import { GameState, PlayerColor } from '../../shared/types';
import { BotStrategy, BotAction, getDistanceFromStart } from './botUtils';
import { ValidMove, getValidMoves } from '../rules/moveValidation';
import { rollDice } from '../game/diceEngine';
import { BOARD, toGlobalPosition, isSafeSquare } from '../../shared/board';
import { DICE_MAX_VALUE } from '../../shared/constants';

interface BotWeights {
    capture: number;
    reachGoal: number;
    enterHomeStretch: number;
    safeSquare: number;
    leaveBase: number;
    riskPenalty: number;
    progressMultiplier: number;
}

const DEFAULT_WEIGHTS: BotWeights = {
    capture: 200,
    reachGoal: 300,
    enterHomeStretch: 100,
    safeSquare: 40,
    leaveBase: 150,
    riskPenalty: 50,
    progressMultiplier: 1
};

function scoreMove(move: ValidMove, state: GameState, weights: BotWeights): number {
    let score = 0;
    const { color } = state.pawns.find(p => p.id === move.pawnId)!;

    if (move.willCapture) score += weights.capture;
    if (move.willReachGoal) score += weights.reachGoal;
    if (move.from === BOARD.HOME) score += weights.leaveBase;

    if (!move.willReachGoal && isSafeSquare(move.to)) {
        if (move.to <= BOARD.MAIN_TRACK_LENGTH) {
            score += weights.safeSquare;
        }
    }

    const wasInHomeStretch = move.from >= BOARD.HOME_STRETCH_START;
    const isInHomeStretch = move.to >= BOARD.HOME_STRETCH_START || move.willReachGoal;

    if (!wasInHomeStretch && isInHomeStretch) {
        score += weights.enterHomeStretch;
    }

    const distanceFromStart = getDistanceFromStart(move.to, color);
    score += distanceFromStart * weights.progressMultiplier;

    if (!move.willReachGoal && !isSafeSquare(move.to) && move.to <= BOARD.MAIN_TRACK_LENGTH) {
        const myGlobalPos = toGlobalPosition(move.to, color);
        const opponents = state.pawns.filter(
            p => p.color !== color &&
                p.position !== BOARD.HOME &&
                p.position !== BOARD.GOAL &&
                p.position < BOARD.HOME_STRETCH_START
        );

        for (const opp of opponents) {
            const oppGlobal = toGlobalPosition(opp.position, opp.color);
            const distance = (myGlobalPos - oppGlobal + BOARD.MAIN_TRACK_LENGTH) % BOARD.MAIN_TRACK_LENGTH;
            if (distance >= 1 && distance <= DICE_MAX_VALUE) {
                score -= weights.riskPenalty;
            }
        }
    }

    return score;
}

export class SmartBot implements BotStrategy {
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

            const scoredMoves = validMoves.map((move: ValidMove) => ({
                move,
                score: scoreMove(move, state, DEFAULT_WEIGHTS)
            }));

            scoredMoves.sort((a: { move: ValidMove; score: number }, b: { move: ValidMove; score: number }) => b.score - a.score);
            const bestMove = scoredMoves[0].move;

            return { type: 'MOVE', pawnId: bestMove.pawnId };
        }

        return { type: 'SKIP' };
    }
}
