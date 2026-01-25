export interface Coordinate {
    row: number;
    col: number;
}

// 0-51 Main Track Coordinates (Standard Ludo Loop)
// Assuming standard path starting from Red's start position (index 0 in this array corresponds to Red's Pos 1)
// Red Start: (14, 2) in 1-15 grid?
// Let's define the segments.

// Left Arm (Top Row): (7, 2) -> (7, 6) (Left to Right)
// Green Start is at (2, 9)? 
// Let's define the Global Track (1-52) starting from Red Start.
// We'll adjust offsets for colors later.

// Hardcoded track for the "Skeleton" - verification needed visually.
const MAIN_TRACK: Coordinate[] = [
    // Red Start Segment (Bottom-Left Area moving Right? No, usually Up or Right)
    // Let's assume Red Base is Bottom-Left.
    // Start at (14, 2)? 
    // Let's follow a standard path:
    // 1. Up from (14, 7) ? No, that's home stretch.
    // Path runs clockwise usually.

    // Let's use a unified coordinate system
    // Bottom-Left Start square: Row 14, Col 2.
    // Move Up? (13, 2)... (9, 2).
    // Then turn Right?

    // Alternative: Red starts Row 7, Col 2. Moves Right.
    // (7,2), (7,3), (7,4), (7,5), (7,6) -> 5 squares.
    // (6,7), (5,7), (4,7), (3,7), (2,7), (1,7) -> Up the Green arm.
    // (1,8), (1,9) -> Top Middle.
    // (2,9), (3,9), (4,9), (5,9), (6,9) -> Down the Green/Yellow arm.
    // (7,10), (7,11), (7,12), (7,13), (7,14), (7,15) -> Right the Yellow arm.
    // (8,15), (9,15) -> Right Middle.
    // (9,14), (9,13), (9,12), (9,11), (9,10) -> Left.
    // (10,9), (11,9), (12,9), (13,9), (14,9), (15,9) -> Down Blue arm.
    // (15,8), (15,7) -> Bottom Middle.
    // (14,7), (13,7), (12,7), (11,7), (10,7) -> Up.
    // (9,6), (9,5), (9,4), (9,3), (9,2), (9,1) -> Left.
    // (8,1) -> Left Middle.
    // (7,1) -> Back to start?

    // This is 52 steps. Let's map it.
];

// Helper to generate range
function range(start: number, count: number, step: { r: number, c: number }): Coordinate[] {
    const res = [];
    let curr = { ...start }; // Fix: start is Coordinate, not number
    for (let i = 0; i < count; i++) {
        res.push({ ...curr });
        curr.row += step.r;
        curr.col += step.c;
    }
    return res;
}

// Defining Segment by Segment
// Segment 1: Bottom-Left Arm, Top Row (Left -> Right)
// Starts at (9, 2) moves Right? (Standard Red Start)
// Let's try:
// R: 14 to 9, Col 7 (Up)
// R: 7, Col 2 to 6 (Right)

// Refined Path (Clockwise from Bottom-Left):
// 1. (14, 7) -> (10, 7) (Up 5)
// 2. (9, 6) -> (9, 1) (Left 6) -- Wait, this enters base?
// Grid is 15x15.
// Center is (8,8).
// Arms are cols 7-9 and rows 7-9.

const TRACK_NODES: Coordinate[] = [
    // Bottom-Left Quadrant (Red Area)
    // Up along Col 7
    { r: 14, c: 7 }, { r: 13, c: 7 }, { r: 12, c: 7 }, { r: 11, c: 7 }, { r: 10, c: 7 },
    // Turn Left into Row 9
    { r: 9, c: 6 }, { r: 9, c: 5 }, { r: 9, c: 4 }, { r: 9, c: 3 }, { r: 9, c: 2 }, { r: 9, c: 1 },
    // Turn Up (Row 8)
    { r: 8, c: 1 },
    // Top Row of Bottom-Left (Row 7) - Moving Right
    { r: 7, c: 1 }, { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }, { r: 7, c: 6 },

    // Top-Left Quadrant (Green Area)
    // Up along Col 7
    { r: 6, c: 7 }, { r: 5, c: 7 }, { r: 4, c: 7 }, { r: 3, c: 7 }, { r: 2, c: 7 }, { r: 1, c: 7 },
    // Turn Right (Row 1)
    { r: 1, c: 8 }, { r: 1, c: 9 },
    // Down along Col 9
    { r: 2, c: 9 }, { r: 3, c: 9 }, { r: 4, c: 9 }, { r: 5, c: 9 }, { r: 6, c: 9 },

    // Top-Right Quadrant (Yellow Area)
    // Right along Row 7
    { r: 7, c: 10 }, { r: 7, c: 11 }, { r: 7, c: 12 }, { r: 7, c: 13 }, { r: 7, c: 14 }, { r: 7, c: 15 },
    // Turn Down (Col 15)
    { r: 8, c: 15 }, { r: 9, c: 15 },
    // Left along Row 9
    { r: 9, c: 14 }, { r: 9, c: 13 }, { r: 9, c: 12 }, { r: 9, c: 11 }, { r: 9, c: 10 },

    // Bottom-Right Quadrant (Blue Area)
    // Down along Col 9
    { r: 10, c: 9 }, { r: 11, c: 9 }, { r: 12, c: 9 }, { r: 13, c: 9 }, { r: 14, c: 9 }, { r: 15, c: 9 },
    // Turn Left (Row 15)
    { r: 15, c: 8 }, { r: 15, c: 7 },
    // Up along Col 7? (This closes the loop at 14,7)
];

// Verify count: 5+6+1 + 6+6+2 + 6+2+5?
// Above manual list:
// 1. (14,7)..(10,7) = 5
// 2. (9,6)..(9,1) = 6
// 3. (8,1) = 1
// 4. (7,1)..(7,6) = 6
// 5. (6,7)..(1,7) = 6
// 6. (1,8)..(1,9) = 2
// 7. (2,9)..(6,9) = 5
// 8. (7,10)..(7,15) = 6
// 9. (8,15)..(9,15) = 2
// 10. (9,14)..(9,10) = 5
// 11. (10,9)..(15,9) = 6
// 12. (15,8)..(15,7) = 2
// Total: 5+6+1+6+6+2+5+6+2+5+6+2 = 52. Perfect.

// Indices mapping:
// Red Start (Pos 1): (7, 2)? 
// Let's map standard Ludo start positions.
// Red (Bottom Left): Starts at scale index 1?
// Actually, `src/shared/board.ts` says `BOARD.START_POSITIONS.RED` is 1.
// In the array above, index 0 is (14,7).
// Does Red start at (14,7)? 
// (14,7) is the first square out of Blue? No.
// Let's map strictly.
// Red Base (Bottom-Left).
// The square causing entry to track is typically (9, 2) or (7, 2).
// Start Position 1 (Red) = (7, 2) (index 13 in my array?)
// Check: (7,1) is index 12. (7,2) is index 13.
// Let's reorder the array to start at Red's logical 1.

// Rotated Array:
// Red Start (1) -> (7, 2)
// Blue Start (14) -> (2, 9)?
// Green Start (27) -> (9, 14)?
// Yellow Start (40) -> (14, 7)?

// Let's implement function to get Coord
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
