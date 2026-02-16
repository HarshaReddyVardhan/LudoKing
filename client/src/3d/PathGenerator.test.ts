import { describe, it, expect } from 'vitest';
import { getBoardPosition, getHomePosition, getPawn3DPosition } from './PathGenerator';
import { BOARD } from '../../../src/shared/board';

describe('PathGenerator', () => {
    describe('getBoardPosition', () => {
        it('should return coordinates for index 1', () => {
            const pos = getBoardPosition(1);
            expect(pos).toBeDefined();
            expect(pos.x).not.toBeNaN();
            expect(pos.z).not.toBeNaN();
        });

        it('should return coordinates for index 52', () => {
            const pos = getBoardPosition(52);
            expect(pos).toBeDefined();
        });
    });

    describe('getHomePosition', () => {
        it('should return different positions for different colors', () => {
            const redPos = getHomePosition('RED', 0);
            const bluePos = getHomePosition('BLUE', 0);

            expect(redPos).not.toEqual(bluePos);
        });
    });

    describe('getPawn3DPosition', () => {
        it('should return base positions for HOME', () => {
            const redHome = getPawn3DPosition('RED', BOARD.HOME);
            expect(redHome).toEqual({ x: 5, y: 0, z: -5 });

            const blueHome = getPawn3DPosition('BLUE', BOARD.HOME);
            expect(blueHome).toEqual({ x: -5, y: 0, z: -5 });
        });

        it('should return goal position for GOAL', () => {
            const goal = getPawn3DPosition('RED', BOARD.GOAL);
            expect(goal).toEqual({ x: 0, y: 1, z: 0 });
        });

        it('should return home stretch position', () => {
            const stretch = getPawn3DPosition('RED', BOARD.HOME_STRETCH_START);
            expect(stretch).toBeDefined();
            expect(stretch.y).toBe(0);
        });

        it('should return main track position using board logic', () => {
            const track = getPawn3DPosition('RED', 1);
            expect(track).toBeDefined();

            const raw = getBoardPosition(1);
            expect(track).toEqual(raw);
        });
    });
});
