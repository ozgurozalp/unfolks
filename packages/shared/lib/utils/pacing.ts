/**
 * How fast the scan pages through Instagram's lists. "fast" is the speed
 * Unfolks has always used; the slower presets trade time for a lower chance
 * of Instagram rate-limiting or flagging the account.
 */
export const SCAN_SPEEDS = ['fast', 'balanced', 'careful'] as const;
export type ScanSpeed = (typeof SCAN_SPEEDS)[number];
export const DEFAULT_SCAN_SPEED: ScanSpeed = 'fast';

export interface ScanPacing {
  /** The first pages of a list use the short delay; small accounts finish there. */
  fastPages: number;
  fastDelayMinMs: number;
  fastDelayMaxMs: number;
  delayMinMs: number;
  delayMaxMs: number;
  /** A longer pause every N pages. 0 turns it off. */
  pauseEveryPages: number;
  pauseMs: number;
}

export const SCAN_PACING: Record<ScanSpeed, ScanPacing> = {
  fast: {
    fastPages: 12,
    fastDelayMinMs: 60,
    fastDelayMaxMs: 140,
    delayMinMs: 180,
    delayMaxMs: 320,
    pauseEveryPages: 25,
    pauseMs: 1200,
  },
  balanced: {
    fastPages: 4,
    fastDelayMinMs: 150,
    fastDelayMaxMs: 300,
    delayMinMs: 450,
    delayMaxMs: 900,
    pauseEveryPages: 15,
    pauseMs: 4000,
  },
  careful: {
    fastPages: 0,
    fastDelayMinMs: 0,
    fastDelayMaxMs: 0,
    delayMinMs: 1200,
    delayMaxMs: 2200,
    pauseEveryPages: 7,
    pauseMs: 10_000,
  },
};

export function isScanSpeed(value: unknown): value is ScanSpeed {
  return typeof value === 'string' && (SCAN_SPEEDS as readonly string[]).includes(value);
}

export function resolveScanSpeed(value: unknown): ScanSpeed {
  return isScanSpeed(value) ? value : DEFAULT_SCAN_SPEED;
}

/** Spacing between unfollows in a batch, plus a longer rest every few actions. */
export interface UnfollowPacing {
  gapMinMs: number;
  gapMaxMs: number;
  /** Rest after this many unfollows. 0 turns the rest off. */
  pauseEvery: number;
  pauseMs: number;
}

export const DEFAULT_UNFOLLOW_PACING: UnfollowPacing = {
  gapMinMs: 4000,
  gapMaxMs: 6000,
  pauseEvery: 5,
  pauseMs: 3 * 60 * 1000,
};

export const UNFOLLOW_PACING_LIMITS = {
  gapMinMs: { min: 2000, max: 120_000 },
  gapMaxMs: { min: 2000, max: 180_000 },
  pauseEvery: { min: 0, max: 100 },
  pauseMs: { min: 0, max: 60 * 60 * 1000 },
} as const;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

/** Clamp user input into safe bounds. The max gap never drops below the min gap. */
export function normalizeUnfollowPacing(value: Partial<UnfollowPacing> | null | undefined): UnfollowPacing {
  const input = value ?? {};
  const limits = UNFOLLOW_PACING_LIMITS;
  const gapMinMs = clamp(input.gapMinMs, limits.gapMinMs.min, limits.gapMinMs.max, DEFAULT_UNFOLLOW_PACING.gapMinMs);
  const gapMaxMs = clamp(input.gapMaxMs, limits.gapMaxMs.min, limits.gapMaxMs.max, DEFAULT_UNFOLLOW_PACING.gapMaxMs);
  return {
    gapMinMs,
    gapMaxMs: Math.max(gapMinMs, gapMaxMs),
    pauseEvery: clamp(
      input.pauseEvery,
      limits.pauseEvery.min,
      limits.pauseEvery.max,
      DEFAULT_UNFOLLOW_PACING.pauseEvery,
    ),
    pauseMs: clamp(input.pauseMs, limits.pauseMs.min, limits.pauseMs.max, DEFAULT_UNFOLLOW_PACING.pauseMs),
  };
}

/** Whether the batch should rest after `done` unfollows (1-based count). */
export function shouldRestAfter(done: number, pacing: UnfollowPacing): boolean {
  return pacing.pauseEvery > 0 && pacing.pauseMs > 0 && done > 0 && done % pacing.pauseEvery === 0;
}
