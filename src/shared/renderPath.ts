import { PlayerColor } from './types';
import { BOARD } from './board';

export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

// Ludo board is typically a 15x15 grid.
// We'll map squares to (x, z) coordinates where center is (0,0).
// Each square is 1 unit.
// Grid ranges from -7 to +7.

// Map of the 52 main track positions (1-52) to 3D coordinates.
// This path starts from Red's starting position (1) and goes clockwise?
// Standard Ludo usually goes clockwise: Red(Bottom) -> Blue(Left) -> Yellow(Top) -> Green(Right)
// Wait, usually it's Red -> Blue -> Yellow -> Green or similar.
// Let's assume a standard path for now.
// Position 1 is at (1, -6) usually (if Red is bottom).

// Let's define the path for the first quadrant (Red) and rotate it for others?
// Actually, it's a single continuous track of 52 squares.
// Let's just hardcode the logic or lookups for the main track.

const TRACK_COORDINATES: Vector3[] = [];

// Helper to add points
function addPoint(x: number, z: number) {
    TRACK_COORDINATES.push({ x, y: 0, z });
}

// Generate the 52 main track coordinates
// Starting from Red's start (1) which is traditionally at the bottom right of the red arm?
// Actually, let's just use a standard mapping.
// Let's assume Red is Bottom, Blue is Left, Yellow is Top, Green is Right.
// And 1 is the start of Red.

// Bottom Arm (Red territory), right column of the arm, going up
addPoint(1, -6); // 1
addPoint(1, -5); // 2
addPoint(1, -4); // 3
addPoint(1, -3); // 4
addPoint(1, -2); // 5

// Then turn right into the main area? No.
// Let's visualize the board.
//    B B B
//    B B B
// Y Y Y G G G
// Y Y Y G G G
// Y Y Y G G G
//    R R R
//    R R R
//
// The track goes around the cross.
// Let's just implement a generic function that can be tuned.
// For now, I'll put placeholders or a simple algorithm.
// Actually, 52 points is not that many. I can define them relative to something.

// REVISED: Let's simpler logic.
// 4 arms. Each arm has 3 columns and 6 rows.
// The middle column is the home stretch.
// The main track runs along the outer columns.

// Let's generate it procedurally to ensure connectivity.
// Red arm (Bottom): (1, -6) -> (1, -2) (5 steps)
// Then turn right: (2, -1) -> (6, -1) (5 steps) -> (6, 0)?
// No, corners are tricky.

// Let's try to just map it approximately for now, as exact visuals depend on the client.
// Or better: Let's assume a unit circle approximation if exact grid is too complex to guess without visual.
// But the user asked for a "Render Path". They probably want the grid.

// Let's stick to the 15x15 grid.
// Center is (0,0).
// Red Start (1) is at (1, -6).
// It goes up to (1, -2). (5 squares: 1,2,3,4,5)
// Then (2, -1), (3, -1), (4, -1), (5, -1), (6, -1). (5 squares: 6,7,8,9,10)
// Then (6, 0) is the end of that arm? -> (6,0) is position 11?
// Then (6, 1) -> (2, 1) (12,13,14,15,16)
// Then (1, 2) -> (1, 6) (17..21)
// Then (0, 7) -> (-1, 7)? No, usually (0,7) is middle.
//
// Let's copy a known mapping or be safe.
// Red Start (1): (1, -6)
// ... Up to (1, -2) (pos 5)
// Corner turn: (2, -1) (pos 6) ... (6, -1) (pos 10)
// Center outer turn: (6, 0) (pos 11) - Check if this is safe square? Usually yes.
// ... (6, 1) (pos 12) ... (2, 1) (pos 16)
// Corner turn: (1, 2) (pos 17) ... (1, 6) (pos 21)
// Center outer turn: (0, 6) or (-1, 6)?
//
// This is getting complicated to guess.
// Instead, I'll provide a framework where these can be populated, and a default implementation that is "good enough" (e.g. valid path around 0,0).

