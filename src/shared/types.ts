export type PlayerColor = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';

export const COLORS: PlayerColor[] = ['RED', 'BLUE', 'GREEN', 'YELLOW'];

export interface Pawn {
    id: string; // e.g. "RED_0"
    color: PlayerColor;
    position: number; // 0=Home, 1-52=Board, 53-57=HomePath, 58=Goal. 
    // Note: This is an abstraction. Real board mapping might differ.
    // For specific implementation:
    // -1 or 0: Base
    // 1..52: Common track
    // >52: Home stretch (requires offset per color)
    pawnIndex: number; // 0-3
}

export interface Player {
    id: string; // connection id
    name: string;
    color: PlayerColor;
    isBot: boolean;
    isActive: boolean;
}

export interface MoveLog {
    player: PlayerColor;
    pawnId: string;
    from: number;
    to: number;
    timestamp: number;
}

export interface GameState {
    players: Player[];
    pawns: Pawn[];
    currentTurn: PlayerColor;
    currentDiceValue: number | null;
    gamePhase: 'WAITING' | 'ROLLING' | 'MOVING' | 'FINISHED';
    roomCode: string;
    lastUpdate: number;
    lastMove: MoveLog | null; // For Rewind/History
    winner?: PlayerColor;
}

// Messages
export interface JoinRequest {
    type: 'JOIN_REQUEST';
    name: string;
    create?: boolean; // If true, allows creating a new room
    playerId?: string; // For session persistence
}

export interface RollRequest {
    type: 'ROLL_REQUEST';
}

export interface MoveRequest {
    type: 'MOVE_REQUEST';
    pawnId: string;
}

export interface AddBotRequest {
    type: 'ADD_BOT';
}
