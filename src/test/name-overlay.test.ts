/**
 * Tests for the ranking board's name-button label.
 * The label logic is pure (no Phaser / DOM), so it is tested here;
 * the overlay itself is exercised by the headless playtest.
 */
import { describe, expect, it } from 'vitest';
import { nameButtonLabel } from '../ui/NameOverlay';

describe('nameButtonLabel', () => {
  it('asks for a name when none is saved', () => {
    expect(nameButtonLabel(null)).toBe('SET NAME');
    expect(nameButtonLabel('')).toBe('SET NAME');
  });

  it('shows short names as they are', () => {
    expect(nameButtonLabel('ZU')).toBe('ZU');
    expect(nameButtonLabel('12345678')).toBe('12345678');
  });

  it('clips names longer than 8 characters with an ellipsis', () => {
    expect(nameButtonLabel('123456789')).toBe('12345678…');
    expect(nameButtonLabel('LongPlayerName')).toBe('LongPlay…');
  });
});
