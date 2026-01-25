/**
 * Room Management Utilities
 * Handles room code generation and validation
 */

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
