import { PlayerColor } from '../../../src/shared/types';
import { BOARD } from '../../../src/shared/board';

export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

/**
 * Returns the 3D position for a given global board index (1-52).
 * Uses a circular path approximation centered at origin.
 */
export function getBoardPosition(globalIndex: number): Vector3 {
    const clampedIndex = Math.max(1, Math.min(52, globalIndex));

    const angle = ((clampedIndex - 1) / 52) * Math.PI * 2;
    const radius = 7;
    const finalAngle = angle - (Math.PI / 2) + (Math.PI / 52);

    return {
        x: Math.cos(finalAngle) * radius,
        y: 0,
        z: Math.sin(finalAngle) * radius
    };
}

/**
 * Returns the 3D position for a pawn in the home stretch.
 * @param color - The player's color
 * @param stepIndex - The step in the home stretch (0-5, where 5 is the goal)
 */
export function getHomePosition(color: PlayerColor, stepIndex: number): Vector3 {
    const baseVal = 7 - stepIndex;

    switch (color) {
        case 'RED': return { x: 0, y: 0, z: -baseVal };
        case 'GREEN': return { x: -baseVal, y: 0, z: 0 };
        case 'YELLOW': return { x: 0, y: 0, z: baseVal };
        case 'BLUE': return { x: baseVal, y: 0, z: 0 };
        default: return { x: 0, y: 0, z: 0 };
    }
}

/**
 * Returns the 3D position for a pawn based on its logical position.
 * @param color - The player's color
 * @param logicalPosition - The logical position from game state
 */
export function getPawn3DPosition(color: PlayerColor, logicalPosition: number): Vector3 {
    if (logicalPosition === BOARD.HOME) {
        switch (color) {
            case 'RED': return { x: 6, y: 0, z: -6 };
            case 'BLUE': return { x: -6, y: 0, z: -6 };
            case 'YELLOW': return { x: -6, y: 0, z: 6 };
            case 'GREEN': return { x: 6, y: 0, z: 6 };
        }
    }

    if (logicalPosition === BOARD.GOAL) {
        return { x: 0, y: 1, z: 0 };
    }

    if (logicalPosition >= BOARD.HOME_STRETCH_START) {
        const step = logicalPosition - BOARD.HOME_STRETCH_START;
        return getHomePosition(color, step);
    }

    const startPos = BOARD.START_POSITIONS[color];
    const globalPos = ((logicalPosition - 1 + startPos - 1) % BOARD.MAIN_TRACK_LENGTH) + 1;

    return getBoardPosition(globalPos);
}
