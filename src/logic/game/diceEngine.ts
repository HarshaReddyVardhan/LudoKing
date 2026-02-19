import { GameState, PlayerColor, COLORS, GamePhase, Color } from '../../shared/types';
import { MAX_CONSECUTIVE_SIXES, ROLL_DEBOUNCE_MS, POSITION_HOME, DICE_MAX_VALUE, WEIGHTED_SIX_PROBABILITY } from '../../shared/constants';

export interface IDiceProvider {
    roll(): number;
}

export class RandomDiceProvider implements IDiceProvider {
    roll(): number {
        return Math.random();
    }
}

export function rollDice(weightSix: boolean = false, provider: IDiceProvider = new RandomDiceProvider()): number {
    const r = provider.roll();

    if (weightSix) {
        if (r < WEIGHTED_SIX_PROBABILITY) return DICE_MAX_VALUE;
        const probabilityRem = 1.0 - WEIGHTED_SIX_PROBABILITY;
        const normalized = (r - WEIGHTED_SIX_PROBABILITY) / probabilityRem;
        return Math.floor(normalized * (DICE_MAX_VALUE - 1)) + 1;
    }
    return Math.floor(r * DICE_MAX_VALUE) + 1;
}

export function handleRollRequest(
    state: GameState,
    requestingPlayerId: string,
    provider: IDiceProvider = new RandomDiceProvider()
): { success: boolean; newState: GameState; diceValue?: number; error?: string } {
    const { players, currentTurn, gamePhase, lastRollTime = 0 } = state;

    if (Date.now() - lastRollTime < ROLL_DEBOUNCE_MS) {
        return { success: false, newState: state, error: 'Rolling too fast' };
    }

    const player = players.find(p => p.connectionId === requestingPlayerId);

    if (!player) return { success: false, newState: state, error: 'Player not found' };
    if (player.color !== currentTurn) return { success: false, newState: state, error: 'Not your turn' };
    if (gamePhase !== GamePhase.ROLLING) {
        return {
            success: false,
            newState: state,
            error: `Cannot roll in ${gamePhase} phase. Current dice: ${state.currentDiceValue}`
        };
    }

    const pawnsInZero = state.pawns.filter(p => p.color === player.color && p.position === POSITION_HOME).length;
    const diceValue = rollDice(pawnsInZero >= 3, provider);

    let consecutiveSixes = state.consecutiveSixes || 0;
    if (diceValue === DICE_MAX_VALUE) {
        consecutiveSixes++;
    } else {
        consecutiveSixes = 0;
    }

    const now = Date.now();

    if (consecutiveSixes >= MAX_CONSECUTIVE_SIXES) {
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
            diceValue,
            newState: {
                ...state,
                currentDiceValue: null,
                gamePhase: GamePhase.ROLLING,
                currentTurn: nextTurn,
                lastUpdate: now,
                consecutiveSixes: 0,
                lastRollTime: now,
            }
        };
    }

    return {
        success: true,
        newState: {
            ...state,
            currentDiceValue: diceValue,
            gamePhase: GamePhase.MOVING,
            lastUpdate: now,
            consecutiveSixes,
            lastRollTime: now,
        },
        diceValue
    };
}

export function resetToRollingPhase(state: GameState, nextTurn: PlayerColor): GameState {
    const isSameTurn = state.currentTurn === nextTurn;
    return {
        ...state,
        currentDiceValue: null,
        gamePhase: GamePhase.ROLLING,
        currentTurn: nextTurn,
        lastUpdate: Date.now(),
        consecutiveSixes: isSameTurn ? (state.consecutiveSixes ?? 0) : 0,
    };
}

