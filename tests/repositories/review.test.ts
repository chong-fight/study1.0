import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/data/db";
import {
  ensureReviewPlan,
  recordReviewAnswer,
  startReviewAttempt,
} from "@/lib/data/repositories";
import { DEFAULT_SETTINGS } from "@/lib/domain/constants";
import {
  makePhrase,
  makeProgress,
  makeReviewState,
} from "../fixtures/phrases";
import { resetTestDatabase, seedPhrases } from "../fixtures/db";

describe("review repository contracts", () => {
  beforeEach(resetTestDatabase);

  it("rejects a mismatched question without partial writes", async () => {
    const phrase = makePhrase("fixed", "transaction fixture");
    await seedPhrases([phrase]);
    await db.cardProgress.put(
      makeProgress(phrase, { state: "scheduled", confirmedGrade: "B" }),
    );
    await db.reviewStates.put(makeReviewState(phrase));
    const plan = await ensureReviewPlan(
      "fixed",
      "2026-01-02",
      DEFAULT_SETTINGS,
    );
    const withAttempt = await startReviewAttempt(plan.id, phrase.id);
    const expectedType = withAttempt.attempts[phrase.id].types[0];
    const mismatched = expectedType === "meaning" ? "spelling" : "meaning";

    await expect(
      recordReviewAnswer(
        plan.id,
        phrase.id,
        mismatched,
        mismatched === "spelling" ? "production" : "recognition",
        true,
        "answer",
        "answer",
        100,
      ),
    ).rejects.toThrow("does not match");

    const stored = await db.reviewPlans.get(plan.id);
    expect(stored?.attempts[phrase.id].answers).toEqual([]);
    expect(await db.reviewLogs.count()).toBe(0);
  });
});
