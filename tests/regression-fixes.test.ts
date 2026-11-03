import { beforeEach, describe, expect, it } from "vitest";
import {
  ensureBoosterReviewPlan,
  ensureCalibrationPlan,
  getCalibrationQueue,
  getTodayData,
  recordCalibrationAnswer,
} from "@/lib/data/repositories";
import { db } from "@/lib/data/db";
import { DEFAULT_SETTINGS } from "@/lib/domain/constants";
import { createCardProgress } from "@/lib/domain/learning-flow";
import {
  chooseSenseIndex,
  secondarySenseIndexes,
} from "@/lib/domain/review-flow";
import { createInitialReviewState } from "@/lib/domain/scheduler";
import type {
  CalibrationPlan,
  QuestionType,
  TrackId,
} from "@/lib/domain/types";
import { importPhrases } from "@/lib/import/importer";
import { normalizeImportJson } from "@/lib/import/normalize";

const day0 = {
  rating: "know" as const,
  firstCorrect: true,
  corrected: false,
  exitCorrect: true,
  completedAt: 1,
};

function source(
  trackId: TrackId,
  phrases: Array<{
    phrase: string;
    meaning: string;
    senses?: unknown[];
  }>,
) {
  return JSON.stringify({
    metadata: {
      role:
        trackId === "fixed"
          ? "fixed_collocation_library"
          : "verb_usage_library",
    },
    phrases: phrases.map((item) => ({
      ...item,
      example: `${item.phrase} example.`,
      exampleZh: `${item.phrase} translation.`,
    })),
  });
}

async function addCalibrationCard(
  trackId: TrackId,
  phrase: string,
  rating: "know" | "vague" | "unknown" = "know",
) {
  await importPhrases(
    normalizeImportJson(
      source(trackId, [{ phrase, meaning: "meaning" }]),
      "calibration-card.json",
    ),
  );
  const card = (await db.phrases.toArray()).find(
    (item) => item.phrase === phrase,
  )!;
  await db.cardProgress.put({
    ...createCardProgress(card, "2026-01-01"),
    state: "incubating",
    day0: { ...day0, rating },
    day0Rating: rating,
    calibrationDueOn: "2026-01-02",
  });
  return card;
}

async function answerCalibration(
  plan: CalibrationPlan,
  phraseId: string,
  questionType: QuestionType,
  correct: boolean,
  senseIndex?: number,
) {
  return recordCalibrationAnswer(
    plan.id,
    phraseId,
    questionType,
    questionType === "meaning"
      ? "recognition"
      : questionType === "spelling"
        ? "production"
        : "usage",
    correct,
    "answer",
    "answer",
    100,
    undefined,
    senseIndex,
  );
}

