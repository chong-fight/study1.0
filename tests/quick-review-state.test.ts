import { describe, expect, it } from "vitest";
import {
  INITIAL_QUICK_REVIEW_STATE,
  quickReviewReducer,
  type QuickReviewState,
} from "@/lib/domain/quick-review";
import {
  clearQuickReviewProgress,
  quickReviewStorageKey,
  readQuickReviewProgress,
  saveQuickReviewProgress,
  type QuickReviewStorage,
} from "@/lib/data/quick-review-storage";

function memoryStorage(): QuickReviewStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("quick review state", () => {
  it("keeps the two directions in separate daily storage keys", () => {
    const storage = memoryStorage();
    saveQuickReviewProgress(storage, "2026-01-01", "en-zh", ["fixed:one"]);
    saveQuickReviewProgress(storage, "2026-01-01", "zh-en", ["fixed:two"]);

    expect(
      quickReviewStorageKey("2026-01-01", "en-zh"),
    ).not.toBe(quickReviewStorageKey("2026-01-01", "zh-en"));
    expect(
      readQuickReviewProgress(storage, "2026-01-01", "en-zh"),
    ).toEqual(["fixed:one"]);
    expect(
      readQuickReviewProgress(storage, "2026-01-01", "zh-en"),
    ).toEqual(["fixed:two"]);
    expect(
      readQuickReviewProgress(storage, "2026-01-02", "en-zh"),
    ).toEqual([]);
  });

  it("does not advance on a wrong answer and completes only once", () => {
    let state: QuickReviewState = quickReviewReducer(
      INITIAL_QUICK_REVIEW_STATE,
      {
        type: "choose-mode",
        mode: "zh-en",
        completedIds: [],
      },
    );
    state = quickReviewReducer(state, { type: "wrong", phraseId: "fixed:one" });
    expect(state.completedIds).toEqual([]);
    expect(state.activeId).toBe("fixed:one");
    expect(state.feedback).toBe("wrong");

    state = quickReviewReducer(state, {
      type: "correct",
      phraseId: "fixed:one",
    });
    state = quickReviewReducer(state, {
      type: "correct",
      phraseId: "fixed:one",
    });
    expect(state.completedIds).toEqual(["fixed:one"]);

    state = quickReviewReducer(state, { type: "next" });
    expect(state.activeId).toBeNull();
    expect(state.feedback).toBeNull();
  });

  it("clears only the active direction when restarted", () => {
    const storage = memoryStorage();
    saveQuickReviewProgress(storage, "2026-01-01", "en-zh", ["fixed:one"]);
    saveQuickReviewProgress(storage, "2026-01-01", "zh-en", ["fixed:two"]);
    clearQuickReviewProgress(storage, "2026-01-01", "en-zh");
    expect(storage.values.has(quickReviewStorageKey("2026-01-01", "en-zh"))).toBe(
      false,
    );
    expect(
      readQuickReviewProgress(storage, "2026-01-01", "zh-en"),
    ).toEqual(["fixed:two"]);
  });

  it("tolerates missing or malformed local storage", () => {
    const storage: QuickReviewStorage = {
      getItem: () => "{bad",
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readQuickReviewProgress(storage, "today", "en-zh")).toEqual([]);
    expect(() =>
      saveQuickReviewProgress(storage, "today", "en-zh", ["id"]),
    ).not.toThrow();
    expect(() =>
      clearQuickReviewProgress(storage, "today", "en-zh"),
    ).not.toThrow();
  });
});
