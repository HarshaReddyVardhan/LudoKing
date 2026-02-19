declare const process: any;

export const CONFIG = {
    // Game Rules
    MAX_PLAYERS: parseInt(process.env.MAX_PLAYERS_PER_ROOM || '4', 10),
    TURN_TIMEOUT_MS: parseInt(process.env.TURN_TIMEOUT_MS || '30000', 10), // 30 seconds

    // Animation & UX
    ANIMATION_DELAY_MS: parseInt(process.env.ANIMATION_DELAY_MS || '2000', 10), // 2 seconds

    // Room Management
    EMPTY_ROOM_TTL_MS: parseInt(process.env.EMPTY_ROOM_TTL_MS || '600000', 10), // 10 minutes
};
