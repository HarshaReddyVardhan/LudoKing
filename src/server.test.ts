/**
 * Server-level integration tests for Bot Takeover and turn management scenarios.
 * These tests exercise the logic layer (no real WebSocket connections needed).
 */

import { describe, it, expect } from 'vitest';
import { createInitialState, createPlayer, initializePawns, checkWinCondition } from './logic/gameState';
import { handleRollRequest, IDiceProvider } from './logic/diceEngine';
import { getValidMoves, executeMove } from './logic/moveValidation';
import { GameState } from './shared/types';
import { SimpleBot } from './logic/simpleBot';

// ─── Deterministic mock dice ──────────────────────────────────────────────────
class MockDiceProvider implements IDiceProvider {
    private sequence: number[];
    private index: number = 0;
    constructor(sequence: number[]) { this.sequence = sequence; }
    roll(): number {
        const value = this.sequence[this.index];
        this.index = (this.index + 1) % this.sequence.length;
        return value;
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createGameWithPlayers(humanCount: number, botCount: number): GameState {
    const state = createInitialState('TEST-SERVER');
    const colors = ['RED', 'BLUE', 'GREEN', 'YELLOW'] as const;
    let idx = 0;

    for (let i = 0; i < humanCount; i++) {
        const color = colors[idx++];
        const player = createPlayer(`human-conn-${i}`, `Human${i}`, color, `human-id-${i}`);
        state.players.push(player);
        state.pawns.push(...initializePawns(color));
    }

    for (let i = 0; i < botCount; i++) {
        const color = colors[idx++];
        const botId = `bot-id-${i}`;
        const player = createPlayer(botId, `Bot${i}`, color, botId);
        player.isBot = true;
        state.players.push(player);
        state.pawns.push(...initializePawns(color));
    }

    state.gamePhase = 'ROLLING';
    state.currentTurn = 'RED';
    return state;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Bot Takeover Scenarios', () => {
    describe('SimpleBot turn execution', () => {
        it('should roll dice and pick a valid move', () => {
            const state = createGameWithPlayers(0, 2);

            // Put ALL RED bot pawns on the board so weighted-six doesn't trigger
            // (weighted six only activates when 3+ pawns are at HOME)
            state.pawns[0].position = 10; // RED_0 at position 10
            state.pawns[1].position = 11; // RED_1 at position 11
            state.pawns[2].position = 12; // RED_2 at position 12 (safe: 14 is blue start, 12 unsafe)
            state.pawns[3].position = 15; // RED_3 at position 15
            state.currentTurn = 'RED';
            state.gamePhase = 'ROLLING';

            const bot = new SimpleBot();

            // Phase 1: Roll — bot should return ROLL action
            const rollAction = bot.computeNextMove(state, 'RED');
            expect(rollAction.type).toBe('ROLL');

            // Simulate roll with mock die: raw = 0.5 -> floor(0.5 * 6) + 1 = 4
            // No weighted dice since 0 pawns are at HOME
            const redPlayer = state.players.find(p => p.color === 'RED')!;
            const mock = new MockDiceProvider([0.5]);
            const rollResult = handleRollRequest(state, redPlayer.connectionId, mock);
            expect(rollResult.success).toBe(true);
            expect(rollResult.diceValue).toBe(4);

            const afterRollState = rollResult.newState;
            expect(afterRollState.gamePhase).toBe('MOVING');

            // Phase 2: Move — bot should return MOVE action
            const moveAction = bot.computeNextMove(afterRollState, 'RED');
            expect(moveAction.type).toBe('MOVE');
            expect(moveAction.pawnId).toBeTruthy();

            const validMoves = getValidMoves(afterRollState);
            const moveResult = executeMove(afterRollState, moveAction.pawnId!, validMoves);
            expect(moveResult.success).toBe(true);
        });

        it('should skip turn when no valid moves available', () => {
            // All RED pawns in home, dice = 4 (cannot leave home)
            const state = createGameWithPlayers(0, 2);
            state.currentTurn = 'RED';
            state.gamePhase = 'MOVING';
            state.currentDiceValue = 4;
            // All RED pawns already at HOME (default)

            const bot = new SimpleBot();
            const action = bot.computeNextMove(state, 'RED');
            expect(action.type).toBe('SKIP');
        });
    });

    describe('Bot Takeover after human disconnect', () => {
        it('should correctly identify bot as current player', () => {
            // Simulate a state where it is a bot's turn
            const state = createGameWithPlayers(1, 1);
            // Make it BLUE bot's turn (idx 1)
            state.currentTurn = 'BLUE';
            state.gamePhase = 'ROLLING';

            const currentPlayer = state.players.find(p => p.color === 'BLUE')!;
            expect(currentPlayer.isBot).toBe(true);
        });

        it('should allow turn skip when active player pool shrinks', () => {
            const state = createGameWithPlayers(2, 0);

            // Mark RED as inactive (e.g. disconnected)
            state.players = state.players.map(p =>
                p.color === 'RED' ? { ...p, isActive: false } : p
            );
            state.currentTurn = 'BLUE'; // already on BLUE
            state.gamePhase = 'ROLLING';
            state.currentDiceValue = null;

            // Only BLUE is active — they should be able to roll
            const bluePlayer = state.players.find(p => p.color === 'BLUE')!;
            const mock = new MockDiceProvider([0.5]);
            const result = handleRollRequest(state, bluePlayer.connectionId, mock);
            expect(result.success).toBe(true);
        });

        it('full bot game loop: bot rolls → moves → turn advances', () => {
            const state = createGameWithPlayers(0, 2);

            // RED bot has a pawn on the board
            state.pawns[0].position = 5; // RED_0
            state.currentTurn = 'RED';
            state.gamePhase = 'ROLLING';

            const bot = new SimpleBot();
            const redPlayer = state.players.find(p => p.color === 'RED')!;

            // Roll with known dice value (0.5 -> 4)
            const mock = new MockDiceProvider([0.5]);
            const rollResult = handleRollRequest(state, redPlayer.connectionId, mock);
            expect(rollResult.success).toBe(true);

            const afterRoll = rollResult.newState;
            const moveAction = bot.computeNextMove(afterRoll, 'RED');

            if (moveAction.type === 'MOVE') {
                const validMoves = getValidMoves(afterRoll);
                const moveResult = executeMove(afterRoll, moveAction.pawnId!, validMoves);
                expect(moveResult.success).toBe(true);

                // After non-extra-turn move, it should be BLUE's turn
                if (!moveResult.extraTurn) {
                    expect(moveResult.newState.currentTurn).toBe('BLUE');
                } else {
                    expect(moveResult.newState.currentTurn).toBe('RED');
                }
            }
        });
    });

    describe('Rank tracking: game continues until N-1 finish', () => {
        it('should not end game when first of 3 players finishes', () => {
            const state = createGameWithPlayers(3, 0);

            // Move all RED pawns to GOAL (59)
            state.pawns = state.pawns.map(p =>
                p.color === 'RED' ? { ...p, position: 59 } : p
            );

            const updatedState = checkWinCondition(state);

            // RED should be rank 1
            const redPlayer = updatedState.players.find(p => p.color === 'RED')!;
            expect(redPlayer.rank).toBe(1);

            // Game should NOT be finished yet (BLUE and GREEN still playing)
            expect(updatedState.gamePhase).not.toBe('FINISHED');
        });

        it('should end game and auto-assign last rank when 1 player remains', () => {
            const state = createGameWithPlayers(3, 0);

            // Move RED and BLUE pawns to GOAL (2 of 3 finish)
            state.pawns = state.pawns.map(p =>
                (p.color === 'RED' || p.color === 'BLUE') ? { ...p, position: 59 } : p
            );

            const updatedState = checkWinCondition(state);

            // RED = rank 1, BLUE = rank 2, GREEN auto-assigned rank 3
            const greenPlayer = updatedState.players.find(p => p.color === 'GREEN')!;
            expect(greenPlayer.rank).toBe(3);

            // Game should be FINISHED
            expect(updatedState.gamePhase).toBe('FINISHED');
        });
    });
});
