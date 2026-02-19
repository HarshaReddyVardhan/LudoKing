import { type ServerMessage, ServerMessageSchema } from '../../src/shared/types';

// Use env var if set (build-time), otherwise fall back to current host in prod or localhost in dev
const PARTYKIT_HOST: string =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PARTYKIT_HOST) ||
    (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
        ? window.location.host
        : 'localhost:1999');

let socket: WebSocket | null = null;
let currentRoom: string | null = null;
let currentMessageHandler: MessageHandler | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000; // Cap at 30s
const BASE_RECONNECT_DELAY = 1000;
const MAX_RETRIES = 50; // Give up eventually

type MessageHandler = (data: ServerMessage) => void;

export function connect(joinedRoom: string, onMessage: MessageHandler) {
    currentRoom = joinedRoom;
    currentMessageHandler = onMessage;
    const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const url = `${isSecure ? 'wss' : 'ws'}://${PARTYKIT_HOST}/parties/main/${joinedRoom}`;
    console.log('Connecting to', url);

    socket = new WebSocket(url);

    socket.onopen = () => {
        console.log('Connected');
        reconnectAttempts = 0;
    };

    socket.onmessage = (event) => {
        try {
            const raw = JSON.parse(event.data);
            const result = ServerMessageSchema.safeParse(raw);

            if (!result.success) {
                console.error("Invalid message received:", result.error);
                return;
            }

            onMessage(result.data);
        } catch (e) {
            console.error("Failed to parse socket message:", e);
        }
    };

    socket.onclose = (event) => {
        if (!event.wasClean) {
            console.log('Connection lost. Reconnecting...');
            scheduleReconnect();
        }
    };
}

function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RETRIES) {
        console.error("Max reconnect attempts reached. Giving up.");
        return;
    }

    // Exponential backoff with jitter
    const backoff = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    const jitter = Math.random() * 1000;
    const delay = backoff + jitter;

    console.log(`Reconnecting in ${Math.floor(delay)}ms... (Attempt ${reconnectAttempts + 1}/${MAX_RETRIES})`);

    setTimeout(() => {
        reconnectAttempts++;
        if (currentRoom && currentMessageHandler) {
            connect(currentRoom, currentMessageHandler);
        }
    }, delay);
}

export function sendJoinRequest(name: string, create: boolean, playerId?: string | null, totalPlayers?: number, botCount?: number) {
    const payload: { type: 'JOIN_REQUEST'; name: string; create: boolean; playerId?: string; totalPlayers?: number; botCount?: number } = {
        type: 'JOIN_REQUEST',
        name,
        create
    };
    if (playerId) payload.playerId = playerId;
    if (create && totalPlayers !== undefined) {
        payload.totalPlayers = totalPlayers;
        payload.botCount = botCount || 0;
    }

    // Validate payload with Zod
    import('../../src/shared/types').then(({ JoinRequestSchema }) => {
        const result = JoinRequestSchema.safeParse(payload);
        if (!result.success) {
            console.error("Invalid JOIN_REQUEST payload:", result.error);
            return;
        }

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(payload));
        } else if (socket) {
            // Retry once briefly if just connecting
            setTimeout(() => {
                socket?.send(JSON.stringify(payload));
            }, 500);
        }
    });
}

export function sendRollRequest() {
    socket?.send(JSON.stringify({ type: 'ROLL_REQUEST' }));
}

export function sendStartGame() {
    socket?.send(JSON.stringify({ type: 'START_GAME' }));
}

export function sendMoveRequest(pawnId: string) {
    socket?.send(JSON.stringify({ type: 'MOVE_REQUEST', pawnId }));
}

export function isSocketOpen(): boolean {
    return socket?.readyState === WebSocket.OPEN;
}
