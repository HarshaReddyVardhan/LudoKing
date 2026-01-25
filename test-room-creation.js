// Test script to verify room creation fix
const WebSocket = require('ws');

const PARTYKIT_HOST = 'ws://127.0.0.1:1999';
const roomId = 'test-room-' + Date.now();

console.log(`\n=== Testing Room Creation ===`);
console.log(`Connecting to: ${PARTYKIT_HOST}/parties/main/${roomId}\n`);

const ws = new WebSocket(`${PARTYKIT_HOST}/parties/main/${roomId}`);

ws.on('open', () => {
    console.log('✓ WebSocket connected');

    // Try to create a room
    setTimeout(() => {
        const createMsg = JSON.stringify({
            type: 'JOIN_REQUEST',
            name: 'TestPlayer',
            create: true
        });
        console.log(`\n→ Sending: ${createMsg}`);
        ws.send(createMsg);
    }, 500);
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log(`← Received: ${JSON.stringify(msg, null, 2)}`);

    if (msg.type === 'JOIN_SUCCESS') {
        console.log(`\n✓ SUCCESS! Room created with code: ${msg.roomCode}`);
        console.log(`✓ Player joined as: ${msg.player.color}`);

        // Close after success
        setTimeout(() => {
            ws.close();
            process.exit(0);
        }, 1000);
    } else if (msg.type === 'JOIN_REJECTED') {
        console.log(`\n✗ FAILED! Error: ${msg.error}`);
        ws.close();
        process.exit(1);
    }
});

ws.on('error', (error) => {
    console.error(`✗ WebSocket error:`, error.message);
    process.exit(1);
});

ws.on('close', () => {
    console.log('\n✓ WebSocket closed');
});

// Timeout after 10 seconds
setTimeout(() => {
    console.log('\n✗ Test timeout');
    ws.close();
    process.exit(1);
}, 10000);
