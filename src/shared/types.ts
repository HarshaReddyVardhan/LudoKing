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

export const RoomInfoMsgSchema = z.object({
    type: z.literal('ROOM_INFO'),
    roomCode: z.string(),
    playerCount: z.number(),
    maxPlayers: z.number(),
    isFull: z.boolean()
});
export type RoomInfoMsg = z.infer<typeof RoomInfoMsgSchema>;

// Need to define supporting schemas for Player and GameState if we want full validation
// For now, we'll use z.any() for complex nested objects to avoid massive refactor, 
// or define minimal schemas.
// The user asked to "Use Zod to parse incoming socket data".
// Defining full GameState schema is best but large. 
// I'll define basic structure.

// Helper Schemas
const ColorSchema = z.nativeEnum(Color);
const GamePhaseSchema = z.nativeEnum(GamePhase);

const PlayerSchema = z.object({
    id: z.string(),
    connectionId: z.string(),
    name: z.string(),
    color: ColorSchema,
    isBot: z.boolean(),
    isActive: z.boolean(),
    rank: z.number().optional()
});

const PawnSchema = z.object({
    id: z.string(),
    color: ColorSchema,
    position: z.number(),
    pawnIndex: z.number()
});

const MoveLogSchema = z.object({
    player: ColorSchema,
    pawnId: z.string(),
    from: z.number(),
    to: z.number(),
    timestamp: z.number()
});

const GameStateSchema = z.object({
    players: z.array(PlayerSchema),
    pawns: z.array(PawnSchema),
    currentTurn: ColorSchema,
    currentDiceValue: z.number().nullable(),
    gamePhase: GamePhaseSchema,
    roomCode: z.string(),
    maxPlayers: z.number(),
    lastUpdate: z.number(),
    lastMove: MoveLogSchema.nullable(),
    winner: ColorSchema.optional(),
    consecutiveSixes: z.number().optional(),
    lastRollTime: z.number().optional()
});

export const JoinSuccessMsgSchema = z.object({
    type: z.literal('JOIN_SUCCESS'),
    player: PlayerSchema,
    roomCode: z.string(),
    reconnected: z.boolean().optional()
});
export type JoinSuccessMsg = z.infer<typeof JoinSuccessMsgSchema>;

export const JoinRejectedMsgSchema = z.object({
    type: z.literal('JOIN_REJECTED'),
    error: z.string()
});
export type JoinRejectedMsg = z.infer<typeof JoinRejectedMsgSchema>;

export const PlayerJoinedMsgSchema = z.object({
    type: z.literal('PLAYER_JOINED'),
    player: PlayerSchema,
    playerCount: z.number()
});
export type PlayerJoinedMsg = z.infer<typeof PlayerJoinedMsgSchema>;

export const SyncStateMsgSchema = z.object({
    type: z.literal('SYNC_STATE'),
    state: GameStateSchema
});
export type SyncStateMsg = z.infer<typeof SyncStateMsgSchema>;

export const PatchStateMsgSchema = z.object({
    type: z.literal('PATCH_STATE'),
    patch: GameStateSchema.partial()
});
export type PatchStateMsg = z.infer<typeof PatchStateMsgSchema>;

export const DiceResultMsgSchema = z.object({
    type: z.literal('DICE_RESULT'),
    diceValue: z.number(),
    player: ColorSchema,
    validPawnIds: z.array(z.string()),
    isBot: z.boolean().optional()
});
export type DiceResultMsg = z.infer<typeof DiceResultMsgSchema>;

export const MoveExecutedMsgSchema = z.object({
    type: z.literal('MOVE_EXECUTED'),
    pawnId: z.string(),
    move: MoveLogSchema.nullable(),
    extraTurn: z.boolean(),
    isBot: z.boolean().optional()
});
export type MoveExecutedMsg = z.infer<typeof MoveExecutedMsgSchema>;

export const TurnSkippedMsgSchema = z.object({
    type: z.literal('TURN_SKIPPED'),
    reason: z.string(),
    nextPlayer: ColorSchema
});
export type TurnSkippedMsg = z.infer<typeof TurnSkippedMsgSchema>;

export const PawnKilledMsgSchema = z.object({
    type: z.literal('PAWN_KILLED'),
    pawnId: z.string(),
    killerPawnId: z.string().optional(),
    position: z.number()
});
export type PawnKilledMsg = z.infer<typeof PawnKilledMsgSchema>;

export const HomeRunMsgSchema = z.object({
    type: z.literal('HOME_RUN'),
    pawnId: z.string()
});
export type HomeRunMsg = z.infer<typeof HomeRunMsgSchema>;

export const PlayerKickedMsgSchema = z.object({
    type: z.literal('PLAYER_KICKED'),
    playerId: z.string(),
    reason: z.string()
});
export type PlayerKickedMsg = z.infer<typeof PlayerKickedMsgSchema>;

export const TurnTimerStartMsgSchema = z.object({
    type: z.literal('TURN_TIMER_START'),
    player: ColorSchema,
    timeoutMs: z.number(),
    startTime: z.number()
});
export type TurnTimerStartMsg = z.infer<typeof TurnTimerStartMsgSchema>;

export const BotTakeoverMsgSchema = z.object({
    type: z.literal('BOT_TAKEOVER'),
    playerId: z.string(),
    color: ColorSchema
});
export type BotTakeoverMsg = z.infer<typeof BotTakeoverMsgSchema>;

export const GameResetMsgSchema = z.object({
    type: z.literal('GAME_RESET')
});
export type GameResetMsg = z.infer<typeof GameResetMsgSchema>;

export const ErrorPayloadSchema = z.object({
    type: z.literal('ERROR'),
    code: z.string(),
    message: z.string()
});
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
    RoomInfoMsgSchema,
    JoinSuccessMsgSchema,
    JoinRejectedMsgSchema,
    PlayerJoinedMsgSchema,
    SyncStateMsgSchema,
    PatchStateMsgSchema,
    DiceResultMsgSchema,
    MoveExecutedMsgSchema,
    TurnSkippedMsgSchema,
    PawnKilledMsgSchema,
    HomeRunMsgSchema,
    PlayerKickedMsgSchema,
    TurnTimerStartMsgSchema,
    BotTakeoverMsgSchema,
    GameResetMsgSchema,
    ErrorPayloadSchema
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

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
