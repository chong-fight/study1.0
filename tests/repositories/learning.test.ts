import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/data/db";
import {
  ensureLearningSession,
  getLearningCards,
  getTodayData,
} from "@/lib/data/repositories";
import { DEFAULT_SETTINGS } from "@/lib/domain/constants";
import {
  makePhrase,
  makeProgress,
} from "../fixtures/phrases";
import { resetTestDatabase, seedPhrases } from "../fixtures/db";

describe("learning repository contracts", () => {
  beforeEach(resetTestDatabase);

  it("keeps fixed and verb-pattern sessions and progress independent", async () => {
    const fixed = makePhrase("fixed", "fixed fixture");
    const verb = makePhrase("verb-pattern", "verb fixture");
    await seedPhrases([fixed, verb]);

    const fixedSession = await ensureLearningSession(
      "fixed",
      "2026-01-01",
      { ...DEFAULT_SETTINGS, fixedNewLimit: 1, verbNewLimit: 1 },
      () => 0.5,
    );
    const verbSession = await ensureLearningSession(
      "verb-pattern",
      "2026-01-01",
      { ...DEFAULT_SETTINGS, fixedNewLimit: 1, verbNewLimit: 1 },
      () => 0.5,
    );
    expect(fixedSession?.phraseIds).toEqual([fixed.id]);
    expect(verbSession?.phraseIds).toEqual([verb.id]);

    await db.cardProgress.put(
      makeProgress(fixed, {
        state: "scheduled",
        confirmedGrade: "B",
      }),
    );
    const fixedCards = await getLearningCards(fixedSession!);
    const verbCards = await getLearningCards(verbSession!);
    expect(fixedCards[0].progress?.state).toBe("scheduled");
    expect(verbCards[0].progress?.state).toBe("day0");

    const today = await getTodayData(DEFAULT_SETTINGS, "2026-01-01");
    expect(
      today.find((track) => track.trackId === "fixed")?.learningDone,
    ).toBe(1);
    expect(
      today.find((track) => track.trackId === "verb-pattern")?.learningDone,
    ).toBe(0);
  });
});
