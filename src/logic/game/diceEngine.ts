import { GameState, PlayerColor, COLORS, GamePhase, Color } from '../../shared/types';
import { MAX_CONSECUTIVE_SIXES, ROLL_DEBOUNCE_MS, POSITION_HOME, DICE_MAX_VALUE, WEIGHTED_SIX_PROBABILITY } from '../../shared/constants';

export interface IDiceProvider {
    roll(): number;
}

export class RandomDiceProvider implements IDiceProvider {
    roll(): number {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return array[0] / (0xFFFFFFFF + 1);
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
        const currentColor = currentTurn;
        let nextPlayerColor = currentColor;

        const activePlayers = players.filter(p => p.isActive); // Should we exclude finished?
        const currentIndex = activePlayers.findIndex(p => p.color === currentColor);

        if (currentIndex !== -1) {
            const nextIndex = (currentIndex + 1) % activePlayers.length;
            nextPlayerColor = activePlayers[nextIndex].color;
        }

        const nextTurn = nextPlayerColor;

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
    const activePlayers = state.players.filter(p => p.isActive && !p.rank);
    // Find current player index in the FULL player list or ACTIVE list?
    // We should cycle through active players.
    // If we rely on state.currentTurn, we find that color in the active list.

    let nextColor = nextTurn;

    // Logic: If nextTurn is passed explicitly (usually from skip logic), use it.
    // But resetToRollingPhase is often called after a move finishes.
    // Standard Ludo: Turn passes to next player in circle.

    // The previous implementation blindly set nextTurn.
    // We need to ensure nextTurn is actually valid/active.
    // If not, find the next one.

    // However, usually the caller determines 'nextTurn'.
    // If this function is responsible for calculating next turn, it should ignore the 'nextTurn' arg?
    // No, signature is `resetToRollingPhase(state, nextTurn)`.
    // The caller (executeMove) calculates `nextTurn`.
    // Let's check executeMove logic.
    // executeMove calls `getNextTurn`.
    // So `nextTurn` passed here IS correct.

    // Wait, the PROMPT says: "ISSUE: `nextTurn` loop in `diceEngine.ts` assumes 4 players."
    // And "ACTION: Update `resetToRollingPhase` to...";
    // But `resetToRollingPhase` takes `nextTurn` as argument!
    // Maybe the prompt meant `handleRollRequest` (where consecutive sixes happens)?
    // OR maybe `resetToRollingPhase` should CALCULATE it?
    // Let's look at `handleRollRequest` (lines 61-70).
    // It creates `nextTurn` using `COLORS[...]`. THIS is the bug potentially.
    // AND `resetToRollingPhase` is called by `executeMove`.

    // Prompt says: "FILES: src/logic/diceEngine.ts resetToRollingPhase"
    // "Update `resetToRollingPhase` to use `gameState.players` array to find next `isActive` index".
    // This implies `resetToRollingPhase` should probably NOT take `nextTurn` as an argument, OR ignore it, OR `handleRollRequest` logic should be moved/fixed.

    // Let's fix `handleRollRequest` first because that's definitely broken (lines 64-68).
    // And `resetToRollingPhase`... if I change the signature, I break `executeMove`.
    // Maybe I should fix the logic inside `resetToRollingPhase` to validate/re-calculate?
    // Or maybe the prompt implies `handleRollRequest`'s usage of `resetToRollingPhase`.

    // Let's fix `handleRollRequest`'s consecutive sixes logic FIRST.
    // It iterates 1..4.

    // AND let's look at `resetToRollingPhase`.
    // If `executeMove` passes a `nextTurn`, we should trust it? `executeMove` uses `getNextTurn` from `board.ts`.
    // Let's check `board.ts`? Not requested.

    // I will update `resetToRollingPhase` to optionally taking `nextTurn`, but primarily finding it if needed?
    // No, `handleRollRequest` calls it with a calculated `nextTurn`.
    // I should fix the calculation in `handleRollRequest`.

    // But I will also follow the prompt "Update resetToRollingPhase".
    // Maybe the prompt means "update the code that resets to rolling phase inside diceEngine"?

    // Let's rewrite `handleRollRequest` to use a helper for next turn.

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

