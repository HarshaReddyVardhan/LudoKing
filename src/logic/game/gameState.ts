import { GameState, Player, Pawn, PlayerColor, COLORS } from '../../shared/types';
import { PAWNS_PER_PLAYER, POSITION_GOAL, POSITION_HOME } from '../../shared/constants';

export function createInitialState(roomCode: string): GameState {
    return {
        players: [],
        pawns: [],
        currentTurn: 'RED',
        currentDiceValue: null,
        gamePhase: 'WAITING',
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
    const finishedPlayersCount = state.players.filter(p => p.rank !== undefined).length;
    let nextRank = finishedPlayersCount + 1;
    let playersChanged = false;

    let newPlayers = state.players.map(player => {
        if (player.rank !== undefined) return player;

        const playerPawns = state.pawns.filter(p => p.color === player.color);
        const allFinished =
            playerPawns.length === PAWNS_PER_PLAYER &&
            playerPawns.every(p => p.position === POSITION_GOAL);

        if (allFinished) {
            playersChanged = true;
            return { ...player, rank: nextRank++ };
        }
        return player;
    });

    const totalPlayers = newPlayers.length;
    const unrankedPlayers = newPlayers.filter(p => p.rank === undefined);
    const playersRemaining = unrankedPlayers.length;
    let newGamePhase = state.gamePhase;
    let phaseChanged = false;

    if (totalPlayers > 1 && playersRemaining === 1) {
        const lastPlayer = unrankedPlayers[0];
        newPlayers = newPlayers.map(p =>
            p.id === lastPlayer.id ? { ...p, rank: nextRank } : p
        );
        playersChanged = true;
    }

    const allRanked = newPlayers.every(p => p.rank !== undefined);
    if (allRanked || (totalPlayers === 1 && playersRemaining === 0)) {
        if (newGamePhase !== 'FINISHED') {
            newGamePhase = 'FINISHED';
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
