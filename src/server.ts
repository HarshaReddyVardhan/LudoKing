import type * as Party from "partykit/server";
import { GameState, ClientMessage, ClientMessageSchema } from "./shared/types";
import { createInitialState } from "./logic/gameState";
import { handleRollRequest } from "./logic/diceEngine";
import { getValidMoves, getValidPawnIds, executeMove } from "./logic/moveValidation";
import {
    MAX_PLAYERS_PER_ROOM,
    handlePlayerJoin,
    addBotToGame,
    addMultipleBots,
    createRoomInfoMessage,
    createStateSyncMessage,
    createPlayerJoinedMessage,
    createJoinSuccessMessage,
    createJoinRejectedMessage,
    deleteRoom
} from "./room/roomUtils";
import { SimpleBot } from "./logic/simpleBot";

// Turn timeout in milliseconds (30 seconds)
// Turn timeout in milliseconds (2 minutes)
const TURN_TIMEOUT_MS = 30 * 1000;

// Message types from client
// Local interfaces removed in favor of shared types


export default class LudoServer implements Party.Server {
    gameState: GameState;
    roomCode: string;
    turnStartTime: number = 0;
    private skippedTurns: Map<string, number> = new Map();
    private isProcessingTurn: boolean = false;

    constructor(readonly room: Party.Room) {
        this.roomCode = this.room.id;
        this.gameState = createInitialState(this.roomCode);
    }

    onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
        console.log(`Connection established: ${conn.id} in room ${this.roomCode}`);

        // Send room info
        conn.send(JSON.stringify(createRoomInfoMessage(this.roomCode, this.gameState)));

