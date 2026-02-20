import { describe, it, expect } from 'vitest';
import { SimpleBot, WeightedSimpleBot } from './simpleBot';
import { createInitialState, createPlayer, initializePawns } from './gameState';
import { GameState, Color, GamePhase } from '../shared/types';

function createTestState(): GameState {
    const state = createInitialState('TEST01');
    state.players = [
        createPlayer('player1', 'Alice', Color.RED),
        createPlayer('player2', 'Bob', Color.BLUE),
    ];
    state.pawns = [
        ...initializePawns(Color.RED),
        ...initializePawns(Color.BLUE),
    ];
    state.currentTurn = Color.RED;
    return state;
}

describe('Simple Bot', () => {
    describe('simpleBotDecide', () => {
        it('should return ROLL action in ROLLING phase', () => {
            const state = createTestState();
            state.gamePhase = GamePhase.ROLLING;

            const bot = new SimpleBot();
            const action = bot.computeNextMove(state, Color.RED);

            expect(action.type).toBe('ROLL');
            expect(action.diceValue).toBeGreaterThanOrEqual(1);
            expect(action.diceValue).toBeLessThanOrEqual(6);
        });

        it('should return MOVE action in MOVING phase with valid moves', () => {
            const state = createTestState();
            state.gamePhase = GamePhase.MOVING;
            state.currentDiceValue = 6;

            const bot = new SimpleBot();
            const action = bot.computeNextMove(state, Color.RED);

            expect(action.type).toBe('MOVE');
            expect(action.pawnId).toBeDefined();
            expect(action.pawnId).toMatch(/^RED_\d$/);
        });

        it('should return SKIP when no valid moves available', () => {
            const state = createTestState();
            state.gamePhase = GamePhase.MOVING;
            state.currentDiceValue = 3; // Can't exit home with 3

            const bot = new SimpleBot();
            const action = bot.computeNextMove(state, Color.RED);

            expect(action.type).toBe('SKIP');
        });

        it('should return SKIP in WAITING or FINISHED phase', () => {
            const state = createTestState();
            state.gamePhase = GamePhase.WAITING;

            const bot = new SimpleBot();
            expect(bot.computeNextMove(state, Color.RED).type).toBe('SKIP');

            state.gamePhase = GamePhase.FINISHED;
            expect(bot.computeNextMove(state, Color.RED).type).toBe('SKIP');
        });
    });

    describe('simpleBotDecideWeighted', () => {
        it('should prefer goal moves over random', () => {
            const state = createTestState();
            state.gamePhase = GamePhase.MOVING;
            state.currentDiceValue = 1;
            // Put a pawn one step from goal
            state.pawns[0].position = 58; // HOME_STRETCH_END

            const bot = new WeightedSimpleBot();
            const action = bot.computeNextMove(state, Color.RED);

            expect(action.type).toBe('MOVE');
            expect(action.pawnId).toBe('RED_0');
        });
    });
});
