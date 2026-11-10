import { createCardProgress } from "@/lib/domain/learning-flow";
import { createInitialReviewState } from "@/lib/domain/scheduler";
import { makeContentKey, makePhraseId } from "@/lib/domain/text";
import type {
  CardProgress,
  Grade,
  Phrase,
  ReviewState,
  TrackId,
} from "@/lib/domain/types";

export function makePhrase(
  trackId: TrackId,
  phrase: string,
  overrides: Partial<Phrase> = {},
): Phrase {
  const id = makePhraseId(trackId, phrase);
  return {
    id,
    trackId,
    contentKey: makeContentKey(trackId, phrase),
    phrase,
    normalizedPhrase: phrase.toLowerCase(),
    meaning: `${phrase} 的含义`,
    senses: [
      {
        meaning: `${phrase} 的含义`,
        primary: true,
        exampleEn: `This example uses ${phrase}.`,
        exampleZh: `这个例句使用了 ${phrase}。`,
      },
    ],
    exampleEn: `This example uses ${phrase}.`,
    exampleZh: `这个例句使用了 ${phrase}。`,
    quizExampleEn: `Another context contains ${phrase}.`,
    quizExampleZh: `另一个语境包含 ${phrase}。`,
    exampleVariants: [
      {
        exampleEn: `This example uses ${phrase}.`,
        exampleZh: `这个例句使用了 ${phrase}。`,
      },
      {
        exampleEn: `Another context contains ${phrase}.`,
        exampleZh: `另一个语境包含 ${phrase}。`,
      },
    ],
    primaryExampleIndexes: [0, 1],
    entryType: trackId === "fixed" ? "固定短语" : "动词句型",
    category: "测试",
    tags: ["fixture"],
    priority: 1,
    exerciseModes:
      trackId === "fixed"
        ? ["recognition", "production", "cloze"]
        : ["recognition", "production", "patternChoice"],
    supportsCloze: true,
    confusionGroup: "",
    synonyms: [],
    source: "fixed-fixture",
    contentStatus: "complete",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

export function makeProgress(
  phrase: Phrase,
  overrides: Partial<CardProgress> = {},
): CardProgress {
  return {
    ...createCardProgress(phrase, "2026-01-01", 1),
    ...overrides,
  };
}

export function makeReviewState(
  phrase: Phrase,
  grade: Grade = "B",
  nextReviewOn = "2026-01-02",
  overrides: Partial<ReviewState> = {},
): ReviewState {
  return {
    ...createInitialReviewState(
      phrase.id,
      phrase.trackId,
      grade,
      "2026-01-01",
      1,
    ),
    nextReviewOn,
    ...overrides,
  };
}
