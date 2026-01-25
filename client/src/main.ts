import './style.css';
import { getGridCoord } from './boardMapping';

// Simple type definitions to avoid importing complex build chain issues for now
interface Pawn {
  id: string;
  color: string;
  position: number;
  pawnIndex: number;
}

interface Player {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  isActive: boolean;
}

interface GameState {
  players: Player[];
  pawns: Pawn[];
  currentTurn: string;
  currentDiceValue: number | null;
  gamePhase: string;
  roomCode: string;
  lastUpdate: number;
  lastMove: any;
  winner?: string;
}

// Global App State
let socket: WebSocket | null = null;
let gameState: GameState | null = null;
// let myPlayerId: string | null = null;
let myColor: string | null = null;
let validPawnIds: string[] = [];
let roomCode: string = '';

const PARTYKIT_HOST = 'localhost:1999';

// DOM Elements
// const app = document.getElementById('app')!;
const board = document.getElementById('ludo-board')!;
const joinOverlay = document.getElementById('join-overlay')!;
const joinNameInput = document.getElementById('join-name') as HTMLInputElement;
const joinRoomInput = document.getElementById('join-room') as HTMLInputElement;

// Steps
const stepName = document.getElementById('step-name')!;
const stepAction = document.getElementById('step-action')!;
const stepJoin = document.getElementById('step-join')!;

// Buttons & text
const nextBtn = document.getElementById('next-btn')!;
const createBtn = document.getElementById('create-btn')!;
const showJoinBtn = document.getElementById('show-join-btn')!;
const confirmJoinBtn = document.getElementById('confirm-join-btn')!;
const backBtn1 = document.getElementById('back-btn-1')!;
const backBtn2 = document.getElementById('back-btn-2')!;
const displayName = document.getElementById('display-name')!;
const nameError = document.getElementById('name-error')!;
const joinError = document.getElementById('join-error')!;

const rollBtn = document.getElementById('roll-btn') as HTMLButtonElement;
const diceDisplay = document.getElementById('dice-display')!;
const statusEl = document.getElementById('turn-indicator')!;
const roomCodeEl = document.getElementById('room-code')!.querySelector('.highlight')!;
const myColorEl = document.getElementById('my-color')!;
const timerBar = document.querySelector('.timer-progress') as HTMLElement;

// Initialize Board Grid
function initBoard() {
  board.innerHTML = '';
  // Create 15x15 grid cells
  for (let r = 1; r <= 15; r++) {
    for (let c = 1; c <= 15; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r.toString();
      cell.dataset.c = c.toString();

      // Styling bases
      if (r <= 6 && c <= 6) cell.className += ' base-area base-green-bg';
      else if (r <= 6 && c >= 10) cell.className += ' base-area base-yellow-bg';
      else if (r >= 10 && c <= 6) cell.className += ' base-area base-red-bg';
      else if (r >= 10 && c >= 10) cell.className += ' base-area base-blue-bg';

      // Check for safe squares (Hardcoded visual check)
      const isSafe = (r == 9 && c == 3) || (r == 7 && c == 2) || (r == 3 && c == 7) || (r == 2 && c == 9) ||
        (r == 7 && c == 13) || (r == 9 && c == 14) || (r == 13 && c == 9) || (r == 14 && c == 7);
      if (isSafe) cell.className += ' safe-square';

      board.appendChild(cell);
    }
  }
}

// WebSocket Connection
function connect(joinedRoom: string) {
  const url = `ws://${PARTYKIT_HOST}/parties/main/${joinedRoom}`;
  console.log('Connecting to', url);

  socket = new WebSocket(url);

  socket.onopen = () => {
    console.log('Connected');
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleMessage(data);
  };
}

function handleMessage(data: any) {
  switch (data.type) {
    case 'ROOM_INFO':
      roomCode = data.roomCode;
      roomCodeEl.textContent = roomCode;
      // If we created a room, we might auto-join, 
      // but user still needs to click join to pick name
      break;

    case 'JOIN_SUCCESS':
      myColor = data.player.color;
      // myPlayerId = data.player.id;
      myColorEl.textContent = `You are ${myColor}`;
      myColorEl.className = data.player.color.toLowerCase();
      joinOverlay.style.display = 'none';
      break;

    case 'SYNC_STATE':
      gameState = data.state;
      renderState();
      break;

    case 'DICE_RESULT':
      diceDisplay.textContent = data.diceValue;
      validPawnIds = data.validPawnIds || [];
      renderState(); // Update highlights

      if (data.isBot) {
        statusEl.textContent = `Bot Rolled ${data.diceValue}`;
      }
      break;

    case 'TURN_TIMER_START':
      startTimer(data.timeoutMs);
      break;

    case 'BOT_TAKEOVER':
      statusEl.textContent = "Bot taking over...";
      break;

    case 'ERROR':
    case 'JOIN_REJECTED':
      alert(data.error);
      break;
  }
}

