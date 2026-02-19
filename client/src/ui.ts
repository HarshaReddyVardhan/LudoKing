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
export const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
export const diceDisplay = document.getElementById('dice-display')!;
export const statusEl = document.getElementById('turn-indicator')!;
export const roomCodeEl = document.getElementById('room-code-text')!;
export const myColorEl = document.getElementById('my-color')!;
// Timer is now per-player, but we might keep the global bar for compatibility or fallback
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
    card.style.background = 'rgba(0, 0, 0, 0.8)';
    card.style.backdropFilter = 'blur(10px)';
    card.style.border = '1px solid var(--neon-cyan)';
    card.style.boxShadow = '0 0 20px var(--neon-cyan)';
    card.style.padding = '15px 30px';
    card.style.borderRadius = '12px';
    card.style.marginBottom = '10px';
    card.style.animation = 'slideIn 0.3s ease-out';

    const title = document.createElement('div');
    title.className = 'notif-title';
    title.textContent = titleText;
    title.style.color = 'var(--neon-green)';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '0.9em';
    title.style.textTransform = 'uppercase';

    const val = document.createElement('div');
    val.className = 'notif-value';
    val.textContent = valueText;
    val.style.color = '#fff';
    val.style.fontSize = '1.2em';
    val.style.fontWeight = '900';

    card.appendChild(title);
    card.appendChild(val);

    notificationArea.innerHTML = '';
    notificationArea.appendChild(card);
}

export function clearNotifications() {
    notificationArea.innerHTML = '';
}


// Sidebar / Timer Rendering Logic
let currentTimerData: { duration: number, start: number, color: string } | null = null;
let timerRequestFrame: number | null = null;



export function startTimer(durationMs: number, startTime: number) {
    // We need to know WHOSE turn it is to animate the correct avatar.
    // However, startTimer is called from main.ts which gets TURN_TIMER_START.
    // Providing we have the current state, we can infer, or main/server needs to allow us to persist 'currentTurn'.
    // Let's rely on renderState updating the DOM first or concurrently.

    // Store data globally
    // We'll guess the color from the current active player in DOM if needed, 
    // or better: renderState sets the 'active' class, we find that.

    if (timerRequestFrame) cancelAnimationFrame(timerRequestFrame);

    // We can't easily get the color here directly without state.
    // Instead we'll trigger the loop and inside the loop we find the active player card
    currentTimerData = { duration: durationMs, start: startTime, color: '' };
    // ^ Color will be resolved in the loop by looking for .player-card.active

    const loop = () => {
        if (!currentTimerData) return;
        // Try to find active card
        const activeCard = document.querySelector('.player-card.active');
        if (activeCard) {
            // Extract color class
            const classes = activeCard.className.split(' ');
            const color = classes.find(c => ['red', 'blue', 'green', 'yellow'].includes(c));
            if (color) {
                currentTimerData.color = color;
                // Run update
                const { duration, start } = currentTimerData;
                const elapsed = Date.now() - start;
                const remaining = Math.max(0, duration - elapsed);
                const pct = Math.max(0, remaining / duration);
                const C = 200;
                const offset = C * (1 - pct);

                const circle = activeCard.querySelector('.avatar-timer-circle') as SVGCircleElement;
                if (circle) {
                    circle.style.strokeDashoffset = offset.toString();
                }

                if (remaining > 0) {
                    timerRequestFrame = requestAnimationFrame(loop);
                }
            }
        } else {
            // DOM not ready, retry next frame
            timerRequestFrame = requestAnimationFrame(loop);
        }
    };
    timerRequestFrame = requestAnimationFrame(loop);
}

