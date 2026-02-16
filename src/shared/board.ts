import { PlayerColor } from './types';

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

const GLOBAL_POS_MAP: Record<PlayerColor, readonly number[]> = {
    RED: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, -1, -1, -1, -1, -1, -1],
    BLUE: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, -1, -1, -1, -1, -1, -1],
    GREEN: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, -1, -1, -1, -1, -1, -1],
    YELLOW: [39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, -1, -1, -1, -1, -1, -1],
};

export function toGlobalPosition(localStep: number, color: PlayerColor): number {
    return GLOBAL_POS_MAP[color][localStep] ?? -1;
}
