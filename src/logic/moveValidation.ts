import { GameState, Pawn, PlayerColor, MoveLog } from '../shared/types';
import { BOARD, getNextTurn, isSafeSquare, toGlobalPosition } from '../shared/board';
import { SAFE_ZONES, ENTER_BOARD_DICE_ROLL } from '../shared/constants';
import { checkWinCondition } from './gameState';

export interface ValidMove {
    pawnId: string;
    from: number;
    to: number;
    willCapture: boolean;
    willReachGoal: boolean;
}

/**
 * Calculates valid moves for the current player based on dice roll.
 * Returns list of pawns that can legally move.
 */

export function getValidMoves(state: GameState): ValidMove[] {
    const { currentDiceValue: dice, currentTurn: turn, pawns } = state;
    if (!dice) return [];

    const moves: ValidMove[] = [];

    pawns.filter(p => p.color === turn).forEach(p => {
        const to = calculateTargetPosition(p, dice);

        if (to === null) return;
        if (isPathBlocked(to, pawns, p.color)) return;

        const willCapture = shouldCapture(to, pawns, p.color);
        const willReachGoal = to === BOARD.GOAL;

        moves.push({
            pawnId: p.id,
            from: p.position,
            to,
            willCapture,
            willReachGoal
        });
    });

    return moves;
}

/**
 * Calculates the target position for a pawn given a dice roll.
 * Returns null if the move is invalid (e.g. wrong dice for start, overshooting goal).
 */
function calculateTargetPosition(pawn: Pawn, dice: number): number | null {
    const { position: pos, color } = pawn;

    // 1. Enter Board Logic
    if (pos === BOARD.HOME) {
        return dice === ENTER_BOARD_DICE_ROLL ? BOARD.START_POSITIONS[color] : null;
    }

    // 2. Already at Goal
    if (pos === BOARD.GOAL) {
        return null;
    }

    // 3. Home Stretch Logic
    if (pos >= BOARD.HOME_STRETCH_START) {
        return isValidHomeStretchMove(pos, dice) ? pos + dice : null;
    }

    // 4. Main Track Logic
    return calculateMainTrackMove(pos, dice, color);
}

/**
 * Checks if a move within the home stretch doesn't overshoot the goal.
 */
function isValidHomeStretchMove(currentPos: number, dice: number): boolean {
    return currentPos + dice <= BOARD.GOAL;
}

/**
 * Calculates the target position from the main track.
 * Handles wrapping around the board and entering the home stretch.
 */
function calculateMainTrackMove(pos: number, dice: number, color: PlayerColor): number | null {
    const entry = BOARD.HOME_ENTRY_POSITIONS[color];

    // Calculate distance to the home stretch entry point
    const distToEntry = (pos <= entry)
        ? entry - pos
        : (BOARD.MAIN_TRACK_LENGTH - pos) + entry;

    if (dice > distToEntry) {
        // Enter home stretch
        const target = BOARD.HOME_STRETCH_START - 1 + (dice - distToEntry);
        return target <= BOARD.GOAL ? target : null;
    } else {
        // Move along main track
        let target = pos + dice;
        if (target > BOARD.MAIN_TRACK_LENGTH) target -= BOARD.MAIN_TRACK_LENGTH;
        return target;
    }
}

/**
 * Checks if the target position is blocked by a pawn of the same color.
 * Self-stacking is allowed only on safe squares.
 */
function isPathBlocked(targetPos: number, allPawns: Pawn[], color: PlayerColor): boolean {
    if (targetPos === BOARD.GOAL || targetPos === BOARD.HOME) return false;

    const isSafe = isSafeSquare(targetPos);
    const pawnsAtTarget = allPawns.filter(p => p.position === targetPos);

    // If unsafe square, cannot land on own pawn
    if (!isSafe && pawnsAtTarget.some(p => p.color === color)) {
        return true;
    }

    return false;
}

function shouldCapture(targetPos: number, allPawns: Pawn[], color: PlayerColor): boolean {
    // Cannot capture in home stretch, home, or goal
    if (targetPos > BOARD.MAIN_TRACK_LENGTH) return false;

    if (isSafeSquare(targetPos)) return false;

    const targetGlobalPos = toGlobalPosition(targetPos, color);

    // Check for any opponent pawn at the same global position
    return allPawns.some(p => {
        if (p.color === color) return false;
        // Ignore pawns in safe areas (Home, Goal, Home Stretch)
        if (p.position === BOARD.HOME || p.position === BOARD.GOAL || p.position >= BOARD.HOME_STRETCH_START) return false;

        const pGlobal = toGlobalPosition(p.position, p.color);
        return pGlobal === targetGlobalPos;
    });
}

/**
 * Executes a validated move and returns the new game state.
 */
export function executeMove(
    state: GameState,
    pawnId: string,
    validMoves: ValidMove[]
): { success: boolean; newState: GameState; error?: string; extraTurn?: boolean } {
    const move = validMoves.find(m => m.pawnId === pawnId);

    if (!move) {
        return { success: false, newState: state, error: 'Invalid pawn selection' };
    }

    const newPawns = state.pawns.map(p => {
        if (p.id === pawnId) {
            return { ...p, position: move.to };
        }
        return p;
    });

    // Handle capture - send opponent pawn back to home
    if (move.willCapture) {
        const movingPawn = state.pawns.find(p => p.id === pawnId)!;
        const targetGlobalPos = toGlobalPosition(move.to, movingPawn.color);

        for (let i = 0; i < newPawns.length; i++) {
            const p = newPawns[i];
            // Check if opponent pawn is on the same global square
            if (p.color !== movingPawn.color &&
                p.position !== BOARD.HOME &&
                p.position !== BOARD.GOAL &&
                p.position < BOARD.HOME_STRETCH_START) {

                const pawnGlobalPos = toGlobalPosition(p.position, p.color);

                if (pawnGlobalPos === targetGlobalPos) {
                    // ACTION: Reset captured pawn to HOME
                    newPawns[i] = { ...p, position: BOARD.HOME };
                    // Note: Ludo rules typically capture ALL pawns on the spot (if multiple opponents), 
                    // though typically valid play prevents stacking opponents. 
                    // We'll continue checking just in case.
                }
            }
        }
    }

    // Determine if player gets extra turn (rolled 6, captured, or reached goal)
    const extraTurn = state.currentDiceValue === ENTER_BOARD_DICE_ROLL || move.willCapture || move.willReachGoal;

    // Create move log
    const lastMove: MoveLog = {
        player: state.currentTurn,
        pawnId,
        from: move.from,
        to: move.to,
        timestamp: Date.now(),
    };

    // Determine next turn
    const activePlayers = state.players.filter(p => p.isActive).map(p => p.color);
    const nextTurn = extraTurn ? state.currentTurn : getNextTurn(state.currentTurn, activePlayers);

    const pendingState: GameState = {
        ...state,
        pawns: newPawns,
        currentDiceValue: null,
        gamePhase: 'ROLLING',
        currentTurn: nextTurn,
        lastMove,
        lastUpdate: Date.now(),
    };

    // Evaluate player ranks and detect FINISHED phase
    const newState = checkWinCondition(pendingState);

    return { success: true, newState, extraTurn };
}

/**
 * Gets just the IDs of valid pawns (for sending to client)
 */
export function getValidPawnIds(state: GameState): string[] {
    return getValidMoves(state).map(m => m.pawnId);
}
