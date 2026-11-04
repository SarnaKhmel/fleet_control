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

  it('accepts drone task lists', () => {
    const tasks = { type: 'drone_tasks', droneId: 'drone-1', trail: [], tasks: [{ lat: 50, lng: 30 }] };
    expect(parseServerMessage(JSON.stringify(tasks))).toEqual(tasks);
  });

  it('drops unknown types, bad JSON and non-strings', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'move' }))).toBeNull();
    expect(parseServerMessage('{not json')).toBeNull();
    expect(parseServerMessage(42)).toBeNull();
  });
});
