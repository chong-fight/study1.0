import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/domain/constants";
import { addDays } from "@/lib/domain/date";
import {
  createInitialReviewState,
  compareReviewPriority,
  updateReviewSchedule,
} from "@/lib/domain/scheduler";
import { db } from "@/lib/data/db";
import {
  ensureLearningSession,
  ensureReviewPlan,
} from "@/lib/data/repositories";
import { importPhrases } from "@/lib/import/importer";
import { normalizeImportJson } from "@/lib/import/normalize";

function source(phrases: { phrase: string; meaning: string }[]) {
  return JSON.stringify({
    metadata: { role: "fixed_collocation_library" },
    phrases: phrases.map((item) => ({
      ...item,
      example: `${item.phrase} example.`,
    })),
  });
}

describe("review backlog fairness", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("prioritizes an older overdue S card over a newer D card", async () => {
    await importPhrases(
      normalizeImportJson(
        source([
          { phrase: "old strong", meaning: "旧强卡" },
          { phrase: "new difficult", meaning: "新难卡" },
        ]),
        "fair.json",
      ),
    );
    const phrases = await db.phrases.toArray();
    const oldCard = phrases.find((item) => item.phrase === "old strong")!;
    const newCard = phrases.find((item) => item.phrase === "new difficult")!;
    await db.reviewStates.put({
      ...createInitialReviewState(oldCard.id, "fixed", "S", "2026-01-01", 1),
      nextReviewOn: "2026-01-02",
    });
    await db.reviewStates.put({
      ...createInitialReviewState(newCard.id, "fixed", "D", "2026-01-03", 1),
      nextReviewOn: "2026-01-03",
    });

    const plan = await ensureReviewPlan(
      "fixed",
      "2026-01-04",
      { ...DEFAULT_SETTINGS, fixedReviewLimit: 1, totalReviewLimit: 1 },
    );
    expect(plan.phraseIds).toEqual([oldCard.id]);
    expect((await db.reviewStates.get(newCard.id))?.deferralCount).toBe(1);
  });

  it("pauses new learning when the review backlog reaches capacity", async () => {
    await importPhrases(
      normalizeImportJson(
        source([{ phrase: "new phrase", meaning: "新短语" }]),
        "new.json",
      ),
    );
    const states = Array.from({ length: 50 }).map((_, index) => ({
      ...createInitialReviewState(
        `fixed:due-${index}`,
        "fixed",
        "B",
        "2026-01-01",
        index,
      ),
      nextReviewOn: "2026-01-02",
    }));
    await db.reviewStates.bulkPut(states);

    const session = await ensureLearningSession(
      "fixed",
      "2026-01-02",
      { ...DEFAULT_SETTINGS, totalReviewLimit: 50 },
      () => 0.5,
    );
    expect(session).toBeNull();
  });

  it("uses unused capacity from the other track instead of wasting review slots", async () => {
    await importPhrases(
      normalizeImportJson(
        source(
          Array.from({ length: 100 }).map((_, index) => ({
            phrase: `shared phrase ${index}`,
            meaning: `shared meaning ${index}`,
          })),
        ),
        "shared-capacity.json",
      ),
    );
    const phrases = await db.phrases.toArray();
    const states = phrases.map((phrase, index) => ({
      ...createInitialReviewState(
        phrase.id,
        "fixed",
        "B",
        "2026-01-01",
        index,
      ),
      nextReviewOn: "2026-01-02",
    }));
    await db.reviewStates.bulkPut(states);

    const plan = await ensureReviewPlan(
      "fixed",
      "2026-01-02",
      {
        ...DEFAULT_SETTINGS,
        fixedReviewLimit: 25,
        verbReviewLimit: 25,
        totalReviewLimit: 50,
      },
    );
    expect(plan.phraseIds).toHaveLength(50);
  });

  it("clears an 89-card due spike within two 50-card review days", () => {
    const cards = Array.from({ length: 89 }).map((_, index) => ({
      ...createInitialReviewState(
        `fixed:spike-${index}`,
        "fixed",
        index % 2 === 0 ? "S" : "D",
        "2026-01-01",
        index,
      ),
      nextReviewOn: "2026-01-02",
      everReviewed: false,
    }));

    for (const date of ["2026-01-02", "2026-01-03"]) {
      const due = cards.filter((card) => card.nextReviewOn <= date);
      const selected = due
        .sort(
          (left, right) => compareReviewPriority(left, right, date),
        )
        .slice(0, 50);
      for (const card of selected) {
        card.everReviewed = true;
        Object.assign(
          card,
          updateReviewSchedule(card, 4, date, Date.parse(`${date}T12:00:00`)),
        );
      }
    }

    expect(cards.every((card) => card.everReviewed)).toBe(true);
  });

  it("gives all 926 simultaneously due cards a bounded first review", () => {
    const cards = Array.from({ length: 926 }).map((_, index) => ({
      ...createInitialReviewState(
        `fixed:full-deck-${index}`,
        "fixed",
        index % 2 === 0 ? "B" : "C",
        "2026-01-01",
        index,
      ),
      nextReviewOn: "2026-01-02",
      firstReviewed: false,
    }));
    let date = "2026-01-02";

    for (let day = 0; day < 19; day += 1) {
      const due = cards
        .filter((card) => card.nextReviewOn <= date)
        .sort((left, right) => compareReviewPriority(left, right, date))
        .slice(0, 50);
      for (const card of due) {
        card.firstReviewed = true;
        Object.assign(
          card,
          updateReviewSchedule(card, 4, date, day + 1),
        );
      }
      date = addDays(date, 1);
    }

    expect(cards.every((card) => card.firstReviewed)).toBe(true);
  });
});
