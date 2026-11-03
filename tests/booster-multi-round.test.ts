import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/data/db";
import {
  ensureBoosterReviewPlan,
  ensureReviewPlan,
  getTodayData,
} from "@/lib/data/repositories";
import { DEFAULT_SETTINGS } from "@/lib/domain/constants";
import { addDays } from "@/lib/domain/date";
import { createCardProgress } from "@/lib/domain/learning-flow";
import { createInitialReviewState } from "@/lib/domain/scheduler";
import { importPhrases } from "@/lib/import/importer";
import { normalizeImportJson } from "@/lib/import/normalize";

const source = JSON.stringify({
  metadata: { role: "fixed_collocation_library" },
  phrases: Array.from({ length: 12 }, (_, index) => ({
    phrase: `practice phrase ${index}`,
    meaning: `释义 ${index}`,
    example: `This is practice example ${index}.`,
    exampleZh: `这是练习例句 ${index}。`,
  })),
});

describe("multiple booster rounds", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await importPhrases(normalizeImportJson(source, "multi-booster.json"));
    const phrases = await db.phrases.toArray();
    await db.cardProgress.bulkPut(
      phrases.map((phrase, index) => ({
        ...createCardProgress(phrase, "2026-01-01"),
        state: "incubating",
        day0Rating: index % 3 === 0 ? "unknown" : "know",
        provisionalGrade:
          index < 3 ? "D" : index < 6 ? "C" : index < 9 ? "B" : "A",
        calibrationDueOn: "2027-01-01",
      })),
    );
  });

  it("covers the learned set before repeating the first booster batch", async () => {
    const settings = { ...DEFAULT_SETTINGS, fixedNewLimit: 4 };
    const days = ["2026-01-01", "2026-01-02", "2026-01-03"];
    const batches: string[][] = [];

    for (const [index, day] of days.entries()) {
      const plan = await ensureBoosterReviewPlan("fixed", day, settings);
      const ids = [...plan.phraseIds];
      batches.push(ids);
      for (const id of ids) {
        const progress = await db.cardProgress.get(id);
        if (progress) {
          await db.cardProgress.put({
            ...progress,
            lastBoosterAt: (index + 1) * 100,
            updatedAt: (index + 1) * 100,
          });
        }
      }
    }

    expect(batches[0]).toHaveLength(4);
    expect(batches[1]).toHaveLength(4);
    expect(batches[2]).toHaveLength(4);
    expect(new Set(batches.flat()).size).toBe(12);

    const fourth = await ensureBoosterReviewPlan(
      "fixed",
      "2026-01-04",
      settings,
    );
    expect(new Set(fourth.phraseIds)).toEqual(new Set(batches[0]));
  });

  it("keeps all learned cards rotating evenly across 30 booster days", async () => {
    const settings = { ...DEFAULT_SETTINGS, fixedNewLimit: 4 };
    const counts = new Map<string, number>();

    for (let dayIndex = 0; dayIndex < 30; dayIndex += 1) {
      const day = addDays("2026-01-01", dayIndex);
      const plan = await ensureBoosterReviewPlan("fixed", day, settings);
      for (const id of plan.phraseIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        const progress = await db.cardProgress.get(id);
        if (progress) {
          await db.cardProgress.put({
            ...progress,
            lastBoosterAt: dayIndex + 1,
            updatedAt: dayIndex + 1,
          });
        }
      }
    }

    expect(counts.size).toBe(12);
    expect(Math.min(...counts.values())).toBe(10);
    expect(Math.max(...counts.values())).toBe(10);
  });

  it("gives formal due reviews priority over another booster round", async () => {
    const phrases = await db.phrases.toArray();
    await db.cardProgress.bulkPut(
      phrases.map((phrase) => ({
        ...createCardProgress(phrase, "2026-01-01"),
        state: "scheduled",
        confirmedGrade: "B",
        graduatedOn: "2026-01-01",
        calibrationDueOn: undefined,
      })),
    );
    await db.reviewStates.bulkPut(
      phrases.map((phrase, index) => ({
        ...createInitialReviewState(
          phrase.id,
          "fixed",
          "B",
          "2026-01-01",
          index,
        ),
        nextReviewOn: "2026-01-10",
      })),
    );

    const settings = { ...DEFAULT_SETTINGS, fixedNewLimit: 4 };
    const data = (
      await getTodayData(settings, "2026-01-10")
    ).find((item) => item.trackId === "fixed");
    expect(data?.boosterPhrases).toEqual([]);
    expect(data?.duePhrases).toHaveLength(12);

    const scheduled = await ensureReviewPlan(
      "fixed",
      "2026-01-10",
      settings,
    );
    const requested = await ensureBoosterReviewPlan(
      "fixed",
      "2026-01-10",
      settings,
    );
    expect(scheduled.kind).toBe("scheduled");
    expect(requested.id).toBe(scheduled.id);
    expect(requested.phraseIds).toEqual(scheduled.phraseIds);
  });

  it("archives an unfinished prior booster without repeating completed cards", async () => {
    const settings = { ...DEFAULT_SETTINGS, fixedNewLimit: 4 };
    const dayOne = await ensureBoosterReviewPlan(
      "fixed",
      "2026-01-01",
      settings,
    );
    const completedId = dayOne.phraseIds[0];
    const progress = await db.cardProgress.get(completedId);
    if (progress) {
      await db.cardProgress.put({
        ...progress,
        lastBoosterAt: 1,
        updatedAt: 1,
      });
    }

    const dayTwo = await ensureBoosterReviewPlan(
      "fixed",
      "2026-01-02",
      settings,
    );
    const archived = await db.reviewPlans.get(dayOne.id);
    expect(archived?.status).toBe("completed");
    expect(dayTwo.status).toBe("active");
    expect(dayTwo.phraseIds).not.toContain(completedId);
  });

  it("does not start a booster while unseen new words still exist", async () => {
    const phrase = (await db.phrases.toArray())[0];
    await db.cardProgress.delete(phrase.id);

    const plan = await ensureBoosterReviewPlan(
      "fixed",
      "2026-01-01",
      { ...DEFAULT_SETTINGS, fixedNewLimit: 4 },
    );
    expect(plan.phraseIds).toEqual([]);
    expect(plan.kind).toBe("scheduled");
    const data = (
      await getTodayData(
        { ...DEFAULT_SETTINGS, fixedNewLimit: 4 },
        "2026-01-01",
      )
    ).find((item) => item.trackId === "fixed");
    expect(data?.boosterPhrases).toEqual([]);
    expect(data?.newPhrases.map((item) => item.id)).toContain(phrase.id);
  });
});
