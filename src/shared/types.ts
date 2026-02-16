import { z } from "zod";

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
    rank?: number; // 1 = 1st, 2 = 2nd, etc.
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
    consecutiveSixes?: number; // Track for 3-sixes rule
    lastRollTime?: number; // For debounce
}


// Messages
export const JoinRequestSchema = z.object({
    type: z.literal('JOIN_REQUEST'),
    name: z.string(),
    create: z.boolean().optional(),
    playerId: z.string().optional(), // For session persistence
    totalPlayers: z.number().optional(), // For room creation
    botCount: z.number().optional() // For room creation
});
export type JoinRequest = z.infer<typeof JoinRequestSchema>;

export const RollRequestSchema = z.object({
    type: z.literal('ROLL_REQUEST')
});
export type RollRequest = z.infer<typeof RollRequestSchema>;

export const MoveRequestSchema = z.object({
    type: z.literal('MOVE_REQUEST'),
    pawnId: z.string()
});
export type MoveRequest = z.infer<typeof MoveRequestSchema>;

export const AddBotRequestSchema = z.object({
    type: z.literal('ADD_BOT')
});
export type AddBotRequest = z.infer<typeof AddBotRequestSchema>;

export const StartGameRequestSchema = z.object({
    type: z.literal('START_GAME')
});
export type StartGameRequest = z.infer<typeof StartGameRequestSchema>;

// Server -> Client Messages

export interface RoomInfoMsg {
    type: 'ROOM_INFO';
    roomCode: string;
    playerCount: number;
    maxPlayers: number;
    isFull: boolean;
}

export interface JoinSuccessMsg {
    type: 'JOIN_SUCCESS';
    player: Player;
    roomCode: string;
    reconnected?: boolean;
}

export interface JoinRejectedMsg {
    type: 'JOIN_REJECTED';
    error: string;
}

export interface PlayerJoinedMsg {
    type: 'PLAYER_JOINED';
    player: Player;
    playerCount: number;
}

export interface SyncStateMsg {
    type: 'SYNC_STATE';
    state: GameState;
}

export interface DiceResultMsg {
    type: 'DICE_RESULT';
    diceValue: number;
    player: PlayerColor;
    validPawnIds: string[];
    isBot?: boolean;
}

export interface MoveExecutedMsg {
    type: 'MOVE_EXECUTED';
    pawnId: string;
    move: MoveLog | null;
    extraTurn: boolean;
    isBot?: boolean;
}

export interface TurnSkippedMsg {
    type: 'TURN_SKIPPED';
    reason: string;
    nextPlayer: PlayerColor;
}

export interface PawnKilledMsg {
    type: 'PAWN_KILLED';
    pawnId: string; // The pawn that was killed
    killerPawnId?: string; // The pawn that killed it (optional)
    position: number; // Where the kill happened
}

export interface HomeRunMsg {
    type: 'HOME_RUN';
    pawnId: string;
}

export interface PlayerKickedMsg {
    type: 'PLAYER_KICKED';
    playerId: string;
    reason: string;
}

export interface TurnTimerStartMsg {
    type: 'TURN_TIMER_START';
    player: PlayerColor;
    timeoutMs: number;
    startTime: number;
}

export interface BotTakeoverMsg {
    type: 'BOT_TAKEOVER';
    playerId: string;
    color: PlayerColor;
}

export interface ErrorPayload {
    type: 'ERROR';
    code: string;
    message: string;
}

export type ServerMessage =
    | RoomInfoMsg
    | JoinSuccessMsg
    | JoinRejectedMsg
    | PlayerJoinedMsg
    | SyncStateMsg
    | DiceResultMsg
    | MoveExecutedMsg
    | TurnSkippedMsg
    | PawnKilledMsg
    | HomeRunMsg
    | PlayerKickedMsg
    | TurnTimerStartMsg
    | BotTakeoverMsg
    | ErrorPayload;

// Client -> Server Messages
export const ClientMessageSchema = z.discriminatedUnion('type', [
    JoinRequestSchema,
    RollRequestSchema,
    MoveRequestSchema,
    AddBotRequestSchema,
    StartGameRequestSchema
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
