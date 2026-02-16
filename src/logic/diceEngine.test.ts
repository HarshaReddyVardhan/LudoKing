import { describe, it, expect } from 'vitest';
import { rollDice, handleRollRequest, resetToRollingPhase, IDiceProvider } from './diceEngine';
import { createInitialState, createPlayer } from './gameState';
import { GameState } from '../shared/types';

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
            // else return 1-5 based on another roll()

            // Case 1: First roll < 0.4 -> should be 6
            const mockSix = new MockDiceProvider([0.3]);
            expect(rollDice(true, mockSix)).toBe(6);

            // Case 2: First roll >= 0.4 -> uses second roll
            // 0.5 (fail weight check) -> then 0.0 -> 1
            const mockOther = new MockDiceProvider([0.5, 0.0]);
            expect(rollDice(true, mockOther)).toBe(1);
        });
    });

    describe('handleRollRequest (Anti-Cheat)', () => {
        function createTestState(): GameState {
            const state = createInitialState('TEST01');
            state.players = [
                createPlayer('player1', 'Alice', 'RED'),
                createPlayer('player2', 'Bob', 'BLUE'),
            ];
            state.currentTurn = 'RED';
            state.gamePhase = 'ROLLING';
            return state;
        }

        it('should allow the current player to roll and get deterministic result', () => {
            const state = createTestState();
            const mock = new MockDiceProvider([0.5]); // 0.5 * 6 = 3 -> 4
            // Wait: floor(0.5 * 6) = 3. 3+1 = 4.

            const result = handleRollRequest(state, 'player1', mock);

            expect(result.success).toBe(true);
            expect(result.diceValue).toBe(4);
            expect(result.newState.gamePhase).toBe('MOVING');
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
            state.gamePhase = 'MOVING';
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

            // Second roll should fail (state is now MOVING)
            const secondRoll = handleRollRequest(firstRoll.newState, 'player1');
            expect(secondRoll.success).toBe(false);
            expect(secondRoll.error).toContain('Cannot roll in MOVING phase');
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
            state.gamePhase = 'MOVING';
            state.currentDiceValue = 5;
            state.currentTurn = 'RED';

            const newState = resetToRollingPhase(state, 'BLUE');

            expect(newState.gamePhase).toBe('ROLLING');
            expect(newState.currentDiceValue).toBeNull();
            expect(newState.currentTurn).toBe('BLUE');
        });
    });
});
