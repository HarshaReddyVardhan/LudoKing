import { describe, it, expect } from 'vitest';
import { rollDice, handleRollRequest, resetToRollingPhase } from './diceEngine';
import { createInitialState, createPlayer } from './gameState';
import { GameState } from '../shared/types';

describe('Dice Engine', () => {
    describe('rollDice', () => {
        it('should return a value between 1 and 6', () => {
            for (let i = 0; i < 100; i++) {
                const result = rollDice();
                expect(result).toBeGreaterThanOrEqual(1);
                expect(result).toBeLessThanOrEqual(6);
            }
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

        it('should allow the current player to roll', () => {
            const state = createTestState();
            const result = handleRollRequest(state, 'player1');

            expect(result.success).toBe(true);
            expect(result.diceValue).toBeGreaterThanOrEqual(1);
            expect(result.diceValue).toBeLessThanOrEqual(6);
            expect(result.newState.gamePhase).toBe('MOVING');
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
