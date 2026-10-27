"use client";

import { useEffect, useState } from "react";
import { localDateKey } from "@/lib/domain/date";

export function useLocalDay(): string {
  const [today, setToday] = useState(() => localDateKey());

  useEffect(() => {
    const sync = () => setToday(localDateKey());
    const interval = window.setInterval(sync, 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return today;
}
