import type { TrackId } from "./types";

const TRACK_IDS = new Set<TrackId>(["fixed", "verb-pattern"]);

export function isTrackId(value: string | null): value is TrackId {
  return Boolean(value && TRACK_IDS.has(value as TrackId));
}

export function resolveTrackId(
  requested: string | null,
  stored: string | null,
): TrackId | null {
  if (isTrackId(requested)) return requested;
  if (isTrackId(stored)) return stored;
  return null;
}

export function replaceTrackInUrl(
  href: string,
  trackId: TrackId,
  base = "https://phrase-memory.local",
): string {
  const url = new URL(href, base);
  url.searchParams.set("track", trackId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export interface RequestEpoch {
  next(): number;
  isCurrent(ticket: number): boolean;
}

export function createRequestEpoch(): RequestEpoch {
  let current = 0;
  return {
    next() {
      current += 1;
      return current;
    },
    isCurrent(ticket) {
      return ticket === current;
    },
  };
}

export interface TrackSwitchLock {
  loading?: boolean;
  preparing?: boolean;
  starting?: boolean;
  submitting?: boolean;
  previewBusy?: boolean;
}

export function isTrackSwitchLocked(lock: TrackSwitchLock): boolean {
  return Boolean(
    lock.loading ||
      lock.preparing ||
      lock.starting ||
      lock.submitting ||
      lock.previewBusy,
  );
}
