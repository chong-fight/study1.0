import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/domain/date";
import {
  createInitialReviewState,
  reviewUrgency,
  updateReviewSchedule,
} from "@/lib/domain/scheduler";
import type { ReviewState } from "@/lib/domain/types";

describe("review scheduler", () => {
  it("creates grade-specific initial intervals", () => {
    expect(
      createInitialReviewState("fixed:one", "fixed", "S", "2026-01-01", 1)
        .intervalDays,
    ).toBe(4);
    expect(
      createInitialReviewState("fixed:one", "fixed", "B", "2026-01-01", 1)
        .intervalDays,
    ).toBe(1);
  });

  it("expands on success and resets on failure", () => {
    const initial = createInitialReviewState(
      "fixed:one",
      "fixed",
      "A",
      "2026-01-01",
      1,
    );
    const good = updateReviewSchedule(initial, 4, "2026-01-03", 2);
    expect(good.intervalDays).toBeGreaterThan(initial.intervalDays);
    expect(good.nextReviewOn).toBe(addDays("2026-01-03", good.intervalDays));

    const failed = updateReviewSchedule(good, 0, "2026-01-10", 3);
    expect(failed.intervalDays).toBe(1);
    expect(failed.nextReviewOn).toBe("2026-01-11");
    expect(failed.lapses).toBe(1);
  });

  it("keeps every value finite across 365 simulated reviews", () => {
    let state = createInitialReviewState(
      "fixed:one",
      "fixed",
      "B",
      "2026-01-01",
      1,
    );
    let date = "2026-01-02";
    for (let index = 0; index < 365; index += 1) {
      const quality = index % 11 === 0 ? 0 : index % 7 === 0 ? 3 : 4;
      state = updateReviewSchedule(state, quality, date, index);
      expect(state.intervalDays).toBeGreaterThan(0);
      expect(Number.isFinite(state.easeFactor)).toBe(true);
      expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
      expect(state.nextReviewOn > date).toBe(true);
      date = addDays(date, 1);
    }
    expect(["S", "A", "B", "C", "D"]).toContain(state.grade);
  });

  it("tolerates review states migrated without deferralCount", () => {
    const state = createInitialReviewState(
      "fixed:legacy",
      "fixed",
      "B",
      "2026-01-01",
      1,
    );
    const legacy = {
      ...state,
      deferralCount: undefined,
    } as unknown as ReviewState;
    expect(Number.isFinite(reviewUrgency(legacy, "2026-01-05"))).toBe(true);
  });
});
