import type * as Party from "partykit/server";
import { GameState } from "./shared/types";
import { createInitialState, createPlayer, initializePawns } from "./logic/gameState";
import { handleRollRequest } from "./logic/diceEngine";
import { getValidMoves, getValidPawnIds, executeMove } from "./logic/moveValidation";
import { MAX_PLAYERS_PER_ROOM } from "./room/roomUtils";
import { simpleBotDecide } from "./logic/simpleBot";

// Turn timeout in milliseconds (30 seconds)
const TURN_TIMEOUT_MS = 30 * 1000;

// Message types from client
interface RollRequest {
    type: 'ROLL_REQUEST';
}

interface JoinRequest {
    type: 'JOIN_REQUEST';
    name: string;
    create?: boolean;  // Set to true when creating a new room
    playerId?: string; // For reconnection
    totalPlayers?: number; // For room creation
    botCount?: number; // For room creation
}

interface MoveRequest {
    type: 'MOVE_REQUEST';
    pawnId: string;
}

type ClientMessage = RollRequest | JoinRequest | MoveRequest;

export default class LudoServer implements Party.Server {
    gameState: GameState;
    roomCode: string;
    turnStartTime: number = 0;

    constructor(readonly room: Party.Room) {
        this.roomCode = this.room.id;
        this.gameState = createInitialState(this.roomCode);
    }

    onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
        console.log(`Connection established: ${conn.id} in room ${this.roomCode}`);

        const currentPlayerCount = this.gameState.players.length;

        conn.send(JSON.stringify({
            type: "ROOM_INFO",
            roomCode: this.roomCode,
            playerCount: currentPlayerCount,
            maxPlayers: MAX_PLAYERS_PER_ROOM,
            isFull: currentPlayerCount >= MAX_PLAYERS_PER_ROOM,
        }));

