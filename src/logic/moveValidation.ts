import { GameState, Pawn, PlayerColor, MoveLog } from '../shared/types';
import { BOARD, getNextTurn, isSafeSquare, toGlobalPosition } from '../shared/board';

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

    // Safe Squares: Stars at 1, 9, 14 etc
    const isSafe = (i: number) => [1, 9, 14, 22, 27, 35, 40, 48].includes(i);
    const moves: ValidMove[] = [];

    pawns.filter(p => p.color === turn).forEach(p => {
        const { id, position: pos, color } = p;
        let to = -1, capture = false, goal = false;

        // Path Logic
        if (pos === BOARD.HOME) {
            if (dice === 6) to = BOARD.START_POSITIONS[color];
            else return;
        } else if (pos === BOARD.GOAL) {
            return;
        } else if (pos >= BOARD.HOME_STRETCH_START) {
            if (pos + dice <= BOARD.GOAL) to = pos + dice;
            else return;
        } else {
            const entry = BOARD.HOME_ENTRY_POSITIONS[color];
            const dist = (pos <= entry) ? entry - pos : (BOARD.MAIN_TRACK_LENGTH - pos) + entry;

            if (dice > dist) {
                to = BOARD.HOME_STRETCH_START - 1 + (dice - dist);
                if (to > BOARD.GOAL) return;
            } else {
                to = pos + dice;
                if (to > BOARD.MAIN_TRACK_LENGTH) to -= BOARD.MAIN_TRACK_LENGTH;
            }
        }

        goal = to === BOARD.GOAL;
        const safeSq = isSafe(to) || to === BOARD.GOAL;
        const busy = pawns.filter(op => op.position === to && to !== BOARD.GOAL && to !== BOARD.HOME);

        // Blocked by Own (Stack 'em if safe, else block)
        if (!safeSq && busy.some(op => op.color === turn)) return;

        // Capture Logic
        if (to <= BOARD.MAIN_TRACK_LENGTH) {
            const opp = busy.some(op => op.color !== turn);
            if (opp) {
                if (safeSq) capture = false; // Safe Square: No kill. Stack 'em.
                else capture = true; // Unsafe: Send opp to base
            }
        }

        moves.push({ pawnId: id, from: pos, to, willCapture: capture, willReachGoal: goal });
    });

    return moves;
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
            if (p.color !== movingPawn.color &&
                p.position !== BOARD.HOME &&
                p.position < BOARD.HOME_STRETCH_START) {
                const pawnGlobalPos = toGlobalPosition(p.position, p.color);
                if (pawnGlobalPos === targetGlobalPos) {
                    newPawns[i] = { ...p, position: BOARD.HOME };
                    break;
                }
            }
        }
    }

    // Determine if player gets extra turn (rolled 6, captured, or reached goal)
    const extraTurn = state.currentDiceValue === 6 || move.willCapture || move.willReachGoal;

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

    // Check for winner (all 4 pawns at goal)
    const playerPawns = newPawns.filter(p => p.color === state.currentTurn);
    const allAtGoal = playerPawns.every(p => p.position === BOARD.GOAL);
    const winner = allAtGoal ? state.currentTurn : undefined;

    const newState: GameState = {
        ...state,
        pawns: newPawns,
        currentDiceValue: null,
        gamePhase: winner ? 'FINISHED' : 'ROLLING',
        currentTurn: winner ? state.currentTurn : nextTurn,
        lastMove,
        lastUpdate: Date.now(),
        winner,
    };

    return { success: true, newState, extraTurn };
}

/**
 * Gets just the IDs of valid pawns (for sending to client)
 */
export function getValidPawnIds(state: GameState): string[] {
    return getValidMoves(state).map(m => m.pawnId);
}
