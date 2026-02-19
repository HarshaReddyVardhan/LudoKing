import type * as Party from "partykit/server";
import { GameState, ServerMessage, ClientMessageSchema, GamePhase, Color } from "./shared/types";
import { createInitialState, resetGame } from "./logic/gameState";
import { handleRollRequest } from "./logic/diceEngine";
import { getValidMoves, getValidPawnIds, executeMove } from "./logic/rules/moveValidation";
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
    deleteRoom,
    createDeltaUpdate
} from "./room/roomUtils";
import { SimpleBot } from "./logic/simpleBot";

import { CONFIG } from "./config";

// Turn timeout in milliseconds
const TURN_TIMEOUT_MS = CONFIG.TURN_TIMEOUT_MS;
// How long to wait for client animation before proceeding
const ANIMATION_DELAY_MS = 2000;

import { Logger } from "./utils/logger";

// ─── Type-safe send helper ────────────────────────────────────────────────────
/**
 * Sends a strongly-typed ServerMessage to a single connection.
 * Prevents typos in JSON keys by enforcing the ServerMessage union at compile time.
 */
function send(conn: Party.Connection, msg: ServerMessage): void {
    conn.send(JSON.stringify(msg));
}

/**
 * Broadcasts a strongly-typed ServerMessage to all connections in the room.
 */
function broadcast(room: Party.Room, msg: ServerMessage): void {
    room.broadcast(JSON.stringify(msg));
}
// ─────────────────────────────────────────────────────────────────────────────

export default class LudoServer implements Party.Server {
    gameState: GameState;
    roomCode: string;
    turnStartTime: number = 0;
    private skippedTurns: Map<string, number> = new Map();
    private isProcessingTurn: boolean = false;
    maintenanceMode: boolean = false;

    constructor(readonly room: Party.Room) {
        // Use normalized room ID as the code
        this.roomCode = this.room.id;
        this.gameState = createInitialState(this.roomCode);
    }

    async onStart() {
        const state = await this.room.storage.get<GameState>("gameState");
        if (state) {
            this.gameState = state;
        }
    }

    onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
        // Allow more connections for spectators, but keep a reasonable hard limit (e.g. 50)
        // Previous limit was 20. Let's bump to 50 to allow spectators.
        if (this.room.connections.size > 50) {
            conn.close(1008, "Too many connections");
            return;
        }
        Logger.info({ event: 'CONNECTION_OPEN', connectionId: conn.id, roomCode: this.roomCode });
        send(conn, createRoomInfoMessage(this.roomCode, this.gameState) as ServerMessage);
        send(conn, createStateSyncMessage(this.gameState) as ServerMessage);
    }

    async onClose(conn: Party.Connection) {
        Logger.info({ event: 'CONNECTION_CLOSED', connectionId: conn.id, roomCode: this.roomCode });

        // If no connections remain, set a 10-minute alarm to GC abandoned rooms.
        // A new player joining before the alarm fires will cancel it.
        if (this.room.connections.size === 0) {
            const EMPTY_ROOM_TTL_MS = CONFIG.EMPTY_ROOM_TTL_MS;
            await this.room.storage.put("emptyRoomAlarm", true);
            await this.room.storage.setAlarm(Date.now() + EMPTY_ROOM_TTL_MS);
            Logger.info({ event: 'ROOM_EMPTY_ALARM_SET', roomCode: this.roomCode, ttl: "10m" });
            return;
        }

        // ISSUE FIX: If the disconnected player was the active (current) turn player,
        // immediately force-skip their turn rather than waiting for timeout.
        const disconnectedPlayer = this.gameState.players.find(
            p => p.connectionId === conn.id
        );

        if (disconnectedPlayer) {
            this.skippedTurns.delete(disconnectedPlayer.id);
        }

        if (
            disconnectedPlayer &&
            !disconnectedPlayer.isBot &&
            disconnectedPlayer.color === this.gameState.currentTurn &&
            (this.gameState.gamePhase === GamePhase.ROLLING ||
                this.gameState.gamePhase === GamePhase.ROLLING_ANIMATION ||
                this.gameState.gamePhase === GamePhase.MOVING)
        ) {
            Logger.info({
                event: 'ACTIVE_PLAYER_DISCONNECT',
                player: disconnectedPlayer.name,
                action: 'FORCE_SKIP'
            });

            // Mark player as inactive
            this.gameState = {
                ...this.gameState,
                players: this.gameState.players.map(p =>
                    p.id === disconnectedPlayer.id ? { ...p, isActive: false } : p
                ),
            };

            this.cancelTurnTimer();
            this.skipTurn();
            this.broadcastState();
        } else if (disconnectedPlayer) {
            // Not their turn — just mark inactive
            this.gameState = {
                ...this.gameState,
                players: this.gameState.players.map(p =>
                    p.id === disconnectedPlayer.id ? { ...p, isActive: false } : p
                ),
            };
        }
    }

    async onMessage(message: string, sender: Party.Connection) {
        let json: unknown;
        try {
            json = JSON.parse(message);
        } catch {
            send(sender, { type: 'ERROR', code: 'INVALID_JSON', message: 'Invalid JSON' });
            return;
        }

        const result = ClientMessageSchema.safeParse(json);
        if (!result.success) {
            Logger.error({ event: 'VALIDATION_ERROR', error: result.error });
            send(sender, { type: 'ERROR', code: 'INVALID_FORMAT', message: 'Invalid message format' });
            return;
        }

        const parsed = result.data;

        if (this.isProcessingTurn) {
            send(sender, { type: 'ERROR', code: 'BUSY', message: 'Server is processing turn' });
            return;
        }

        this.isProcessingTurn = true;
        try {
            switch (parsed.type) {
                case 'JOIN_REQUEST':
                    await this.handleJoin(
                        sender,
                        parsed.name,
                        parsed.create,
                        parsed.playerId,
                        parsed.totalPlayers,
                        parsed.botCount
                    );
                    break;
                case 'ROLL_REQUEST':
                    this.handleRoll(sender);
                    break;
                case 'MOVE_REQUEST':
                    this.handleMove(sender, parsed.pawnId);
                    break;
                case 'ANIMATION_ACK':
                    this.handleAnimationAck(sender);
                    break;
                case 'START_GAME':
                    if (this.gameState.players.length < 2) {
                        send(sender, {
                            type: 'ERROR',
                            code: 'NOT_ENOUGH_PLAYERS',
                            message: 'Need at least 2 players to start',
                        });
                        return;
                    }

                    // Only host (first player) can start
                    const host = this.gameState.players[0];
                    if (!host || host.connectionId !== sender.id) {
                        send(sender, {
                            type: 'ERROR',
                            code: 'NOT_HOST',
                            message: 'Only the host can start the game',
                        });
                        return;
                    }

                    if (this.gameState.gamePhase !== GamePhase.WAITING) {
                        return;
                    }

                    this.gameState.gamePhase = GamePhase.ROLLING;
                    this.gameState.currentTurn = Color.RED;

                    this.startTurnTimer();
                    this.broadcastState();
                    break;
                case 'ADD_BOT':
                    this.handleAddBot(sender);
                    break;
                case 'RESET_GAME':
                    this.handleResetGame(sender);
                    break;
                default:
                    send(sender, { type: 'ERROR', code: 'UNKNOWN_TYPE', message: 'Unknown message type' });
            }
        } catch (err) {
            Logger.error({ event: 'GAME_LOGIC_ERROR', error: err });
            send(sender, {
                type: 'ERROR',
                code: 'INTERNAL_ERROR',
                message: err instanceof Error ? err.message : 'Unknown server error',
            });
        } finally {
            this.isProcessingTurn = false;
        }
    }

    private async handleJoin(
        conn: Party.Connection,
        name: string,
        create: boolean = false,
        playerId?: string,
        totalPlayers?: number,
        botCount?: number
    ) {
        // Maintenance Mode: Block new joins, allow reconnects
        if (this.maintenanceMode) {
            // Check if it's a reconnect
            const isReconnect = playerId && this.gameState.players.some(p => p.id === playerId);
            if (!isReconnect) {
                send(conn, createJoinRejectedMessage('Server is in maintenance mode. No new games allowed.') as ServerMessage);
                return;
            }
        }

        const result = handlePlayerJoin(
            this.gameState,
            conn.id,
            name,
            create,
            playerId,
            totalPlayers,
            conn
        );

        if (!result.success) {
            send(conn, createJoinRejectedMessage(result.error || 'Join failed') as ServerMessage);
            return;
        }

        if (result.isSpectator) {
            Logger.info({ event: 'SPECTATOR_JOINED', connectionId: conn.id, roomCode: this.roomCode });
            // Send success message locally
            send(conn, createJoinSuccessMessage(result.player!, this.roomCode, false) as ServerMessage);
            // Ensure they have the latest state
            send(conn, createStateSyncMessage(this.gameState) as ServerMessage);
            return;
        }

        if (result.updatedState) {
            this.gameState = result.updatedState;
        }

        // Cancel any pending empty-room GC alarm now that a player has joined
        await this.room.storage.delete("emptyRoomAlarm");

        send(conn, createJoinSuccessMessage(result.player!, this.roomCode, result.reconnected) as ServerMessage);

        if (!result.reconnected) {
            broadcast(
                this.room,
                createPlayerJoinedMessage(result.player!, this.gameState.players.length) as ServerMessage
            );
        }

        if (create && botCount && botCount > 0) {
            Logger.info({ event: 'CREATING_BOTS', count: botCount, roomCode: this.roomCode });
            this.gameState = addMultipleBots(this.gameState, botCount);
        }

        this.room.storage.put("gameState", this.gameState);
        this.broadcastState();
    }

    private handleAddBot(conn: Party.Connection) {
        const result = addBotToGame(this.gameState);
        if (result.success && result.updatedState) {
            this.gameState = result.updatedState;
            this.broadcastState();
        }
    }

    private handleResetGame(conn: Party.Connection) {
        // Only host (first active player) can reset
        const host = this.gameState.players.find(p => p.isActive);
        if (!host || host.connectionId !== conn.id) {
            send(conn, { type: 'ERROR', code: 'NOT_HOST', message: 'Only the host can reset the game' });
            return;
        }
        if (this.gameState.gamePhase !== GamePhase.FINISHED) {
            send(conn, { type: 'ERROR', code: 'NOT_FINISHED', message: 'Game has not finished yet' });
            return;
        }
        this.cancelTurnTimer();
        this.gameState = resetGame(this.gameState);
        this.room.storage.put("gameState", this.gameState);
        broadcast(this.room, { type: 'GAME_RESET' });
        this.broadcastState();
    }

    private handleRoll(conn: Party.Connection) {
        if (this.isProcessingTurn) {
            send(conn, { type: 'ERROR', code: 'TURN_IN_PROGRESS', message: 'Turn in process' });
            return;
        }

        const currentPlayer = this.gameState.players.find(
            p => p.color === this.gameState.currentTurn
        );
        if (currentPlayer?.isBot) {
            send(conn, { type: 'ERROR', code: 'BOT_TURN', message: 'Wait for bot turn' });
            return;
        }

        const result = handleRollRequest(this.gameState, conn.id);

        if (!result.success) {
            send(conn, { type: 'ERROR', code: 'ROLL_FAILED', message: result.error ?? 'Roll failed' });
            return;
        }

        // Reset skipped turns for this player (use stable ID)
        const player = this.gameState.players.find(p => p.connectionId === conn.id);
        if (player) {
            this.skippedTurns.set(player.id, 0);
        }
        this.cancelTurnTimer();

        this.gameState = result.newState;
        const validPawnIds = getValidPawnIds(this.gameState);

        // Enter ROLLING_ANIMATION phase — tell clients to play the dice animation.
        // The server moves to MOVING only after ANIMATION_ACK (or timeout fallback).
        this.gameState = {
            ...this.gameState,
            gamePhase: GamePhase.ROLLING_ANIMATION,
        };
        this.room.storage.put("gameState", this.gameState);

        broadcast(this.room, {
            type: 'DICE_RESULT',
            diceValue: result.diceValue!,
            player: this.gameState.currentTurn,
            validPawnIds,
        });

        // Fallback: after ANIMATION_DELAY_MS advance automatically regardless of ACK
        if (validPawnIds.length === 0) {
            setTimeout(() => {
                // Re-read state in case ACK already arrived
                if (this.gameState.gamePhase === GamePhase.ROLLING_ANIMATION) {
                    this.gameState = { ...this.gameState, gamePhase: GamePhase.MOVING };
                }
                this.skipTurn();
                this.broadcastState();
            }, ANIMATION_DELAY_MS);
        } else {
            setTimeout(() => {
                if (this.gameState.gamePhase === GamePhase.ROLLING_ANIMATION) {
                    this.gameState = { ...this.gameState, gamePhase: GamePhase.MOVING };
                    this.startTurnTimer();
                    this.broadcastState();
                }
            }, ANIMATION_DELAY_MS);
        }
    }

    /**
     * Client sends ANIMATION_ACK when its dice animation finishes.
     * This allows the server to transition to MOVING earlier than the fallback timeout.
     */
    private handleAnimationAck(conn: Party.Connection) {
        if (this.gameState.gamePhase !== GamePhase.ROLLING_ANIMATION) return;

        const validPawnIds = getValidPawnIds(this.gameState);

        this.gameState = { ...this.gameState, gamePhase: GamePhase.MOVING };

        if (validPawnIds.length === 0) {
            this.skipTurn();
            this.broadcastState();
        } else {
            this.startTurnTimer();
            this.broadcastState();
        }
    }

    private handleMove(conn: Party.Connection, pawnId: string) {
        if (this.isProcessingTurn) {
            send(conn, { type: 'ERROR', code: 'TURN_IN_PROGRESS', message: 'Turn in process' });
            return;
        }

        const oldState = this.gameState;

        const player = this.gameState.players.find(p => p.connectionId === conn.id);
        if (!player) {
            send(conn, { type: 'ERROR', code: 'MOVE_FAILED', message: 'Player not found' });
            return;
        }

        if (player.isBot) {
            send(conn, { type: 'ERROR', code: 'BOT_TURN', message: 'Wait for bot turn' });
            return;
        }

        if (player.color !== this.gameState.currentTurn) {
            send(conn, { type: 'ERROR', code: 'MOVE_FAILED', message: 'Not your turn' });
            return;
        }

        this.skippedTurns.set(player.id, 0);
        this.cancelTurnTimer();

        this.cancelTurnTimer();

        if (this.gameState.gamePhase !== GamePhase.MOVING) {
            send(conn, { type: 'ERROR', code: 'MOVE_FAILED', message: 'Must roll first' });
            return;
        }

        const validMoves = getValidMoves(this.gameState);
        const result = executeMove(this.gameState, pawnId, validMoves);

        if (!result.success) {
            send(conn, { type: 'ERROR', code: 'MOVE_FAILED', message: result.error ?? 'Move failed' });
            return;
        }

        this.gameState = result.newState;
        this.room.storage.put("gameState", this.gameState);

        broadcast(this.room, {
            type: 'MOVE_EXECUTED',
            pawnId,
            move: this.gameState.lastMove,
            extraTurn: result.extraTurn ?? false,
        });

        if (this.gameState.gamePhase !== GamePhase.FINISHED) {
            this.startTurnTimer();
        }

        this.broadcastState(oldState);
    }

    private skipTurn() {
        // Only skip among unranked, active players
        const activePlayers = this.gameState.players
            .filter(p => p.isActive && p.rank === undefined)
            .map(p => p.color);

        if (activePlayers.length === 0) {
            Logger.error("No active unranked players found in skipTurn!");
            return;
        }

        const currentIndex = activePlayers.indexOf(this.gameState.currentTurn);
        const nextIndex = (currentIndex + 1) % activePlayers.length;

        this.gameState = {
            ...this.gameState,
            currentTurn: activePlayers[nextIndex],
            currentDiceValue: null,
            gamePhase: GamePhase.ROLLING,
            consecutiveSixes: 0,
            lastUpdate: Date.now(),
        };

        broadcast(this.room, {
            type: 'TURN_SKIPPED',
            reason: 'No valid moves available',
            nextPlayer: this.gameState.currentTurn,
        });

        this.startTurnTimer();
    }

    // =====================
    // TURN TIMER & BOT
    // =====================

    private startTurnTimer() {
        if (
            this.gameState.gamePhase === GamePhase.WAITING ||
            this.gameState.gamePhase === GamePhase.FINISHED
        ) {
            return;
        }

        this.turnStartTime = Date.now();

        const currentPlayer = this.gameState.players.find(
            p => p.color === this.gameState.currentTurn
        );
        if (currentPlayer?.isBot) {
            this.room.storage.setAlarm(Date.now() + 1000);
        } else {
            this.room.storage.setAlarm(Date.now() + TURN_TIMEOUT_MS);
        }

        broadcast(this.room, {
            type: 'TURN_TIMER_START',
            player: this.gameState.currentTurn,
            timeoutMs: TURN_TIMEOUT_MS,
            startTime: this.turnStartTime,
        });
    }

    private cancelTurnTimer() {
        this.room.storage.deleteAlarm();
    }

    async onAlarm() {
        // Empty-room GC: if the alarm was set because the room had zero connections,
        // and it's still empty now, delete all storage to prevent memory leaks.
        const isEmptyRoomAlarm = await this.room.storage.get<boolean>("emptyRoomAlarm");
        if (isEmptyRoomAlarm) {
            if (this.room.connections.size === 0) {
                Logger.info({ event: 'ROOM_GC', roomCode: this.roomCode, action: 'DELETE_STORAGE' });
                await deleteRoom(this.roomCode, this.room);
            } else {
                // A player joined before the alarm fired; cancel the sentinel.
                await this.room.storage.delete("emptyRoomAlarm");
                Logger.info({ event: 'ROOM_GC_CANCELLED', roomCode: this.roomCode, reason: 'PLAYERS_PRESENT' });
            }
            return;
        }

        if (this.isProcessingTurn) {
            Logger.warn("Alarm fired while turn is being processed. Ignoring to prevent race.");
            return;
        }

        this.isProcessingTurn = true;

        try {
            const currentPlayer = this.gameState.players.find(
                p => p.color === this.gameState.currentTurn
            );

            if (!currentPlayer) return;

            if (currentPlayer.isBot) {
                await this.update();
                return;
            }

            const currentSkips = (this.skippedTurns.get(currentPlayer.id) || 0) + 1;
            this.skippedTurns.set(currentPlayer.id, currentSkips);

            Logger.info({
                event: 'PLAYER_TIMEOUT',
                player: currentPlayer.name,
                skips: currentSkips
            });

            if (currentSkips >= 3) {
                // AFK TAKEOVER: Do NOT kick, switch to bot
                Logger.info({
                    event: 'BOT_TAKEOVER',
                    player: currentPlayer.name
                });

                // Update player text
                const wasName = currentPlayer.name;

                this.gameState = {
                    ...this.gameState,
                    players: this.gameState.players.map(p => {
                        if (p.id === currentPlayer.id) {
                            return {
                                ...p,
                                isBot: true,
                                isActive: true, // Keep active so bot plays
                                name: `${wasName} (Auto)`
                            };
                        }
                        return p;
                    })
                };

                broadcast(this.room, {
                    type: 'BOT_TAKEOVER',
                    playerId: currentPlayer.id,
                    color: currentPlayer.color
                });

                this.broadcastState();

                // Immediately trigger update so bot plays this turn if it's still their turn
                this.update();
            } else {
                this.skipTurn();
            }
        } catch (error) {
            Logger.error({ event: 'ALARM_ERROR', error });
        } finally {
            this.isProcessingTurn = false;
        }
    }

    private async update() {
        try {
            if (
                this.gameState.gamePhase === GamePhase.FINISHED ||
                this.gameState.gamePhase === GamePhase.WAITING
            ) {
                return;
            }

            const bot = new SimpleBot();
            const action = bot.computeNextMove(this.gameState, this.gameState.currentTurn);

            const BOT_ACTION_DELAY = 1000;

            if (action.type === 'ROLL') {
                const player = this.gameState.players.find(
                    p => p.color === this.gameState.currentTurn
                );
                if (!player) return;

                const rollResult = handleRollRequest(this.gameState, player.id);

                if (rollResult.success) {
                    this.gameState = rollResult.newState;
                    const validPawnIds = getValidPawnIds(this.gameState);

                    broadcast(this.room, {
                        type: 'DICE_RESULT',
                        diceValue: rollResult.diceValue!,
                        player: this.gameState.currentTurn,
                        validPawnIds,
                        isBot: true,
                    });

                    this.room.storage.setAlarm(Date.now() + BOT_ACTION_DELAY);
                } else {
                    Logger.error({ event: 'BOT_ROLL_FAILED', error: rollResult.error });
                    this.skipTurn();
                }
            } else if (action.type === 'MOVE') {
                if (!action.pawnId) {
                    this.skipTurn();
                    return;
                }

                const validMoves = getValidMoves(this.gameState);
                const result = executeMove(this.gameState, action.pawnId, validMoves);

                if (result.success) {
                    this.gameState = result.newState;

                    broadcast(this.room, {
                        type: 'MOVE_EXECUTED',
                        pawnId: action.pawnId,
                        move: this.gameState.lastMove,
                        extraTurn: result.extraTurn ?? false,
                        isBot: true,
                    });

                    if (result.extraTurn) {
                        this.room.storage.setAlarm(Date.now() + BOT_ACTION_DELAY);
                    } else {
                        if (this.gameState.gamePhase !== GamePhase.FINISHED) {
                            this.startTurnTimer();
                        }
                    }
                } else {
                    Logger.error("Bot failed valid move");
                    this.skipTurn();
                }
            } else {
                this.skipTurn();
            }

            this.broadcastState();
        } catch (error) {
            Logger.error({ event: 'BOT_CRASH', error });
            this.skipTurn();
        }
    }

    private broadcastState(oldState?: GameState) {
        this.room.storage.put("gameState", this.gameState);

        if (oldState) {
            broadcast(this.room, createDeltaUpdate(oldState, this.gameState));
        } else {
            broadcast(this.room, {
                type: 'SYNC_STATE',
                state: this.gameState,
            });
        }
    }

    onRequest(req: Party.Request) {
        if (req.method === "GET") {
            return new Response(
                JSON.stringify({
                    status: "ok",
                    room: this.room.id,
                    roomCode: this.roomCode,
                    players: this.gameState.players.length,
                    phase: this.gameState.gamePhase,
                    currentTurn: this.gameState.currentTurn,
                }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        }
        return new Response("Method not allowed", { status: 405 });
    }
}

LudoServer satisfies Party.Worker;
