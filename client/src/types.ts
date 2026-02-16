import type { MoveLog } from '../../src/shared/types';

export interface Pawn {
    id: string;
    color: string;
    position: number;
    pawnIndex: number;
}

export interface Player {
    id: string;
    name: string;
    color: string;
    isBot: boolean;
    isActive: boolean;
}

export interface GameState {
    players: Player[];
    pawns: Pawn[];
    currentTurn: string;
    currentDiceValue: number | null;
    gamePhase: string;
    roomCode: string;
    lastUpdate: number;
    lastMove: MoveLog | null;
    winner?: string;
}

export const PARTYKIT_HOST = 'localhost:1999';
