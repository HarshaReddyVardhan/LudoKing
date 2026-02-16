import { GameState } from '../shared/types';
import { getValidMoves, ValidMove } from '../logic/moveValidation';
import { rollDice } from '../logic/diceEngine';
import { BotStrategy, BotAction } from './botUtils';

export class SimpleBot implements BotStrategy {
    computeNextMove(state: GameState, playerColor: string): BotAction {
        // If in ROLLING phase, we need to roll
        if (state.gamePhase === 'ROLLING') {
            const diceValue = rollDice();
            return { type: 'ROLL', diceValue };
        }

        // If in MOVING phase, pick a random valid move
        if (state.gamePhase === 'MOVING') {
            const validMoves = getValidMoves(state);

            if (validMoves.length === 0) {
                return { type: 'SKIP' };
            }

            // Simple bot: pick a random valid move
            const randomIndex = Math.floor(Math.random() * validMoves.length);
            const chosenMove = validMoves[randomIndex];

            return { type: 'MOVE', pawnId: chosenMove.pawnId };
        }

        return { type: 'SKIP' };
    }
}

export class WeightedSimpleBot implements BotStrategy {
    computeNextMove(state: GameState, playerColor: string): BotAction {
        if (state.gamePhase === 'ROLLING') {
            const diceValue = rollDice();
            return { type: 'ROLL', diceValue };
        }

        if (state.gamePhase === 'MOVING') {
            const validMoves = getValidMoves(state);

            if (validMoves.length === 0) {
                return { type: 'SKIP' };
            }

            // Prefer moves that capture or reach goal
            const captureMoves = validMoves.filter(m => m.willCapture);
            const goalMoves = validMoves.filter(m => m.willReachGoal);

            // Priority: Goal > Capture > Random
            if (goalMoves.length > 0) {
                return { type: 'MOVE', pawnId: goalMoves[0].pawnId };
            }

            if (captureMoves.length > 0) {
                return { type: 'MOVE', pawnId: captureMoves[0].pawnId };
            }

            // Random from remaining
            const randomIndex = Math.floor(Math.random() * validMoves.length);
            return { type: 'MOVE', pawnId: validMoves[randomIndex].pawnId };
        }

        return { type: 'SKIP' };
    }
}
