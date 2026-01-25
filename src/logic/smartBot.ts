import { GameState, PlayerColor } from '../shared/types';
import { BotAction } from './simpleBot';
import { getValidMoves, ValidMove } from './moveValidation';
import { rollDice } from './diceEngine';
import { BOARD, toGlobalPosition, isSafeSquare } from '../shared/board';

/**
 * Smart Bot Strategy Configuration
 */
interface BotWeights {
    capture: number;
    reachGoal: number;
    enterHomeStretch: number;
    safeSquare: number;
    leaveBase: number;
    riskPenalty: number; // Penalty for landing in a spot where opponent is 1-6 tiles behind
    progressMultiplier: number; // Points per tile moved closer to goal
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

/**
 * Calculates a score for a given move based on the current game state and weights.
 */
function scoreMove(move: ValidMove, state: GameState, weights: BotWeights): number {
    let score = 0;
    const { color } = state.pawns.find(p => p.id === move.pawnId)!;

    // 1. Capture Bonus
    if (move.willCapture) score += weights.capture;

    // 2. Goal Bonus
    if (move.willReachGoal) score += weights.reachGoal;

    // 3. Leave Base
    if (move.from === BOARD.HOME) score += weights.leaveBase;

    // 4. Safe Square
    // If not goal, check if destination is safe
    if (!move.willReachGoal && isSafeSquare(move.to)) {
        // Only valid if on main track
        if (move.to <= BOARD.MAIN_TRACK_LENGTH) {
            score += weights.safeSquare;
        }
    }

    // 5. Enter Home Stretch
    // If we weren't in home stretch/goal before, and now we are (or at goal)
    const wasInHomeStretch = move.from >= BOARD.HOME_STRETCH_START;
    const isInHomeStretch = move.to >= BOARD.HOME_STRETCH_START || move.willReachGoal;

    if (!wasInHomeStretch && isInHomeStretch) {
        score += weights.enterHomeStretch;
    }

    // 6. Progress Bonus (Distance travelled)
    // Roughly 1 pt per square.
    // Note: 'to' and 'from' aren't linear global indices, so simple subtraction works only for same segment.
    // But since we want "progress", we can just infer the move distance is mostly the dice value.
    // However, moving into safety is better.
    // Let's just use dice value as a tie-breaker.
    // score += (state.currentDiceValue || 0) * weights.progressMultiplier;

    // 7. Risk Assessment (The "Smart" part)
    // Check if the destination puts us in range of an opponent.
    if (!move.willReachGoal && !isSafeSquare(move.to) && move.to <= BOARD.MAIN_TRACK_LENGTH) {
        // Calculate global pos
        const myGlobalPos = toGlobalPosition(move.to, color);

        // Check all opponents
        const opponents = state.pawns.filter(p => p.color !== color && p.position !== BOARD.HOME && p.position !== BOARD.GOAL && p.position < BOARD.HOME_STRETCH_START);

        for (const opp of opponents) {
            const oppGlobal = toGlobalPosition(opp.position, opp.color);
            // Distance on the circle: (My - Opp + 52) % 52.
            const distance = (myGlobalPos - oppGlobal + BOARD.MAIN_TRACK_LENGTH) % BOARD.MAIN_TRACK_LENGTH;

            // If distance is small positive (1-6), they are behind us and can catch us.
            // Actually, if distance is 1..6, it means we are 1..6 steps AHEAD of them.
            // wait, if I am at 10, and they are at 4. 10-4 = 6. They roll 6, they catch me.
            // So if `myGlobal - oppGlobal` is 1..6, I am in danger.

            if (distance >= 1 && distance <= 6) {
                // Higher penalty if they are closer or if 6 (likely roll? well 1/6 chance for any)
                score -= weights.riskPenalty;
                // Accumulate risk? Or just once? Let's accumulate for multiple threats.
            }
        }
    }

    return score;
}

/**
 * Smart Bot Decision Function
 */
export function smartBotDecide(state: GameState): BotAction {
    // 1. Roll Phase
    if (state.gamePhase === 'ROLLING') {
        const diceValue = rollDice();
        return { type: 'ROLL', diceValue };
    }

    // 2. Move Phase
    if (state.gamePhase === 'MOVING') {
        const validMoves = getValidMoves(state);

        if (validMoves.length === 0) {
            return { type: 'SKIP' };
        }

        // Evaluate all moves
        const scoredMoves = validMoves.map(move => ({
            move,
            score: scoreMove(move, state, DEFAULT_WEIGHTS)
        }));

        // Sort by score descending
        scoredMoves.sort((a, b) => b.score - a.score);

        // Pick the best one
        // Provide some randomness if scores are tied?
        // For now, deterministic best move.
        const bestMove = scoredMoves[0].move;

        return { type: 'MOVE', pawnId: bestMove.pawnId };
    }

    return { type: 'SKIP' };
}
