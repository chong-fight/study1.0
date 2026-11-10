import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/data/db";
import { buildReviewAttemptTypes } from "@/lib/domain/review-flow";
import { createCardProgress } from "@/lib/domain/learning-flow";
import { importPhrases } from "@/lib/import/importer";
import { normalizeImportJson } from "@/lib/import/normalize";

describe("spelling target", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("uses two spelling prompts in one formal review attempt", async () => {
    await importPhrases(
      normalizeImportJson(
        JSON.stringify({
          metadata: { role: "fixed_collocation_library" },
          phrases: [
            {
              phrase: "look into",
              meaning: "investigate",
              example: "We need to look into the cause.",
              exampleZh: "translation",
            },
          ],
        }),
        "spelling-target.json",
      ),
    );
    const phrase = (await db.phrases.toArray())[0];
    const progress = {
      ...createCardProgress(phrase, "2026-01-01"),
      skills: {
        recognition: "stable" as const,
        production: "fragile" as const,
        usage: "stable" as const,
        pattern: "stable" as const,
      },
    };

    const types = buildReviewAttemptTypes(phrase, progress);
    expect(types.filter((type) => type === "spelling")).toHaveLength(2);
  });
});
