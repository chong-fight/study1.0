import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/data/db";
import { ensureBoosterReviewPlan } from "@/lib/data/repositories";
import { DEFAULT_SETTINGS } from "@/lib/domain/constants";
import { makePhrase, makeProgress } from "../fixtures/phrases";
import { resetTestDatabase, seedPhrases } from "../fixtures/db";

describe("booster repository contracts", () => {
  beforeEach(resetTestDatabase);

  it("uses the current line limit and does not create formal review state", async () => {
    const phrases = Array.from({ length: 6 }, (_, index) =>
      makePhrase("fixed", `booster fixture ${index}`),
    );
    await seedPhrases(phrases);
    await db.cardProgress.bulkPut(
      phrases.map((phrase, index) =>
        makeProgress(phrase, {
          state: "incubating",
          day0Rating: "know",
          provisionalGrade: index < 2 ? "D" : "C",
          calibrationDueOn: "2027-01-01",
        }),
      ),
    );

    const plan = await ensureBoosterReviewPlan(
      "fixed",
      "2026-01-01",
      { ...DEFAULT_SETTINGS, fixedNewLimit: 3 },
    );
    expect(plan.kind).toBe("booster");
    expect(plan.phraseIds).toHaveLength(3);
    expect(await db.reviewStates.count()).toBe(0);
  });
});
