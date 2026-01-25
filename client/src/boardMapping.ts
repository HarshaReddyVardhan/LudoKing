export interface Coordinate {
    r: number;
    c: number;
}

// 0-51 Main Track Logic implemented in getGridCoord and GLOBAL_TRACK
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
