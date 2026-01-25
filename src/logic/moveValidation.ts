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
    const diceValue = state.currentDiceValue;
    if (diceValue === null) {
        return [];
    }

    const currentColor = state.currentTurn;
    const playerPawns = state.pawns.filter(p => p.color === currentColor);
    const validMoves: ValidMove[] = [];

    for (const pawn of playerPawns) {
        const move = calculateMove(pawn, diceValue, state);
        if (move) {
            validMoves.push(move);
        }
    }

    return validMoves;
}

/**
 * Calculates if a specific pawn can move with the given dice value.
 * Returns the move details or null if move is invalid.
 */
function calculateMove(pawn: Pawn, diceValue: number, state: GameState): ValidMove | null {
    const { color, position } = pawn;

    // Case 1: Pawn is in home/base - needs a 6 to exit
    if (position === BOARD.HOME) {
        if (diceValue === 6) {
            const startPos = BOARD.START_POSITIONS[color];
            // Check if start position is blocked by own pawn
            const blocked = isBlockedByOwnPawn(startPos, color, state.pawns);
            if (!blocked) {
                const willCapture = hasOpponentPawn(startPos, color, state.pawns);
                return {
                    pawnId: pawn.id,
                    from: BOARD.HOME,
                    to: startPos,
                    willCapture,
                    willReachGoal: false,
                };
            }
        }
        return null;
    }

    // Case 2: Pawn is already at goal - cannot move
    if (position === BOARD.GOAL) {
        return null;
    }

    // Case 3: Pawn is on home stretch (53-58)
    if (position >= BOARD.HOME_STRETCH_START && position <= BOARD.HOME_STRETCH_END) {
        const newPosition = position + diceValue;
        if (newPosition === BOARD.GOAL) {
            // Exact roll to reach goal
            return {
                pawnId: pawn.id,
                from: position,
                to: BOARD.GOAL,
                willCapture: false,
                willReachGoal: true,
            };
        } else if (newPosition < BOARD.GOAL) {
            // Move within home stretch
            return {
                pawnId: pawn.id,
                from: position,
                to: newPosition,
                willCapture: false,
                willReachGoal: false,
            };
        }
        // Overshot the goal - invalid move
        return null;
    }

    // Case 4: Pawn is on main track (1-52)
    const homeEntry = BOARD.HOME_ENTRY_POSITIONS[color];
    const distanceToHomeEntry = calculateDistanceToHomeEntry(position, homeEntry);

    if (diceValue > distanceToHomeEntry) {
        // Pawn will enter home stretch
        const stepsIntoHomeStretch = diceValue - distanceToHomeEntry;
        const newPosition = BOARD.HOME_STRETCH_START - 1 + stepsIntoHomeStretch;

        if (newPosition === BOARD.GOAL) {
            return {
                pawnId: pawn.id,
                from: position,
                to: BOARD.GOAL,
                willCapture: false,
                willReachGoal: true,
            };
        } else if (newPosition < BOARD.GOAL) {
            return {
                pawnId: pawn.id,
                from: position,
                to: newPosition,
                willCapture: false,
                willReachGoal: false,
            };
        }
        // Overshot - invalid
        return null;
    }

    // Normal move on main track
    let newPosition = position + diceValue;
    if (newPosition > BOARD.MAIN_TRACK_LENGTH) {
        newPosition = newPosition - BOARD.MAIN_TRACK_LENGTH;
    }

    // Check if blocked by own pawn
    if (isBlockedByOwnPawn(newPosition, color, state.pawns)) {
        return null;
    }

    const willCapture = hasOpponentPawn(newPosition, color, state.pawns) && !isSafeSquare(newPosition);

    return {
        pawnId: pawn.id,
        from: position,
        to: newPosition,
        willCapture,
        willReachGoal: false,
    };
}

/**
 * Calculates distance from current position to home entry point
 */
function calculateDistanceToHomeEntry(position: number, homeEntry: number): number {
    if (position <= homeEntry) {
        return homeEntry - position;
    }
    // Wrap around the board
    return (BOARD.MAIN_TRACK_LENGTH - position) + homeEntry;
}

/**
 * Checks if a position is blocked by player's own pawn
 */
function isBlockedByOwnPawn(position: number, color: PlayerColor, pawns: Pawn[]): boolean {
    return pawns.some(p => p.color === color && p.position === position && position !== BOARD.HOME);
}

/**
 * Checks if there's an opponent pawn at the position
 */
function hasOpponentPawn(position: number, color: PlayerColor, pawns: Pawn[]): boolean {
    return pawns.some(p =>
        p.color !== color &&
        p.position !== BOARD.HOME &&
        p.position < BOARD.HOME_STRETCH_START &&
        toGlobalPosition(p.position, p.color) === toGlobalPosition(position, color)
    );
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
