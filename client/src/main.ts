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
const stepConfig = document.getElementById('step-config')!;
const stepJoin = document.getElementById('step-join')!;

// Buttons & text
const nextBtn = document.getElementById('next-btn')!;
const createBtn = document.getElementById('create-btn')!;
const showJoinBtn = document.getElementById('show-join-btn')!;
const confirmCreateBtn = document.getElementById('confirm-create-btn')!;
const confirmJoinBtn = document.getElementById('confirm-join-btn')!;
const backBtn1 = document.getElementById('back-btn-1')!;
const backBtn3 = document.getElementById('back-btn-3')!;
const backBtn4 = document.getElementById('back-btn-4')!;
const displayName = document.getElementById('display-name')!;
const nameError = document.getElementById('name-error')!;
const configError = document.getElementById('config-error')!;
const joinError = document.getElementById('join-error')!;

// Number control elements
const totalPlayersValue = document.getElementById('total-players-value')!;
const totalPlayersMinus = document.getElementById('total-players-minus') as HTMLButtonElement;
const totalPlayersPlus = document.getElementById('total-players-plus') as HTMLButtonElement;
const botCountValue = document.getElementById('bot-count-value')!;
const botCountMinus = document.getElementById('bot-count-minus') as HTMLButtonElement;
const botCountPlus = document.getElementById('bot-count-plus') as HTMLButtonElement;

// State for configuration
let totalPlayers = 4;
let botCount = 0;

const rollBtn = document.getElementById('roll-btn') as HTMLButtonElement;
const diceDisplay = document.getElementById('dice-display')!;
const statusEl = document.getElementById('turn-indicator')!;
const roomCodeEl = document.getElementById('room-code-text')!;
const myColorEl = document.getElementById('my-color')!;
const timerBar = document.querySelector('.timer-progress') as HTMLElement;
const copyNotification = document.getElementById('copy-notification')!;

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

// Notification Area
const notificationArea = document.getElementById('notification-area')!;

function showNotification(titleText: string, valueText: string) {
  const card = document.createElement('div');
  card.className = 'notification-card';

  const title = document.createElement('div');
  title.className = 'notif-title';
  title.textContent = titleText;

  const val = document.createElement('div');
  val.className = 'notif-value';
  val.textContent = valueText;

  if (valueText.length > 2) {
    val.style.fontSize = '1.2rem';
  }

  card.appendChild(title);
  card.appendChild(val);

  notificationArea.innerHTML = '';
  notificationArea.appendChild(card);
}

function showDiceNotification(playerColor: string, value: number) {
  showNotification(`${playerColor} ROLLED`, value.toString());
}

function clearNotifications() {
  notificationArea.innerHTML = '';
}

function handleMessage(data: any) {
  switch (data.type) {
    case 'ROOM_INFO':
      roomCode = data.roomCode;
      roomCodeEl.textContent = roomCode;
      break;

    case 'JOIN_SUCCESS':
      myColor = data.player.color;
      playerId = data.player.id;
      localStorage.setItem('ludo_player_id', playerId!);

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

      showDiceNotification(data.player, data.diceValue);

      if (data.isBot) {
        statusEl.textContent = `Bot Rolled ${data.diceValue}`;
      }
      break;

    case 'MOVE_EXECUTED':
      // Clear notification on move
      clearNotifications();
      break;

    case 'TURN_SKIPPED':
      // Show notification briefly
      showNotification("TURN SKIPPED", "No Moves");
      setTimeout(clearNotifications, 2000);
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
    const coord = getGridCoord(pawn.color, pawn.position, pawn.pawnIndex);
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
      // Wrapper for positioning
      const wrapper = document.createElement('div');
      wrapper.className = 'pawn-wrapper';

      // Handle overlaps with small offsets on the wrapper
      if (pawns.length > 1) {
        const offset = (idx * 5) - ((pawns.length - 1) * 2.5);
        wrapper.style.transform = `translate(${offset}px, ${offset}px)`;
      }

      const el = document.createElement('div');
      el.className = `pawn ${pawn.color.toLowerCase()}`;

      // Add fading for opponent pawns
      if (myColor && pawn.color !== myColor) {
        el.style.opacity = '0.4';
      }

      // Check if movable
      if (gameState?.currentTurn === myColor &&
        gameState.gamePhase === 'MOVING' &&
        validPawnIds.includes(pawn.id)) {
        el.className += ' clickable';
        el.onclick = () => sendMove(pawn.id);
      }

      wrapper.appendChild(el);
      cell.appendChild(wrapper);
    });
  });

  // UI Updates handled below
  // statusEl update moved to after player lookup

  // Render User List (Sidebar Rows)
  const playerInfoPanel = document.getElementById('player-info')!;
  playerInfoPanel.innerHTML = ''; // clear

  gameState.players.forEach(p => {
    // Container
    const row = document.createElement('div');
    row.className = `player-row ${p.color.toLowerCase()}`;
    if (gameState?.currentTurn === p.color) {
      row.classList.add('active');
    }

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'player-avatar';
    avatar.textContent = p.name.substring(0, 1).toUpperCase();

    // Info Text
    const info = document.createElement('div');
    info.className = 'player-info-text';

    const nameEl = document.createElement('div');
    nameEl.className = 'player-name';
    nameEl.textContent = p.name + (p.color === myColor ? " (You)" : "");

    const statusText = document.createElement('div');
    statusText.className = 'player-status';
    statusText.textContent = p.isBot ? "Bot" : (p.isActive ? "Online" : "Away");

    info.appendChild(nameEl);
    info.appendChild(statusText);

    row.appendChild(avatar);
    row.appendChild(info);

    playerInfoPanel.appendChild(row);
  });

  // UI Updates: Turn Indicator with NAME
  const currentPlayer = gameState.players.find(p => p.color === gameState?.currentTurn);
  const isMyTurn = gameState.currentTurn === myColor;

  if (isMyTurn) {
    statusEl.textContent = "Your Turn!";
    statusEl.style.color = '#4ade80';
  } else {
    statusEl.textContent = `${currentPlayer?.name || gameState.currentTurn}'s Turn`;
    statusEl.style.color = '#ccc';
  }

  // Roll Button Logic
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
let playerId = localStorage.getItem('ludo_player_id');

