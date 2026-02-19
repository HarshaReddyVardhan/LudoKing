/**
 * Room Management Utilities
 * Handles room code generation, validation, player management, and bot logic
 */

import type * as Party from "partykit/server";
import { GameState, Player, PlayerColor, Color, ServerMessage, SyncStateMsg, PatchStateMsg } from "../shared/types";
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

import { CONFIG } from "../config";

export const MAX_PLAYERS_PER_ROOM = CONFIG.MAX_PLAYERS;

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
    isSpectator?: boolean;
}

/**
 * Finds the next available color for a new player
 */
export function getAvailableColor(gameState: GameState): PlayerColor | null {
    const colors: PlayerColor[] = [Color.RED, Color.BLUE, Color.GREEN, Color.YELLOW];
    const takenColors = gameState.players.map(p => p.color);
    return colors.find(c => !takenColors.includes(c)) || null;
}

/**
 * Handles player reconnection logic
 */
export function handlePlayerReconnection(
    gameState: GameState,
    playerId: string,
    newConnectionId: string,
    conn?: Party.Connection
): JoinResult {
    const existingPlayer = gameState.players.find(p => p.id === playerId);

    if (!existingPlayer) {
        return { success: false, error: 'Player not found for reconnection' };
    }

    console.log(`Reconnecting player ${existingPlayer.name} (${existingPlayer.id} -> ${newConnectionId})`);

    // Update player connection ID (keep stable ID same)
    existingPlayer.connectionId = newConnectionId;
    existingPlayer.isActive = true;
    existingPlayer.disconnectedAt = undefined;
    existingPlayer.disconnectAction = undefined;

    // Send immediate sync state to the reconnecting player to ensure they have the latest data including their own update
    if (conn) {
        conn.send(JSON.stringify(createStateSyncMessage(gameState)));
    }

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
    connectionId: string,
    name?: string
): { valid: boolean; error?: string; spectator?: boolean } {
    const playerCount = gameState.players.length;

    // Check if trying to join empty room without create flag
    if (playerCount === 0 && !create) {
        return { valid: false, error: 'Room does not exist' };
    }

    // Reject new players joining after game has already started.
    // Reconnections are handled upstream (via handlePlayerReconnection) before
    // this function is ever called, so this only blocks truly new joiners.
    if (gameState.gamePhase !== 'WAITING') {
        // If game in progress, allow as spectator
        return { valid: true, spectator: true };
    }

    // Check if room is full — allow join as spectator (isActive=false) instead of hard reject
    if (playerCount >= gameState.maxPlayers) {
        // Spectator allowed: return valid but caller must set isActive=false
        return { valid: true, spectator: true };
    }

    // Check for duplicate connectionId (already joined via same socket)
    const alreadyJoinedById = gameState.players.find(p => p.connectionId === connectionId);
    if (alreadyJoinedById) {
        // This is actually a success case - player re-used same connection
        return { valid: true };
    }

    // Check for duplicate name - prevent same player joining twice under a different connection
    if (name !== undefined) {
        // Enforce name rules: Alphanumeric + spaces only, max 12 chars
        const nameRegex = /^[a-zA-Z0-9 ]{1,12}$/;
        if (!nameRegex.test(name.trim())) {
            return { valid: false, error: 'Name must be 1-12 alphanumeric characters' };
        }

        const alreadyJoinedByName = gameState.players.find(
            p => p.name.trim().toLowerCase() === name.trim().toLowerCase()
        );
        if (alreadyJoinedByName) {
            return { valid: false, error: `Player with name "${name}" is already in this room` };
        }
    }

    return { valid: true };
}

/**
 * Strips HTML tags and encodes special characters to prevent XSS.
 */
function sanitizeName(raw: string): string {
    return raw
        .replace(/<[^>]*>/g, '')          // strip HTML tags
        .replace(/[&<>"'`]/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;',
            '"': '&quot;', "'": '&#39;', '`': '&#96;'
        })[c] ?? c)
        .trim()
        .slice(0, 32); // max 32 chars
}

/**
 * Adds a new player to the game state
 */
