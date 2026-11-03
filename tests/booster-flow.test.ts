import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/data/db";
import {
  ensureBoosterReviewPlan,
  getReviewQueue,
  getTodayData,
  recordReviewAnswer,
  startReviewAttempt,
} from "@/lib/data/repositories";
import { DEFAULT_SETTINGS } from "@/lib/domain/constants";
import { createCardProgress } from "@/lib/domain/learning-flow";
import { importPhrases } from "@/lib/import/importer";
import { normalizeImportJson } from "@/lib/import/normalize";

const source = JSON.stringify({
  metadata: { role: "fixed_collocation_library" },
  phrases: [
    {
      phrase: "look into",
      meaning: "调查",
      example: "We need to look into the cause.",
      exampleZh: "我们需要调查原因。",
    },
  ],
});

describe("second-round booster", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await importPhrases(normalizeImportJson(source, "booster.json"));
  });

  it("offers learned cards when no unseen cards remain", async () => {
    const phrase = (await db.phrases.toArray())[0];
    await db.cardProgress.put({
      ...createCardProgress(phrase, "2026-01-01"),
      state: "incubating",
      day0Rating: "unknown",
      provisionalGrade: "D",
      calibrationDueOn: "2026-01-02",
    });

    const data = await getTodayData(
      { ...DEFAULT_SETTINGS, fixedNewLimit: 4 },
      "2026-01-01",
    );
    expect(data.find((item) => item.trackId === "fixed")?.boosterPhrases).toEqual([
      phrase,
    ]);
  });

  it("records practice without creating or moving the formal review schedule", async () => {
    const phrase = (await db.phrases.toArray())[0];
    await db.cardProgress.put({
      ...createCardProgress(phrase, "2026-01-01"),
      state: "incubating",
      day0Rating: "vague",
      provisionalGrade: "C",
      calibrationDueOn: "2026-01-02",
    });
    let plan = await ensureBoosterReviewPlan(
      "fixed",
      "2026-01-01",
      { ...DEFAULT_SETTINGS, fixedNewLimit: 1 },
    );
    expect(plan.kind).toBe("booster");
    expect(plan.phraseIds).toEqual([phrase.id]);
    const todayData = (
      await getTodayData(
        { ...DEFAULT_SETTINGS, fixedNewLimit: 1 },
        "2026-01-01",
      )
    ).find((item) => item.trackId === "fixed");
    expect(todayData?.boosterPhrases).toEqual([]);
    expect(todayData?.reviewPhrases.map((item) => item.id)).toEqual([
      phrase.id,
    ]);

    for (let attempt = 0; attempt < 20 && plan.status === "active"; attempt += 1) {
      const queue = await getReviewQueue(plan);
      const item = queue[0];
      if (!item) break;
      if (!plan.attempts[item.phrase.id]) {
        plan = await startReviewAttempt(plan.id, item.phrase.id);
      }
      const currentAttempt = plan.attempts[item.phrase.id];
      const questionType = currentAttempt.types[currentAttempt.answers.length];
      if (!questionType) break;
      plan = (
        await recordReviewAnswer(
          plan.id,
          item.phrase.id,
          questionType,
          questionType === "spelling"
            ? "production"
            : questionType === "contextChoice" ||
                questionType === "cloze"
              ? "usage"
              : "recognition",
          true,
          "answer",
          "answer",
          100,
        )
      ).plan;
    }

    expect(plan.status).toBe("completed");
    expect(await db.reviewStates.get(phrase.id)).toBeUndefined();
    expect((await db.cardProgress.get(phrase.id))?.state).toBe("incubating");
    expect((await db.cardProgress.get(phrase.id))?.lastBoosterAt).toBeTypeOf(
      "number",
    );
    expect(
      (await db.reviewLogs.toArray()).every((log) => log.mode === "booster"),
    ).toBe(true);
  });
});