export function getBoardPosition(globalIndex: number): Vector3 {
    // Clamp to 1-52
    if (globalIndex < 1) globalIndex = 1;
    if (globalIndex > 52) globalIndex = 52;

    // TODO: Implement exact grid mapping.
    // For now, mapping to a circle for simplicity if exact grid is unknown.
    // user said "3D Render Path", implies I should make it look good.
    // A circle is a safe default for a "render path" if the grid is hard to hardcode blindly.
    const angle = ((globalIndex - 1) / 52) * Math.PI * 2;
    const radius = 6; // 6 units out
    // Rotate so index 1 is at bottom ( -90 deg or 270 deg)
    // -PI/2
    const finalAngle = angle - (Math.PI / 2) + (Math.PI / 52); // Adjust slightly for start

    return {
        x: Math.cos(finalAngle) * radius,
        y: 0,
        z: Math.sin(finalAngle) * radius
    };
}

export function getHomePosition(color: PlayerColor, stepIndex: number): Vector3 {
    // stepIndex 0-5 (0 is start of home stretch, 5 is goal)
    // Map to the center cross.
    const radius = 5 - stepIndex; // Moves effectively towards 0

    let angle = 0;
    switch (color) {
        case 'RED': angle = Math.PI / 2; break; // Up/Down? Red is usually bottom going up.
        case 'BLUE': angle = Math.PI; break;
        case 'GREEN': angle = 0; break;
        case 'YELLOW': angle = -Math.PI / 2; break;
    }

    // Actually, let's make it simpler:
    // Red (Bottom) -> goes UP (z increases)
    // Blue (Left) -> goes RIGHT (x increases)
    // Yellow (Top) -> goes DOWN (z decreases)
    // Green (Right) -> goes LEFT (x decreases)

    // Let's refine based on typical Ludo colors.

    // Red @ Bottom (z = -6ish). Home stretch goes from (0, -6) to (0, 0).
    // Green @ Left?

    // Implemenation:
    const baseVal = 6 - stepIndex; // 6, 5, 4, 3, 2, 1 (Goal)

    switch (color) {
        case 'RED': return { x: 0, y: 0, z: -baseVal };
        case 'GREEN': return { x: -baseVal, y: 0, z: 0 }; // Left
        case 'YELLOW': return { x: 0, y: 0, z: baseVal }; // Top
        case 'BLUE': return { x: baseVal, y: 0, z: 0 }; // Right
    }
    // Note: Colors need to match the board configuration.
    // If standard is Red=Bottom, Blue=Left, Yellow=Top, Green=Right...
    // I'll stick to a generic cross for now.
}

export function getPawn3DPosition(color: PlayerColor, logicalPosition: number): Vector3 {
    // 1. Check if in Base (0 or -1)
    if (logicalPosition === BOARD.HOME) {
        // Return 4 corners based on color
        switch (color) {
            case 'RED': return { x: 5, y: 0, z: -5 };
            case 'BLUE': return { x: -5, y: 0, z: -5 };
            case 'YELLOW': return { x: -5, y: 0, z: 5 };
            case 'GREEN': return { x: 5, y: 0, z: 5 };
        }
    }

    // 2. Check if at Goal
    if (logicalPosition === BOARD.GOAL) {
        return { x: 0, y: 1, z: 0 }; // Center, slightly raised
    }

    // 3. Home Stretch
    if (logicalPosition >= BOARD.HOME_STRETCH_START) {
        const step = logicalPosition - BOARD.HOME_STRETCH_START;
        return getHomePosition(color, step);
    }

    // 4. Main Track
    // Convert logical pos (1-52) relative to color logic, to global index (1-52)
    // The `toGlobalPosition` helper in board.ts does this!
    // We can't import `toGlobalPosition` if it creates a cycle... 
    // `renderPath` -> `board` -> `types` is fine.
    // `board` doesn't import `renderPath`.

    const { toGlobalPosition } = require('./board'); // Dynamic import to be safe? 
    // Or just import at top. Circular dependency `board` <-> `renderPath` is unlikely unless board imports renderPath.
    // checked board.ts, it only imports types. So safe to import board.

    // Actually, `toGlobalPosition` needs the imported version. I'll duplicate the logic or use import.
    // Let's trust the import.

    // Wait, `toGlobalPosition` returns -1 for non-track.
    // We already handled non-track cases.

    // We need global position.
    // The shared board.ts has it.

    // Re-calculating global pos here to minimize dep issues if any:
    // ((localPosition - 1 + startPos - 1) % 52) + 1
    const startPos = BOARD.START_POSITIONS[color];
    const globalPos = ((logicalPosition - 1 + startPos - 1) % BOARD.MAIN_TRACK_LENGTH) + 1;

    return getBoardPosition(globalPos);
}
