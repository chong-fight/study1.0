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
    const selected = selectNewPhrases(
      items,
      new Set(),
      3,
      new Set(),
      () => 0,
    );
    const ids = selected.map((item) => item.id);
    expect(ids.includes("fixed:take-part-in") && ids.includes("fixed:join-in")).toBe(
      false,
    );
    expect(phrasesConflict(items[0], items[1])).toBe(true);
  });

  it("honors a zero daily limit", () => {
    expect(selectNewPhrases([phrase("fixed:test", "test")], new Set(), 0)).toEqual(
      [],
    );
  });
});
