import { describe, it, expect } from 'vitest';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode, MAX_PLAYERS_PER_ROOM } from './roomUtils';

describe('Room Utilities', () => {
    describe('generateRoomCode', () => {
        it('should generate a 6-character code', () => {
            const code = generateRoomCode();
            expect(code.length).toBe(6);
        });

        it('should only contain valid characters', () => {
            for (let i = 0; i < 100; i++) {
                const code = generateRoomCode();
                expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
            }
        });

        it('should generate unique codes', () => {
            const codes = new Set<string>();
            for (let i = 0; i < 100; i++) {
                codes.add(generateRoomCode());
            }
            // At least 95 should be unique (very high probability)
            expect(codes.size).toBeGreaterThan(95);
        });
    });

    describe('isValidRoomCode', () => {
        it('should return true for valid 6-char codes', () => {
            expect(isValidRoomCode('ABC123')).toBe(true);
            expect(isValidRoomCode('XYZNMK')).toBe(true);
        });

        it('should return false for invalid codes', () => {
            expect(isValidRoomCode('')).toBe(false);
            expect(isValidRoomCode('ABC')).toBe(false);
            expect(isValidRoomCode('ABC1234')).toBe(false);
            expect(isValidRoomCode('abc-12')).toBe(false);
        });
    });

    describe('normalizeRoomCode', () => {
        it('should uppercase and trim', () => {
            expect(normalizeRoomCode('  abc123  ')).toBe('ABC123');
            expect(normalizeRoomCode('xyzNMK')).toBe('XYZNMK');
        });
    });

    describe('MAX_PLAYERS_PER_ROOM', () => {
        it('should be 4', () => {
            expect(MAX_PLAYERS_PER_ROOM).toBe(4);
        });
    });
});
