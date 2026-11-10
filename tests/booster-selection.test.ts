import { describe, expect, it } from "vitest";
import { selectBoosterCandidates } from "@/lib/domain/booster-selection";

describe("booster candidate selection", () => {
  it("prioritizes weaker grades before easier cards", () => {
    const selected = selectBoosterCandidates(
      [
        {
          phraseId: "easy",
          grade: "S",
          mistakeCount: 0,
          lapses: 0,
        },
        {
          phraseId: "weak",
          grade: "D",
          mistakeCount: 0,
          lapses: 0,
        },
        {
          phraseId: "middle",
          grade: "B",
          mistakeCount: 0,
          lapses: 0,
        },
      ],
      2,
      "risk",
    );

    expect(selected).toEqual(["weak", "middle"]);
  });

  it("orders the current booster round by first-round weakness", () => {
    const selected = selectBoosterCandidates(
      [
        {
          phraseId: "strong-first-round",
          grade: "A",
          mistakeCount: 0,
          lapses: 0,
          firstRoundWeaknessScore: 20,
        },
        {
          phraseId: "weak-first-round",
          grade: "D",
          mistakeCount: 0,
          lapses: 0,
          firstRoundWeaknessScore: 80,
        },
      ],
      1,
      "coverage",
    );

    expect(selected).toEqual(["weak-first-round"]);
  });

  it("starts the next cycle with the cards practiced longest ago", () => {
    const selected = selectBoosterCandidates(
      [
        {
          phraseId: "recent",
          grade: "C",
          mistakeCount: 1,
          lapses: 0,
          lastBoosterAt: 300,
        },
        {
          phraseId: "mistake-heavy",
          grade: "C",
          mistakeCount: 3,
          lapses: 1,
          lastBoosterAt: 100,
        },
        {
          phraseId: "oldest",
          grade: "C",
          mistakeCount: 1,
          lapses: 0,
          lastBoosterAt: 50,
        },
      ],
      3,
      "rotation",
      3,
    );

    expect(selected).toEqual(["oldest", "mistake-heavy", "recent"]);
  });

  it("returns booster failures before clean cards in the next cycle", () => {
    const selected = selectBoosterCandidates(
      [
        {
          phraseId: "clean-recent",
          grade: "B",
          mistakeCount: 0,
          lapses: 0,
          lastBoosterAt: 300,
          boosterMistakeCount: 0,
        },
        {
          phraseId: "failed-older",
          grade: "B",
          mistakeCount: 0,
          lapses: 0,
          lastBoosterAt: 100,
          boosterMistakeCount: 2,
        },
        {
          phraseId: "clean-oldest",
          grade: "B",
          mistakeCount: 0,
          lapses: 0,
          lastBoosterAt: 50,
          boosterMistakeCount: 0,
        },
      ],
      3,
      "booster-failures",
      3,
    );

    expect(selected).toEqual([
      "failed-older",
      "clean-oldest",
      "clean-recent",
    ]);
  });

  it("uses mistakes to order cards practiced at the same time", () => {
    const selected = selectBoosterCandidates(
      [
        {
          phraseId: "recent-allowed",
          grade: "C",
          mistakeCount: 1,
          lapses: 0,
          lastBoosterAt: 100,
        },
        {
          phraseId: "mistake-heavy",
          grade: "C",
          mistakeCount: 4,
          lapses: 1,
          lastBoosterAt: 100,
        },
      ],
      2,
      "mistakes",
    );

    expect(selected[0]).toBe("mistake-heavy");
  });

  it("returns no cards for a zero limit", () => {
    expect(
      selectBoosterCandidates(
        [
          {
            phraseId: "card",
            grade: "D",
            mistakeCount: 0,
            lapses: 0,
          },
        ],
        0,
        "zero",
      ),
    ).toEqual([]);
  });
});
