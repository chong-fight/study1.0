"use client";

import { useCallback, useEffect, useState } from "react";
import {
  replaceTrackInUrl,
  resolveTrackId,
} from "@/lib/domain/track-selection";
import type { TrackId } from "@/lib/domain/types";

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
    const nextTrack = resolveTrackId(requested, stored);
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
        window.history.replaceState(
          window.history.state,
          "",
          replaceTrackInUrl(window.location.href, nextTrack),
        );
      } catch {
        // Updating the address bar is optional; the selection is already in memory.
      }
    },
    [storageKey],
  );

  return { trackId, setTrackId, trackReady };
}
