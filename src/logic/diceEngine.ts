import { GameState, PlayerColor } from '../shared/types';

/**
 * Generates a random dice value between 1 and 6 (inclusive).
 * This is the ONLY place dice values should be generated (anti-cheat).
 */
export function rollDice(): number {
    return Math.floor(Math.random() * 6) + 1;
}

/**
 * Attempts to roll the dice for a player.
 * Returns the new state with the dice value, or null if the roll is invalid.
 * 
 * Anti-cheat rules:
 * - Only the current turn player can roll
 * - Cannot roll if already rolled (must move first)
 * - Game must be in ROLLING phase
 */
export function handleRollRequest(
    state: GameState,
    requestingPlayerId: string
): { success: boolean; newState: GameState; diceValue?: number; error?: string } {
    // Find the requesting player
    const player = state.players.find(p => p.id === requestingPlayerId);

    if (!player) {
        return { success: false, newState: state, error: 'Player not found' };
    }

    // Check if it's this player's turn
    if (player.color !== state.currentTurn) {
        return { success: false, newState: state, error: 'Not your turn' };
    }

    // Check game phase - must be ROLLING to roll
    if (state.gamePhase !== 'ROLLING') {
        return {
            success: false,
            newState: state,
            error: `Cannot roll in ${state.gamePhase} phase. Current dice: ${state.currentDiceValue}`
        };
    }

    // Generate the dice value
    const diceValue = rollDice();

    // Lock the state to MOVING phase (player must move before rolling again)
    const newState: GameState = {
        ...state,
        currentDiceValue: diceValue,
        gamePhase: 'MOVING',
        lastUpdate: Date.now(),
    };

    return { success: true, newState, diceValue };
}

/**
 * Resets the game phase to ROLLING after a move is complete.
 * This is called after a valid move to allow the next roll.
 */
export function resetToRollingPhase(state: GameState, nextTurn: PlayerColor): GameState {
    return {
        ...state,
        currentDiceValue: null,
        gamePhase: 'ROLLING',
        currentTurn: nextTurn,
        lastUpdate: Date.now(),
    };
}
