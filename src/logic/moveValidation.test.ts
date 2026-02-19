import { describe, it, expect } from 'vitest';
import { getValidMoves, getValidPawnIds, executeMove } from './moveValidation';
import { createInitialState, createPlayer, initializePawns } from './gameState';
import { GameState, Pawn } from '../shared/types';
import { BOARD, toGlobalPosition } from '../shared/board';

function createTestState(): GameState {
    const state = createInitialState('TEST01');
    state.players = [
        createPlayer('player1', 'Alice', 'RED'),
        createPlayer('player2', 'Bob', 'BLUE'),
    ];
    state.pawns = [
        ...initializePawns('RED'),
        ...initializePawns('BLUE'),
    ];
    state.currentTurn = 'RED';
    state.gamePhase = 'MOVING';
    return state;
}

describe('Movement Validation', () => {
    describe('Pawn in Home (Base)', () => {
        it('should NOT allow pawn in home to move with dice 1-5', () => {
            const state = createTestState();

            for (let dice = 1; dice <= 5; dice++) {
                state.currentDiceValue = dice;
                const validMoves = getValidMoves(state);
                // All RED pawns are in home, none should be able to move
                expect(validMoves.length).toBe(0);
            }
        });

        it('should allow pawn in home to move with dice 6', () => {
            const state = createTestState();
            state.currentDiceValue = 6;

            const validMoves = getValidMoves(state);

            // All 4 RED pawns can exit home with a 6
            expect(validMoves.length).toBe(4);
            validMoves.forEach(move => {
                expect(move.from).toBe(BOARD.HOME);
                expect(move.to).toBe(BOARD.START_POSITIONS.RED);
            });
        });
    });

    describe('Pawn on Main Track', () => {
        it('should calculate correct destination for normal move', () => {
            const state = createTestState();
            state.pawns[0].position = 10; // RED_0 on position 10
            state.currentDiceValue = 4;

            const validMoves = getValidMoves(state);

            const pawnMove = validMoves.find(m => m.pawnId === 'RED_0');
            expect(pawnMove).toBeDefined();
            expect(pawnMove!.to).toBe(14);
        });

        it('should wrap around the board correctly', () => {
            const state = createTestState();
            state.pawns[0].position = 50; // RED_0 near end of track
            state.currentDiceValue = 5;

            const validMoves = getValidMoves(state);

            const pawnMove = validMoves.find(m => m.pawnId === 'RED_0');
            expect(pawnMove).toBeDefined();
            // 50 + 5 = 55, but RED's home entry is at 52, so it enters home stretch
            // This depends on home entry logic
        });

        it('should not allow move if blocked by own pawn', () => {
            const state = createTestState();
            state.pawns[0].position = 10; // RED_0
            state.pawns[1].position = 12; // RED_1 blocks the destination (12 is unsafe)
            state.currentDiceValue = 2;

            const validMoves = getValidMoves(state);

            const pawnMove = validMoves.find(m => m.pawnId === 'RED_0');
            expect(pawnMove).toBeUndefined();
        });

        it('should identify multiple pawns as valid when they can all move', () => {
            const state = createTestState();
            // Set up 2 Red pawns on the track
            state.pawns[0].position = 10; // RED_0 at 10
            state.pawns[1].position = 20; // RED_1 at 20
            // Others remain at Home (0)

            const dice = 5;
            state.currentDiceValue = dice;

            const validMoves = getValidMoves(state);

            // Expected:
            // RED_0 (10) -> 15. Valid
            // RED_1 (20) -> 25. Valid

            const validIds = validMoves.map(m => m.pawnId);

            expect(validIds).toContain('RED_0');
            expect(validIds).toContain('RED_1');
            expect(validIds.length).toBe(2);
        });
    });

    describe('Capture Detection', () => {
        it('should calculate global positions correctly for collision detection', () => {
            // RED: Local step 1 -> Global position 1
            const redStart = toGlobalPosition(1, 'RED');
            expect(redStart).toBe(1);

            // BLUE: Local step 1 -> Global position 14
            const blueStart = toGlobalPosition(1, 'BLUE');
            expect(blueStart).toBe(14);

            // This demonstrates collision: RED at local step 14 and BLUE at local step 1
            // are both at global position 14
            expect(toGlobalPosition(14, 'RED')).toBe(14);
        });

        it('should detect capture on non-safe square (Global 15)', () => {
            const state = createTestState();
            const red = state.pawns[0]; // RED_0
            const blue = state.pawns[4]; // BLUE_0 (first blue pawn)

            // Global 15 is UNSAFE.
            // Red at Local 14 (Global 14). Moves 1 -> Local 15 (Global 15).
            red.position = 14;

            // Blue at Local 2 (Global 15).
            // Map Blue: 0->13, 1->14, 2->15.
            blue.position = 2;

            state.currentDiceValue = 1;

            const validMoves = getValidMoves(state);
            const move = validMoves.find(m => m.pawnId === red.id);

            expect(move).toBeDefined();
            expect(move!.to).toBe(15);
            expect(move!.willCapture).toBe(true);

            // Execute Move
            const result = executeMove(state, red.id, validMoves);

            const movedRed = result.newState.pawns.find(p => p.id === red.id);
            const capturedBlue = result.newState.pawns.find(p => p.id === blue.id);

            expect(movedRed!.position).toBe(15);
            expect(capturedBlue!.position).toBe(BOARD.HOME); // Verify captured pawn is reset to HOME
            expect(result.extraTurn).toBe(true); // Capture grants extra turn
        });

        it('should NOT capture on safe square (Global 14)', () => {
            const state = createTestState();
            const red = state.pawns[0];
            const blue = state.pawns[4];

            // Global 14 is SAFE (Star/Start).
            // Red at Local 13. Moves 1 -> Local 14 (Global 14).
            red.position = 13;

            // Blue at Local 1 (Global 14).
            blue.position = 1;

            state.currentDiceValue = 1;

            const validMoves = getValidMoves(state);
            const move = validMoves.find(m => m.pawnId === red.id);

            expect(move).toBeDefined();
            expect(move!.to).toBe(14);
            expect(move!.willCapture).toBe(false);

            // Execute Move
            const result = executeMove(state, red.id, validMoves);

            const movedRed = result.newState.pawns.find(p => p.id === red.id);
            const safeBlue = result.newState.pawns.find(p => p.id === blue.id);

            expect(movedRed!.position).toBe(14);
            expect(safeBlue!.position).toBe(1); // Stays put
            expect(result.extraTurn).toBe(false);
        });
    });

    describe('Home Stretch and Goal', () => {
        it('should allow exact roll to reach goal', () => {
            const state = createTestState();
            state.pawns[0].position = BOARD.HOME_STRETCH_END; // Position 58
            state.currentDiceValue = 1; // Should reach 59 (GOAL)

            const validMoves = getValidMoves(state);

            const pawnMove = validMoves.find(m => m.pawnId === 'RED_0');
            expect(pawnMove).toBeDefined();
            expect(pawnMove!.to).toBe(BOARD.GOAL);
            expect(pawnMove!.willReachGoal).toBe(true);
        });

        it('should NOT allow overshooting the goal', () => {
            const state = createTestState();
            state.pawns[0].position = BOARD.HOME_STRETCH_END; // Position 58
            state.currentDiceValue = 3; // Would overshoot goal

            const validMoves = getValidMoves(state);

            const pawnMove = validMoves.find(m => m.pawnId === 'RED_0');
            expect(pawnMove).toBeUndefined();
        });
    });

    describe('executeMove', () => {
        it('should reject move for invalid pawn', () => {
            const state = createTestState();
            state.pawns[0].position = 10;
            state.currentDiceValue = 4;

            const validMoves = getValidMoves(state);

            // Try to move a pawn not in valid moves (e.g., one in home)
            const result = executeMove(state, 'RED_1', validMoves);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid pawn selection');
        });

        it('should successfully execute valid move', () => {
            const state = createTestState();
            state.pawns[0].position = 10;
            state.currentDiceValue = 4;

            const validMoves = getValidMoves(state);
            const result = executeMove(state, 'RED_0', validMoves);

            expect(result.success).toBe(true);
            expect(result.newState.pawns.find(p => p.id === 'RED_0')!.position).toBe(14);
        });

        it('should grant extra turn on rolling 6', () => {
            const state = createTestState();
            state.pawns[0].position = 10;
            state.currentDiceValue = 6;

            const validMoves = getValidMoves(state);
            const result = executeMove(state, 'RED_0', validMoves);

            expect(result.success).toBe(true);
            expect(result.extraTurn).toBe(true);
            expect(result.newState.currentTurn).toBe('RED'); // Still RED's turn
        });

        it('should switch turn after normal move', () => {
            const state = createTestState();
            state.pawns[0].position = 10;
            state.currentDiceValue = 4;

            const validMoves = getValidMoves(state);
            const result = executeMove(state, 'RED_0', validMoves);

            expect(result.success).toBe(true);
            expect(result.extraTurn).toBeFalsy();
            expect(result.newState.currentTurn).toBe('BLUE'); // Next player
        });
    });

    describe('getValidPawnIds', () => {
        it('should return only IDs of movable pawns', () => {
            const state = createTestState();
            state.pawns[0].position = 10; // Only this pawn can move
            state.currentDiceValue = 4;

            const validIds = getValidPawnIds(state);

            expect(validIds).toContain('RED_0');
            expect(validIds).not.toContain('RED_1'); // In home, needs 6
        });
    });
});
