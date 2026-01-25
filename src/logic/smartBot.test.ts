import { describe, it, expect, vi } from 'vitest';
import { smartBotDecide } from './smartBot';
import { GameState, PlayerColor, Pawn } from '../shared/types';
import { BOARD } from '../shared/board';

// Mock `rollDice` from diceEngine to control rolls if needed, 
// but smartBotDecide just calls it. We can just check it returns ROLL.
// Actually, smartBotDecide calls `rollDice` internally.

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
            lastMove: null
        };
    }

    it('should roll dice if in ROLLING phase', () => {
        const state = createState('ROLLING', null, 'RED', []);
        const action = smartBotDecide(state);
        expect(action.type).toBe('ROLL');
        expect(action.diceValue).toBeGreaterThanOrEqual(1);
    });

    it('should prefer capturing an opponent', () => {
        // Setup: Red has pawn at pos 10. Blue has pawn at pos 13.
        // Dice roll 3. Red moves 10->13 (Capture).
        // Alternative: Red has another pawn at 20 moving to 23 (Empty).

        const redPawn1: Pawn = { id: 'RED_1', color: 'RED', position: 10, pawnIndex: 0 };
        const redPawn2: Pawn = { id: 'RED_2', color: 'RED', position: 20, pawnIndex: 1 };
        const bluePawn: Pawn = { id: 'BLUE_1', color: 'BLUE', position: 13, pawnIndex: 0 }; // 10 + 3 = 13 (Capture)

        // Ensure no blockage or weirdness.
        // Red start is 1. 10 is relative? No, positions in Pawn are local 1-52?
        // Wait, types.ts says "1-52=Board".
        // And moveValidation uses `toGlobalPosition`.
        // Let's assume positions are valid.

        // Wait, `moveValidation` checks `toGlobalPosition`.
        // If Red at 10 and Blue at 13.
        // Red Start is 1. Red 10 is Global 10.
        // Blue Start is 14. Blue 13 is Global (13-1+14-1)%52 + 1 = 26.
        // So Red 10 cannot capture Blue 13.

        // We need to calculte collision:
        // Target Global Pos: X.
        // Red needs to land on X.

        // Let's try simpler:
        // Red Start 1. Red 12 -> 13. Move 1 step.
        // Blue needs to be at Global 13.
        // Blue Start 14.
        // For Blue to be at Global 13:
        // ((Pos - 1 + 13) % 52) + 1 = 13
        // Pos + 12 % 52 = 12 -> Pos = 0? No base. 
        // Pos + 12 = 12 + 52 = 64. 64 % 52 = 12.
        // Pos = 52.
        // So if Blue is at 52. Global is 13.

        const redPawn: Pawn = { id: 'RED_1', color: 'RED', position: 12, pawnIndex: 0 };
        const bluePawnTarget: Pawn = { id: 'BLUE_1', color: 'BLUE', position: 52, pawnIndex: 0 };

        // Dice 1.
        const state = createState('MOVING', 1, 'RED', [redPawn, bluePawnTarget]);

        // Add a distractor move for Red
        // RedPawn2 at 20 -> 21. No capture.
        const redPawn2Distractor: Pawn = { id: 'RED_2', color: 'RED', position: 20, pawnIndex: 1 };
        state.pawns.push(redPawn2Distractor);

        const action = smartBotDecide(state);

        expect(action.type).toBe('MOVE');
        expect(action.pawnId).toBe('RED_1'); // Should choose capture
    });

    it('should prefer entering safe square', () => {
        // Red Start 1.
        // Safe squares: 1, 9, 14, 22...
        // Let's aim for 9.
        // Pawn at 8, roll 1.

        const redPawn1: Pawn = { id: 'RED_1', color: 'RED', position: 8, pawnIndex: 0 }; // 8->9 (Safe)
        const redPawn2: Pawn = { id: 'RED_2', color: 'RED', position: 40, pawnIndex: 1 }; // 40->41 (Not safe, 40 is safe but 41 isn't)

        const state = createState('MOVING', 1, 'RED', [redPawn1, redPawn2]);
        const action = smartBotDecide(state);

        expect(action.type).toBe('MOVE');
        expect(action.pawnId).toBe('RED_1');
    });

    it('should prefer leaving base', () => {
        // Roll 6.
        // Pawn 1 in Base (HOME).
        // Pawn 2 on board at 10.

        const redPawn1: Pawn = { id: 'RED_1', color: 'RED', position: BOARD.HOME, pawnIndex: 0 };
        const redPawn2: Pawn = { id: 'RED_2', color: 'RED', position: 10, pawnIndex: 1 };

        const state = createState('MOVING', 6, 'RED', [redPawn1, redPawn2]);
        const action = smartBotDecide(state);

        expect(action.type).toBe('MOVE');
        // Leaving base is priority usually
        expect(action.pawnId).toBe('RED_1');
    });
});
