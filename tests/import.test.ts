import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/data/db";
import { importPhrases, inspectExistingPreview } from "@/lib/import/importer";
import { normalizeImportJson } from "@/lib/import/normalize";

function fixture(exampleZh = "每个人都参加了讨论。") {
  return JSON.stringify({
    schemaVersion: "phrase-app-audit-2.0",
    metadata: { role: "fixed_collocation_library" },
    phrases: [
      {
        id: 1,
        phrase: "take part in",
        meaning: "参与；参加",
        senses: [
          { meaning: "参与；参加", note: "primary", primary: true },
          { meaning: "加入；参与", note: "secondary" },
        ],
        example: "Everyone took part in the discussion.",
        exampleZh,
        quizExample: "Most students took part in the science fair.",
        quizExampleZh: "quiz translation",
        category: "高频",
        entryType: "固定短语",
        supportsCloze: true,
        synonym_details: [
          {
            phrase: "join in",
            usage: "更口语化",
            example: "Come and join in.",
          },
        ],
      },
    ],
  });
}

describe("JSON import", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("normalizes the legacy audit format", () => {
    const preview = normalizeImportJson(fixture(), "fixed.json");
    expect(preview.trackId).toBe("fixed");
    expect(preview.phrases).toHaveLength(1);
    expect(preview.phrases[0].quizExampleEn).toContain("science fair");
    expect(preview.phrases[0].quizExampleZh).toBe("quiz translation");
    expect(preview.phrases[0].senses).toHaveLength(2);
    expect(preview.phrases[0].senses?.[0].primary).toBe(true);
    expect(preview.phrases[0].senses?.[1].meaning).toContain("加入");
    expect(preview.phrases[0].exampleZh).toBe("每个人都参加了讨论。");
    expect(preview.phrases[0].synonyms[0].phrase).toBe("join in");
  });

  it("is idempotent and preserves learning progress on updates", async () => {
    const first = normalizeImportJson(fixture(), "fixed.json");
    const firstResult = await importPhrases(first);
    expect(firstResult.added).toBe(1);

    await db.cardProgress.put({
      id: first.phrases[0].id,
      phraseId: first.phrases[0].id,
      trackId: "fixed",
      state: "incubating",
      skills: {
        recognition: "fragile",
        production: "unseen",
        usage: "unseen",
        pattern: "unseen",
      },
      firstLearnedOn: "2026-01-01",
      calibrationDueOn: "2026-01-02",
      createdAt: 1,
      updatedAt: 1,
    });

    const repeated = await importPhrases(
      normalizeImportJson(fixture(), "fixed.json"),
    );
    expect(repeated.skipped).toBe(1);
    expect(await db.phrases.count()).toBe(1);

    const updatedPreview = normalizeImportJson(
      fixture("每个人都参与了这场讨论。"),
      "fixed.json",
    );
    const previewCounts = await inspectExistingPreview(updatedPreview);
    expect(previewCounts.updated).toBe(1);
    await importPhrases(updatedPreview);
    expect((await db.phrases.get(first.phrases[0].id))?.exampleZh).toBe(
      "每个人都参与了这场讨论。",
    );
    expect(await db.cardProgress.count()).toBe(1);
  });

  it("updates quiz examples without resetting learning progress", async () => {
    const first = normalizeImportJson(fixture(), "fixed.json");
    await importPhrases(first);
    await db.cardProgress.put({
      id: first.phrases[0].id,
      phraseId: first.phrases[0].id,
      trackId: "fixed",
      state: "scheduled",
      skills: {
        recognition: "stable",
        production: "stable",
        usage: "stable",
        pattern: "stable",
      },
      firstLearnedOn: "2026-01-01",
      createdAt: 1,
      updatedAt: 1,
    });

    const nextDocument = JSON.parse(fixture());
    nextDocument.phrases[0].quizExampleZh = "updated quiz translation";
    const updated = normalizeImportJson(
      JSON.stringify(nextDocument),
      "fixed.json",
    );
    expect((await inspectExistingPreview(updated)).updated).toBe(1);
    await importPhrases(updated);
    expect((await db.phrases.get(first.phrases[0].id))?.quizExampleZh).toBe(
      "updated quiz translation",
    );
    expect((await db.cardProgress.get(first.phrases[0].id))?.state).toBe(
      "scheduled",
    );
  });
});
