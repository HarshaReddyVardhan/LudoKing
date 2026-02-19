import { GameState, Pawn, PlayerColor, MoveLog } from '../../shared/types';
import { BOARD, getNextTurn, isSafeSquare, toGlobalPosition } from '../../shared/board';
import { SAFE_ZONES, ENTER_BOARD_DICE_ROLL } from '../../shared/constants';
import { checkWinCondition } from '../game/gameState';

export interface ValidMove {
    pawnId: string;
    from: number;
    to: number;
    willCapture: boolean;
    willReachGoal: boolean;
}

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

function calculateTargetPosition(pawn: Pawn, dice: number): number | null {
    const { position: pos, color } = pawn;

    if (pos === BOARD.HOME) {
        return dice === ENTER_BOARD_DICE_ROLL ? BOARD.START_POSITIONS[color] : null;
    }

    if (pos === BOARD.GOAL) {
        return null;
    }

    if (pos >= BOARD.HOME_STRETCH_START) {
        return isValidHomeStretchMove(pos, dice) ? pos + dice : null;
    }

    return calculateMainTrackMove(pos, dice, color);
}

function isValidHomeStretchMove(currentPos: number, dice: number): boolean {
    return currentPos + dice <= BOARD.GOAL;
}

function calculateMainTrackMove(pos: number, dice: number, color: PlayerColor): number | null {
    const entry = BOARD.HOME_ENTRY_POSITIONS[color];

    const distToEntry = (pos <= entry)
        ? entry - pos
        : (BOARD.MAIN_TRACK_LENGTH - pos) + entry;

    if (dice > distToEntry) {
        const target = BOARD.HOME_STRETCH_START - 1 + (dice - distToEntry);
        return target <= BOARD.GOAL ? target : null;
    } else {
        let target = pos + dice;
        if (target > BOARD.MAIN_TRACK_LENGTH) target -= BOARD.MAIN_TRACK_LENGTH;
        return target;
    }
}

function isPathBlocked(targetPos: number, allPawns: Pawn[], color: PlayerColor): boolean {
    if (targetPos === BOARD.GOAL || targetPos === BOARD.HOME) return false;

    const isSafe = isSafeSquare(targetPos);
    const pawnsAtTarget = allPawns.filter(p => p.position === targetPos);

    if (!isSafe && pawnsAtTarget.some(p => p.color === color)) {
        return true;
    }

    return false;
}

function shouldCapture(targetPos: number, allPawns: Pawn[], color: PlayerColor): boolean {
    if (targetPos > BOARD.MAIN_TRACK_LENGTH) return false;

    if (isSafeSquare(targetPos)) return false;

    const targetGlobalPos = toGlobalPosition(targetPos, color);

    return allPawns.some(p => {
        if (p.color === color) return false;
        if (p.position === BOARD.HOME || p.position === BOARD.GOAL || p.position >= BOARD.HOME_STRETCH_START) return false;

        const pGlobal = toGlobalPosition(p.position, p.color);
        return pGlobal === targetGlobalPos;
    });
}

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

    if (move.willCapture) {
        const movingPawn = state.pawns.find(p => p.id === pawnId)!;
        const targetGlobalPos = toGlobalPosition(move.to, movingPawn.color);

        for (let i = 0; i < newPawns.length; i++) {
            const p = newPawns[i];
            if (p.color !== movingPawn.color &&
                p.position !== BOARD.HOME &&
                p.position !== BOARD.GOAL &&
                p.position < BOARD.HOME_STRETCH_START) {

                const pawnGlobalPos = toGlobalPosition(p.position, p.color);

                if (pawnGlobalPos === targetGlobalPos) {
                    newPawns[i] = { ...p, position: BOARD.HOME };
                }
            }
        }
    }

    // Extra turn on: rolled 6, captured opponent, OR pawn reached goal
    const extraTurn = state.currentDiceValue === ENTER_BOARD_DICE_ROLL || move.willCapture || move.willReachGoal;

    const lastMove: MoveLog = {
        player: state.currentTurn,
        pawnId,
        from: move.from,
        to: move.to,
        timestamp: Date.now(),
    };

    // Skip ranked players in turn rotation
    const activePlayers = state.players
        .filter(p => p.isActive && p.rank === undefined)
        .map(p => p.color);
    const turnPool = activePlayers.length > 0
        ? activePlayers
        : state.players.filter(p => p.isActive).map(p => p.color);
    const nextTurn = extraTurn ? state.currentTurn : getNextTurn(state.currentTurn, turnPool);

    const pendingState: GameState = {
        ...state,
        pawns: newPawns,
        currentDiceValue: null,
        gamePhase: 'ROLLING',
        currentTurn: nextTurn,
        lastMove,
        lastUpdate: Date.now(),
    };

    const newState = checkWinCondition(pendingState);

    return { success: true, newState, extraTurn };
}

export function getValidPawnIds(state: GameState): string[] {
    return getValidMoves(state).map(m => m.pawnId);
}
