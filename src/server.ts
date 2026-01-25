import type * as Party from "partykit/server";
import { GameState } from "./shared/types";
import { createInitialState, createPlayer, initializePawns } from "./logic/gameState";
import { handleRollRequest } from "./logic/diceEngine";
import { getValidMoves, getValidPawnIds, executeMove } from "./logic/moveValidation";
import { generateRoomCode, MAX_PLAYERS_PER_ROOM } from "./room/roomUtils";

// Message types from client
interface RollRequest {
    type: 'ROLL_REQUEST';
}

interface JoinRequest {
    type: 'JOIN_REQUEST';
    name: string;
}

interface MoveRequest {
    type: 'MOVE_REQUEST';
    pawnId: string;
}

type ClientMessage = RollRequest | JoinRequest | MoveRequest;

export default class LudoServer implements Party.Server {
    gameState: GameState;
    roomCode: string;

    constructor(readonly room: Party.Room) {
        // Generate a friendly room code (the room.id from PartyKit is used internally)
        this.roomCode = generateRoomCode();
        this.gameState = createInitialState(this.roomCode);
    }

    onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
        console.log(`Connection established: ${conn.id} in room ${this.roomCode}`);

        // Check if room is full before allowing interaction
        const currentPlayerCount = this.gameState.players.length;

        // Send current state and room info to the new connection
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

        switch (parsed.type) {
            case 'JOIN_REQUEST':
                this.handleJoin(sender, parsed.name);
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

    private handleJoin(conn: Party.Connection, name: string) {
        // Check max players limit
        if (this.gameState.players.length >= MAX_PLAYERS_PER_ROOM) {
            conn.send(JSON.stringify({ type: 'JOIN_REJECTED', error: 'Room is full (max 4 players)' }));
            return;
        }

        // Check if this connection already joined
        const existingPlayer = this.gameState.players.find(p => p.id === conn.id);
        if (existingPlayer) {
            conn.send(JSON.stringify({ type: 'JOIN_REJECTED', error: 'Already joined' }));
            return;
        }

        const colors = ['RED', 'BLUE', 'GREEN', 'YELLOW'] as const;
        const takenColors = this.gameState.players.map(p => p.color);
        const availableColor = colors.find(c => !takenColors.includes(c));

        if (!availableColor) {
            conn.send(JSON.stringify({ type: 'JOIN_REJECTED', error: 'No colors available' }));
            return;
        }

        const player = createPlayer(conn.id, name, availableColor);
        const pawns = initializePawns(availableColor);

        this.gameState.players.push(player);
        this.gameState.pawns.push(...pawns);
        this.gameState.lastUpdate = Date.now();

        // Notify the joining player
        conn.send(JSON.stringify({
            type: 'JOIN_SUCCESS',
            player,
            roomCode: this.roomCode,
        }));

        // Broadcast player joined to all
        this.room.broadcast(JSON.stringify({
            type: 'PLAYER_JOINED',
            player,
            playerCount: this.gameState.players.length,
        }));



        // If 2+ players and in WAITING, start the game
        if (this.gameState.players.length >= 2 && this.gameState.gamePhase === 'WAITING') {
            this.gameState.gamePhase = 'ROLLING';
            this.gameState.currentTurn = this.gameState.players[0].color;
        }

        this.broadcastState();
    }

    private handleRoll(conn: Party.Connection) {
        const result = handleRollRequest(this.gameState, conn.id);

        if (!result.success) {
            conn.send(JSON.stringify({ type: 'ROLL_REJECTED', error: result.error }));
            return;
        }

        this.gameState = result.newState;

        // Calculate valid moves for the current player
        const validPawnIds = getValidPawnIds(this.gameState);

        // Broadcast the dice result with valid pawn IDs
        this.room.broadcast(JSON.stringify({
            type: 'DICE_RESULT',
            diceValue: result.diceValue,
            player: this.gameState.currentTurn,
            validPawnIds,
        }));

        // If no valid moves, automatically skip turn
        if (validPawnIds.length === 0) {
            this.skipTurn();
        }

        this.broadcastState();
    }

    private handleMove(conn: Party.Connection, pawnId: string) {
        // Verify it's this player's turn
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

        // Get valid moves and attempt to execute
        const validMoves = getValidMoves(this.gameState);
        const result = executeMove(this.gameState, pawnId, validMoves);

        if (!result.success) {
            conn.send(JSON.stringify({ type: 'MOVE_REJECTED', error: result.error }));
            return;
        }

        this.gameState = result.newState;

        // Broadcast move animation
        this.room.broadcast(JSON.stringify({
            type: 'MOVE_EXECUTED',
            pawnId,
            move: this.gameState.lastMove,
            extraTurn: result.extraTurn,
        }));

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
                players: this.gameState.players.length,
                phase: this.gameState.gamePhase
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response("Method not allowed", { status: 405 });
    }
}

LudoServer satisfies Party.Worker;


