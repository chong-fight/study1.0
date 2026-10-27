import { isAcceptedMeaning, isAcceptedPhrase } from "./text";
import { TRACKS } from "./constants";
import type {
  CardProgress,
  ExerciseMode,
  Phrase,
  QuestionType,
  Skill,
} from "./types";

export interface ReviewQuestion {
  type: QuestionType;
  skill: Skill;
  prompt: string;
  expected: string;
  options?: string[];
  hint?: string;
}

const QUESTION_SKILL: Record<QuestionType, Skill> = {
  meaning: "recognition",
  phraseChoice: "pattern",
  contextChoice: "usage",
  spelling: "production",
  cloze: "usage",
};

export function canUseCloze(phrase: Phrase): boolean {
  return (
    phrase.supportsCloze &&
    Boolean(phrase.exampleEn) &&
    phrase.exampleEn.toLowerCase().includes(phrase.phrase.toLowerCase())
  );
}

export function availableQuestionTypes(phrase: Phrase): QuestionType[] {
  const types: QuestionType[] = ["meaning", "phraseChoice", "spelling"];
  if (phrase.exampleEn) types.push("contextChoice");
  if (canUseCloze(phrase)) types.push("cloze");
  return types;
}

export const CALIBRATION_QUESTION_ORDER: QuestionType[] = [
  "meaning",
  "phraseChoice",
  "contextChoice",
  "spelling",
];

export function chooseReviewTypes(
  phrase: Phrase,
  progress: CardProgress | undefined,
  random = Math.random,
): QuestionType[] {
  const available = availableQuestionTypes(phrase);
  if (progress) {
    const weakSkills = Object.entries(progress.skills)
      .filter(
        ([skill, state]) =>
          state !== "automatized" &&
          TRACKS[phrase.trackId].requiredSkills.includes(skill as Skill),
      )
      .sort((left, right) => skillRank(left[1]) - skillRank(right[1]))
      .map(([skill]) => skill as Skill);
    const weak = weakSkills[0];
    const preferred = questionForSkill(weak, available);
    if (preferred) {
      const second =
        available.find((type) => type !== preferred) ??
        available[Math.floor(random() * available.length)];
      return [preferred, second];
    }
  }

  const shuffled = [...available].sort(() => random() - 0.5);
  return shuffled.slice(0, Math.min(2, shuffled.length));
}

function questionForSkill(
  skill: Skill | undefined,
  available: readonly QuestionType[],
): QuestionType | undefined {
  if (!skill) return undefined;
  if (skill === "recognition" && available.includes("meaning")) return "meaning";
  if (skill === "production" && available.includes("spelling")) {
    return "spelling";
  }
  if (skill === "pattern" && available.includes("phraseChoice")) {
    return "phraseChoice";
  }
  if (skill === "usage" && available.includes("contextChoice")) {
    return "contextChoice";
  }
  if (skill === "usage" && available.includes("cloze")) return "cloze";
  return undefined;
}

function skillRank(state: string): number {
  return { unseen: 0, fragile: 1, stable: 2, automatized: 3 }[state] ?? 0;
}

export function buildQuestion(
  type: QuestionType,
  phrase: Phrase,
  distractors: readonly string[],
): ReviewQuestion {
  if (type === "spelling") {
    return {
      type,
      skill: QUESTION_SKILL[type],
      prompt: phrase.meaning,
      expected: phrase.phrase,
      hint: phraseInitialHint(phrase.phrase),
    };
  }

  if (type === "phraseChoice") {
    return {
      type,
      skill:
        phrase.trackId === "verb-pattern" ? "pattern" : "recognition",
      prompt: phrase.meaning,
      expected: phrase.phrase,
      options: [...new Set([phrase.phrase, ...distractors])].slice(0, 4),
    };
  }

  if (type === "contextChoice") {
    return {
      type,
      skill: QUESTION_SKILL[type],
      prompt: phrase.exampleEn,
      expected: phrase.phrase,
      options: [...new Set([phrase.phrase, ...distractors])].slice(0, 4),
    };
  }

  if (type === "cloze") {
    return {
      type,
      skill: QUESTION_SKILL[type],
      prompt: phrase.exampleEn.replace(
        new RegExp(escapeRegExp(phrase.phrase), "i"),
        "______",
      ),
      expected: phrase.phrase,
      options: [...new Set([phrase.phrase, ...distractors])].slice(0, 4),
    };
  }

  return {
    type,
    skill: QUESTION_SKILL[type],
    prompt: phrase.phrase,
    expected: phrase.meaning,
  };
}

export function checkAnswer(
  question: ReviewQuestion,
  answer: string,
): boolean {
  if (question.type === "meaning") {
    return isAcceptedMeaning(answer, question.expected);
  }
  return isAcceptedPhrase(answer, question.expected);
}

export function modeSupportsQuestion(
  mode: ExerciseMode,
  questionType: QuestionType,
): boolean {
  if (questionType === "meaning") return mode === "recognition";
  if (questionType === "spelling") {
    return mode === "production" || mode === "structureTransform";
  }
  return mode === "cloze" || mode === "patternChoice";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function phraseInitialHint(phrase: string): string {
  return phrase
    .split(/\s+/)
    .map((word) => {
      const match = word.match(/[A-Za-z]/);
      return match ? `${match[0]}…` : word;
    })
    .join(" ");
}
