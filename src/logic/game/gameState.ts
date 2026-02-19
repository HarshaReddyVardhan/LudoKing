import { GameState, Player, Pawn, PlayerColor, COLORS, Color, GamePhase } from '../../shared/types';
import { PAWNS_PER_PLAYER, POSITION_GOAL, POSITION_HOME } from '../../shared/constants';

export function createInitialState(roomCode: string): GameState {
    return {
        players: [],
        pawns: [],
        currentTurn: Color.RED,
        currentDiceValue: null,
        gamePhase: GamePhase.WAITING,
        roomCode,
        maxPlayers: 4,
        lastUpdate: Date.now(),
        lastMove: null,
    };
}

export function createPlayer(connectionId: string, name: string, color: PlayerColor, stableId?: string): Player {
    return {
        id: stableId || crypto.randomUUID(),
        connectionId,
        name,
        color,
        isBot: false,
        isActive: true,
    };
}

export function initializePawns(color: PlayerColor): Pawn[] {
    return Array.from({ length: PAWNS_PER_PLAYER }).map((_, index) => ({
        id: `${color}_${index}`,
        color,
        position: POSITION_HOME,
        pawnIndex: index,
    }));
}

export function checkWinCondition(state: GameState): GameState {
    let playersChanged = false;

    let newPlayers = state.players.map(player => {
        if (player.rank !== undefined) return player;

        const playerPawns = state.pawns.filter(p => p.color === player.color);
        const allFinished =
            playerPawns.length === PAWNS_PER_PLAYER &&
            playerPawns.every(p => p.position === POSITION_GOAL);

        if (allFinished) {
            playersChanged = true;
            // Recalculate rank based on current ranked length to avoid duplicates
            const currentRank = state.players.filter(p => p.rank !== undefined).length + 1;
            return { ...player, rank: currentRank };
        }
        return player;
    });

    const totalPlayers = newPlayers.length;
    const unrankedPlayers = newPlayers.filter(p => p.rank === undefined);
    const playersRemaining = unrankedPlayers.length;
    let newGamePhase: GamePhase = state.gamePhase;
    let phaseChanged = false;

    if (totalPlayers > 1 && playersRemaining === 1) {
        const lastPlayer = unrankedPlayers[0];
        const lastRank = newPlayers.filter(p => p.rank !== undefined).length + 1;
        newPlayers = newPlayers.map(p =>
            p.id === lastPlayer.id ? { ...p, rank: lastRank } : p
        );
        playersChanged = true;
    }

    const allRanked = newPlayers.every(p => p.rank !== undefined);
    if (allRanked || (totalPlayers === 1 && playersRemaining === 0)) {
        if (newGamePhase !== GamePhase.FINISHED) {
            newGamePhase = GamePhase.FINISHED;
            phaseChanged = true;
        }
    }

    if (playersChanged || phaseChanged) {
        return {
            ...state,
            players: newPlayers,
            gamePhase: newGamePhase,
        };
    }

    return state;
}

/**
 * Resets the game back to the WAITING phase while preserving the player list.
 * Pawns are moved back to HOME, ranks cleared, dice cleared.
 * Only the host should be allowed to call this (enforced in server.ts).
 */
export function resetGame(state: GameState): GameState {
    const resetPlayers = state.players.map(p => ({ ...p, rank: undefined, isActive: true }));
    const resetPawns = resetPlayers.flatMap(p => initializePawns(p.color));
    return {
        ...state,
        players: resetPlayers,
        pawns: resetPawns,
        currentTurn: Color.RED,
        currentDiceValue: null,
        consecutiveSixes: 0,
        gamePhase: GamePhase.WAITING,
        winner: undefined,
        lastMove: null,
        lastUpdate: Date.now(),
    };
}