        conn.send(JSON.stringify({
            type: "SYNC_STATE",
            state: this.gameState
        }));
    }

    onMessage(message: string, sender: Party.Connection) {
        let parsed: ClientMessage;
        try {
            parsed = JSON.parse(message);
        } catch {
            sender.send(JSON.stringify({ type: 'ERROR', error: 'Invalid JSON' }));
            return;
        }

        // Cancel timeout on any valid action from current player
        this.cancelTurnTimer();

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
            default:
                sender.send(JSON.stringify({ type: 'ERROR', error: 'Unknown message type' }));
        }
    }

    private handleJoin(conn: Party.Connection, name: string, create: boolean = false, playerId?: string, totalPlayers?: number, botCount?: number) {
        const playerCount = this.gameState.players.length;

        // 1. RECONNECTION LOGIC
        if (playerId) {
            const existingPlayer = this.gameState.players.find(p => p.id === playerId);
            if (existingPlayer) {
                // Determine if we need to update the socket definition?
                // PartyKit keeps connection, check if we need to swap IDs?
                // Actually, we usually want to re-bind the *player* to this new *connection ID* if checking online status,
                // BUT here we store player ID as the connection ID originally. 
                // Let's UPDATE the player's ID to the new connection ID to keep it simple for communication,
                // OR we keep a mapping.

                // For simplicity in this architecture where p.id IS conn.id:
                // We update the player ID to the NEW conn.id
                console.log(`Reconnecting player ${existingPlayer.name} (${existingPlayer.id} -> ${conn.id})`);

                // Update IDs in state
                existingPlayer.id = conn.id;
                // We also need to update this name if changed? No, keep original name for consistency or update?
                // Let's keep original name to avoid identity spoofing confusion.

                conn.send(JSON.stringify({
                    type: 'JOIN_SUCCESS',
                    player: existingPlayer,
                    roomCode: this.roomCode,
                    reconnected: true
                }));

                this.broadcastState();
                return;
            }
        }

        // 2. CREATE VS JOIN VALIDATION
        if (playerCount === 0 && !create) {
            console.log(`Rejecting join to empty room ${this.roomCode} without create flag`);
            conn.send(JSON.stringify({ type: 'JOIN_REJECTED', error: 'Room does not exist' }));
            return;
        }

        // 3. FULL ROOM CHECK
        if (playerCount >= MAX_PLAYERS_PER_ROOM) {
            conn.send(JSON.stringify({ type: 'JOIN_REJECTED', error: 'Room is full (max 4 players)' }));
            return;
        }

        // 4. CHECK FOR DUPLICATES (by Connection ID)
        const alreadyJoined = this.gameState.players.find(p => p.id === conn.id);
        if (alreadyJoined) {
            // Treat as success/ack
            conn.send(JSON.stringify({
                type: 'JOIN_SUCCESS',
                player: alreadyJoined,
                roomCode: this.roomCode,
            }));
            return;
        }

        // 5. ASSIGN COLOR
        const colors = ['RED', 'BLUE', 'GREEN', 'YELLOW'] as const;
        const takenColors = this.gameState.players.map(p => p.color);
        const availableColor = colors.find(c => !takenColors.includes(c));

        if (!availableColor) {
            conn.send(JSON.stringify({ type: 'JOIN_REJECTED', error: 'No colors available' }));
            return;
        }

        // 6. CREATE PLAYER
        const player = createPlayer(conn.id, name, availableColor);
        const pawns = initializePawns(availableColor);

        this.gameState.players.push(player);
        this.gameState.pawns.push(...pawns);
        this.gameState.lastUpdate = Date.now();

        conn.send(JSON.stringify({
            type: 'JOIN_SUCCESS',
            player,
            roomCode: this.roomCode,
        }));

        this.room.broadcast(JSON.stringify({
            type: 'PLAYER_JOINED',
            player,
            playerCount: this.gameState.players.length,
        }));

        // 7. CREATE BOTS if this is room creation
        if (create && botCount && botCount > 0) {
            console.log(`Creating ${botCount} bots for room ${this.roomCode}`);
            for (let i = 0; i < botCount; i++) {
                this.addBot();
            }
        }

        // Start game if 2+ players (Auto-start for now, can move to manual START button later)
        if (this.gameState.players.length >= 2 && this.gameState.gamePhase === 'WAITING') {
            this.gameState.gamePhase = 'ROLLING';
            this.gameState.currentTurn = this.gameState.players[0].color;
            this.startTurnTimer();
        }

        this.broadcastState();
    }

    private addBot() {
        if (this.gameState.players.length >= MAX_PLAYERS_PER_ROOM) return;

        const colors = ['RED', 'BLUE', 'GREEN', 'YELLOW'] as const;
        const takenColors = this.gameState.players.map(p => p.color);
        const availableColor = colors.find(c => !takenColors.includes(c));

        if (!availableColor) return;

        const botId = `bot-${Date.now()}-${Math.random()}`;
        const botName = `Bot ${availableColor}`;

        const player = createPlayer(botId, botName, availableColor);
        player.isBot = true;

        const pawns = initializePawns(availableColor);

        this.gameState.players.push(player);
        this.gameState.pawns.push(...pawns);

        console.log(`Added bot: ${botName} (${botId})`);
    }

    private handleAddBot(conn: Party.Connection) {
        if (this.gameState.players.length >= MAX_PLAYERS_PER_ROOM) return;

        // Only allow if game waiting? Or allow dynamic? Let's say Waiting for now.
        // Or if in game, add to next empty slot?

        const colors = ['RED', 'BLUE', 'GREEN', 'YELLOW'] as const;
        const takenColors = this.gameState.players.map(p => p.color);
        const availableColor = colors.find(c => !takenColors.includes(c));

        if (!availableColor) return;

        const botId = `bot-${Date.now()}`;
        const botName = `Bot ${availableColor}`;

        const player = createPlayer(botId, botName, availableColor);
        player.isBot = true;

        const pawns = initializePawns(availableColor);

        this.gameState.players.push(player);
        this.gameState.pawns.push(...pawns);

        this.broadcastState();

        // If this triggered start
        if (this.gameState.players.length >= 2 && this.gameState.gamePhase === 'WAITING') {
            this.gameState.gamePhase = 'ROLLING';
            this.gameState.currentTurn = this.gameState.players[0].color;
            this.startTurnTimer();
        }
    }

    private handleRoll(conn: Party.Connection) {
        const result = handleRollRequest(this.gameState, conn.id);

        if (!result.success) {
            conn.send(JSON.stringify({ type: 'ROLL_REJECTED', error: result.error }));
            return;
        }

        this.gameState = result.newState;
        const validPawnIds = getValidPawnIds(this.gameState);

        this.room.broadcast(JSON.stringify({
            type: 'DICE_RESULT',
            diceValue: result.diceValue,
            player: this.gameState.currentTurn,
            validPawnIds,
        }));

        if (validPawnIds.length === 0) {
            this.skipTurn();
        } else {
            // Reset timer for move phase
            this.startTurnTimer();
        }

        this.broadcastState();
    }

    private handleMove(conn: Party.Connection, pawnId: string) {
        const player = this.gameState.players.find(p => p.id === conn.id);
        if (!player) {
            conn.send(JSON.stringify({ type: 'MOVE_REJECTED', error: 'Player not found' }));
            return;
        }

        if (player.color !== this.gameState.currentTurn) {
            conn.send(JSON.stringify({ type: 'MOVE_REJECTED', error: 'Not your turn' }));
            return;
        }

        if (this.gameState.gamePhase !== 'MOVING') {
            conn.send(JSON.stringify({ type: 'MOVE_REJECTED', error: 'Must roll first' }));
            return;
        }

        const validMoves = getValidMoves(this.gameState);
        const result = executeMove(this.gameState, pawnId, validMoves);

        if (!result.success) {
            conn.send(JSON.stringify({ type: 'MOVE_REJECTED', error: result.error }));
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
            // Schedule alarm for timeout for human players
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
        // Timer expired - bot takes over
        console.log(`Turn timeout for ${this.gameState.currentTurn} - bot taking over`);

        // Notify players about bot takeover
        this.room.broadcast(JSON.stringify({
            type: 'BOT_TAKEOVER',
            player: this.gameState.currentTurn,
            reason: 'Turn timeout (30 seconds)',
        }));

        // Execute bot action
        await this.executeBotTurn();
    }

    private async executeBotTurn() {
        if (this.gameState.gamePhase === 'FINISHED' || this.gameState.gamePhase === 'WAITING') {
            return;
        }

        const action = simpleBotDecide(this.gameState);
        const BOT_ACTION_DELAY = 1500; // 1.5s lag for realistic/watchable speed

        if (action.type === 'ROLL') {
            // Bot rolls
            const result = handleRollRequest(this.gameState, this.gameState.currentTurn); // Bot ID?
            // Wait, we need the bot's player object.
            // The bot IS the current turn player.
            // We need the ID. logic/diceEngine expects ID.
            const player = this.gameState.players.find(p => p.color === this.gameState.currentTurn);
            if (!player) return;

            // Logic was:
            // this.gameState = { ...this.gameState, currentDiceValue: action.diceValue!, ... }
            // But to reuse logic we could use handleRollRequest if we mock the ID or trust the bot decision?
            // The simpleBotDecide returns a *proposed* action.
            // But existing code just *applied* the proposal.

            // Let's stick to applying the proposal from valid possibilities, 
            // BUT `simpleBotDecide` does return a dice value logic which is odd. 
            // Let's look at `simpleBotDecide`: it actually calls `rollDice` internally?
            // No, it returns `diceValue` only if it simulates it?
            // Actually, `simpleBot.ts` likely just says "I want to ROLL". 
            // The previous code: `if (action.type === 'ROLL') { ... currentDiceValue: action.diceValue ... }`
            // suggests `simpleBotDecide` was cheated/generating the value?

            // Checks `simpleBot.ts`... `return { type: 'ROLL', diceValue: Math.floor(Math.random()...) }`?
            // If so, we should use the server's `handleRollRequest` to ensure fairness/factors logic applies!

            // Let's use the authoritative `handleRollRequest` instead of the bot's generated value.
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

                if (validPawnIds.length === 0) {
                    // No moves, end turn
                    // Delay before skipping so user sees the dice
                    setTimeout(() => {
                        this.skipTurn();
                        // skipTurn starts timer for NEXT player.
                    }, BOT_ACTION_DELAY);
                } else {
                    // Schedule next step (Move)
                    this.room.storage.setAlarm(Date.now() + BOT_ACTION_DELAY);
                }
            } else {
                console.error("Bot failed to roll:", rollResult.error);
                this.skipTurn();
            }

        } else if (action.type === 'MOVE') {
            const validMoves = getValidMoves(this.gameState);
            // Verify the pawnId is valid
            // The bot might choose a pawn.
            // We need to ensure `action.pawnId` is valid.
            if (!action.pawnId) {
                this.skipTurn();
                return;
            }

            const result = executeMove(this.gameState, action.pawnId!, validMoves);

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
                    // Schedule next step (Roll again)
                    this.room.storage.setAlarm(Date.now() + BOT_ACTION_DELAY);
                } else {
                    // Turn ends.
                    // Start timer for next player (which will set appropriate alarm)
                    // We can call it immediately or with small delay?
                    // Let's call immediately, startTurnTimer handles the flow.
                    if (this.gameState.gamePhase !== 'FINISHED') {
                        this.startTurnTimer();
                    }
                }
            } else {
                console.error("Bot failed valid move");
                this.skipTurn();
            }
        } else {
            // SKIP or No Action
            this.skipTurn();
        }

        this.broadcastState();
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



