import { z } from "zod";

export enum Color {
    RED = 'RED',
    BLUE = 'BLUE',
    GREEN = 'GREEN',
    YELLOW = 'YELLOW'
}

export type PlayerColor = Color;

export const COLORS: Color[] = [Color.RED, Color.BLUE, Color.GREEN, Color.YELLOW];

export enum GamePhase {
    WAITING = 'WAITING',
    ROLLING = 'ROLLING',
    ROLLING_ANIMATION = 'ROLLING_ANIMATION',
    MOVING = 'MOVING',
    FINISHED = 'FINISHED'
}

export interface Pawn {
    id: string; // e.g. "RED_0"
    color: Color;
    position: number; // 0=Home, 1-52=Board, 53-57=HomePath, 58=Goal. 
    // Note: This is an abstraction. Real board mapping might differ.
    // For specific implementation:
    // -1 or 0: Base
    // 1..52: Common track
    // >52: Home stretch (requires offset per color)
    pawnIndex: number; // 0-3
}

export interface Player {
    id: string; // stable player id (persisted)
    connectionId: string; // transient socket id
    name: string;
    color: Color;
    isBot: boolean;
    isActive: boolean;
    rank?: number; // 1 = 1st, 2 = 2nd, etc.
}

export interface MoveLog {
    player: Color;
    pawnId: string;
    from: number;
    to: number;
    timestamp: number;
}

export interface GameState {
    players: Player[];
    pawns: Pawn[];
    currentTurn: Color;
    currentDiceValue: number | null;
    gamePhase: GamePhase;
    roomCode: string;
    maxPlayers: number; // Configurable limit (2-4)
    lastUpdate: number;
    lastMove: MoveLog | null; // For Rewind/History
    winner?: Color;
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

export const AnimationAckSchema = z.object({
    type: z.literal('ANIMATION_ACK')
});
export type AnimationAck = z.infer<typeof AnimationAckSchema>;

export const ResetGameSchema = z.object({
    type: z.literal('RESET_GAME')
});
export type ResetGame = z.infer<typeof ResetGameSchema>;

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

export interface PatchStateMsg {
    type: 'PATCH_STATE';
    patch: Partial<GameState>;
}

export interface DiceResultMsg {
    type: 'DICE_RESULT';
    diceValue: number;
    player: Color;
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
    nextPlayer: Color;
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
    player: Color;
    timeoutMs: number;
    startTime: number;
}

export interface BotTakeoverMsg {
    type: 'BOT_TAKEOVER';
    playerId: string;
    color: Color;
}

export interface GameResetMsg {
    type: 'GAME_RESET';
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
    | PatchStateMsg
    | DiceResultMsg
    | MoveExecutedMsg
    | TurnSkippedMsg
    | PawnKilledMsg
    | HomeRunMsg
    | PlayerKickedMsg
    | TurnTimerStartMsg
    | BotTakeoverMsg
    | GameResetMsg
    | ErrorPayload;

// Client -> Server Messages
export const ClientMessageSchema = z.discriminatedUnion('type', [
    JoinRequestSchema,
    RollRequestSchema,
    MoveRequestSchema,
    AddBotRequestSchema,
    StartGameRequestSchema,
    AnimationAckSchema,
    ResetGameSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
