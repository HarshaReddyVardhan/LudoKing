import { GameState, Player, Pawn, PlayerColor, COLORS } from '../shared/types';
import { PAWNS_PER_PLAYER, POSITION_GOAL, POSITION_HOME } from '../shared/constants';

export function createInitialState(roomCode: string): GameState {
    return {
        players: [],
        pawns: [], // Pawns are created when players join or game starts
        currentTurn: 'RED', // Default start
        currentDiceValue: null,
        gamePhase: 'WAITING',
        roomCode,
        lastUpdate: Date.now(),
        lastMove: null,
    };
}

export function createPlayer(id: string, name: string, color: PlayerColor): Player {
    return {
        id,
        name,
        color,
        isBot: false,
        isActive: true,
    };
}

export function initializePawns(color: PlayerColor): Pawn[] {
    // Create 4 pawns for the color, initially at position 0 (Base)
    return Array.from({ length: PAWNS_PER_PLAYER }).map((_, index) => ({
        id: `${color}_${index}`,
        color,
        position: POSITION_HOME,
        pawnIndex: index,
    }));
}

export function checkWinCondition(state: GameState): GameState {
    const finishedPlayersCount = state.players.filter(p => p.rank?.valueOf()).length;
    let nextRank = finishedPlayersCount + 1;
    let playersChanged = false;
    let rankUpdatedInLoop = false;

    // Create new players array with updated ranks
    const newPlayers = state.players.map(player => {
        if (player.rank) return player; // Already ranked

        // Check if all 4 pawns are at position 59 (Goal)
        const playerPawns = state.pawns.filter(p => p.color === player.color);
        const allFinished = playerPawns.length === PAWNS_PER_PLAYER && playerPawns.every(p => p.position === POSITION_GOAL);

        if (allFinished) {
            playersChanged = true;
            rankUpdatedInLoop = true;
            return { ...player, rank: nextRank++ };
        }
        return player;
    });

    // 2. Check if game should end
    const totalPlayers = newPlayers.length;
    const playersRemaining = newPlayers.filter(p => !p.rank).length;
    let newGamePhase = state.gamePhase;
    let phaseChanged = false;

    // Logic: If there's only 1 player left (and we started with > 1), game over.
    // Or if started with 1 player and 0 remain.
    if ((totalPlayers > 1 && playersRemaining <= 1) || (totalPlayers === 1 && playersRemaining === 0)) {
        if (newGamePhase !== 'FINISHED') {
            newGamePhase = 'FINISHED';
            phaseChanged = true;
        }
    }

    if (playersChanged || phaseChanged) {
        return {
            ...state,
            players: newPlayers,
            gamePhase: newGamePhase
        };
    }

    return state;
}
