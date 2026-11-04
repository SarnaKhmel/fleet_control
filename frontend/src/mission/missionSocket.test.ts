import { describe, expect, it } from 'vitest';
import { parseServerMessage } from './missionSocket';

describe('parseServerMessage', () => {
  it('accepts known server messages', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'mission_reset' }))).toEqual({ type: 'mission_reset' });
    expect(parseServerMessage(JSON.stringify({ type: 'mission_error', reason: 'outside_area' }))).toEqual({
      type: 'mission_error',
      reason: 'outside_area',
    });
  });

  it('drops unknown types, bad JSON and non-strings', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'move' }))).toBeNull();
    expect(parseServerMessage('{not json')).toBeNull();
    expect(parseServerMessage(42)).toBeNull();
  });
});
