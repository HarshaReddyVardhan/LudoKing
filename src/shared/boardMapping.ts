import { PlayerColor } from './types';

/**
 * Board Mapping - Single Source of Truth
 * 
 * This module contains all board position mapping logic:
 * 1. toGlobalPosition - Maps player-relative positions to global board positions (for game logic)
 * 2. getGridCoord - Maps positions to UI grid coordinates (for rendering)
 */

// ============================================================================
// GAME LOGIC MAPPING (toGlobalPosition)
// ============================================================================

/**
 * Maps each player's local step (0-57) to global board positions (0-51 for main track, -1 for home stretch)
 * 
 * Each player has their own perspective of the board:
 * - Steps 0-51: Main circular track (52 positions)
 * - Steps 52-57: Home stretch (6 positions, represented as -1 in global map)
 * 
 * The global track positions 0-51 are shared, but each player enters at a different point:
 * - RED starts at global position 0 (step 1)
 * - BLUE starts at global position 13 (step 1)
 * - GREEN starts at global position 26 (step 1)
 * - YELLOW starts at global position 39 (step 1)
 */
const GLOBAL_MAP: Record<PlayerColor, readonly number[]> = {
    RED: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, -1, -1, -1, -1, -1, -1],
    BLUE: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, -1, -1, -1, -1, -1, -1],
    GREEN: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, -1, -1, -1, -1, -1, -1],
    YELLOW: [39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, -1, -1, -1, -1, -1, -1],
};

/**
 * Converts a player's local step position to a global board position
 * @param localStep - The step in the player's journey (0-57)
 * @param color - The player's color
 * @returns Global position (0-51) or -1 if in home stretch
 */
export function toGlobalPosition(localStep: number, color: PlayerColor): number {
    return GLOBAL_MAP[color][localStep] ?? -1;
}

// ============================================================================
// UI COORDINATE MAPPING (getGridCoord)
// ============================================================================

export interface Coordinate {
    r: number;
    c: number;
}

/**
 * Maps a position to grid coordinates for UI rendering
 * @param color - Player color
 * @param position - Position on the board (0=base, 1-52=main track, 53-58=home stretch, 59=goal)
 * @param pawnIndex - Index of the pawn (0-3) for positioning multiple pawns in base
 * @returns Grid coordinate {r, c} for rendering
 */
export function getGridCoord(color: string, position: number, pawnIndex: number = 0): Coordinate {
    // 0 = Base
    if (position === 0) return getBaseCoord(color, pawnIndex);

    // 59 = Goal
    if (position === 59) return { r: 8, c: 8 };

    // 53-58 = Home Stretch
    if (position >= 53) {
        return getHomeStretchCoord(color, position - 53); // 0-5 index
    }

    // 1-52 = Main Track
    // Offsets for each color's starting position (Position 1) on the GLOBAL_TRACK
    // Red starts at index 0
    // Green starts at index 13
    // Yellow starts at index 26
    // Blue starts at index 39
    let offset = 0;
    switch (color) {
        case 'RED': offset = 39; break;
        case 'GREEN': offset = 26; break;
        case 'YELLOW': offset = 26; break;
        case 'BLUE': offset = 13; break;
    }

    // Calculate grid index: (RelativePos - 1 + Offset) % 52
    const loopIndex = (position - 1 + offset) % 52;
    return GLOBAL_TRACK[loopIndex];
}

/**
 * Global track coordinates for the main circular path (52 positions)
 * This maps global positions 0-51 to grid coordinates
 */
const GLOBAL_TRACK: Coordinate[] = [
    // RED START AREA (1-5)
    { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }, { r: 7, c: 6 },
    // UP TO GREEN (6-11)
    { r: 6, c: 7 }, { r: 5, c: 7 }, { r: 4, c: 7 }, { r: 3, c: 7 }, { r: 2, c: 7 }, { r: 1, c: 7 },
    // TURNING (12-13)
    { r: 1, c: 8 }, { r: 1, c: 9 },
    // GREEN HOME RUN ENTRY SIDE (14-18)
    { r: 2, c: 9 }, { r: 3, c: 9 }, { r: 4, c: 9 }, { r: 5, c: 9 }, { r: 6, c: 9 },
    // RIGHT TO YELLOW (19-24)
    { r: 7, c: 10 }, { r: 7, c: 11 }, { r: 7, c: 12 }, { r: 7, c: 13 }, { r: 7, c: 14 }, { r: 7, c: 15 },
    // TURNING (25-26)
    { r: 8, c: 15 }, { r: 9, c: 15 },
    // YELLOW HOME RUN ENTRY SIDE (27-31)
    { r: 9, c: 14 }, { r: 9, c: 13 }, { r: 9, c: 12 }, { r: 9, c: 11 }, { r: 9, c: 10 },
    // DOWN TO BLUE (32-37)
    { r: 10, c: 9 }, { r: 11, c: 9 }, { r: 12, c: 9 }, { r: 13, c: 9 }, { r: 14, c: 9 }, { r: 15, c: 9 },
    // TURNING (38-39)
    { r: 15, c: 8 }, { r: 15, c: 7 },
    // BLUE HOME RUN ENTRY SIDE (40-44)
    { r: 14, c: 7 }, { r: 13, c: 7 }, { r: 12, c: 7 }, { r: 11, c: 7 }, { r: 10, c: 7 },
    // LEFT TO RED (45-50)
    { r: 9, c: 6 }, { r: 9, c: 5 }, { r: 9, c: 4 }, { r: 9, c: 3 }, { r: 9, c: 2 }, { r: 9, c: 1 },
    // TURNING (51-52)
    { r: 8, c: 1 }, { r: 7, c: 1 }
];

/**
 * Gets the grid coordinate for a pawn in its base
 */
function getBaseCoord(color: string, pawnIndex: number = 0): Coordinate {
    // Each base is 6x6. Position pawns in a square pattern within the base
    // Pawn positions will be at (2,2), (2,5), (5,2), (5,5) relative to base top-left
    const offsets = [
        { dr: 2, dc: 2 },  // Top-left pawn
        { dr: 2, dc: 5 },  // Top-right pawn
        { dr: 5, dc: 2 },  // Bottom-left pawn
        { dr: 5, dc: 5 }   // Bottom-right pawn
    ];

    const offset = offsets[pawnIndex % 4];

    switch (color) {
        case 'RED': // Bottom-left base (rows 10-15, cols 1-6)
            return { r: 10 + offset.dr, c: 1 + offset.dc };
        case 'GREEN': // Top-left base (rows 1-6, cols 1-6)
            return { r: 1 + offset.dr, c: 1 + offset.dc };
        case 'YELLOW': // Top-right base (rows 1-6, cols 10-15)
            return { r: 1 + offset.dr, c: 10 + offset.dc };
        case 'BLUE': // Bottom-right base (rows 10-15, cols 10-15)
            return { r: 10 + offset.dr, c: 10 + offset.dc };
        default: return { r: 0, c: 0 };
    }
}

/**
 * Gets the grid coordinate for a position in the home stretch
 */
function getHomeStretchCoord(color: string, index: number): Coordinate {
    // index 0-5
    switch (color) {
        case 'RED': // Moves Right from (8,1)
            return { r: 8, c: 2 + index };
        case 'GREEN': // Moves Down from (1,8)
            return { r: 2 + index, c: 8 };
        case 'YELLOW': // Moves Left from (8,15)
            return { r: 8, c: 14 - index };
        case 'BLUE': // Moves Up from (15,8)
            return { r: 14 - index, c: 8 };
        default: return { r: 8, c: 8 };
    }
}
