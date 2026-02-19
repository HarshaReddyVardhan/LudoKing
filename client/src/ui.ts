import { getGridCoord, getBoardZone, isSafeGridCoord } from '@shared/boardMap';
import { BOARD_DIMENSION } from '@shared/constants';
import type { GameState, Pawn } from '../../src/shared/types';
import { sendMoveRequest } from './socket';

// DOM Elements
export const app = document.getElementById('app')!;
export const board = document.getElementById('ludo-board')!;
export const joinOverlay = document.getElementById('join-overlay')!;
export const joinNameInput = document.getElementById('join-name') as HTMLInputElement;
export const joinRoomInput = document.getElementById('join-room') as HTMLInputElement;

// Steps
export const stepName = document.getElementById('step-name')!;
export const stepAction = document.getElementById('step-action')!;
export const stepConfig = document.getElementById('step-config')!;
export const stepJoin = document.getElementById('step-join')!;

// Buttons & text
export const nextBtn = document.getElementById('next-btn')!;
export const createBtn = document.getElementById('create-btn')!;
export const showJoinBtn = document.getElementById('show-join-btn')!;
export const confirmCreateBtn = document.getElementById('confirm-create-btn')!;
export const confirmJoinBtn = document.getElementById('confirm-join-btn')!;
export const backBtn1 = document.getElementById('back-btn-1')!;
export const backBtn3 = document.getElementById('back-btn-3')!;
export const backBtn4 = document.getElementById('back-btn-4')!;
export const displayName = document.getElementById('display-name')!;
export const nameError = document.getElementById('name-error')!;
export const configError = document.getElementById('config-error')!;
export const joinError = document.getElementById('join-error')!;

// Number control elements
export const totalPlayersValue = document.getElementById('total-players-value')!;
export const totalPlayersMinus = document.getElementById('total-players-minus') as HTMLButtonElement;
export const totalPlayersPlus = document.getElementById('total-players-plus') as HTMLButtonElement;
export const botCountValue = document.getElementById('bot-count-value')!;
export const botCountMinus = document.getElementById('bot-count-minus') as HTMLButtonElement;
export const botCountPlus = document.getElementById('bot-count-plus') as HTMLButtonElement;

// Game UI
export const rollBtn = document.getElementById('roll-btn') as HTMLButtonElement;
export const diceDisplay = document.getElementById('dice-display')!;
export const statusEl = document.getElementById('turn-indicator')!;
export const roomCodeEl = document.getElementById('room-code-text')!;
export const myColorEl = document.getElementById('my-color')!;
export const timerBar = document.querySelector('.timer-progress') as HTMLElement;
export const notificationArea = document.getElementById('notification-area')!;
export const copyNotification = document.getElementById('copy-notification')!;
export const fsBtn = document.getElementById('fs-btn') as HTMLButtonElement;
export const playerInfoPanel = document.getElementById('player-info')!;


// State for configuration
export let totalPlayers = 4;
export let botCount = 0;

// Initialize Board Grid
export function initBoard() {
    board.innerHTML = '';
    // Create grid cells dynamically
    for (let r = 1; r <= BOARD_DIMENSION; r++) {
        for (let c = 1; c <= BOARD_DIMENSION; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.r = r.toString();
            cell.dataset.c = c.toString();

            // Styling bases
            const zone = getBoardZone(r, c);
            if (zone) {
                cell.className += ` base-area base-${zone.toLowerCase()}-bg`;
            }

            // Check for safe squares
            if (isSafeGridCoord(r, c)) {
                cell.className += ' safe-square';
            }

            board.appendChild(cell);
        }
    }
}

