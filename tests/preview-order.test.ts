import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/data/db";
import {
  ensureLearningSession,
  recordLearningPreviewRating,
  recordLearningPreviewRecognition,
} from "@/lib/data/repositories";
import { DEFAULT_SETTINGS } from "@/lib/domain/constants";
import { isPreviewRecognized } from "@/lib/domain/learning-policy";
import { orderPreviewCandidates } from "@/lib/domain/preview-order";
import { importPhrases } from "@/lib/import/importer";
import { normalizeImportJson } from "@/lib/import/normalize";

describe("preview card ordering", () => {
  it("returns an empty queue when there are no preview cards", () => {
    expect(orderPreviewCandidates([], "empty")).toEqual([]);
  });

  it("keeps unrated cards first and orders rated cards by recognition count", () => {
    const ordered = orderPreviewCandidates(
      [
        { id: "two-a", hasInitialRating: true, recognizedCount: 2 },
        { id: "new", hasInitialRating: false, recognizedCount: 0 },
        { id: "zero", hasInitialRating: true, recognizedCount: 0 },
        { id: "two-b", hasInitialRating: true, recognizedCount: 2 },
        { id: "one", hasInitialRating: true, recognizedCount: 1 },
      ],
      "session-1",
    );

    expect(ordered[0]).toBe("new");
    expect(ordered[1]).toBe("zero");
    expect(ordered[2]).toBe("one");
    expect(new Set(ordered.slice(3))).toEqual(new Set(["two-a", "two-b"]));
  });

  it("uses a different shuffle for each recognition round", () => {
    const ids = Array.from({ length: 20 }, (_, index) => `card-${index}`);
    const firstRound = orderPreviewCandidates(
      ids.map((id) => ({
        id,
        hasInitialRating: true,
        recognizedCount: 0,
      })),
      "session-2",
    );
    const secondRound = orderPreviewCandidates(
      ids.map((id) => ({
        id,
        hasInitialRating: true,
        recognizedCount: 1,
      })),
      "session-2",
    );

    expect(firstRound).not.toEqual(secondRound);
  });

  it("never repeats the exact prior order for a small recognition batch", () => {
    const ids = ["thanks to", "up to date", "be excited about"];
    const firstRound = orderPreviewCandidates(
      ids.map((id) => ({
        id,
        hasInitialRating: true,
        recognizedCount: 0,
      })),
      "small-batch",
    );
    const secondRound = orderPreviewCandidates(
      ids.map((id) => ({
        id,
        hasInitialRating: true,
        recognizedCount: 1,
      })),
      "small-batch",
    );

    expect(secondRound).not.toEqual(firstRound);
  });

  it("keeps the same deterministic order when a session is reloaded", () => {
    const candidates = Array.from({ length: 12 }, (_, index) => ({
      id: `stable-${index}`,
      hasInitialRating: false,
      recognizedCount: 0,
    }));

    expect(orderPreviewCandidates(candidates, "stable-session")).toEqual(
      orderPreviewCandidates(candidates, "stable-session"),
    );
  });

  it("moves a reset card back into the earliest recognition group", () => {
    const ordered = orderPreviewCandidates(
      [
        { id: "nearly-passed", hasInitialRating: true, recognizedCount: 3 },
        { id: "reset", hasInitialRating: true, recognizedCount: 0 },
      ],
      "session-3",
    );

    expect(ordered).toEqual(["reset", "nearly-passed"]);
  });
});

describe("direct preview rating", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await importPhrases(
      normalizeImportJson(
        JSON.stringify({
          metadata: { role: "fixed_collocation_library" },
          phrases: [
            {
              phrase: "look into",
              meaning: "调查",
              example: "We need to look into the cause.",
              exampleZh: "我们需要调查原因。",
            },
          ],
        }),
        "preview-direct.json",
      ),
    );
  });

  it("counts a direct know rating without requiring a card flip", async () => {
    const session = await ensureLearningSession(
      "fixed",
      "2026-01-01",
      DEFAULT_SETTINGS,
      () => 0,
    );
    const phraseId = session!.phraseIds[0];

    await recordLearningPreviewRating(session!.id, phraseId, "know");
    let progress = await db.cardProgress.get(phraseId);
    expect(progress?.previewRequiredCount).toBe(2);
    expect(progress?.previewRecognizedCount).toBe(1);
    expect(isPreviewRecognized(progress)).toBe(false);

    await recordLearningPreviewRecognition(session!.id, phraseId, true);
    progress = await db.cardProgress.get(phraseId);
    expect(progress?.previewRecognizedCount).toBe(2);
    expect(isPreviewRecognized(progress)).toBe(true);
  });
});