        // Send current state
        conn.send(JSON.stringify(createStateSyncMessage(this.gameState)));
    }

    async onClose(conn: Party.Connection) {
        console.log(`Connection closed: ${conn.id} in room ${this.roomCode}`);

        // If the room is empty, clean up
        if (this.room.connections.size === 0) {
            await deleteRoom(this.roomCode, this.room);
        }
    }

    onMessage(message: string, sender: Party.Connection) {
        let json: unknown;
        try {
            json = JSON.parse(message);
        } catch {
            sender.send(JSON.stringify({ type: 'ERROR', code: 'INVALID_JSON', message: 'Invalid JSON' }));
            return;
        }

        const result = ClientMessageSchema.safeParse(json);
        if (!result.success) {
            console.error("Validation error:", result.error);
            sender.send(JSON.stringify({ type: 'ERROR', code: 'INVALID_FORMAT', message: 'Invalid message format' }));
            return;
        }

        const parsed = result.data;

        try {
            switch (parsed.type) {
                case 'JOIN_REQUEST':
                    this.handleJoin(sender, parsed.name, parsed.create, parsed.playerId, parsed.totalPlayers, parsed.botCount);
                    break;
                case 'ROLL_REQUEST':
                    this.handleRoll(sender);
                    break;
                case 'MOVE_REQUEST':
                    this.handleMove(sender, parsed.pawnId);
                    break;
                case 'START_GAME':
                    if (this.gameState.players.length < 2) {
                        sender.send(JSON.stringify({ type: 'ERROR', code: 'NOT_ENOUGH_PLAYERS', message: 'Need at least 2 players to start' }));
                        return;
                    }

                    // Only host (first player) can start
                    const host = this.gameState.players[0];
                    if (!host || host.id !== sender.id) {
                        sender.send(JSON.stringify({ type: 'ERROR', code: 'NOT_HOST', message: 'Only the host can start the game' }));
                        return;
                    }

                    if (this.gameState.gamePhase !== 'WAITING') {
                        return;
                    }

                    this.gameState.gamePhase = 'ROLLING';
                    this.gameState.currentTurn = 'RED'; // Always start with RED

                    this.startTurnTimer();
                    this.broadcastState();
                    break;
                case 'ADD_BOT':
                    this.handleAddBot(sender);
                    break;
                default:
                    sender.send(JSON.stringify({ type: 'ERROR', code: 'UNKNOWN_TYPE', message: 'Unknown message type' }));
            }
        } catch (err) {
            console.error("Game Logic Processing Error:", err);
            sender.send(JSON.stringify({
                type: 'ERROR',
                code: 'INTERNAL_ERROR',
                message: err instanceof Error ? err.message : 'Unknown server error'
            }));
        }
    }

    private handleJoin(conn: Party.Connection, name: string, create: boolean = false, playerId?: string, totalPlayers?: number, botCount?: number) {
        // Delegate to room utils for join logic
        const result = handlePlayerJoin(
            this.gameState,
            conn.id,
            name,
            create,
            playerId
        );

        if (!result.success) {
            conn.send(JSON.stringify(createJoinRejectedMessage(result.error || 'Join failed')));
            return;
        }

        // Update game state if modified
        if (result.updatedState) {
            this.gameState = result.updatedState;
        }

        // Send success message to the joining player
        conn.send(JSON.stringify(
            createJoinSuccessMessage(result.player!, this.roomCode, result.reconnected)
        ));

        // Broadcast player joined event if not a reconnection
        if (!result.reconnected) {
            this.room.broadcast(JSON.stringify(
                createPlayerJoinedMessage(result.player!, this.gameState.players.length)
            ));
        }

        // Add bots if this is room creation
        if (create && botCount && botCount > 0) {
            console.log(`Creating ${botCount} bots for room ${this.roomCode}`);
            this.gameState = addMultipleBots(this.gameState, botCount);
        }

        this.broadcastState();
    }

    private handleAddBot(conn: Party.Connection) {
        const result = addBotToGame(this.gameState);

        if (result.success && result.updatedState) {
            this.gameState = result.updatedState;
            this.broadcastState();
        }
    }

    private handleRoll(conn: Party.Connection) {
        if (this.isProcessingTurn) {
            conn.send(JSON.stringify({ type: 'ERROR', code: 'TURN_IN_PROGRESS', message: 'Turn in process' }));
            return;
        }

        // Validate that current turn is NOT a bot
        const currentPlayer = this.gameState.players.find(p => p.color === this.gameState.currentTurn);
        if (currentPlayer?.isBot) {
            conn.send(JSON.stringify({ type: 'ERROR', code: 'BOT_TURN', message: 'Wait for bot turn' }));
            return;
        }

        const result = handleRollRequest(this.gameState, conn.id);

        if (!result.success) {
            conn.send(JSON.stringify({ type: 'ERROR', code: 'ROLL_FAILED', message: result.error }));
            return;
        }

        this.skippedTurns.set(conn.id, 0); // Reset skip count on valid activity
        this.cancelTurnTimer(); // Cancel previous timer

        this.gameState = result.newState;
        const validPawnIds = getValidPawnIds(this.gameState);

        this.room.broadcast(JSON.stringify({
            type: 'DICE_RESULT',
            diceValue: result.diceValue,
            player: this.gameState.currentTurn,
            validPawnIds,
        }));

        if (validPawnIds.length === 0) {
            // Add a small delay so the user sees the dice result before turn switch
            setTimeout(() => {
                this.skipTurn();
                this.broadcastState(); // Broadcast the new state (next player)
            }, 1000);
        } else {
            // Reset timer for move phase
            this.startTurnTimer();
        }

        // Note: We intentionally do NOT broadcast state here if skipping, 
        // to avoid a jittery double-update (Dice -> Moved/Skipped).
        // If not skipping, we broadcast below.
        if (validPawnIds.length > 0) {
            this.broadcastState();
        }
    }

    private handleMove(conn: Party.Connection, pawnId: string) {
        if (this.isProcessingTurn) {
            conn.send(JSON.stringify({ type: 'ERROR', code: 'TURN_IN_PROGRESS', message: 'Turn in process' }));
            return;
        }

        const player = this.gameState.players.find(p => p.id === conn.id);
        if (!player) {
            conn.send(JSON.stringify({ type: 'ERROR', code: 'MOVE_FAILED', message: 'Player not found' }));
            return;
        }

        if (player.isBot) {
            conn.send(JSON.stringify({ type: 'ERROR', code: 'BOT_TURN', message: 'Wait for bot turn' }));
            return;
        }

        if (player.color !== this.gameState.currentTurn) {
            conn.send(JSON.stringify({ type: 'ERROR', code: 'MOVE_FAILED', message: 'Not your turn' }));
            return;
        }

        this.skippedTurns.set(conn.id, 0); // Reset skip count on valid activity
        this.cancelTurnTimer(); // Cancel timer

        if (this.gameState.gamePhase !== 'MOVING') {
            conn.send(JSON.stringify({ type: 'ERROR', code: 'MOVE_FAILED', message: 'Must roll first' }));
            return;
        }

        const validMoves = getValidMoves(this.gameState);
        const result = executeMove(this.gameState, pawnId, validMoves);

        if (!result.success) {
            conn.send(JSON.stringify({ type: 'ERROR', code: 'MOVE_FAILED', message: result.error }));
            return;
        }

        this.gameState = result.newState;

        this.room.broadcast(JSON.stringify({
            type: 'MOVE_EXECUTED',
            pawnId,
            move: this.gameState.lastMove,
            extraTurn: result.extraTurn,
        }));

        // Start timer for next turn
        if (this.gameState.gamePhase !== 'FINISHED') {
            this.startTurnTimer();
        }

        this.broadcastState();
    }

    private skipTurn() {
        const activePlayers = this.gameState.players.filter(p => p.isActive).map(p => p.color);

        if (activePlayers.length === 0) {
            console.error("No active players found in skipTurn!");
            return;
        }

        const currentIndex = activePlayers.indexOf(this.gameState.currentTurn);
        const nextIndex = (currentIndex + 1) % activePlayers.length;

        this.gameState = {
            ...this.gameState,
            currentTurn: activePlayers[nextIndex],
            currentDiceValue: null,
            gamePhase: 'ROLLING',
            lastUpdate: Date.now(),
        };

        this.room.broadcast(JSON.stringify({
            type: 'TURN_SKIPPED',
            reason: 'No valid moves available',
            nextPlayer: this.gameState.currentTurn,
        }));

        this.startTurnTimer();
    }

    // =====================
    // TURN TIMER & BOT
    // =====================

    private startTurnTimer() {
        if (this.gameState.gamePhase === 'WAITING' || this.gameState.gamePhase === 'FINISHED') {
            return;
        }

        this.turnStartTime = Date.now();

        // Check if current player is a bot
        const currentPlayer = this.gameState.players.find(p => p.color === this.gameState.currentTurn);
        if (currentPlayer?.isBot) {
            // Execute bot turn after a short delay (for better UX)
            this.room.storage.setAlarm(Date.now() + 1000);
        } else {
            // Schedule alarm for timeout for human players (30s)
            // Use the room storage alarm which persists
            this.room.storage.setAlarm(Date.now() + TURN_TIMEOUT_MS);
        }

        // Notify clients about the timer
        this.room.broadcast(JSON.stringify({
            type: 'TURN_TIMER_START',
            player: this.gameState.currentTurn,
            timeoutMs: TURN_TIMEOUT_MS,
            startTime: this.turnStartTime,
        }));
    }

    private cancelTurnTimer() {
        this.room.storage.deleteAlarm();
    }

    async onAlarm() {
        // Prevent race conditions / re-entry
        if (this.isProcessingTurn) {
            console.warn("Alarm fired while turn is being processed. Ignoring to prevent race.");
            return;
        }

        this.isProcessingTurn = true;

        try {
            // Timer expired
            const currentPlayer = this.gameState.players.find(p => p.color === this.gameState.currentTurn);

            if (!currentPlayer) return;

            if (currentPlayer.isBot) {
                // Bot logic
                await this.update();
                return;
            }

            // Human player timed out
            const currentSkips = (this.skippedTurns.get(currentPlayer.id) || 0) + 1;
            this.skippedTurns.set(currentPlayer.id, currentSkips);

            console.log(`Player ${currentPlayer.name} timed out. Skips: ${currentSkips}`);

            if (currentSkips >= 3) {
                // Kick logic
                const playerToKick = currentPlayer;

                // 1. Advance turn first to ensure game flow continues
                this.skipTurn();

                // 2. Remove player and their pawns
                this.gameState.players = this.gameState.players.filter(p => p.id !== playerToKick.id);
                this.gameState.pawns = this.gameState.pawns.filter(p => p.color !== playerToKick.color);

                // 3. Notify everyone
                this.room.broadcast(JSON.stringify({
                    type: 'PLAYER_KICKED',
                    playerId: playerToKick.id,
                    reason: 'AFK_TIMEOUT'
                }));

                this.broadcastState();

                // Check if game should end due to lack of players?
                if (this.gameState.players.length < 2) {
                    // Optionally handle game end here, but keeping it simple for now.
                }

            } else {
                // Just skip turn
                this.skipTurn();
            }
        } catch (error) {
            console.error("Error in onAlarm:", error);
        } finally {
            this.isProcessingTurn = false;
        }
    }

    private async update() {
        try {
            if (this.gameState.gamePhase === 'FINISHED' || this.gameState.gamePhase === 'WAITING') {
                return;
            }

            const bot = new SimpleBot();
            const action = bot.computeNextMove(this.gameState, this.gameState.currentTurn);
            const BOT_ACTION_DELAY = 1000; // 1s lag for faster gameplay

            if (action.type === 'ROLL') {
                const player = this.gameState.players.find(p => p.color === this.gameState.currentTurn);
                if (!player) return;

                // Use authoritative roll request
                const rollResult = handleRollRequest(this.gameState, player.id);

                if (rollResult.success) {
                    this.gameState = rollResult.newState;
                    const validPawnIds = getValidPawnIds(this.gameState);

                    this.room.broadcast(JSON.stringify({
                        type: 'DICE_RESULT',
                        diceValue: rollResult.diceValue,
                        player: this.gameState.currentTurn,
                        validPawnIds,
                        isBot: true,
                    }));

                    // Schedule next tick to catch MOVE or SKIP
                    this.room.storage.setAlarm(Date.now() + BOT_ACTION_DELAY);
                } else {
                    console.error("Bot failed to roll:", rollResult.error);
                    this.skipTurn();
                }

            } else if (action.type === 'MOVE') {
                // Ensure pawnId is present for MOVE action
                if (!action.pawnId) {
                    this.skipTurn();
                    return;
                }

                const validMoves = getValidMoves(this.gameState);
                const result = executeMove(this.gameState, action.pawnId, validMoves);

                if (result.success) {
                    this.gameState = result.newState;

                    this.room.broadcast(JSON.stringify({
                        type: 'MOVE_EXECUTED',
                        pawnId: action.pawnId,
                        move: this.gameState.lastMove,
                        extraTurn: result.extraTurn,
                        isBot: true,
                    }));

                    if (result.extraTurn) {
                        // Schedule next tick for extra roll
                        this.room.storage.setAlarm(Date.now() + BOT_ACTION_DELAY);
                    } else {
                        // Turn ends, start timer for next player
                        if (this.gameState.gamePhase !== 'FINISHED') {
                            this.startTurnTimer();
                        }
                    }
                } else {
                    console.error("Bot failed valid move");
                    this.skipTurn();
                }

            } else {
                // SKIP or No Action (e.g. rolled but no moves)
                this.skipTurn();
            }

        } catch (error) {
            console.error("Bot crashed, skipping turn:", error);
            this.skipTurn();
        }
    }

    private broadcastState() {
        this.room.broadcast(JSON.stringify({
            type: 'SYNC_STATE',
            state: this.gameState,
        }));
    }

    onRequest(req: Party.Request) {
        if (req.method === "GET") {
            return new Response(JSON.stringify({
                status: "ok",
                room: this.room.id,
                roomCode: this.roomCode,
                players: this.gameState.players.length,
                phase: this.gameState.gamePhase,
                currentTurn: this.gameState.currentTurn,
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response("Method not allowed", { status: 405 });
    }
}

LudoServer satisfies Party.Worker;