export function showNotification(titleText: string, valueText: string) {
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

export function clearNotifications() {
    notificationArea.innerHTML = '';
}


// Timer Animation
let timerInterval: number | null = null;
export function startTimer(durationMs: number) {
    if (timerInterval) clearInterval(timerInterval);
    timerBar.style.width = '100%';
    timerBar.style.transition = 'none';

    setTimeout(() => {
        timerBar.style.transition = `width ${durationMs}ms linear`;
        timerBar.style.width = '0%';
    }, 50);
}

export function renderState(gameState: GameState | null, myColor: string | null, validPawnIds: string[] = []) {
    if (!gameState) return;

    // Ensure validPawnIds is always an array
    const safeValidPawnIds = Array.isArray(validPawnIds) ? validPawnIds : [];

    // Clear existing pawns
    document.querySelectorAll('.pawn').forEach(el => el.remove());

    // Render Pawns
    const pawnsAtCell = new Map<string, Pawn[]>();

    // Null check for pawns array
    if (gameState.pawns && Array.isArray(gameState.pawns)) {
        gameState.pawns.forEach(pawn => {
            // Null check for pawn properties
            if (!pawn || typeof pawn.color !== 'string' || typeof pawn.position !== 'number' || typeof pawn.pawnIndex !== 'number') {
                return; // Skip invalid pawns
            }
            const coord = getGridCoord(pawn.color, pawn.position, pawn.pawnIndex);
            const key = `${coord.r},${coord.c}`;
            if (!pawnsAtCell.has(key)) pawnsAtCell.set(key, []);
            pawnsAtCell.get(key)!.push(pawn);
        });
    }

    pawnsAtCell.forEach((pawns, key) => {
        const [r, c] = key.split(',').map(Number);
        // Find the cell
        // Grid child index = (r-1)*BOARD_DIMENSION + (c-1)
        const index = (r - 1) * BOARD_DIMENSION + (c - 1);
        const cell = board.children[index] as HTMLElement;

        pawns.forEach((pawn, idx) => {
            // Null check for pawn
            if (!pawn || !pawn.color || !pawn.id) {
                return; // Skip invalid pawns
            }

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
                safeValidPawnIds.includes(pawn.id)) {
                el.className += ' clickable';
                el.dataset.pawnId = pawn.id;
            }

            wrapper.appendChild(el);
            cell.appendChild(wrapper);
        });
    });

    // Render User List (Sidebar Rows)
    playerInfoPanel.innerHTML = ''; // clear

    // Null check for players array
    if (gameState.players && Array.isArray(gameState.players)) {
        gameState.players.forEach(p => {
            // Null check for player properties
            if (!p || !p.color || !p.name) {
                return; // Skip invalid players
            }

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
            // Null check for isBot and isActive
            statusText.textContent = p.isBot ? "Bot" : (p.isActive ? "Online" : "Away");

            info.appendChild(nameEl);
            info.appendChild(statusText);

            row.appendChild(avatar);
            row.appendChild(info);

            playerInfoPanel.appendChild(row);
        });
    }

    // UI Updates: Turn Indicator with NAME
    const currentPlayer = gameState.players && Array.isArray(gameState.players)
        ? gameState.players.find(p => p && p.color === gameState?.currentTurn)
        : undefined;
    const isMyTurn = gameState.currentTurn === myColor;

    if (isMyTurn) {
        statusEl.textContent = "Your Turn!";
        statusEl.style.color = '#4ade80';
    } else {
        const turnName = currentPlayer?.name || gameState.currentTurn || 'Unknown';
        statusEl.textContent = `${turnName}'s Turn`;
        statusEl.style.color = '#ccc';
    }

    // Roll Button Logic
    // Null check for gamePhase
    const gamePhase = gameState.gamePhase || 'ROLLING';
    if (isMyTurn && gamePhase === 'ROLLING') {
        rollBtn.disabled = false;
        rollBtn.textContent = "ROLL DICE";
        rollBtn.style.opacity = '1';
    } else {
        rollBtn.disabled = true;
        rollBtn.style.opacity = '0.5';
        if (gamePhase === 'MOVING') {
            rollBtn.textContent = "MOVE PAWN";
        } else {
            rollBtn.textContent = "WAITING";
        }
    }
}

// Config Logic
export function updateNumberControls() {
    totalPlayersValue.textContent = totalPlayers.toString();
    botCountValue.textContent = botCount.toString();

    // Update button states
    totalPlayersMinus.disabled = totalPlayers <= 2;
    totalPlayersPlus.disabled = totalPlayers >= 4;
    botCountMinus.disabled = botCount <= 0;
    botCountPlus.disabled = botCount >= (totalPlayers - 1);
}

export function setTotalPlayers(val: number) {
    totalPlayers = val;
}
export function setBotCount(val: number) {
    botCount = val;
}

export function showError(el: HTMLElement, show: boolean) {
    el.style.display = show ? 'block' : 'none';
}

// Event Delegation for Board Interactions
board.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement;

    // Use closest('.cell') as requested to determine the context
    const cell = target.closest('.cell');
    if (cell) {
        // If specific pawn was clicked, prioritize it
        const pawnEl = target.closest('.pawn') as HTMLElement;
        if (pawnEl && pawnEl.dataset.pawnId && pawnEl.classList.contains('clickable')) {
            sendMoveRequest(pawnEl.dataset.pawnId);
            return;
        }

        // Otherwise, if cell has a SINGLE clickable pawn (or just pick one), move it.
        // This improves UX by making the whole cell a hit target.
        const clickablePawn = cell.querySelector('.pawn.clickable') as HTMLElement;
        if (clickablePawn && clickablePawn.dataset.pawnId) {
            sendMoveRequest(clickablePawn.dataset.pawnId);
        }
    }
});
