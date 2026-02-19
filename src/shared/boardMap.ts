import { PlayerColor } from './types';
import { BOARD_PATH_LENGTH, HOME_STRETCH_START, POSITION_GOAL, POSITION_HOME } from './constants';

/**
 * Board Mapping - Single Source of Truth
 * 
 * This module contains all board position mapping logic:
 * 1. toGlobalPosition - Maps player-relative positions to global board positions (for game logic)
 * 2. getGridCoord - Maps positions to UI grid coordinates (for rendering)
 * 3. getCoordinates - Direct mapping of track index to coordinates
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
    if (position === POSITION_HOME) return getBaseCoord(color, pawnIndex);

    // 59 = Goal
    if (position === POSITION_GOAL) return { r: 8, c: 8 };

    // 53-58 = Home Stretch
    // 53-58 = Home Stretch
    if (position >= HOME_STRETCH_START) {
        return getHomeStretchCoord(color, position - HOME_STRETCH_START); // 0-5 index
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
    const loopIndex = (position - 1 + offset) % BOARD_PATH_LENGTH;
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

/**
 * Gets the grid coordinate for a given index on the main track.
 * @param index - The global track index (0-51)
 * @returns The grid coordinate {r, c}
 */
export function getCoordinates(index: number): Coordinate {
    if (index < 0 || index >= GLOBAL_TRACK.length) {
        return { r: 0, c: 0 }; // Fallback or throw error
    }
    return GLOBAL_TRACK[index];
}

// Indices of safe squares on the global track
export const SAFE_TRACK_INDICES = [0, 8, 13, 22, 26, 35, 39, 48];

/**
 * Checks if a grid coordinate represents a safe square (Star)
 */
export function isSafeGridCoord(r: number, c: number): boolean {
    return SAFE_TRACK_INDICES.some(index => {
        const coord = GLOBAL_TRACK[index];
        return coord.r === r && coord.c === c;
    });
}

/**
 * Determines the zone (Base) of a grid coordinate
 * @returns 'RED', 'GREEN', 'YELLOW', 'BLUE' or null
 */
export function getBoardZone(r: number, c: number): string | null {
    if (r <= 6 && c <= 6) return 'GREEN';
    if (r <= 6 && c >= 10) return 'YELLOW';
    if (r >= 10 && c <= 6) return 'RED';
    if (r >= 10 && c >= 10) return 'BLUE';
    return null;
}

/**
 * Debug utility to visualize the board path for a specific player color.
 * Returns an ASCII representation of the board with the path marked.
 */
export function validateBoardPath(color: PlayerColor): string {
    const grid: string[][] = Array(17).fill(null).map(() => Array(17).fill(' . '));

    // Mark global track
    for (let i = 0; i < GLOBAL_TRACK.length; i++) {
        const { r, c } = GLOBAL_TRACK[i];
        if (r >= 0 && r < 17 && c >= 0 && c < 17) {
            grid[r][c] = ' . '; // Reset to dot
        }
    }

    // Trace player path
    for (let step = 0; step <= 57; step++) { // 0-51 + 52-57 (home stretch)
        const globalPos = toGlobalPosition(step, color);
        // We need to map globalPos to grid coord
        // Use the existing getGridCoord logic logic, but we need to reconstruct the "position" expected by getGridCoord
        // getGridCoord expects: 0=base (we skip), 1-52=main, 53-58=home stretch, 59=goal

        // Map local stride (0-57) to the "position" argument for getGridCoord
        let posArg = 0;
        if (step < 52) {
            // toGlobalPosition gives us 0-51.
            // getGridCoord for main track takes "position" which is ... actually, getGridCoord logic is:
            // Main Track: loopIndex = (position - 1 + offset) % 52.
            // But we have the global index directly from toGlobalPosition!
            // Let's use getCoordinates(globalPos) for main track.
            if (globalPos !== -1) {
                const { r, c } = getCoordinates(globalPos);
                if (r >= 0 && r < 17 && c >= 0 && c < 17) {
                    grid[r][c] = step.toString().padStart(3, ' ');
                }
                continue;
            }
        }

        // If globalPos is -1, it's home stretch or goal.
        // step 51 is the last main track step.
        // step 52-57 are home stretch? 
        // Let's check logic:
        // Main track: 0 to 51.
        // Home stretch: indices 0-5 in getHomeStretchCoord?

        // Let's rely on getGridCoord.
        // local step 0 is start?
        // getGridCoord(color, position)
        // position 1 = first step on main track.
        // position 52 = last step on main track.
        // position 53 = first step on home stretch.
        // position 57 = ???

        // Let's assume standard Ludo:
        // Path length is 57 positions?
        // 52 main + 5 home stretch + 1 goal = 58?

        // Let's just use the Grid Coordinates directly if we can matches.

        // Actually, let's just use getGridCoord with the "position" abstraction used in the game:
        // position 1 is the start.
        // position 52 is just before home stretch entry?
        // position 53-58 is home stretch?
        // Let's iterate 1 to 59?

        // The prompt says "render the grid coordinates to console/canvas to verify path".
        // Let's iterate position 1 to 59.

    }

    // Better Approach: Iterate 1 to 59 (Move Logic positions) + Base (0)

    const output: string[] = [];

    output.push(`Path for ${color}:`);

    // Base
    const base = getGridCoord(color, 0, 0);
    grid[base.r][base.c] = '[B]';

    // Path 1-58
    for (let pos = 1; pos <= 58; pos++) { // 1..52 (main), 53..58 (home)
        const coord = getGridCoord(color, pos);
        if (coord.r >= 0 && coord.r < 17 && coord.c >= 0 && coord.c < 17) {
            // Mark direction if possible, or just number
            grid[coord.r][coord.c] = pos.toString().padStart(3, ' ');
        }
    }

    // Goal 59
    const goal = getGridCoord(color, 59);
    grid[goal.r][goal.c] = '[G]';

    // Render grid
    for (let r = 0; r < 17; r++) {
        output.push(grid[r].join(''));
    }

    return output.join('\n');
}

