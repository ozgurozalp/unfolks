import { describe, expect, it } from 'vitest';
import { estimateBulkRemainingMs, type UnfollowPacing } from '../pacing';

const pacing: UnfollowPacing = { gapMinMs: 4000, gapMaxMs: 6000, pauseEvery: 5, pauseMs: 60_000 };

describe('estimateBulkRemainingMs', () => {
  it('is zero once every account is done', () => {
    expect(estimateBulkRemainingMs({ done: 10, total: 10, pacing })).toBe(0);
  });

  it('does not wait before the first account', () => {
    // One account: unfollowed right away, nothing to wait for.
    expect(estimateBulkRemainingMs({ done: 0, total: 1, pacing })).toBe(0);
  });

  it('adds the average gap before each remaining account', () => {
    expect(estimateBulkRemainingMs({ done: 1, total: 4, pacing })).toBe(3 * 5000);
  });

  it('adds a rest after every pauseEvery accounts', () => {
    // From 0 to 12: gaps before #2..#12 (11) and rests after #5 and #10.
    expect(estimateBulkRemainingMs({ done: 0, total: 12, pacing })).toBe(11 * 5000 + 2 * 60_000);
  });

  it('counts only what is left of a rest in progress', () => {
    const now = 1_000_000;
    const estimate = estimateBulkRemainingMs({ done: 5, total: 7, pacing, restingUntil: now + 20_000, now });
    expect(estimate).toBe(20_000 + 2 * 5000);
  });

  it('ignores rests that are turned off', () => {
    const noRest = { ...pacing, pauseEvery: 0 };
    expect(estimateBulkRemainingMs({ done: 0, total: 11, pacing: noRest })).toBe(10 * 5000);
  });
});
