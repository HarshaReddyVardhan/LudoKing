export interface Coordinate {
    r: number;
    c: number;
}

// 0-51 Main Track Logic implemented in getGridCoord and GLOBAL_TRACK
export function getGridCoord(color: string, position: number): Coordinate {
    // 0 = Base
    if (position === 0) return getBaseCoord(color);

    // 59 = Goal
    if (position === 59) return { r: 8, c: 8 };

    // 53-58 = Home Stretch
    if (position >= 53) {
        return getHomeStretchCoord(color, position - 53); // 0-5 index
    }

    // 1-52 = Main Track
    // Standardize to Red's perspective (offset 0)
    // Red Start = 1.
    // If my TRACK_NODES starts at some arbitrary point, I need to find offset.
    // Let's say TRACK_NODES[0] is (14,7). 
    // This looks like Blue's output path.
    // Let's find (7,2). It is index 13 in TRACK_NODES roughly.
    // Actually, I should just recompute the track to start exactly at Red's 1.

    // Re-ordered Track starting at Red's Pos 1 (7, 2)
    // 1. (7,2) to (7,6) -> 5
    // 2. (6,7) to (1,7) -> 6
    // 3. (1,8) to (1,9) -> 2
    // 4. (2,9) to (6,9) -> 5
    // 5. (7,10) to (7,15) -> 6
    // 6. (8,15) to (9,15) -> 2
    // 7. (9,14) to (9,10) -> 5
    // 8. (10,9) to (15,9) -> 6
    // 9. (15,8) to (15,7) -> 2
    // 10. (14,7) to (10,7) -> 5
    // 11. (9,6) to (9,1) -> 6
    // 12. (8,1) -> 1
    // Total 51? + (7,1)? Need 52.

    // Let's use the standard mapped nodes array in code.
    const loopIndex = (position - 1) % 52;
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

function getBaseCoord(color: string): Coordinate {
    switch (color) {
        case 'RED': return { r: 13, c: 3 }; // Center of BL
        case 'GREEN': return { r: 3, c: 3 }; // Center of TL
        case 'YELLOW': return { r: 3, c: 13 }; // Center of TR
        case 'BLUE': return { r: 13, c: 13 }; // Center of BR
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
