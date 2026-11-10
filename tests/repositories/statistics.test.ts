import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/data/db";
import { getTodayData } from "@/lib/data/repositories";
import { DEFAULT_SETTINGS } from "@/lib/domain/constants";
import { makePhrase, makeProgress } from "../fixtures/phrases";
import { resetTestDatabase, seedPhrases } from "../fixtures/db";

describe("statistics repository contracts", () => {
  beforeEach(resetTestDatabase);

  it("reports explicit review ID sets without counting a settled card twice", async () => {
    const phrases = [
      makePhrase("fixed", "statistics passed"),
      makePhrase("fixed", "statistics failed"),
    ];
    await seedPhrases(phrases);
    await db.cardProgress.bulkPut(
      phrases.map((phrase) =>
        makeProgress(phrase, {
          state: "incubating",
          day0Rating: "know",
          calibrationDueOn: "2026-01-02",
        }),
      ),
    );

    const today = (
      await getTodayData(DEFAULT_SETTINGS, "2026-01-02")
    ).find((track) => track.trackId === "fixed")!;
    expect(new Set(today.reviewPendingIds).size).toBe(
      today.reviewPendingIds.length,
    );
    expect(
      today.reviewSettledIds.every(
        (id) => !today.reviewPendingIds.includes(id),
      ),
    ).toBe(true);
  });
});
