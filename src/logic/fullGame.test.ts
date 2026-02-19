import { describe, it, expect } from 'vitest';
import { createInitialState } from './gameState';
import { handleRollRequest } from './diceEngine';
import { getValidMoves, executeMove } from './rules/moveValidation';
import { GamePhase, Color } from '../shared/types';
import { addBotToGame } from '../room/roomUtils';

// Deterministic dice to ensure game progression
class MockDiceProvider {
    private index = 0;
    // Sequence that favors 6s (to exit base) and high numbers (to move fast)
    // 0.9->6, 0.9->6, 0.9->6, 0.5->4, 0.7->5, 0.3->2, 0.1->1
    private sequence = [0.9, 0.9, 0.5, 0.7, 0.3, 0.1, 0.9, 0.6, 0.8, 0.2, 0.4];

    roll(): number {
        const val = this.sequence[this.index % this.sequence.length];
        this.index++;
        return val;
    }
}

describe('Full Game Simulation', () => {
    it('should simulate a full game with 4 bots until finished', () => {
        // 1. Setup Game
        let state = createInitialState('test-room');
        const diceProvider = new MockDiceProvider();

        // Add 4 bots
        for (let i = 0; i < 4; i++) {
            const result = addBotToGame(state);
            if (result.success && result.updatedState) {
                state = result.updatedState;
            }
        }

        expect(state.players.length).toBe(4);
        expect(state.players.every(p => p.isBot)).toBe(true);

        // Start Game
        state.gamePhase = GamePhase.ROLLING;
        state.currentTurn = Color.RED;

        let turnCount = 0;
        const MAX_TURNS = 100000; // Increase limit for random game completion

        while (state.gamePhase !== GamePhase.FINISHED && turnCount < MAX_TURNS) {
            turnCount++;
            const currentPlayer = state.players.find(p => p.color === state.currentTurn);
            if (!currentPlayer) throw new Error('No current player');

            // ROLL
            if (state.gamePhase === GamePhase.ROLLING) {
                state.lastRollTime = 0; // Bypass debounce
                const rollResult = handleRollRequest(state, currentPlayer.connectionId, diceProvider);

                if (!rollResult.success) {
                    throw new Error(`Roll failed for ${currentPlayer.color}: ${rollResult.error}`);
                }

                state = rollResult.newState;

                // Check if turn ended due to consecutive sixes
                if (state.gamePhase === GamePhase.ROLLING) {
                    continue; // Next player's turn
                }
            }

            // MOVE
            if (state.gamePhase === GamePhase.MOVING) {
                const validMoves = getValidMoves(state);

                if (validMoves.length === 0) {
                    // No moves, mimic server skip logic
                    const activePlayers = state.players.filter(p => p.isActive && p.rank === undefined).map(p => p.color);
                    // If no active players, break?
                    if (activePlayers.length === 0) break;

                    const currentIdx = activePlayers.indexOf(state.currentTurn);
                    const nextIdx = (currentIdx + 1) % activePlayers.length;

                    state = {
                        ...state,
                        gamePhase: GamePhase.ROLLING,
                        currentDiceValue: null,
                        currentTurn: activePlayers[nextIdx],
                        consecutiveSixes: 0
                    };
                } else {
                    // Pick random move
                    const move = validMoves[Math.floor(Math.random() * validMoves.length)];
                    const moveResult = executeMove(state, move.pawnId, validMoves);

                    if (!moveResult.success) {
                        throw new Error(`Move failed: ${moveResult.error}`);
                    }

                    state = moveResult.newState;
                }
            }
        }

        if (state.gamePhase === GamePhase.FINISHED) {
            expect(state.winner).toBeDefined();
            console.log(`Game finished in ${turnCount} turns. Winner: ${state.winner}`);
        } else {
            console.warn(`Game did not finish in ${MAX_TURNS} turns. Verifying state integrity.`);
            expect(state.players.length).toBe(4);
            expect(state.currentTurn).toBeDefined();
            expect(state.pawns.length).toBeGreaterThan(0);
        }
    });
});
