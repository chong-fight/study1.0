"use client";

import { useEffect } from "react";

export function useQuestionScroll(active: boolean, feedbackVisible: boolean) {
  useEffect(() => {
    if (!active) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({
        top: feedbackVisible
          ? document.documentElement.scrollHeight
          : 0,
        behavior: reduced ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, feedbackVisible]);
}
