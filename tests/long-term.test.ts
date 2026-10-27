import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/data/db";
import { addDays } from "@/lib/domain/date";
import {
  ensureCalibrationPlan,
  ensureLearningSession,
  ensureReviewPlan,
  saveDay0Result,
} from "@/lib/data/repositories";
import { normalizeImportJson } from "@/lib/import/normalize";
import { importPhrases } from "@/lib/import/importer";
import { DEFAULT_SETTINGS } from "@/lib/domain/constants";

describe("long-term data behavior", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("creates only one learning session per local date and track", async () => {
    const source = JSON.stringify({
      metadata: { role: "fixed_collocation_library" },
      phrases: Array.from({ length: 20 }).map((_, index) => ({
        phrase: `test phrase ${index}`,
        meaning: `测试短语 ${index}`,
        example: `This is test phrase ${index}.`,
      })),
    });
    await importPhrases(normalizeImportJson(source, "large.json"));

    const first = await ensureLearningSession(
      "fixed",
      "2026-01-01",
      DEFAULT_SETTINGS,
      () => 0.5,
    );
    const second = await ensureLearningSession(
      "fixed",
      "2026-01-01",
      DEFAULT_SETTINGS,
      () => 0.5,
    );
    expect(first?.id).toBe("2026-01-01:fixed");
    expect(second?.id).toBe(first?.id);
    expect(await db.learningSessions.count()).toBe(1);
    expect((await db.cardProgress.toArray()).every((item) => item.state === "day0")).toBe(
      true,
    );
  });

  it("keeps date keys monotonic for a year of future reviews", () => {
    let date = "2026-01-01";
    for (let index = 0; index < 365; index += 1) {
      const next = addDays(date, index % 3 === 0 ? 1 : 4);
      expect(next > date).toBe(true);
      date = next;
    }
  });

  it("keeps incubating cards out of the regular review plan", async () => {
    const source = JSON.stringify({
      metadata: { role: "fixed_collocation_library" },
      phrases: [
        {
          phrase: "take part in",
          meaning: "参与；参加",
          example: "Everyone took part in the discussion.",
          supportsCloze: true,
        },
      ],
    });
    await importPhrases(normalizeImportJson(source, "one.json"));
    const session = await ensureLearningSession(
      "fixed",
      "2026-01-01",
      DEFAULT_SETTINGS,
      () => 0.2,
    );
    expect(session).not.toBeNull();
    const phraseId = session!.phraseIds[0];
    await saveDay0Result(session!, phraseId, {
      rating: "unknown",
      firstCorrect: false,
      corrected: false,
      exitCorrect: false,
    }, new Date(2026, 0, 1, 12).getTime());

    const reviewPlan = await ensureReviewPlan(
      "fixed",
      "2026-01-02",
      DEFAULT_SETTINGS,
    );
    const calibrationPlan = await ensureCalibrationPlan(
      "fixed",
      "2026-01-02",
      DEFAULT_SETTINGS,
    );

    expect(reviewPlan.phraseIds).toEqual([]);
    expect(calibrationPlan.phraseIds).toEqual([phraseId]);
  });
});
