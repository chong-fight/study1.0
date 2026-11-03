"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrackId } from "@/lib/domain/types";

const TRACKS = new Set<TrackId>(["fixed", "verb-pattern"]);

function isTrackId(value: string | null): value is TrackId {
  return Boolean(value && TRACKS.has(value as TrackId));
}

export function usePersistedTrack(
  storageKey = "phrase-memory-2-active-track",
) {
  const [trackId, setTrackState] = useState<TrackId>("fixed");
  const [trackReady, setTrackReady] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(storageKey);
    } catch {
      // Local storage can be unavailable in private browsing contexts.
    }
    const requested = new URLSearchParams(window.location.search).get("track");
    const nextTrack = isTrackId(requested)
      ? requested
      : isTrackId(stored)
        ? stored
        : null;
    if (nextTrack) {
      setTrackState(nextTrack);
      if (requested && requested !== stored) {
        try {
          window.localStorage.setItem(storageKey, nextTrack);
        } catch {
          // The in-memory selection still works without local storage.
        }
      }
    }
    setTrackReady(true);
  }, [storageKey]);

  const setTrackId = useCallback(
    (nextTrack: TrackId) => {
      setTrackState(nextTrack);
      try {
        window.localStorage.setItem(storageKey, nextTrack);
      } catch {
        // The in-memory selection still works without local storage.
      }
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("track", nextTrack);
        window.history.replaceState(
          window.history.state,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      } catch {
        // Updating the address bar is optional; the selection is already in memory.
      }
    },
    [storageKey],
  );

  return { trackId, setTrackId, trackReady };
}
