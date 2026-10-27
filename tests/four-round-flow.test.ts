import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/domain/constants";
import { createInitialReviewState, reviewUrgency } from "@/lib/domain/scheduler";
import { db } from "@/lib/data/db";
import {
  ensureCalibrationPlan,
  ensureLearningSession,
  getCalibrationPlan,
  getCalibrationQueue,
  getLearningGateQueue,
  recordCalibrationAnswer,
  recordLearningGateAnswer,
  setDay0Rating,
} from "@/lib/data/repositories";
import { importPhrases } from "@/lib/import/importer";
import { normalizeImportJson } from "@/lib/import/normalize";

const source = JSON.stringify({
  metadata: { role: "fixed_collocation_library" },
  phrases: [
    {
      phrase: "take part in",
      meaning: "参与；参加",
      example: "Everyone took part in the discussion.",
      exampleZh: "每个人都参与了讨论。",
      supportsCloze: true,
    },
  ],
});

describe("day 0 four gates", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await importPhrases(normalizeImportJson(source, "one.json"));
  });

  it("requires meaning, production, application and exit before incubation", async () => {
    const session = await ensureLearningSession(
      "fixed",
      "2026-01-01",
      DEFAULT_SETTINGS,
      () => 0.3,
    );
    expect(session).not.toBeNull();
    const phraseId = session!.phraseIds[0];
    await setDay0Rating(phraseId, "know");

    const types = {
      meaning: "meaning",
      production: "spelling",
      application: "contextChoice",
      exit: "phraseChoice",
    } as const;
    const skills = {
      meaning: "recognition",
      spelling: "production",
      contextChoice: "usage",
      phraseChoice: "recognition",
    } as const;

    for (const gate of ["meaning", "production", "application", "exit"] as const) {
      const queue = await getLearningGateQueue(session!);
      expect(queue).toHaveLength(1);
      const type = types[gate];
      const result = await recordLearningGateAnswer(
        session!.id,
        phraseId,
        gate,
        type,
        skills[type],
        true,
        "answer",
        "answer",
        100,
      );
      expect(result.session.currentRound).toBe(
        gate === "exit" ? 4 : (["meaning", "production", "application"].indexOf(gate) + 2),
      );
    }

    const progress = await db.cardProgress.get(phraseId);
    expect(progress?.state).toBe("incubating");
    expect(Object.keys(progress?.day0Gates ?? {})).toHaveLength(4);
  });
});

describe("day 1 four calibration rounds", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await importPhrases(normalizeImportJson(source, "one.json"));
  });

  it("graduates only after all four rounds", async () => {
    const session = await ensureLearningSession(
      "fixed",
      "2026-01-01",
      DEFAULT_SETTINGS,
      () => 0.3,
    );
    const phraseId = session!.phraseIds[0];
    await setDay0Rating(phraseId, "know");
    const gateData = {
      meaning: { type: "meaning", skill: "recognition" },
      production: { type: "spelling", skill: "production" },
      application: { type: "contextChoice", skill: "usage" },
      exit: { type: "phraseChoice", skill: "recognition" },
    } as const;
    for (const [gate, data] of Object.entries(gateData) as [
      keyof typeof gateData,
      { type: "meaning" | "spelling" | "contextChoice" | "phraseChoice"; skill: "recognition" | "production" | "usage" | "pattern" },
    ][]) {
      await recordLearningGateAnswer(
        session!.id,
        phraseId,
        gate,
        data.type,
        data.skill,
        true,
        "answer",
        "answer",
        100,
      );
    }
    await db.cardProgress.update(phraseId, { calibrationDueOn: "2026-01-02" });

    let plan = await ensureCalibrationPlan(
      "fixed",
      "2026-01-02",
      DEFAULT_SETTINGS,
    );
    for (let round = 1; round <= 4; round += 1) {
      const queue = await getCalibrationQueue(plan);
      expect(queue).toHaveLength(1);
      const item = queue[0];
      const result = await recordCalibrationAnswer(
        plan.id,
        phraseId,
        item.questionType,
        item.questionType === "meaning"
          ? "recognition"
          : item.questionType === "spelling"
            ? "production"
            : item.questionType === "phraseChoice"
              ? "pattern"
              : "usage",
        true,
        "answer",
        "answer",
        100,
      );
      plan = result.plan;
    }
    plan = (await getCalibrationPlan("fixed", "2026-01-02"))!;
    expect(plan.status).toBe("completed");
    expect((await db.reviewStates.get(phraseId))?.grade).toBe("S");
    expect((await db.cardProgress.get(phraseId))?.state).toBe("scheduled");
  });
});

describe("fair review urgency", () => {
  it("lets an older high-grade card outrank a newer risky card", () => {
    const oldS = {
      ...createInitialReviewState("fixed:old", "fixed", "S", "2026-01-01", 1),
      nextReviewOn: "2026-01-02",
    };
    const newD = {
      ...createInitialReviewState("fixed:new", "fixed", "D", "2026-01-03", 1),
      nextReviewOn: "2026-01-03",
    };
    expect(reviewUrgency(oldS, "2026-01-04")).toBeGreaterThan(
      reviewUrgency(newD, "2026-01-04"),
    );
  });
});
