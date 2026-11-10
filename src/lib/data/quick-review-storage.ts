import type { QuickReviewMode } from "@/lib/domain/quick-review";

export interface QuickReviewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function quickReviewStorageKey(
  today: string,
  mode: QuickReviewMode,
): string {
  return `phrase-memory-2-quick-review:${today}:${mode}`;
}

export function readQuickReviewProgress(
  storage: QuickReviewStorage,
  today: string,
  mode: QuickReviewMode,
): string[] {
  try {
    const value = JSON.parse(
      storage.getItem(quickReviewStorageKey(today, mode)) ?? "[]",
    );
    return Array.isArray(value)
      ? [...new Set(value.filter((item): item is string => typeof item === "string"))]
      : [];
  } catch {
    return [];
  }
}

export function saveQuickReviewProgress(
  storage: QuickReviewStorage,
  today: string,
  mode: QuickReviewMode,
  completedIds: readonly string[],
): void {
  try {
    storage.setItem(
      quickReviewStorageKey(today, mode),
      JSON.stringify([...new Set(completedIds)]),
    );
  } catch {
    // The in-memory quick review remains usable without local storage.
  }
}

export function clearQuickReviewProgress(
  storage: QuickReviewStorage,
  today: string,
  mode: QuickReviewMode,
): void {
  try {
    storage.removeItem(quickReviewStorageKey(today, mode));
  } catch {
    // The in-memory quick review remains usable without local storage.
  }
}
