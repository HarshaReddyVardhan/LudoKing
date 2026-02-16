import { GameState, PlayerColor } from '../shared/types';
import { BotAction } from './simpleBot';
import { getValidMoves, ValidMove } from './moveValidation';
import { rollDice } from './diceEngine';
import { BOARD, toGlobalPosition, isSafeSquare } from '../shared/board';

/**
 * Calculates how far a position is from the player's start.
 * Used to prioritize moving pawns closer to the goal.
 */
function getDistanceFromStart(pos: number, color: PlayerColor): number {
    if (pos === BOARD.HOME) return 0;
    if (pos === BOARD.GOAL) return BOARD.MAIN_TRACK_LENGTH + 6; // Goal is max distance

    if (pos >= BOARD.HOME_STRETCH_START) {
        // Distance on main track portion (52) + distance into home stretch
        // Home stretch starts at 53.
        return BOARD.MAIN_TRACK_LENGTH + (pos - BOARD.HOME_STRETCH_START);
    }

    const start = BOARD.START_POSITIONS[color];
    // Main track distance: (pos - start + 52) % 52
    // If pos == start, dist is 0.
    return (pos - start + BOARD.MAIN_TRACK_LENGTH) % BOARD.MAIN_TRACK_LENGTH;
}

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

    // 6. Progress Value (Prefer moving pawns closer to goal)
    // We prioritize advancing pawns that are closer to completion to finish the game.
    const distanceFromStart = getDistanceFromStart(move.to, color);
    score += distanceFromStart * weights.progressMultiplier;

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
                // Apply penalty for each opponent in range
                score -= weights.riskPenalty;
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
