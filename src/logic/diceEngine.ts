import { GameState, PlayerColor, COLORS } from '../shared/types';
import { MAX_CONSECUTIVE_SIXES, ROLL_DEBOUNCE_MS, POSITION_HOME, DICE_MAX_VALUE, WEIGHTED_SIX_PROBABILITY } from '../shared/constants';

/**
 * Interface for providing random numbers.
 * Allows injecting deterministic behavior for testing.
 * Must return a number in the range [0, 1).
 */
export interface IDiceProvider {
    roll(): number;
}

/**
 * Default implementation using Math.random().
 */
export class RandomDiceProvider implements IDiceProvider {
    roll(): number {
        return Math.random();
    }
}

/**
 * Generates a random dice value between 1 and 6 (inclusive).
 * If weightSix is true, increases the probability of rolling a 6.
 * (Standard: ~16%, Weighted: ~40%)
 */
export function rollDice(weightSix: boolean = false, provider: IDiceProvider = new RandomDiceProvider()): number {
    const r = provider.roll();

    if (weightSix) {
        // Weighted chance of rolling a 6
        if (r < WEIGHTED_SIX_PROBABILITY) return DICE_MAX_VALUE;

        // Remaining probability split among 1-5
        // Normalize r from [WEIGHTED_SIX_PROBABILITY, 1.0) to [0, 1.0)
        const probabilityRem = 1.0 - WEIGHTED_SIX_PROBABILITY;
        const normalized = (r - WEIGHTED_SIX_PROBABILITY) / probabilityRem;
        return Math.floor(normalized * (DICE_MAX_VALUE - 1)) + 1;
    }
    return Math.floor(r * DICE_MAX_VALUE) + 1;
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
    requestingPlayerId: string,
    provider: IDiceProvider = new RandomDiceProvider()
): { success: boolean; newState: GameState; diceValue?: number; error?: string } {
    const { players, currentTurn, gamePhase, lastRollTime = 0 } = state;

    // Debounce: Prevent spam clicking (300ms)
    if (Date.now() - lastRollTime < ROLL_DEBOUNCE_MS) {
        // Return existing state without error to ignore spam, or error
        return { success: false, newState: state, error: 'Rolling too fast' };
    }

    const player = players.find(p => p.id === requestingPlayerId);

    if (!player) return { success: false, newState: state, error: 'Player not found' };
    if (player.color !== currentTurn) return { success: false, newState: state, error: 'Not your turn' };
    if (gamePhase !== 'ROLLING') {
        return {
            success: false,
            newState: state,
            error: `Cannot roll in ${gamePhase} phase. Current dice: ${state.currentDiceValue}`
        };
    }

    // Weight 6 if 3+ pawns in base
    const pawnsInZero = state.pawns.filter(p => p.color === player.color && p.position === POSITION_HOME).length;
    const diceValue = rollDice(pawnsInZero >= 3, provider);

    // 3 Sixes Consecutive Rule
    let consecutiveSixes = state.consecutiveSixes || 0;
    if (diceValue === DICE_MAX_VALUE) {
        consecutiveSixes++;
    } else {
        consecutiveSixes = 0;
    }

    const now = Date.now();

    // If rolled 3 sixes, turn ends immediately
    if (consecutiveSixes >= MAX_CONSECUTIVE_SIXES) {
        // Find next active player
        const currentColorIdx = COLORS.indexOf(currentTurn);
        let nextTurn = currentTurn;
        for (let i = 1; i <= 4; i++) {
            const nextColor = COLORS[(currentColorIdx + i) % 4];
            if (players.some(p => p.color === nextColor && p.isActive)) {
                nextTurn = nextColor;
                break;
            }
        }

        return {
            success: true,
            diceValue, // Return the 6 so UI can show it briefly
            newState: {
                ...state,
                currentDiceValue: null, // Reset immediately
                gamePhase: 'ROLLING',
                currentTurn: nextTurn,
                lastUpdate: now,
                consecutiveSixes: 0,
                lastRollTime: now,
            }
        };
    }

    // Normal successful roll
    return {
        success: true,
        newState: {
            ...state,
            currentDiceValue: diceValue,
            gamePhase: 'MOVING',
            lastUpdate: now,
            consecutiveSixes,
            lastRollTime: now,
        },
        diceValue
    };
}

/**
 * Resets the game phase to ROLLING after a move is complete.
 * This is called after a valid move to allow the next roll.
 */
export function resetToRollingPhase(state: GameState, nextTurn: PlayerColor): GameState {
    const isSameTurn = state.currentTurn === nextTurn;
    return {
        ...state,
        currentDiceValue: null,
        gamePhase: 'ROLLING',
        currentTurn: nextTurn,
        lastUpdate: Date.now(),
        // Reset consecutive sixes if turn changes
        consecutiveSixes: isSameTurn ? (state.consecutiveSixes || 0) : 0,
    };
}