export function renderState(gameState: GameState | null, myColor: string | null, validPawnIds: string[] = []) {
    if (!gameState) return;

    const safeValidPawnIds = Array.isArray(validPawnIds) ? validPawnIds : [];

    // --- PAWNS ---
    const existingPawnEls = new Map<string, HTMLElement>();
    document.querySelectorAll('.pawn[data-pawn-id]').forEach(el => {
        if (el instanceof HTMLElement && el.dataset.pawnId) {
            existingPawnEls.set(el.dataset.pawnId, el);
        }
    });

    const processedPawnIds = new Set<string>();
    const pawnsAtCell = new Map<string, Pawn[]>();

    if (gameState.pawns && Array.isArray(gameState.pawns)) {
        gameState.pawns.forEach(pawn => {
            if (!pawn || typeof pawn.color !== 'string') return;
            const coord = getGridCoord(pawn.color, pawn.position, pawn.pawnIndex);
            const key = `${coord.r},${coord.c}`;
            if (!pawnsAtCell.has(key)) pawnsAtCell.set(key, []);
            pawnsAtCell.get(key)!.push(pawn);
        });
    }

    pawnsAtCell.forEach((pawns, key) => {
        const [r, c] = key.split(',').map(Number);
        const index = (r - 1) * BOARD_DIMENSION + (c - 1);
        const cell = board.children[index] as HTMLElement;

        pawns.forEach((pawn, idx) => {
            processedPawnIds.add(pawn.id);
            let el = existingPawnEls.get(pawn.id);
            let wrapper: HTMLElement;

            if (el) {
                wrapper = el.parentElement as HTMLElement;
                // Add .moving class if position changed? (Complex to track without prev state)
                // For now, just ensure color class
                el.className = `pawn ${pawn.color.toLowerCase()}`;
            } else {
                wrapper = document.createElement('div');
                wrapper.className = 'pawn-wrapper';
                el = document.createElement('div');
                el.className = `pawn ${pawn.color.toLowerCase()}`;
                wrapper.appendChild(el);
            }

            if (wrapper.parentElement !== cell) {
                cell.appendChild(wrapper);
                // "Juice": Particle burst on move arrival?
                // Just random burst for effect
                // createParticles(cell); // Too noisy if every check?
            }

            // Handle overlaps
            if (pawns.length > 1) {
                const offset = (idx * 5) - ((pawns.length - 1) * 2.5);
                wrapper.style.transform = `translate(${offset}px, ${offset}px)`;
            } else {
                wrapper.style.transform = '';
            }

            // Fading
            if (myColor && pawn.color !== myColor) {
                el.style.opacity = '0.6';
            } else {
                el.style.opacity = '1';
            }

            // Interactive
            if (gameState?.currentTurn === myColor &&
                gameState.gamePhase === 'MOVING' &&
                safeValidPawnIds.includes(pawn.id)) {
                el.classList.add('clickable');
                el.dataset.pawnId = pawn.id;
            } else {
                el.classList.remove('clickable');
                el.dataset.pawnId = pawn.id;
            }
        });
    });

    existingPawnEls.forEach((el, id) => {
        if (!processedPawnIds.has(id)) {
            // Pawn removed (Captured or Home?)
            createParticles(el.parentElement as HTMLElement, 'white', 20); // Death poof
            el.parentElement?.remove();
        }
    });

    // --- PLAYERS (Corner Cards) ---
    playerInfoPanel.innerHTML = '';
    // We map colors to corners:
    // Red: BL, Green: TL, Yellow: TR, Blue: BR
    const colorCorners: Record<string, string> = {
        'RED': 'corner-bottom-left',
        'GREEN': 'corner-top-left',
        'YELLOW': 'corner-top-right',
        'BLUE': 'corner-bottom-right'
    };

    if (gameState.players && Array.isArray(gameState.players)) {
        gameState.players.forEach(p => {
            if (!p || !p.color) return;

            const cornerClass = colorCorners[p.color] || 'corner-bottom-left';

            // Card
            const card = document.createElement('div');
            card.className = `player-card ${p.color.toLowerCase()} ${cornerClass}`;
            if (gameState?.currentTurn === p.color) {
                card.classList.add('active');
            }

            // Avatar Container
            const avatar = document.createElement('div');
            avatar.className = 'player-avatar';
            avatar.textContent = p.name.substring(0, 1).toUpperCase();

            // SVG Timer Ring
            avatar.innerHTML += `
            <svg class="avatar-timer-svg" viewBox="0 0 80 80">
                <circle class="avatar-timer-circle" cx="40" cy="40" r="32" />
            </svg>
            `;

            // Info
            const info = document.createElement('div');
            info.className = 'player-info-text';

            const nameEl = document.createElement('div');
            nameEl.className = 'player-name';
            nameEl.textContent = p.name;
            if (p.color === myColor) {
                nameEl.innerHTML += ' <span style="font-size:0.8em; opacity:0.7">(YOU)</span>';
            }

            const statusText = document.createElement('div');
            statusText.className = 'player-status';
            statusText.textContent = p.isBot ? "BOT" : (p.isActive ? "ONLINE" : "AFK");

            info.appendChild(nameEl);
            info.appendChild(statusText);

            card.appendChild(avatar);
            card.appendChild(info);

            playerInfoPanel.appendChild(card);
        });
    }

    // --- UI STATUS ---
    const isMyTurn = gameState.currentTurn === myColor;
    if (isMyTurn) {
        statusEl.textContent = "YOUR TURN";
        statusEl.style.color = '#fff';
        statusEl.style.textShadow = "0 0 10px var(--neon-green)";
    } else {
        const p = gameState.players.find(pl => pl.color === gameState.currentTurn);
        statusEl.textContent = p ? `${p.name}'s TURN` : 'WAITING...';
        statusEl.style.color = '#ccc';
        statusEl.style.textShadow = "none";
    }

    // Buttons
    const gamePhase = gameState.gamePhase || 'ROLLING';
    if (isMyTurn && gamePhase === 'ROLLING') {
        rollBtn.disabled = false;
        rollBtn.textContent = "ROLL";
        rollBtn.style.opacity = '1';
    } else {
        rollBtn.disabled = true;
        rollBtn.style.opacity = '0.5';
        rollBtn.textContent = gamePhase === 'MOVING' ? "MOVE..." : "WAIT";
    }
}

// Particle System
function createParticles(element: HTMLElement, color: string = 'white', count: number = 10) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 50 + 20;

        p.style.position = 'fixed'; // Fixed to screen
        p.style.left = `${centerX}px`;
        p.style.top = `${centerY}px`;
        p.style.width = '6px';
        p.style.height = '6px';
        p.style.background = color === 'white' ? '#fff' : `var(--neon-${color})`;
        p.style.borderRadius = '50%';
        p.style.pointerEvents = 'none';
        p.style.zIndex = '9999';
        p.style.transition = 'all 0.6s ease-out';

        document.body.appendChild(p);

        // Animate
        requestAnimationFrame(() => {
            const tx = Math.cos(angle) * speed;
            const ty = Math.sin(angle) * speed;
            p.style.transform = `translate(${tx}px, ${ty}px) scale(0)`;
            p.style.opacity = '0';
        });

        setTimeout(() => p.remove(), 600);
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

export function updateStartButton(gamePhase: string, playerCount: number, isHost: boolean) {
    if (gamePhase === 'WAITING' && isHost) {
        startBtn.style.display = '';
        startBtn.disabled = playerCount < 2;
        startBtn.title = playerCount < 2 ? 'Need at least 2 players' : '';
    } else {
        startBtn.style.display = 'none';
    }
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
        const clickablePawn = cell.querySelector('.pawn.clickable') as HTMLElement;
        if (clickablePawn && clickablePawn.dataset.pawnId) {
            sendMoveRequest(clickablePawn.dataset.pawnId);
        }
    }
});
