import { describe, it, expect } from 'vitest';
import { getValidMoves, getValidPawnIds, executeMove } from './moveValidation';
import { createInitialState, createPlayer, initializePawns } from './gameState';
import { GameState, Pawn } from '../shared/types';
import { BOARD } from '../shared/board';

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
            state.pawns[1].position = 14; // RED_1 blocks the destination
            state.currentDiceValue = 4;

            const validMoves = getValidMoves(state);

            const pawnMove = validMoves.find(m => m.pawnId === 'RED_0');
            expect(pawnMove).toBeUndefined();
        });
    });

    describe('Capture Detection', () => {
        it('should detect capture on non-safe square', () => {
            const state = createTestState();
            state.pawns[0].position = 10; // RED_0
            // Place BLUE pawn at position that maps to same global as RED's destination
            state.pawns[4].position = 1; // BLUE_0 at their start (global position 14)
            state.currentDiceValue = 4; // RED_0 moves to 14 (same global as BLUE start + offset)

            // This test may need adjustment based on actual board mapping
            const validMoves = getValidMoves(state);
            // Check if any move has willCapture set
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
