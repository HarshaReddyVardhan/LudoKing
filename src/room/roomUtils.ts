/**
 * Room Management Utilities
 * Handles room code generation, validation, player management, and bot logic
 */

import type * as Party from "partykit/server";
import { GameState, Player, PlayerColor } from "../shared/types";
import { createPlayer, initializePawns } from "../logic/gameState";

/**
 * Generates a random 6-digit alphanumeric room code.
 * Uses uppercase letters and numbers, avoiding confusing characters (0, O, I, L, 1).
 */
export function generateRoomCode(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // Removed 0, O, I, L, 1 for clarity
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Validates a room code format.
 * Must be exactly 6 alphanumeric characters.
 */
export function isValidRoomCode(code: string): boolean {
    if (!code || code.length !== 6) return false;
    return /^[A-Z0-9]{6}$/i.test(code);
}

/**
 * Normalizes a room code (uppercase, trimmed).
 */
export function normalizeRoomCode(code: string): string {
    return code.trim().toUpperCase();
}

export const MAX_PLAYERS_PER_ROOM = 4;

// =====================
// PLAYER MANAGEMENT
// =====================

/**
 * Result of a player join attempt
 */
export interface JoinResult {
    success: boolean;
    error?: string;
    player?: Player;
    reconnected?: boolean;
    updatedState?: GameState;
}

/**
 * Finds the next available color for a new player
 */
export function getAvailableColor(gameState: GameState): PlayerColor | null {
    const colors: PlayerColor[] = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
    const takenColors = gameState.players.map(p => p.color);
    return colors.find(c => !takenColors.includes(c)) || null;
}

/**
 * Handles player reconnection logic
 */
export function handlePlayerReconnection(
    gameState: GameState,
    playerId: string,
    newConnectionId: string
): JoinResult {
    const existingPlayer = gameState.players.find(p => p.id === playerId);

    if (!existingPlayer) {
        return { success: false, error: 'Player not found for reconnection' };
    }

    console.log(`Reconnecting player ${existingPlayer.name} (${existingPlayer.id} -> ${newConnectionId})`);

    // Update player ID to new connection ID
    existingPlayer.id = newConnectionId;

    return {
        success: true,
        player: existingPlayer,
        reconnected: true,
        updatedState: gameState
    };
}

/**
 * Validates if a player can join the room
 */
export function validateJoinRequest(
    gameState: GameState,
    create: boolean,
    connectionId: string
): { valid: boolean; error?: string } {
    const playerCount = gameState.players.length;

    // Check if trying to join empty room without create flag
    if (playerCount === 0 && !create) {
        return { valid: false, error: 'Room does not exist' };
    }

    // Check if room is full
    if (playerCount >= MAX_PLAYERS_PER_ROOM) {
        return { valid: false, error: 'Room is full (max 4 players)' };
    }

    // Check for duplicate connection
    const alreadyJoined = gameState.players.find(p => p.id === connectionId);
    if (alreadyJoined) {
        // This is actually a success case - player already joined
        return { valid: true };
    }

    return { valid: true };
}

/**
 * Adds a new player to the game state
 */
export function addPlayerToGame(
    gameState: GameState,
    connectionId: string,
    name: string
): JoinResult {
    // Get available color
    const availableColor = getAvailableColor(gameState);

    if (!availableColor) {
        return { success: false, error: 'No colors available' };
    }

    // Create player and pawns
    const player = createPlayer(connectionId, name, availableColor);
    const pawns = initializePawns(availableColor);

    // Update game state
    const updatedState: GameState = {
        ...gameState,
        players: [...gameState.players, player],
        pawns: [...gameState.pawns, ...pawns],
        lastUpdate: Date.now()
    };

    return {
        success: true,
        player,
        updatedState
    };
}

/**
 * Main handler for player join requests
 */
export function handlePlayerJoin(
    gameState: GameState,
    connectionId: string,
    name: string,
    create: boolean = false,
    playerId?: string
): JoinResult {
    // 1. Handle reconnection if playerId provided
    if (playerId) {
        const reconnectResult = handlePlayerReconnection(gameState, playerId, connectionId);
        if (reconnectResult.success) {
            return reconnectResult;
        }
    }

    // 2. Validate join request
    const validation = validateJoinRequest(gameState, create, connectionId);
    if (!validation.valid) {
        return { success: false, error: validation.error };
    }

    // 3. Check if already joined (return success)
    const alreadyJoined = gameState.players.find(p => p.id === connectionId);
    if (alreadyJoined) {
        return {
            success: true,
            player: alreadyJoined,
            updatedState: gameState
        };
    }

    // 4. Add new player
    return addPlayerToGame(gameState, connectionId, name);
}

// =====================
// BOT MANAGEMENT
// =====================

/**
 * Creates and adds a bot player to the game
 */
export function addBotToGame(gameState: GameState): JoinResult {
    if (gameState.players.length >= MAX_PLAYERS_PER_ROOM) {
        return { success: false, error: 'Room is full' };
    }

    const availableColor = getAvailableColor(gameState);
    if (!availableColor) {
        return { success: false, error: 'No colors available' };
    }

    const botId = `bot-${Date.now()}-${Math.random()}`;
    const botName = `Bot ${availableColor}`;

    const player = createPlayer(botId, botName, availableColor);
    player.isBot = true;

    const pawns = initializePawns(availableColor);

    const updatedState: GameState = {
        ...gameState,
        players: [...gameState.players, player],
        pawns: [...gameState.pawns, ...pawns],
        lastUpdate: Date.now()
    };

    console.log(`Added bot: ${botName} (${botId})`);

    return {
        success: true,
        player,
        updatedState
    };
}

/**
 * Adds multiple bots to the game
 */
export function addMultipleBots(gameState: GameState, count: number): GameState {
    let currentState = gameState;

    for (let i = 0; i < count; i++) {
        const result = addBotToGame(currentState);
        if (result.success && result.updatedState) {
            currentState = result.updatedState;
        } else {
            console.warn(`Failed to add bot ${i + 1}/${count}: ${result.error}`);
            break;
        }
    }

    return currentState;
}

// =====================
// CONNECTION HANDLING
// =====================

/**
 * Creates room info message for new connections
 */
export function createRoomInfoMessage(roomCode: string, gameState: GameState) {
    const currentPlayerCount = gameState.players.length;

    return {
        type: "ROOM_INFO",
        roomCode,
        playerCount: currentPlayerCount,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        isFull: currentPlayerCount >= MAX_PLAYERS_PER_ROOM,
    };
}

/**
 * Creates state sync message
 */
export function createStateSyncMessage(gameState: GameState) {
    return {
        type: "SYNC_STATE",
        state: gameState
    };
}

/**
 * Creates player joined broadcast message
 */
export function createPlayerJoinedMessage(player: Player, totalPlayers: number) {
    return {
        type: 'PLAYER_JOINED',
        player,
        playerCount: totalPlayers,
    };
}

/**
 * Creates join success message
 */
export function createJoinSuccessMessage(
    player: Player,
    roomCode: string,
    reconnected: boolean = false
) {
    return {
        type: 'JOIN_SUCCESS',
        player,
        roomCode,
        reconnected
    };
}

/**
 * Creates join rejected message
 */
export function createJoinRejectedMessage(error: string) {
    return {
        type: 'JOIN_REJECTED',
        error
    };
}
