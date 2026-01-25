
import { describe, it, expect } from 'vitest';
import { getValidMoves, executeMove } from './moveValidation';
import { createInitialState, createPlayer, initializePawns } from './gameState';
import { GameState } from '../shared/types';
import { BOARD, toGlobalPosition } from '../shared/board';

function createTestState(): GameState {
    const state = createInitialState('TEST_REPRO');
    state.players = [
        createPlayer('p1', 'Alice', 'RED'),
        createPlayer('p2', 'Bob', 'BLUE'),
    ];
    // Clear auto-created pawns and make custom ones
    state.pawns = [];

    // Add 4 RED pawns
    const redPawns = initializePawns('RED');
    state.pawns.push(...redPawns);

    // Add 4 BLUE pawns
    const bluePawns = initializePawns('BLUE');
    state.pawns.push(...bluePawns);

    state.currentTurn = 'RED';
    state.gamePhase = 'MOVING';
    return state;
}

describe('Bug Reproduction: Availability and Global Position', () => {

    it('should calculate global position correctly for collision', () => {
        // Red (Start 1) at Local 14 -> Global 14.
        const redGlobal = toGlobalPosition(14, 'RED');
        // Blue (Start 14) at Local 1 (Start) -> Global 14.
        // Wait, current toGlobalPosition is suspected to return 27 for Blue Local 1 if input is meant to be relative.
        // But if input is GLOBAL, it should handle it?

        // Let's verify what toGlobalPosition currently does
        // Code: ((localPosition - 1 + startPos - 1) % 52) + 1

        // Case 1: Red at 14. (Start 1).
        // (14 - 1 + 1 - 1) % 52 + 1 = 14. Correct.
        expect(redGlobal).toBe(14);

        // Case 2: Blue at 14. (Start 14).
        // Since input is Global, it should map to 14.
        const blueGlobal = toGlobalPosition(14, 'BLUE');
        expect(blueGlobal).toBe(14);

        console.log(`Red Global: ${redGlobal}, Blue Global: ${blueGlobal}`);
    });

    it('should make multiple pawns available if they are valid moves', () => {
        const state = createTestState();
        // Set up 2 Red pawns on the track
        state.pawns[0].position = 10; // Red 0 at 10
        state.pawns[1].position = 20; // Red 1 at 20
        // Others at Home (0)

        const dice = 5;
        state.currentDiceValue = dice;

        const moves = getValidMoves(state);

        // Expected:
        // P1 (10) -> 15. Valid? Yes.
        // P2 (20) -> 25. Valid? Yes.

        const validIds = moves.map(m => m.pawnId);
        console.log('Valid IDs:', validIds);

        expect(validIds).toContain('RED_0');
        expect(validIds).toContain('RED_1');
        expect(validIds.length).toBe(2);
    });

    it('should correctly handle collision detection for capture', () => {
        const state = createTestState();
        state.currentTurn = 'BLUE'; // Blue moving

        // Red pawn at 26. (Not a safe square)
        state.pawns[0].position = 26; // RED_0

        // Blue pawn at 24.
        state.pawns[4].position = 24; // BLUE_0

        state.currentDiceValue = 2; // 24 + 2 = 26.

        const moves = getValidMoves(state);
        const move = moves.find(m => m.pawnId === 'BLUE_0');

        expect(move).toBeDefined();
        // Should capture Red at 26.

        expect(move?.willCapture).toBe(true);
    });
});