// Rendering
function renderState() {
  if (!gameState) return;

  // Clear existing pawns
  document.querySelectorAll('.pawn').forEach(el => el.remove());

  // Render Pawns
  const pawnsAtCell = new Map<string, Pawn[]>();

  gameState.pawns.forEach(pawn => {
    const coord = getGridCoord(pawn.color, pawn.position);
    const key = `${coord.r},${coord.c}`;
    if (!pawnsAtCell.has(key)) pawnsAtCell.set(key, []);
    pawnsAtCell.get(key)!.push(pawn);
  });

  pawnsAtCell.forEach((pawns, key) => {
    const [r, c] = key.split(',').map(Number);
    // Find the cell
    // Grid child index = (r-1)*15 + (c-1)
    const index = (r - 1) * 15 + (c - 1);
    const cell = board.children[index] as HTMLElement;

    pawns.forEach((pawn, idx) => {
      const el = document.createElement('div');
      el.className = `pawn ${pawn.color.toLowerCase()}`;

      // Handle overlaps with small offsets
      if (pawns.length > 1) {
        const offset = (idx * 5) - ((pawns.length - 1) * 2.5);
        el.style.transform = `translate(${offset}px, ${offset}px)`;
      }

      // Check if movable
      if (gameState?.currentTurn === myColor &&
        gameState.gamePhase === 'MOVING' &&
        validPawnIds.includes(pawn.id)) {
        el.className += ' clickable';
        el.onclick = () => sendMove(pawn.id);
      }

      cell.appendChild(el);
    });
  });

  // UI Updates
  const isMyTurn = gameState.currentTurn === myColor;
  statusEl.textContent = isMyTurn ? "Your Turn!" : `${gameState.currentTurn}'s Turn`;
  statusEl.style.color = isMyTurn ? '#4ade80' : '#ccc';

  if (isMyTurn && gameState.gamePhase === 'ROLLING') {
    rollBtn.disabled = false;
    rollBtn.textContent = "ROLL DICE";
    rollBtn.style.opacity = '1';
  } else {
    rollBtn.disabled = true;
    rollBtn.style.opacity = '0.5';
    if (gameState.gamePhase === 'MOVING') {
      rollBtn.textContent = "MOVE PAWN";
    } else {
      rollBtn.textContent = "WAITING";
    }
  }
}

// Timer Animation
let timerInterval: any = null;
function startTimer(durationMs: number) {
  if (timerInterval) clearInterval(timerInterval);
  timerBar.style.width = '100%';
  timerBar.style.transition = 'none';

  setTimeout(() => {
    timerBar.style.transition = `width ${durationMs}ms linear`;
    timerBar.style.width = '0%';
  }, 50);
}

// Actions
// Navigation & Validation
let playerName = "";

function showError(el: HTMLElement, show: boolean) {
  el.style.display = show ? 'block' : 'none';
}

function handleNameStep() {
  const name = joinNameInput.value.trim();
  if (name.length < 2) {
    showError(nameError, true);
    return;
  }
  showError(nameError, false);
  playerName = name;
  displayName.textContent = playerName;

  stepName.style.display = 'none';
  stepAction.style.display = 'block';
}

function goBackToName() {
  stepAction.style.display = 'none';
  stepName.style.display = 'block';
}

function showJoinStep() {
  stepAction.style.display = 'none';
  stepJoin.style.display = 'block';
  joinRoomInput.focus();
}

function goBackToAction() {
  stepJoin.style.display = 'none';
  stepAction.style.display = 'block';
  showError(joinError, false);
}

// Game Action
function joinGame() {
  const room = joinRoomInput.value.trim();

  if (!room) {
    showError(joinError, true);
    joinError.innerText = "Room Code is required";
    return;
  }

  // Basic validation (e.g., length or pattern if desired)
  if (room.length < 3) {
    showError(joinError, true);
    joinError.innerText = "Invalid Room Code";
    return;
  }

  showError(joinError, false);
  connectAndJoin(room, playerName);
}

function createGame() {
  // Generate a clearer 6-digit number room code for better UX
  const room = Math.floor(100000 + Math.random() * 900000).toString();
  connectAndJoin(room, playerName);
}

function connectAndJoin(room: string, name: string) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    connect(room);
    setTimeout(() => {
      socket?.send(JSON.stringify({ type: 'JOIN_REQUEST', name }));
    }, 500);
  } else {
    socket.send(JSON.stringify({ type: 'JOIN_REQUEST', name }));
  }
}

function sendRoll() {
  socket?.send(JSON.stringify({ type: 'ROLL_REQUEST' }));
}

function sendMove(pawnId: string) {
  socket?.send(JSON.stringify({ type: 'MOVE_REQUEST', pawnId }));
}

const fsBtn = document.getElementById('fs-btn') as HTMLButtonElement;

// Event Listeners
nextBtn.onclick = handleNameStep;
backBtn1.onclick = goBackToName;
backBtn2.onclick = goBackToAction;

createBtn.onclick = createGame;
showJoinBtn.onclick = showJoinStep;
confirmJoinBtn.onclick = joinGame;

rollBtn.onclick = sendRoll;

// Enter key support
joinNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleNameStep();
});
joinRoomInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') joinGame();
});

fsBtn.onclick = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
};

// Init
initBoard();
