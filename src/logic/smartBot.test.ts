
import { describe, it, expect, vi } from 'vitest';
import { SmartBot } from './smartBot';
import { GameState, PlayerColor, Pawn } from '../shared/types';
import { BOARD } from '../shared/board';

describe('smartBotDecide', () => {
    // Helper to create state
    function createState(phase: GameState['gamePhase'], diceValue: number | null, myColor: PlayerColor, pawns: Pawn[]): GameState {
        return {
            gamePhase: phase,
            currentDiceValue: diceValue,
            currentTurn: myColor,
            players: [],
            pawns: pawns,
            roomCode: 'test',
            lastUpdate: 0,
            lastMove: null,
            winner: undefined,
        };
    }

    it('should roll dice if in ROLLING phase', () => {
        const state = createState('ROLLING', null, 'RED', []);
        const bot = new SmartBot();
        const action = bot.computeNextMove(state, 'RED');
        expect(action.type).toBe('ROLL');
        expect(action.diceValue).toBeGreaterThanOrEqual(1);
    });

    it('should prefer capturing an opponent', () => {
        // Red at 12, Blue at 13 (Global). Dice 1. Red 12->13 captures Blue.
        const redPawn: Pawn = { id: 'RED_1', color: 'RED', position: 12, pawnIndex: 0 };
        const bluePawnTarget: Pawn = { id: 'BLUE_1', color: 'BLUE', position: 13, pawnIndex: 0 };
        const redPawn2Distractor: Pawn = { id: 'RED_2', color: 'RED', position: 20, pawnIndex: 1 };

        const state = createState('MOVING', 1, 'RED', [redPawn, bluePawnTarget, redPawn2Distractor]);
        const bot = new SmartBot();
        const action = bot.computeNextMove(state, 'RED');

        expect(action.type).toBe('MOVE');
        expect(action.pawnId).toBe('RED_1');
    });

    it('should prefer entering safe square', () => {
        // Red 8->9 (Safe). Red 40->41 (Not safe). Dice 1.
        const redPawn1: Pawn = { id: 'RED_1', color: 'RED', position: 8, pawnIndex: 0 };
        const redPawn2: Pawn = { id: 'RED_2', color: 'RED', position: 40, pawnIndex: 1 };

        const state = createState('MOVING', 1, 'RED', [redPawn1, redPawn2]);
        const bot = new SmartBot();
        const action = bot.computeNextMove(state, 'RED');

        expect(action.type).toBe('MOVE');
        expect(action.pawnId).toBe('RED_1');
    });

    it('should prefer leaving base', () => {
        // Red Home->Start. Red 10->16. Dice 6.
        const redPawn1: Pawn = { id: 'RED_1', color: 'RED', position: BOARD.HOME, pawnIndex: 0 };
        const redPawn2: Pawn = { id: 'RED_2', color: 'RED', position: 10, pawnIndex: 1 };

        const state = createState('MOVING', 6, 'RED', [redPawn1, redPawn2]);
        const bot = new SmartBot();
        const action = bot.computeNextMove(state, 'RED');

        expect(action.type).toBe('MOVE');
        expect(action.pawnId).toBe('RED_1');
    });

    it('should prefer moving pawn closer to goal (Progress Bonus)', () => {
        // Red 1 at 45. Red 2 at 5. Dice 2.
        // 45->47 (Dist ~46).
        // 5->7 (Dist ~6).
        // Both safe moves. Should prefer 45->47.
        const redPawn1: Pawn = { id: 'RED_ADVANCED', color: 'RED', position: 45, pawnIndex: 0 };
        const redPawn2: Pawn = { id: 'RED_BEHIND', color: 'RED', position: 5, pawnIndex: 1 };

        const state = createState('MOVING', 2, 'RED', [redPawn1, redPawn2]);
        const bot = new SmartBot();
        const action = bot.computeNextMove(state, 'RED');

        expect(action.type).toBe('MOVE');
        expect(action.pawnId).toBe('RED_ADVANCED');
    });
});
