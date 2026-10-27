import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, GRADE_ORDER } from "@/lib/domain/constants";
import { addDays, daysBetween } from "@/lib/domain/date";
import {
  createInitialReviewState,
  reviewUrgency,
  updateReviewSchedule,
} from "@/lib/domain/scheduler";
import type { Grade, ReviewQuality, ReviewState, TrackId } from "@/lib/domain/types";

interface SimCard extends ReviewState {
  everReviewed: boolean;
  firstDueOn: string;
  firstReviewedOn?: string;
}

describe("120-day accelerated use", () => {
  it("keeps review queues from permanently starving cards", () => {
    const cards: SimCard[] = [];
    let serial = 0;
    let date = "2026-01-01";
    let maxOverdue = 0;

    const addCard = (trackId: TrackId, grade: Grade, dueOn: string) => {
      serial += 1;
      const state = createInitialReviewState(
        `${trackId}:sim-${serial}`,
        trackId,
        grade,
        date,
        serial,
      );
      cards.push({
        ...state,
        nextReviewOn: dueOn,
        everReviewed: false,
        firstDueOn: dueOn,
      });
    };

    for (let index = 0; index < 30; index += 1) {
      for (let item = 0; item < 6; item += 1) {
        addCard("fixed", item % 3 === 0 ? "C" : "B", addDays(date, 1));
      }
      for (let item = 0; item < 4; item += 1) {
        addCard("verb-pattern", item % 2 === 0 ? "C" : "B", addDays(date, 1));
      }
      date = addDays(date, 1);
    }

    date = "2026-01-02";
    for (let day = 0; day < 120; day += 1) {
      const due = cards.filter((card) => card.nextReviewOn <= date);
      for (const card of due) {
        maxOverdue = Math.max(
          maxOverdue,
          Math.max(0, daysBetween(card.nextReviewOn, date)),
        );
      }

      const trackCounts: Record<TrackId, number> = {
        fixed: 0,
        "verb-pattern": 0,
      };
      const sorted = [...due].sort(
        (left, right) => reviewUrgency(right, date) - reviewUrgency(left, date),
      );
      const selected: SimCard[] = [];
      for (const card of sorted) {
        const trackLimit =
          card.trackId === "fixed"
            ? DEFAULT_SETTINGS.fixedReviewLimit
            : DEFAULT_SETTINGS.verbReviewLimit;
        if (selected.length >= DEFAULT_SETTINGS.totalReviewLimit) break;
        if (trackCounts[card.trackId] >= trackLimit) continue;
        selected.push(card);
        trackCounts[card.trackId] += 1;
      }

      const selectedIds = new Set(selected.map((card) => card.phraseId));
      for (const card of due) {
        if (!selectedIds.has(card.phraseId)) card.deferralCount += 1;
      }

      for (const card of selected) {
        card.everReviewed = true;
        card.firstReviewedOn ??= date;
        const signal = (serial + cards.indexOf(card) * 17 + day * 13) % 100;
        const quality: ReviewQuality = signal < 10 ? 0 : signal < 25 ? 3 : 4;
        Object.assign(
          card,
          updateReviewSchedule(card, quality, date, day + serial),
        );
      }

      date = addDays(date, 1);
    }

    const neverReviewed = cards.filter((card) => !card.everReviewed);
    const maxFirstReviewWait = Math.max(
      ...cards.map((card) =>
        daysBetween(card.firstDueOn, card.firstReviewedOn ?? date),
      ),
    );
    const validGrades = cards.every((card) => GRADE_ORDER.includes(card.grade));

    console.log({
      simulatedDays: 120,
      cards: cards.length,
      neverReviewed: neverReviewed.length,
      maxReviewWaitDays: maxFirstReviewWait,
      maxOverdueDays: maxOverdue,
    });

    expect(neverReviewed).toHaveLength(0);
    expect(maxFirstReviewWait).toBeLessThanOrEqual(7);
    expect(validGrades).toBe(true);
  });
});
