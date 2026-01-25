// Test script to verify join rejection on empty room
const WebSocket = require('ws');

const PARTYKIT_HOST = 'ws://127.0.0.1:1999';
const roomId = 'empty-room-' + Date.now();

console.log(`\n=== Testing Join Rejection (Empty Room) ===`);
console.log(`Connecting to: ${PARTYKIT_HOST}/parties/main/${roomId}\n`);

const ws = new WebSocket(`${PARTYKIT_HOST}/parties/main/${roomId}`);

ws.on('open', () => {
    console.log('✓ WebSocket connected');

    // Try to join WITHOUT create flag
    setTimeout(() => {
        const joinMsg = JSON.stringify({
            type: 'JOIN_REQUEST',
            name: 'TestPlayer',
            create: false  // Explicitly set to false
        });
        console.log(`\n→ Sending: ${joinMsg}`);
        ws.send(joinMsg);
    }, 500);
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log(`← Received: ${JSON.stringify(msg, null, 2)}`);

    if (msg.type === 'JOIN_REJECTED') {
        console.log(`\n✓ SUCCESS! Join correctly rejected: ${msg.error}`);
        ws.close();
        process.exit(0);
    } else if (msg.type === 'JOIN_SUCCESS') {
        console.log(`\n✗ FAILED! Should have been rejected but was accepted`);
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
