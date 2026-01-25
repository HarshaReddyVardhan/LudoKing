import { PlayerColor, COLORS } from './types';

/**
 * Ludo Board Layout Constants
 * 
 * Board positions:
 * - 0: Home/Base (pawn not on board)
 * - 1-52: Main track (shared by all players)
 * - 53-58: Home stretch (color-specific, leads to goal)
 * - 59: Goal (finished)
 * 
 * Each color has:
 * - A starting position on the main track (where they enter after rolling 6)
 * - A home entry position (where they leave main track to enter home stretch)
 */

export const BOARD = {
    HOME: 0,
    GOAL: 59,
    MAIN_TRACK_LENGTH: 52,
    HOME_STRETCH_START: 53,
    HOME_STRETCH_END: 58,

    // Starting positions on the main track (1-indexed, where pawn enters after leaving base)
    START_POSITIONS: {
        RED: 1,
        BLUE: 14,
        GREEN: 27,
        YELLOW: 40,
    } as Record<PlayerColor, number>,

    // Position where each color exits main track to enter home stretch
    HOME_ENTRY_POSITIONS: {
        RED: 52,
        BLUE: 13,
        GREEN: 26,
        YELLOW: 39,
    } as Record<PlayerColor, number>,

    // Safe squares where pawns cannot be captured
    SAFE_SQUARES: [1, 9, 14, 22, 27, 35, 40, 48] as readonly number[],
} as const;

/**
 * Gets the next player color in turn order
 */
export function getNextTurn(current: PlayerColor, activePlayers: PlayerColor[]): PlayerColor {
    const currentIndex = activePlayers.indexOf(current);
    const nextIndex = (currentIndex + 1) % activePlayers.length;
    return activePlayers[nextIndex];
}

/**
 * Checks if a square is a safe square
 */
export function isSafeSquare(position: number): boolean {
    return BOARD.SAFE_SQUARES.includes(position);
}

/**
 * Converts a pawn's logical position to a global board position
 * considering the color's offset on the circular track.
 * 
 * This is used internally for collision detection between different colors.
 */
export function toGlobalPosition(localPosition: number, color: PlayerColor): number {
    if (localPosition === BOARD.HOME || localPosition >= BOARD.HOME_STRETCH_START) {
        // Home, goal, or home stretch positions are not on the shared track
        return -1;
    }

    const startPos = BOARD.START_POSITIONS[color];
    // Calculate global position on the 52-square track
    return ((localPosition - 1 + startPos - 1) % BOARD.MAIN_TRACK_LENGTH) + 1;
}
