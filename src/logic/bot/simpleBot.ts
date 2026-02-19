import { GameState } from '../../shared/types';
import { ValidMove, getValidMoves } from '../rules/moveValidation';
import { rollDice } from '../game/diceEngine';
import { BotStrategy, BotAction } from './botUtils';

export class SimpleBot implements BotStrategy {
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
            const validMoves: ValidMove[] = getValidMoves(state);

            if (validMoves.length === 0) {
                return { type: 'SKIP' };
            }

            const captureMoves = validMoves.filter((m: ValidMove) => m.willCapture);
            const goalMoves = validMoves.filter((m: ValidMove) => m.willReachGoal);

            if (goalMoves.length > 0) {
                return { type: 'MOVE', pawnId: goalMoves[0].pawnId };
            }

            if (captureMoves.length > 0) {
                return { type: 'MOVE', pawnId: captureMoves[0].pawnId };
            }

            const randomIndex = Math.floor(Math.random() * validMoves.length);
            return { type: 'MOVE', pawnId: validMoves[randomIndex].pawnId };
        }

        return { type: 'SKIP' };
    }
}
