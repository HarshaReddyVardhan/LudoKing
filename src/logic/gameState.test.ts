import { describe, it, expect } from 'vitest';
import { createInitialState, initializePawns, createPlayer } from './gameState';
import { Color, GamePhase } from '../shared/types';

describe('GameState Logic', () => {
    it('should create a valid initial state', () => {
        const state = createInitialState('123456');
        expect(state.roomCode).toBe('123456');
        expect(state.gamePhase).toBe(GamePhase.WAITING);
        expect(state.players).toHaveLength(0);
        expect(state.lastMove).toBeNull();
    });

    it('should initialize pawns correctly', () => {
        const pawns = initializePawns(Color.RED);
        expect(pawns).toHaveLength(4);
        expect(pawns[0].color).toBe(Color.RED);
        expect(pawns[0].position).toBe(0);
        expect(pawns[0].id).toBe('RED_0');
    });

    it('should create a player object', () => {
        const player = createPlayer('conn1', 'Alice', Color.BLUE);
        expect(player.name).toBe('Alice');
        expect(player.color).toBe(Color.BLUE);
        expect(player.isActive).toBe(true);
    });
});
