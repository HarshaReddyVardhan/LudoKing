import { describe, it, expect } from 'vitest';
import { rollDice, handleRollRequest, resetToRollingPhase, IDiceProvider } from './diceEngine';
import { createInitialState, createPlayer } from './gameState';
import { GameState, Color, GamePhase } from '../shared/types';

class MockDiceProvider implements IDiceProvider {
    private sequence: number[];
    private index: number = 0;

    constructor(sequence: number[]) {
        this.sequence = sequence;
    }

    roll(): number {
        const value = this.sequence[this.index];
        this.index = (this.index + 1) % this.sequence.length;
        return value;
    }
}

describe('Dice Engine', () => {
    describe('rollDice', () => {
        it('should return deterministic values with mock provider', () => {
            // 0.0 -> 1, 0.99 -> 6
            const mock = new MockDiceProvider([0.0, 0.99]);
            expect(rollDice(false, mock)).toBe(1);
            expect(rollDice(false, mock)).toBe(6);
        });

        it('should handle weighted rolls', () => {
            // Weighted logic:
            // if roll() < 0.4 -> return 6
            // else return 1-5 based on the same roll normalized

            // Case 1: Roll < 0.4 -> 6
            const mockSix = new MockDiceProvider([0.3]);
            expect(rollDice(true, mockSix)).toBe(6);

            // Case 2: Roll >= 0.4 -> 1-5
            // 0.5 -> (0.5-0.4)/0.6 = 0.166... -> *5 = 0.833... -> 0 -> +1 = 1
            const mockOther = new MockDiceProvider([0.5]);
            expect(rollDice(true, mockOther)).toBe(1);
        });
    });

    describe('handleRollRequest (Anti-Cheat)', () => {
        function createTestState(): GameState {
            const state = createInitialState('TEST01');
            state.players = [
                createPlayer('player1', 'Alice', Color.RED),
                createPlayer('player2', 'Bob', Color.BLUE),
            ];
            state.currentTurn = Color.RED;
            state.gamePhase = GamePhase.ROLLING;
            return state;
        }

        it('should allow the current player to roll and get deterministic result', () => {
            const state = createTestState();
            const mock = new MockDiceProvider([0.5]); // 0.5 * 6 = 3 -> 4
            // Wait: floor(0.5 * 6) = 3. 3+1 = 4.

            const result = handleRollRequest(state, 'player1', mock);

            expect(result.success).toBe(true);
            expect(result.diceValue).toBe(4);
            expect(result.newState.gamePhase).toBe(GamePhase.MOVING);
            expect(result.newState.currentDiceValue).toBe(4);
        });

        it('should reject roll from wrong player (not their turn)', () => {
            const state = createTestState();
            const result = handleRollRequest(state, 'player2'); // Bob tries to roll on Red's turn

            expect(result.success).toBe(false);
            expect(result.error).toBe('Not your turn');
        });

        it('should reject roll if player already rolled (MOVING phase)', () => {
            const state = createTestState();
            state.gamePhase = GamePhase.MOVING;
            state.currentDiceValue = 4;

            const result = handleRollRequest(state, 'player1');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Cannot roll in MOVING phase');
        });

        it('should prevent double rolls in succession', () => {
            const state = createTestState();

            // First roll should succeed
            const firstRoll = handleRollRequest(state, 'player1');
            expect(firstRoll.success).toBe(true);

            // Second roll on the resulting state should fail.
            // It might fail due to MOVING phase OR debounce (both are valid anti-cheat responses).
            const secondRoll = handleRollRequest(firstRoll.newState, 'player1');
            expect(secondRoll.success).toBe(false);
            expect(
                secondRoll.error?.includes('Cannot roll in MOVING phase') ||
                secondRoll.error?.includes('Rolling too fast')
            ).toBe(true);
        });

        it('should reject roll from unknown player', () => {
            const state = createTestState();
            const result = handleRollRequest(state, 'unknown_player');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Player not found');
        });
    });

    describe('resetToRollingPhase', () => {
        it('should reset state for next player turn', () => {
            const state = createInitialState('TEST01');
            state.gamePhase = GamePhase.MOVING;
            state.currentDiceValue = 5;
            state.currentTurn = Color.RED;

            const newState = resetToRollingPhase(state, Color.BLUE);

            expect(newState.gamePhase).toBe(GamePhase.ROLLING);
            expect(newState.currentDiceValue).toBeNull();
            expect(newState.currentTurn).toBe(Color.BLUE);
        });
    });

    describe('3 Consecutive Sixes Rule', () => {
        // Helper: creates a 2-player state with all pawns on the board
        // so that non-weighted dice is used (weighted only kicks in when 3+ pawns are at HOME).
        function createTestState(): GameState {
            const state = createInitialState('TEST01');
            state.players = [
                createPlayer('player1', 'Alice', Color.RED),
                createPlayer('player2', 'Bob', Color.BLUE),
            ];
            // Move all RED pawns onto the board so weighted-six doesn't trigger.
            // Non-weighted: floor(r * 6) + 1
            // 0.99 -> 6,  0.5 -> 4,  0.0 -> 1
            state.pawns = [
                { id: 'RED_0', color: Color.RED, position: 5, pawnIndex: 0 },
                { id: 'RED_1', color: Color.RED, position: 6, pawnIndex: 1 },
                { id: 'RED_2', color: Color.RED, position: 7, pawnIndex: 2 },
                { id: 'RED_3', color: Color.RED, position: 8, pawnIndex: 3 },
                { id: 'BLUE_0', color: Color.BLUE, position: 0, pawnIndex: 0 },
                { id: 'BLUE_1', color: Color.BLUE, position: 0, pawnIndex: 1 },
                { id: 'BLUE_2', color: Color.BLUE, position: 0, pawnIndex: 2 },
                { id: 'BLUE_3', color: Color.BLUE, position: 0, pawnIndex: 3 },
            ];
            state.currentTurn = Color.RED;
            state.gamePhase = GamePhase.ROLLING;
            return state;
        }

        it('should forfeit turn and pass to next player on 3rd consecutive six', () => {
            // Non-weighted: 0.99 -> floor(0.99 * 6) + 1 = floor(5.94) + 1 = 5 + 1 = 6
            const mock = new MockDiceProvider([0.99]);
            const state = createTestState();

            // Simulate two previous sixes already logged
            state.consecutiveSixes = 2;

            const result = handleRollRequest(state, 'player1', mock);

            expect(result.success).toBe(true);
            expect(result.diceValue).toBe(6);
            // Turn should pass to BLUE (the next active player)
            expect(result.newState.currentTurn).toBe(Color.BLUE);
            // Dice value reset (no move allowed)
            expect(result.newState.currentDiceValue).toBeNull();
            // Streak reset
            expect(result.newState.consecutiveSixes).toBe(0);
            // Phase back to ROLLING for BLUE
            expect(result.newState.gamePhase).toBe(GamePhase.ROLLING);
        });

        it('should preserve consecutive six streak after first six', () => {
            // Non-weighted: 0.99 -> 6
            const mock = new MockDiceProvider([0.99]);
            const state = createTestState();
            state.consecutiveSixes = 0;

            const result = handleRollRequest(state, 'player1', mock);

            expect(result.success).toBe(true);
            expect(result.diceValue).toBe(6);
            // Still RED's turn, streak = 1
            expect(result.newState.currentTurn).toBe(Color.RED);
            expect(result.newState.consecutiveSixes).toBe(1);
            expect(result.newState.gamePhase).toBe(GamePhase.MOVING);
        });

        it('should reset streak on non-six after two sixes', () => {
            // Non-weighted: 0.5 -> floor(0.5 * 6) + 1 = floor(3) + 1 = 4
            const mock = new MockDiceProvider([0.5]);
            const state = createTestState();
            state.consecutiveSixes = 2;

            const result = handleRollRequest(state, 'player1', mock);

            expect(result.success).toBe(true);
            expect(result.diceValue).toBe(4);
            // Turn does NOT change (not a forfeit)
            expect(result.newState.currentTurn).toBe(Color.RED);
            expect(result.newState.consecutiveSixes).toBe(0);
            expect(result.newState.gamePhase).toBe(GamePhase.MOVING);
        });

        it('should skip inactive players when forfeiting on 3 sixes', () => {
            // Non-weighted: 0.99 -> 6
            const mock = new MockDiceProvider([0.99]);
            // 4-player game: RED (all pawns on board), BLUE (inactive), GREEN, YELLOW
            const state = createInitialState('TEST01');
            state.players = [
                createPlayer('p1', 'Alice', Color.RED),
                { ...createPlayer('p2', 'Bob', Color.BLUE), isActive: false },
                createPlayer('p3', 'Carol', Color.GREEN),
                createPlayer('p4', 'Dave', Color.YELLOW),
            ];
            // Move all RED pawns onto board (non-weighted dice)
            state.pawns = [
                { id: 'RED_0', color: Color.RED, position: 5, pawnIndex: 0 },
                { id: 'RED_1', color: Color.RED, position: 6, pawnIndex: 1 },
                { id: 'RED_2', color: Color.RED, position: 7, pawnIndex: 2 },
                { id: 'RED_3', color: Color.RED, position: 8, pawnIndex: 3 },
            ];
            state.currentTurn = Color.RED;
            state.gamePhase = GamePhase.ROLLING;
            state.consecutiveSixes = 2;

            const result = handleRollRequest(state, 'p1', mock);

            expect(result.success).toBe(true);
            // BLUE is inactive, so next active player is GREEN
            expect(result.newState.currentTurn).toBe(Color.GREEN);
            expect(result.newState.consecutiveSixes).toBe(0);
        });
    });
});
