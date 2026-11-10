import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/data/db";
import {
  ensureCalibrationPlan,
  getCalibrationQueue,
  recordCalibrationAnswer,
} from "@/lib/data/repositories";
import { DEFAULT_SETTINGS } from "@/lib/domain/constants";
import { makePhrase, makeProgress } from "../fixtures/phrases";
import { resetTestDatabase, seedPhrases } from "../fixtures/db";

describe("calibration repository contracts", () => {
  beforeEach(resetTestDatabase);

  it("judges D only after three consecutive failures", async () => {
    const phrase = makePhrase("fixed", "calibration streak fixture");
    await seedPhrases([phrase]);
    await db.cardProgress.put(
      makeProgress(phrase, {
        state: "incubating",
        day0Rating: "unknown",
        calibrationDueOn: "2026-01-02",
      }),
    );
    let plan = await ensureCalibrationPlan(
      "fixed",
      "2026-01-02",
      DEFAULT_SETTINGS,
    );

    for (const correct of [false, true, true]) {
      const item = (await getCalibrationQueue(plan))[0];
      plan = (
        await recordCalibrationAnswer(
          plan.id,
          phrase.id,
          item.questionType,
          item.questionType === "meaning" ? "recognition" : "usage",
          correct,
          "answer",
          "answer",
          100,
        )
      ).plan;
    }
    expect(plan.failedIds).not.toContain(phrase.id);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const item = (await getCalibrationQueue(plan))[0];
      plan = (
        await recordCalibrationAnswer(
          plan.id,
          phrase.id,
          item.questionType,
          item.questionType === "meaning" ? "recognition" : "usage",
          false,
          "answer",
          "answer",
          100,
        )
      ).plan;
    }
    expect(plan.failedIds).toContain(phrase.id);
  });
});
