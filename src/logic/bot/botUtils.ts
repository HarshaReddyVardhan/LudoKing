import { GameState, PlayerColor } from '../../shared/types';
import { BOARD } from '../../shared/board';
import { DICE_MAX_VALUE } from '../../shared/constants';

export interface BotAction {
    type: 'ROLL' | 'MOVE' | 'SKIP';
    pawnId?: string;
    diceValue?: number;
}

export interface BotStrategy {
    computeNextMove(gameState: GameState, playerColor: string): BotAction;
}

/**
 * Calculates how far a position is from the player's start.
 * Used to prioritize moving pawns closer to the goal.
 */
export function getDistanceFromStart(pos: number, color: PlayerColor): number {
    if (pos === BOARD.HOME) return 0;
    if (pos === BOARD.GOAL) return BOARD.MAIN_TRACK_LENGTH + DICE_MAX_VALUE;

    if (pos >= BOARD.HOME_STRETCH_START) {
        return BOARD.MAIN_TRACK_LENGTH + (pos - BOARD.HOME_STRETCH_START);
    }

    const start = BOARD.START_POSITIONS[color];
    return (pos - start + BOARD.MAIN_TRACK_LENGTH) % BOARD.MAIN_TRACK_LENGTH;
}
