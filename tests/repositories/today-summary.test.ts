import { describe, expect, it } from "vitest";
import {
  summarizeTodayData,
  type TrackTodayData,
} from "@/lib/data/repositories";
import { makePhrase, makeProgress } from "../fixtures/phrases";

function track(
  trackId: "fixed" | "verb-pattern",
  overrides: Partial<TrackTodayData> = {},
): TrackTodayData {
  return {
    trackId,
    newPhrases: [],
    learningPhrases: [],
    learningCompletedIds: [],
    learningDone: 0,
    calibrationPhrases: [],
    duePhrases: [],
    reviewPhrases: [],
    reviewCompletedIds: [],
    reviewFailedIds: [],
    reviewSettledIds: [],
    reviewPendingIds: [],
    boosterPhrases: [],
    completedPhrases: [],
    deferredCount: 0,
    ...overrides,
  };
}

describe("today summary", () => {
  it("uses one explicit ID basis for completed and pending counts", () => {
    const fixedPhrase = makePhrase("fixed", "fixed summary");
    const verbPhrase = makePhrase("verb-pattern", "verb summary");
    const data = [
      track("fixed", {
        session: {
          id: "2026-01-01:fixed",
          date: "2026-01-01",
          trackId: "fixed",
          phraseIds: [fixedPhrase.id],
          previewedPhraseIds: [fixedPhrase.id],
          stage: "day0",
          currentRound: 2,
          roundPassedIds: {
            "1": [fixedPhrase.id],
            "2": [],
            "3": [],
            "4": [],
          },
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        },
        learningPhrases: [fixedPhrase],
        learningCompletedIds: [fixedPhrase.id],
        learningDone: 1,
        reviewPhrases: [fixedPhrase],
        reviewCompletedIds: [fixedPhrase.id],
        reviewSettledIds: [fixedPhrase.id],
        reviewPendingIds: [],
      }),
      track("verb-pattern", {
        newPhrases: [verbPhrase],
        reviewPhrases: [verbPhrase, fixedPhrase],
        reviewPendingIds: [verbPhrase.id],
      }),
    ];

    expect(summarizeTodayData(data, "all")).toMatchObject({
      total: 5,
      done: 2,
      newCount: 2,
      newPendingCount: 1,
      reviewPendingCount: 1,
      hasLearning: true,
    });
    expect(summarizeTodayData(data, "fixed")).toMatchObject({
      total: 2,
      done: 2,
      newPendingCount: 0,
      reviewPendingCount: 0,
      hasDue: true,
    });
  });

  it("keeps a booster-only day distinct from formal due work", () => {
    const phrase = makePhrase("fixed", "booster summary");
    const data = [
      track("fixed", {
        plan: {
          id: "2026-01-01:fixed",
          date: "2026-01-01",
          trackId: "fixed",
          phraseIds: [phrase.id],
          kind: "booster",
          boosterRound: 3,
          calibrationIds: [],
          deferredPhraseIds: [],
          completedPhraseIds: [],
          attempts: {},
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        },
        boosterPhrases: [phrase],
        reviewPhrases: [phrase],
        reviewPendingIds: [phrase.id],
      }),
    ];
    expect(summarizeTodayData(data)).toMatchObject({
      hasDue: true,
      actualDueCount: 0,
      boosterOnly: true,
    });
    expect(makeProgress(phrase).state).toBe("day0");
  });
});
