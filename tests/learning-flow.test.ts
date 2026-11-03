import { describe, expect, it } from "vitest";
import {
  phrasesConflict,
  selectNewPhrases,
} from "@/lib/domain/learning-flow";
import type { Phrase } from "@/lib/domain/types";

function phrase(
  id: string,
  text: string,
  group = "",
  synonyms: string[] = [],
): Phrase {
  return {
    id,
    trackId: "fixed",
    contentKey: `fixed:${text}`,
    phrase: text,
    normalizedPhrase: text,
    meaning: "测试",
    exampleEn: "",
    exampleZh: "",
    entryType: "固定短语",
    category: "测试",
    tags: [],
    priority: 1,
    exerciseModes: ["recognition", "production"],
    supportsCloze: false,
    confusionGroup: group,
    synonyms: synonyms.map((value) => ({ phrase: value, usage: "" })),
    source: "test",
    contentStatus: "missingExample",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("new learning selection", () => {
  it("does not place direct synonyms or shared confusion groups together", () => {
    const items = [
      phrase("fixed:take-part-in", "take part in", "", ["join in"]),
      phrase("fixed:join-in", "join in", "", ["take part in"]),
      phrase("fixed:a-few", "a few"),
    ];
    const preferred = selectNewPhrases(
      items,
      new Set(),
      2,
      new Set(),
      () => 0,
    );
    const preferredIds = preferred.map((item) => item.id);
    expect(
      preferredIds.includes("fixed:take-part-in") &&
        preferredIds.includes("fixed:join-in"),
    ).toBe(false);
    expect(phrasesConflict(items[0], items[1])).toBe(true);
  });

  it("fills the requested daily limit when conflict avoidance alone is too strict", () => {
    const items = Array.from({ length: 4 }, (_, index) =>
      phrase(
        `fixed:shared-${index}`,
        `shared phrase ${index}`,
        "shared-group",
      ),
    );

    expect(
      selectNewPhrases(items, new Set(), 4, new Set(), () => 0),
    ).toHaveLength(4);
  });

  it("honors a zero daily limit", () => {
    expect(selectNewPhrases([phrase("fixed:test", "test")], new Set(), 0)).toEqual(
      [],
    );
  });

  it("keeps higher-priority phrases ahead while shuffling inside a priority", () => {
    const items = [
      { ...phrase("fixed:p3", "priority three"), priority: 3 },
      { ...phrase("fixed:p1-a", "priority one a"), priority: 1 },
      { ...phrase("fixed:p1-b", "priority one b"), priority: 1 },
    ];
    const selected = selectNewPhrases(items, new Set(), 3, new Set(), () => 0);
    expect(selected.slice(0, 2).every((item) => item.priority === 1)).toBe(true);
    expect(selected[2].priority).toBe(3);
  });
});