export function addPlayerToGame(
    gameState: GameState,
    connectionId: string,
    name: string,
    stableId?: string,
    spectator?: boolean
): JoinResult {
    const safeName = sanitizeName(name);

    // Get available color (spectators share the next available slot or get none)
    const availableColor = getAvailableColor(gameState);

    if (!availableColor && !spectator) {
        return { success: false, error: 'No colors available' };
    }

    if (!availableColor) {
        // Spectator with no free color slot: still allow but no pawn color
        // We still need a color placeholder — use first color (they won't get pawns)
        // For now, reject spectators when no color is available (edge case)
        return { success: false, error: 'No color slot for spectator' };
    }

    // Create player and pawns
    const player = createPlayer(connectionId, safeName, availableColor, stableId);
    if (spectator) {
        player.isActive = false;
    }
    const pawns = spectator ? [] : initializePawns(availableColor);

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
    playerId?: string,
    totalPlayers?: number,
    conn?: Party.Connection
): JoinResult {
    // 0. Update maxPlayers if creating and specified
    if (create && totalPlayers && gameState.players.length === 0) {
        gameState.maxPlayers = Math.max(2, Math.min(4, totalPlayers));
    }

    // 1. Handle reconnection if playerId provided
    if (playerId) {
        const reconnectResult = handlePlayerReconnection(gameState, playerId, connectionId, conn);
        if (reconnectResult.success) {
            return reconnectResult;
        }
    }

    // 2. Validate join request (includes name-duplicate check)
    const validation = validateJoinRequest(gameState, create, connectionId, name);
    if (!validation.valid) {
        return { success: false, error: validation.error };
    }

    // 2.5 Handle Spectator Logic (Room Full or Game in Progress)
    if (validation.spectator) {
        // Create a transient spectator player object
        const spectatorPlayer: Player = {
            id: `spec-${connectionId}`,
            connectionId: connectionId,
            name: `${name} (Spectator)`,
            color: Color.RED, // Dummy color, won't be used since not in state logic checks ideally
            isBot: false,
            isActive: false,
            rank: undefined
        };

        return {
            success: true,
            player: spectatorPlayer,
            isSpectator: true,
            updatedState: undefined // Do NOT update state
        };
    }

    // 3. Check if already joined by connectionId (return success without re-adding)
    const alreadyJoined = gameState.players.find(p => p.connectionId === connectionId);
    if (alreadyJoined) {
        return {
            success: true,
            player: alreadyJoined,
            updatedState: gameState
        };
    }

    // 4. Add new player
    return addPlayerToGame(gameState, connectionId, name, playerId);
}

// =====================
// BOT MANAGEMENT
// =====================

/**
 * Creates and adds a bot player to the game
 */
export function addBotToGame(gameState: GameState): JoinResult {
    if (gameState.players.length >= gameState.maxPlayers) {
        return { success: false, error: 'Room is full' };
    }

    const availableColor = getAvailableColor(gameState);
    if (!availableColor) {
        return { success: false, error: 'No colors available' };
    }

    const botId = `bot-${Date.now()}-${Math.random()}`;
    const botName = `Bot ${availableColor}`;

    // For bots, connectionId is same as id
    const player = createPlayer(botId, botName, availableColor, botId);
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
        maxPlayers: gameState.maxPlayers,
        isFull: currentPlayerCount >= gameState.maxPlayers,
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

/**
 * Cleans up room resources when a room is empty.
 * @param roomId The ID of the room to delete (for logging)
 * @param room The PartyKit room instance (needed to clear storage)
 */
export async function deleteRoom(roomId: string, room: Party.Room) {
    console.log(`[Room ${roomId}] Deleting room and clearing storage...`);
    // Clear all storage (alarms, persisted state) to prevent leaks
    await room.storage.deleteAll();
}
// =====================
// STATE DELTA UPDATE
// =====================

/**
 * Creates a delta update message containing only changed properties.
 * Currently optimized for pawn positions and game phase.
 */
export function createDeltaUpdate(oldState: GameState, newState: GameState): ServerMessage {
    const patch: Partial<GameState> = {};
    let hasChanges = false;

    // Check phase change
    if (oldState.gamePhase !== newState.gamePhase) {
        patch.gamePhase = newState.gamePhase;
        hasChanges = true;
    }

    // Check turn change
    if (oldState.currentTurn !== newState.currentTurn) {
        patch.currentTurn = newState.currentTurn;
        hasChanges = true;
    }

    // Check dice value
    if (oldState.currentDiceValue !== newState.currentDiceValue) {
        patch.currentDiceValue = newState.currentDiceValue;
        hasChanges = true;
    }

    // Check pawns (only include changed pawns to save bandwidth)
    // However, if pawns array length changes (add/remove), send full array.
    if (oldState.pawns.length !== newState.pawns.length) {
        patch.pawns = newState.pawns;
        hasChanges = true;
        // Send only changed pawns
        const changedPawns = newState.pawns.filter((p, i) => {
            const oldP = oldState.pawns[i];
            return !oldP || p.position !== oldP.position || p.pawnIndex !== oldP.pawnIndex;
        });

        if (changedPawns.length > 0) {
            patch.pawns = changedPawns;
            hasChanges = true;
        }
    }

    if (hasChanges) {
        patch.lastUpdate = Date.now();
        return {
            type: 'PATCH_STATE',
            patch
        };
    }

    return createStateSyncMessage(newState) as ServerMessage;
}
