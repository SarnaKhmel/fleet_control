import { describe, expect, it } from 'vitest';
import { useMapIssueStore } from './mapIssue';

describe('mapIssue store', () => {
  it('starts without issues and records one', () => {
    expect(useMapIssueStore.getState().issue).toBeNull();
    useMapIssueStore.getState().setIssue('terrain');
    expect(useMapIssueStore.getState().issue).toBe('terrain');
    useMapIssueStore.getState().setIssue(null);
  });
});