// On load, check if we have a name/id?
if (playerId) {
  // We have a session.
  // Ideally we might want to auto-restore name if available?
  // For now, let's just use it during join.
  console.log("Found existing session:", playerId);
}

function showError(el: HTMLElement, show: boolean) {
  el.style.display = show ? 'block' : 'none'; // Fixed display property
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

function showConfigStep() {
  stepAction.style.display = 'none';
  stepConfig.style.display = 'block';
}

function showJoinStep() {
  stepAction.style.display = 'none';
  stepJoin.style.display = 'block';
  joinRoomInput.focus();
}

function goBackToActionFromConfig() {
  stepConfig.style.display = 'none';
  stepAction.style.display = 'block';
  showError(configError, false);
}

function goBackToActionFromJoin() {
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

  if (room.length < 3) {
    showError(joinError, true);
    joinError.innerText = "Invalid Room Code";
    return;
  }

  showError(joinError, false);
  // JOIN EXISTING: create = false
  connectAndJoin(room, playerName, false);
}

function createGame() {
  // Validate configuration
  if (totalPlayers < 2 || totalPlayers > 4) {
    showError(configError, true);
    configError.innerText = "Total players must be between 2 and 4";
    return;
  }

  if (botCount < 0 || botCount >= totalPlayers) {
    showError(configError, true);
    configError.innerText = "Bot count must be less than total players";
    return;
  }

  showError(configError, false);

  // CREATE NEW: create = true
  // Generate a cleaner 6-digit number room code 
  const room = Math.floor(100000 + Math.random() * 900000).toString();
  connectAndJoin(room, playerName, true, totalPlayers, botCount);
}

function connectAndJoin(room: string, name: string, create: boolean, totalPlayers?: number, botCount?: number) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    connect(room);
    setTimeout(() => {
      const payload: any = { type: 'JOIN_REQUEST', name, create };
      if (playerId) payload.playerId = playerId;
      if (create && totalPlayers !== undefined) {
        payload.totalPlayers = totalPlayers;
        payload.botCount = botCount || 0;
      }

      socket?.send(JSON.stringify(payload));
    }, 500);
  } else {
    const payload: any = { type: 'JOIN_REQUEST', name, create };
    if (playerId) payload.playerId = playerId;
    if (create && totalPlayers !== undefined) {
      payload.totalPlayers = totalPlayers;
      payload.botCount = botCount || 0;
    }
    socket.send(JSON.stringify(payload));
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
backBtn3.onclick = goBackToActionFromConfig;
backBtn4.onclick = goBackToActionFromJoin;

createBtn.onclick = showConfigStep;
confirmCreateBtn.onclick = createGame;
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

// Number control handlers
function updateNumberControls() {
  totalPlayersValue.textContent = totalPlayers.toString();
  botCountValue.textContent = botCount.toString();

  // Update button states
  totalPlayersMinus.disabled = totalPlayers <= 2;
  totalPlayersPlus.disabled = totalPlayers >= 4;
  botCountMinus.disabled = botCount <= 0;
  botCountPlus.disabled = botCount >= (totalPlayers - 1);
}

totalPlayersMinus.onclick = () => {
  if (totalPlayers > 2) {
    totalPlayers--;
    // Ensure bots don't exceed new limit
    if (botCount >= totalPlayers) {
      botCount = totalPlayers - 1;
    }
    updateNumberControls();
  }
};

totalPlayersPlus.onclick = () => {
  if (totalPlayers < 4) {
    totalPlayers++;
    updateNumberControls();
  }
};

botCountMinus.onclick = () => {
  if (botCount > 0) {
    botCount--;
    updateNumberControls();
  }
};

botCountPlus.onclick = () => {
  if (botCount < totalPlayers - 1) {
    botCount++;
    updateNumberControls();
  }
};

// Initialize controls
updateNumberControls();

fsBtn.onclick = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
};

// Copy room code on click
roomCodeEl.onclick = async () => {
  if (!roomCode || roomCode === '---') {
    return; // No code to copy yet
  }

  try {
    await navigator.clipboard.writeText(roomCode);

    // Show notification
    copyNotification.classList.add('show');

    // Remove the class after animation completes
    setTimeout(() => {
      copyNotification.classList.remove('show');
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Failed to copy room code. Please copy manually: ' + roomCode);
  }
};

// Init
initBoard();
