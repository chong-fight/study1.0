import { DEFAULT_SETTINGS } from "@/lib/domain/constants";
import type { AppSettings } from "@/lib/domain/types";

const STORAGE_KEY = "phrase-memory-2-settings";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeSettings(input: Partial<AppSettings>): AppSettings {
  return {
    fixedNewLimit: clamp(
      input.fixedNewLimit ?? DEFAULT_SETTINGS.fixedNewLimit,
      0,
      30,
    ),
    verbNewLimit: clamp(
      input.verbNewLimit ?? DEFAULT_SETTINGS.verbNewLimit,
      0,
      30,
    ),
    totalNewLimit: clamp(
      input.totalNewLimit ?? DEFAULT_SETTINGS.totalNewLimit,
      1,
      50,
    ),
    fixedReviewLimit: clamp(
      input.fixedReviewLimit ?? DEFAULT_SETTINGS.fixedReviewLimit,
      0,
      100,
    ),
    verbReviewLimit: clamp(
      input.verbReviewLimit ?? DEFAULT_SETTINGS.verbReviewLimit,
      0,
      100,
    ),
    totalReviewLimit: clamp(
      input.totalReviewLimit ?? DEFAULT_SETTINGS.totalReviewLimit,
      1,
      150,
    ),
  };
}

export function getSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSettings(JSON.parse(raw) as Partial<AppSettings>) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const normalized = normalizeSettings(settings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}
