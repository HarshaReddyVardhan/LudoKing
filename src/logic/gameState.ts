import { GameState, Player, Pawn, PlayerColor, COLORS } from '../shared/types';

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
    return Array.from({ length: 4 }).map((_, index) => ({
        id: `${color}_${index}`,
        color,
        position: 0,
        pawnIndex: index,
    }));
}
