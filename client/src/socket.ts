import { PARTYKIT_HOST } from './types';

let socket: WebSocket | null = null;

type MessageHandler = (data: any) => void;

export function connect(joinedRoom: string, onMessage: MessageHandler) {
    const url = `ws://${PARTYKIT_HOST}/parties/main/${joinedRoom}`;
    console.log('Connecting to', url);

    socket = new WebSocket(url);

    socket.onopen = () => {
        console.log('Connected');
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        onMessage(data);
    };
}

export function sendJoinRequest(name: string, create: boolean, playerId?: string | null, totalPlayers?: number, botCount?: number) {
    const payload: any = { type: 'JOIN_REQUEST', name, create };
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