describe("audit regression fixes", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("requires every secondary sense in day 1 calibration", async () => {
    await importPhrases(
      normalizeImportJson(
        source("fixed", [
          {
            phrase: "be open to",
            meaning: "primary",
            senses: [
              {
                meaning: "primary",
                primary: true,
                exampleEn: "Primary example.",
                exampleZh: "Primary translation.",
              },
              {
                meaning: "secondary one",
                exampleEn: "Secondary one example.",
                exampleZh: "Secondary one translation.",
              },
              {
                meaning: "secondary two",
                exampleEn: "Secondary two example.",
                exampleZh: "Secondary two translation.",
              },
            ],
          },
        ]),
        "multi-sense-calibration.json",
      ),
    );
    const phrase = (await db.phrases.toArray())[0];
    await db.cardProgress.put({
      ...createCardProgress(phrase, "2026-01-01"),
      state: "incubating",
      day0,
      day0Rating: "know",
      calibrationDueOn: "2026-01-02",
    });
    let plan = await ensureCalibrationPlan("fixed", "2026-01-02");

    plan = (
      await answerCalibration(plan, phrase.id, "meaning", true)
    ).plan;
    plan = (
      await answerCalibration(plan, phrase.id, "phraseChoice", true)
    ).plan;

    const firstSense = (await getCalibrationQueue(plan))[0];
    const firstPass = await answerCalibration(
      plan,
      phrase.id,
      "senseChoice",
      true,
      firstSense.senseIndex,
    );
    plan = firstPass.plan;
    expect(firstPass.passed).toBe(false);
    expect(plan.currentRound).toBe(3);
    const attemptsAfterSense = plan.results[phrase.id]?.["3"]?.attempts;
    const duplicateSense = await answerCalibration(
      plan,
      phrase.id,
      "senseChoice",
      true,
      firstSense.senseIndex,
    );
    expect(duplicateSense.plan.results[phrase.id]?.["3"]?.attempts).toBe(
      attemptsAfterSense,
    );

    const secondSense = (await getCalibrationQueue(plan))[0];
    expect(secondSense.senseIndex).not.toBe(firstSense.senseIndex);
    const secondPass = await answerCalibration(
      plan,
      phrase.id,
      "senseChoice",
      true,
      secondSense.senseIndex,
    );
    plan = secondPass.plan;
    expect(secondPass.passed).toBe(true);
    expect(plan.currentRound).toBe(4);
  });

  it("uses consecutive failures instead of total attempts", async () => {
    const phrase = await addCalibrationCard(
      "fixed",
      "streak phrase",
      "unknown",
    );
    let plan = await ensureCalibrationPlan("fixed", "2026-01-02");

    for (const correct of [false, true, true]) {
      const result = await answerCalibration(
        plan,
        phrase.id,
        "meaning",
        correct,
      );
      plan = result.plan;
      expect(result.failed).toBe(false);
    }
    expect(plan.failedIds).not.toContain(phrase.id);
    expect(plan.results[phrase.id]?.["1"]?.failureStreak).toBe(0);

    for (const correct of [false, false, false]) {
      const result = await answerCalibration(
        plan,
        phrase.id,
        "meaning",
        correct,
      );
      plan = result.plan;
      if (correct) expect(result.failed).toBe(false);
    }
    expect(plan.failedIds).toContain(phrase.id);
  });

  it("penalizes a first error in any secondary sense during grading", async () => {
    await importPhrases(
      normalizeImportJson(
        source("fixed", [
          {
            phrase: "sense grade",
            meaning: "primary",
            senses: [
              {
                meaning: "primary",
                primary: true,
                exampleEn: "Primary example.",
                exampleZh: "Primary translation.",
              },
              {
                meaning: "secondary one",
                exampleEn: "Secondary one example.",
                exampleZh: "Secondary one translation.",
              },
              {
                meaning: "secondary two",
                exampleEn: "Secondary two example.",
                exampleZh: "Secondary two translation.",
              },
            ],
          },
        ]),
        "sense-grade.json",
      ),
    );
    const phrase = (await db.phrases.toArray())[0];
    await db.cardProgress.put({
      ...createCardProgress(phrase, "2026-01-01"),
      state: "incubating",
      day0,
      day0Rating: "know",
      calibrationDueOn: "2026-01-02",
    });
    let plan = await ensureCalibrationPlan("fixed", "2026-01-02");
    plan = (await answerCalibration(plan, phrase.id, "meaning", true)).plan;
    plan = (
      await answerCalibration(plan, phrase.id, "phraseChoice", true)
    ).plan;

    const firstSense = (await getCalibrationQueue(plan))[0];
    plan = (
      await answerCalibration(
        plan,
        phrase.id,
        "senseChoice",
        true,
        firstSense.senseIndex,
      )
    ).plan;
    const secondSense = (await getCalibrationQueue(plan))[0];
    plan = (
      await answerCalibration(
        plan,
        phrase.id,
        "senseChoice",
        false,
        secondSense.senseIndex,
      )
    ).plan;
    plan = (
      await answerCalibration(
        plan,
        phrase.id,
        "senseChoice",
        true,
        secondSense.senseIndex,
      )
    ).plan;
    expect(plan.currentRound).toBe(4);

    for (let index = 0; index < 3; index += 1) {
      plan = (
        await answerCalibration(plan, phrase.id, "spelling", true)
      ).plan;
    }
    expect(plan.status).toBe("completed");
    expect((await db.cardProgress.get(phrase.id))?.confirmedGrade).toBe("B");
  });

  it("handles a primary sense that is not at index zero", async () => {
    await importPhrases(
      normalizeImportJson(
        source("fixed", [
          {
            phrase: "primary later",
            meaning: "primary",
            senses: [
              {
                meaning: "secondary zero",
                exampleEn: "Secondary zero example.",
                exampleZh: "Secondary zero translation.",
              },
              {
                meaning: "primary",
                primary: true,
                exampleEn: "Primary example.",
                exampleZh: "Primary translation.",
              },
              {
                meaning: "secondary two",
                exampleEn: "Secondary two example.",
                exampleZh: "Secondary two translation.",
              },
            ],
          },
        ]),
        "primary-later.json",
      ),
    );
    const phrase = (await db.phrases.toArray())[0];
    expect(secondarySenseIndexes(phrase)).toEqual([0, 2]);
    expect(chooseSenseIndex(phrase)).toBe(0);
  });

  it("reopens an old round 3 pass that has no sense evidence", async () => {
    await importPhrases(
      normalizeImportJson(
        source("fixed", [
          {
            phrase: "legacy sense",
            meaning: "primary",
            senses: [
              {
                meaning: "primary",
                primary: true,
                exampleEn: "Primary example.",
                exampleZh: "Primary translation.",
              },
              {
                meaning: "secondary",
                exampleEn: "Secondary example.",
                exampleZh: "Secondary translation.",
              },
            ],
          },
        ]),
        "legacy-calibration.json",
      ),
    );
    const phrase = (await db.phrases.toArray())[0];
    await db.cardProgress.put({
      ...createCardProgress(phrase, "2026-01-01"),
      state: "incubating",
      day0,
      day0Rating: "know",
      calibrationDueOn: "2026-01-02",
    });
    await db.calibrationPlans.put({
      id: "calibration:2026-01-02:fixed",
      date: "2026-01-02",
      trackId: "fixed",
      phraseIds: [phrase.id],
      currentRound: 3,
      roundPassedIds: {
        "1": [phrase.id],
        "2": [phrase.id],
        "3": [phrase.id],
        "4": [],
      },
      failedIds: [],
      results: {
        [phrase.id]: {
          "1": {
            firstCorrect: true,
            finalCorrect: true,
            attempts: 1,
            lastAttemptAt: 1,
          },
          "2": {
            firstCorrect: true,
            finalCorrect: true,
            attempts: 1,
            lastAttemptAt: 1,
          },
          "3": {
            firstCorrect: true,
            finalCorrect: true,
            attempts: 1,
            lastAttemptAt: 1,
          },
        },
      },
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });

    const plan = await ensureCalibrationPlan("fixed", "2026-01-02");
    expect(plan.roundPassedIds["3"]).toEqual([]);
    expect((await getCalibrationQueue(plan))[0].senseIndex).toBe(1);
  });

  it("blocks boosters when the other track has formal review due", async () => {
    await importPhrases(
      normalizeImportJson(
        source("fixed", [{ phrase: "fixed known", meaning: "fixed" }]),
        "global-booster-fixed.json",
      ),
    );
    await importPhrases(
      normalizeImportJson(
        source("verb-pattern", [{ phrase: "verb due", meaning: "verb" }]),
        "global-booster-verb.json",
      ),
    );
    const cards = await db.phrases.toArray();
    const fixed = cards.find((item) => item.trackId === "fixed")!;
    const verb = cards.find((item) => item.trackId === "verb-pattern")!;
    await db.cardProgress.bulkPut([
      {
        ...createCardProgress(fixed, "2026-01-01"),
        state: "incubating",
        day0,
        day0Rating: "know",
        calibrationDueOn: "2027-01-01",
      },
      {
        ...createCardProgress(verb, "2026-01-01"),
        state: "scheduled",
      },
    ]);
    await db.reviewStates.put({
      ...createInitialReviewState(
        verb.id,
        "verb-pattern",
        "B",
        "2026-01-01",
      ),
      nextReviewOn: "2026-01-02",
    });

    const plan = await ensureBoosterReviewPlan(
      "fixed",
      "2026-01-02",
      DEFAULT_SETTINGS,
    );
    expect(plan.kind).toBe("scheduled");
    expect(plan.phraseIds).toEqual([]);
  });

  it("tracks calibration success and failure as settled today", async () => {
    await importPhrases(
      normalizeImportJson(
        source("fixed", [
          { phrase: "passed card", meaning: "passed" },
          { phrase: "failed card", meaning: "failed" },
        ]),
        "today-settlement.json",
      ),
    );
    const cards = await db.phrases.toArray();
    await db.cardProgress.bulkPut(
      cards.map((card) => ({
        ...createCardProgress(card, "2026-01-01"),
        state: "incubating" as const,
        day0,
        day0Rating: "know" as const,
        calibrationDueOn: "2026-01-02",
      })),
    );
    const plan = await ensureCalibrationPlan("fixed", "2026-01-02");
    const passed = cards[0];
    const failed = cards[1];
    await db.calibrationPlans.put({
      ...plan,
      status: "completed",
      completedAt: Date.now(),
      failedIds: [failed.id],
      roundPassedIds: {
        "1": [],
        "2": [],
        "3": [],
        "4": [],
      },
    });
    await db.cardProgress.update(passed.id, {
      state: "scheduled",
      calibrationDueOn: undefined,
    });
    await db.cardProgress.update(failed.id, {
      state: "incubating",
      calibrationDueOn: "2026-01-03",
    });

    const today = (
      await getTodayData(DEFAULT_SETTINGS, "2026-01-02")
    ).find((item) => item.trackId === "fixed")!;
    expect(today.reviewPhrases.map((item) => item.id)).toEqual([
      passed.id,
      failed.id,
    ]);
    expect(today.reviewCompletedIds).toEqual([passed.id]);
    expect(today.reviewFailedIds).toEqual([failed.id]);
    expect(today.reviewSettledIds).toEqual([passed.id, failed.id]);
    expect(today.reviewPendingIds).toEqual([]);
  });
});
