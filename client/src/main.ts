import './style.css';
import type { GameState, ServerMessage } from '../../src/shared/types';
import * as Socket from './socket';
import * as UI from './ui';

// Global App State
let gameState: GameState | null = null;
let myColor: string | null = null;
let validPawnIds: string[] = [];
let roomCode: string = '';
let playerId = localStorage.getItem('ludo_player_id');

// Socket Message Handler
function handleMessage(data: ServerMessage) {
  switch (data.type) {
    case 'ROOM_INFO':
      roomCode = data.roomCode;
      UI.roomCodeEl.textContent = roomCode;
      break;

    case 'JOIN_SUCCESS':
      myColor = data.player.color;
      playerId = data.player.id;
      localStorage.setItem('ludo_player_id', playerId!);

      UI.myColorEl.textContent = `You are ${myColor}`;
      UI.myColorEl.className = data.player.color.toLowerCase();
      UI.joinOverlay.style.display = 'none';
      break;

    case 'SYNC_STATE':
      gameState = data.state;
      UI.renderState(gameState, myColor, validPawnIds);
      break;

    case 'DICE_RESULT':
      UI.diceDisplay.textContent = data.diceValue.toString();
      validPawnIds = Array.isArray(data.validPawnIds) ? data.validPawnIds : [];
      UI.renderState(gameState, myColor, validPawnIds); // Update highlights

      UI.showNotification(`${data.player} ROLLED`, data.diceValue.toString());

      if (data.isBot) {
        UI.statusEl.textContent = `Bot Rolled ${data.diceValue}`;
      }
      break;

    case 'MOVE_EXECUTED':
      // Clear notification on move
      UI.clearNotifications();
      // Reset validPawnIds as the turn/phase has changed
      validPawnIds = [];
      UI.renderState(gameState, myColor, validPawnIds);
      break;

    case 'TURN_SKIPPED':
      // Show notification briefly
      UI.showNotification("TURN SKIPPED", "No Moves");
      // Reset validPawnIds
      validPawnIds = [];
      UI.renderState(gameState, myColor, validPawnIds);
      setTimeout(UI.clearNotifications, 2000);
      break;

    case 'TURN_TIMER_START':
      UI.startTimer(data.timeoutMs);
      break;

    case 'BOT_TAKEOVER':
      UI.statusEl.textContent = "Bot taking over...";
      break;

    case 'JOIN_REJECTED':
      alert(data.error);
      break;

    case 'ERROR':
      alert(data.message);
      break;
  }
}

// Navigation & Validation
let playerName = "";

// On load, check if we have a name/id?
if (playerId) {
  // Session restored from localStorage
}

function handleNameStep() {
  const name = UI.joinNameInput.value.trim();
  if (name.length < 2) {
    UI.showError(UI.nameError, true);
    return;
  }
  UI.showError(UI.nameError, false);
  playerName = name;
  UI.displayName.textContent = playerName;

  UI.stepName.style.display = 'none';
  UI.stepAction.style.display = 'block';
}

function goBackToName() {
  UI.stepAction.style.display = 'none';
  UI.stepName.style.display = 'block';
}

function showConfigStep() {
  UI.stepAction.style.display = 'none';
  UI.stepConfig.style.display = 'block';
}

function showJoinStep() {
  UI.stepAction.style.display = 'none';
  UI.stepJoin.style.display = 'block';
  UI.joinRoomInput.focus();
}

function goBackToActionFromConfig() {
  UI.stepConfig.style.display = 'none';
  UI.stepAction.style.display = 'block';
  UI.showError(UI.configError, false);
}

function goBackToActionFromJoin() {
  UI.stepJoin.style.display = 'none';
  UI.stepAction.style.display = 'block';
  UI.showError(UI.joinError, false);
}

// Game Action
function joinGame() {
  const room = UI.joinRoomInput.value.trim();

  if (!room) {
    UI.showError(UI.joinError, true);
    UI.joinError.innerText = "Room Code is required";
    return;
  }

  if (room.length < 3) {
    UI.showError(UI.joinError, true);
    UI.joinError.innerText = "Invalid Room Code";
    return;
  }

  UI.showError(UI.joinError, false);

  // Connect logic
  Socket.connect(room, handleMessage);
  // Send Join logic handled in socket.ts helper? 
  // Wait, I need to call connect then send. But connect is async-ish (websocket open).
  // The helper `sendJoinRequest` in socket.ts handles the wait.
  Socket.connect(room, handleMessage); // Call connect
  Socket.sendJoinRequest(playerName, false, playerId); // Send request
}

function createGame() {
  // Validate configuration
  if (UI.totalPlayers < 2 || UI.totalPlayers > 4) {
    UI.showError(UI.configError, true);
    UI.configError.innerText = "Total players must be between 2 and 4";
    return;
  }

  if (UI.botCount < 0 || UI.botCount >= UI.totalPlayers) {
    UI.showError(UI.configError, true);
    UI.configError.innerText = "Bot count must be less than total players";
    return;
  }

  UI.showError(UI.configError, false);

  // CREATE NEW: create = true
  const room = Math.floor(100000 + Math.random() * 900000).toString();

  Socket.connect(room, handleMessage);
  Socket.sendJoinRequest(playerName, true, playerId, UI.totalPlayers, UI.botCount);
}


// Event Listeners
UI.nextBtn.onclick = handleNameStep;
UI.backBtn1.onclick = goBackToName;
UI.backBtn3.onclick = goBackToActionFromConfig;
UI.backBtn4.onclick = goBackToActionFromJoin;

UI.createBtn.onclick = showConfigStep;
UI.confirmCreateBtn.onclick = createGame;
UI.showJoinBtn.onclick = showJoinStep;
UI.confirmJoinBtn.onclick = joinGame;

UI.rollBtn.onclick = Socket.sendRollRequest;

// Enter key support
UI.joinNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleNameStep();
});
UI.joinRoomInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') joinGame();
});

// Number controls logic
UI.totalPlayersMinus.onclick = () => {
  if (UI.totalPlayers > 2) {
    UI.setTotalPlayers(UI.totalPlayers - 1);
    if (UI.botCount >= UI.totalPlayers) {
      UI.setBotCount(UI.totalPlayers - 1);
    }
    UI.updateNumberControls();
  }
};

UI.totalPlayersPlus.onclick = () => {
  if (UI.totalPlayers < 4) {
    UI.setTotalPlayers(UI.totalPlayers + 1);
    UI.updateNumberControls();
  }
};

UI.botCountMinus.onclick = () => {
  if (UI.botCount > 0) {
    UI.setBotCount(UI.botCount - 1);
    UI.updateNumberControls();
  }
};

UI.botCountPlus.onclick = () => {
  if (UI.botCount < UI.totalPlayers - 1) {
    UI.setBotCount(UI.botCount + 1);
    UI.updateNumberControls();
  }
};

// Initialize controls
UI.updateNumberControls();

UI.fsBtn.onclick = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
};

// Copy room code
UI.roomCodeEl.onclick = async () => {
  if (!roomCode || roomCode === '---') {
    return;
  }

  try {
    await navigator.clipboard.writeText(roomCode);
    UI.copyNotification.classList.add('show');
    setTimeout(() => {
      UI.copyNotification.classList.remove('show');
    }, 2000);
  } catch (err) {
    // Failed to copy to clipboard
    alert('Failed to copy room code. Please copy manually: ' + roomCode);
  }
};

// Init
UI.initBoard();
