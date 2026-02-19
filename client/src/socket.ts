import { type ServerMessage, ServerMessageSchema } from '../../src/shared/types';

const PARTYKIT_HOST = 'localhost:1999';

let socket: WebSocket | null = null;
let currentRoom: string | null = null;
let currentMessageHandler: MessageHandler | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 10000;

type MessageHandler = (data: ServerMessage) => void;

export function connect(joinedRoom: string, onMessage: MessageHandler) {
    currentRoom = joinedRoom;
    currentMessageHandler = onMessage;
    const url = `ws://${PARTYKIT_HOST}/parties/main/${joinedRoom}`;
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
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    console.log(`Reconnecting in ${delay}ms...`);

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

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
    } else if (socket) {
        // Retry once briefly if just connecting
        setTimeout(() => {
            socket?.send(JSON.stringify(payload));
        }, 500);
    }
}

export function sendRollRequest() {
    socket?.send(JSON.stringify({ type: 'ROLL_REQUEST' }));
}

export function sendMoveRequest(pawnId: string) {
    socket?.send(JSON.stringify({ type: 'MOVE_REQUEST', pawnId }));
}

export function isSocketOpen(): boolean {
    return socket?.readyState === WebSocket.OPEN;
}
