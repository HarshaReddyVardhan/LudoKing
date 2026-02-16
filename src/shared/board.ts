import { PlayerColor } from './types';

import {
    POSITION_HOME,
    POSITION_GOAL,
    BOARD_PATH_LENGTH,
    HOME_STRETCH_START,
    HOME_STRETCH_END,
    SAFE_ZONES
} from './constants';

export const BOARD = {
    HOME: POSITION_HOME,
    GOAL: POSITION_GOAL,
    MAIN_TRACK_LENGTH: BOARD_PATH_LENGTH,
    HOME_STRETCH_START: HOME_STRETCH_START,
    HOME_STRETCH_END: HOME_STRETCH_END,

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
    SAFE_SQUARES: SAFE_ZONES as readonly number[],
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

// Re-export toGlobalPosition from the centralized boardMapping module
export { toGlobalPosition } from './boardMap';
