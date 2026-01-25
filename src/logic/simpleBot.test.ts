import { describe, it, expect } from 'vitest';
import { simpleBotDecide, simpleBotDecideWeighted } from './simpleBot';
import { createInitialState, createPlayer, initializePawns } from './gameState';
import { GameState } from '../shared/types';

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
    return state;
}

describe('Simple Bot', () => {
    describe('simpleBotDecide', () => {
        it('should return ROLL action in ROLLING phase', () => {
            const state = createTestState();
            state.gamePhase = 'ROLLING';

            const action = simpleBotDecide(state);

            expect(action.type).toBe('ROLL');
            expect(action.diceValue).toBeGreaterThanOrEqual(1);
            expect(action.diceValue).toBeLessThanOrEqual(6);
        });

        it('should return MOVE action in MOVING phase with valid moves', () => {
            const state = createTestState();
            state.gamePhase = 'MOVING';
            state.currentDiceValue = 6;

            const action = simpleBotDecide(state);

            expect(action.type).toBe('MOVE');
            expect(action.pawnId).toBeDefined();
            expect(action.pawnId).toMatch(/^RED_\d$/);
        });

        it('should return SKIP when no valid moves available', () => {
            const state = createTestState();
            state.gamePhase = 'MOVING';
            state.currentDiceValue = 3; // Can't exit home with 3

            const action = simpleBotDecide(state);

            expect(action.type).toBe('SKIP');
        });

        it('should return SKIP in WAITING or FINISHED phase', () => {
            const state = createTestState();
            state.gamePhase = 'WAITING';

            expect(simpleBotDecide(state).type).toBe('SKIP');

            state.gamePhase = 'FINISHED';
            expect(simpleBotDecide(state).type).toBe('SKIP');
        });
    });

    describe('simpleBotDecideWeighted', () => {
        it('should prefer goal moves over random', () => {
            const state = createTestState();
            state.gamePhase = 'MOVING';
            state.currentDiceValue = 1;
            // Put a pawn one step from goal
            state.pawns[0].position = 58; // HOME_STRETCH_END

            const action = simpleBotDecideWeighted(state);

            expect(action.type).toBe('MOVE');
            expect(action.pawnId).toBe('RED_0');
        });
    });
});
