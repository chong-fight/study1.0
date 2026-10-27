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
  exampleVariant?: number;
  senseIndex?: number;
}

const QUESTION_SKILL: Record<QuestionType, Skill> = {
  meaning: "recognition",
  phraseChoice: "pattern",
  contextChoice: "usage",
  senseChoice: "usage",
  spelling: "production",
  cloze: "usage",
};

const IRREGULAR_VERB_FORMS: Record<string, readonly string[]> = {
  arise: ["arose", "arisen"],
  be: ["am", "is", "are", "was", "were", "been", "being"],
  bear: ["bore", "borne", "born"],
  beat: ["beat", "beaten"],
  become: ["became"],
  begin: ["began", "begun"],
  bite: ["bit", "bitten"],
  break: ["broke", "broken"],
  bring: ["brought"],
  build: ["built"],
  buy: ["bought"],
  catch: ["caught"],
  choose: ["chose", "chosen"],
  come: ["came"],
  deal: ["dealt"],
  do: ["did", "done"],
  draw: ["drew", "drawn"],
  drink: ["drank", "drunk"],
  drive: ["drove", "driven"],
  eat: ["ate", "eaten"],
  fall: ["fell", "fallen"],
  feel: ["felt"],
  fight: ["fought"],
  find: ["found"],
  fly: ["flew", "flown"],
  forgive: ["forgave", "forgiven"],
  forget: ["forgot", "forgotten"],
  get: ["got", "gotten"],
  give: ["gave", "given"],
  go: ["went", "gone"],
  grow: ["grew", "grown"],
  hang: ["hung"],
  have: ["has", "had"],
  hear: ["heard"],
  hold: ["held"],
  keep: ["kept"],
  know: ["knew", "known"],
  lay: ["laid"],
  lead: ["led"],
  leave: ["left"],
  lend: ["lent"],
  lose: ["lost"],
  make: ["made"],
  mean: ["meant"],
  meet: ["met"],
  pay: ["paid"],
  put: ["put"],
  read: ["read"],
  ride: ["rode", "ridden"],
  ring: ["rang", "rung"],
  rise: ["rose", "risen"],
  run: ["ran"],
  say: ["said"],
  see: ["saw", "seen"],
  sell: ["sold"],
  send: ["sent"],
  set: ["set"],
  shake: ["shook", "shaken"],
  show: ["showed", "shown"],
  sing: ["sang", "sung"],
  sit: ["sat"],
  sleep: ["slept"],
  speak: ["spoke", "spoken"],
  spend: ["spent"],
  stand: ["stood"],
  steal: ["stole", "stolen"],
  stick: ["stuck"],
  strike: ["struck", "stricken"],
  take: ["took", "taken"],
  teach: ["taught"],
  tell: ["told"],
  think: ["thought"],
  throw: ["threw", "thrown"],
  understand: ["understood"],
  wear: ["wore", "worn"],
  win: ["won"],
  write: ["wrote", "written"],
};

export function canUseCloze(phrase: Phrase): boolean {
  return (
    phrase.supportsCloze &&
    Boolean(phrase.exampleEn) &&
    phrase.exampleEn.toLowerCase().includes(phrase.phrase.toLowerCase())
  );
}

export function buildContextPrompt(
  phrase: Phrase,
  variantIndex?: number,
): string | null {
  const example = contextExample(phrase, variantIndex).exampleEn.trim();
  if (!example) return null;

  const pattern = contextPattern(phrase.phrase);
  if (pattern) {
    const match = example.match(pattern);
    if (match?.index !== undefined) {
      return replaceWithBlank(example, match.index, match.index + match[0].length);
    }
  }

  const headPattern = headWordPattern(phrase.phrase);
  if (headPattern) {
    const match = example.match(headPattern);
    if (match?.index !== undefined) {
      return replaceWithBlank(example, match.index, match.index + match[0].length);
    }
  }

  return null;
}

export function contextExample(phrase: Phrase, variantIndex?: number) {
  const variants = phrase.exampleVariants ?? [];
  const selected =
    variantIndex !== undefined && variants[variantIndex]
      ? variants[variantIndex]
      : undefined;
  return {
    exampleEn:
      selected?.exampleEn ||
      phrase.quizExampleEn ||
      phrase.exampleEn,
    exampleZh:
      selected?.exampleZh ||
      phrase.quizExampleZh ||
      phrase.exampleZh,
  };
}

export function chooseExampleVariant(
  phrase: Phrase,
  progress?: CardProgress,
): number {
  const total = Math.max(1, phrase.exampleVariants?.length ?? 2);
  const allowed = (
    phrase.primaryExampleIndexes?.length
      ? phrase.primaryExampleIndexes
      : Array.from({ length: total }, (_, index) => index)
  ).filter((index) => index >= 0 && index < total);
  if (allowed.length <= 1) return allowed[0] ?? 0;
  const candidatesWithCounts = allowed.map((index) => ({
    count: progress?.exampleUseCounts?.[index] ?? 0,
    index,
  }));
  const minimum = Math.min(
    ...candidatesWithCounts.map((item) => item.count),
  );
  const candidates = candidatesWithCounts
    .filter(
      (item) =>
        item.count === minimum &&
        item.index !== progress?.lastExampleIndex,
    )
    .map((item) => item.index);
  const fallback = candidatesWithCounts
    .filter((item) => item.count === minimum)
    .map((item) => item.index);
  const pool = candidates.length > 0 ? candidates : fallback;
  return pool[0] ?? 0;
}

export function chooseSenseIndex(
  phrase: Phrase,
  progress?: CardProgress,
  allowedIndexes?: readonly number[],
): number | undefined {
  const senses = phrase.senses ?? [];
  const allowed = (
    allowedIndexes ??
    senses
      .map((sense, index) => ({ sense, index }))
      .filter((item) => !item.sense.primary)
      .map((item) => item.index)
  ).filter((index) => index > 0 && index < senses.length);
  if (allowed.length === 0) return undefined;
  const candidates = allowed.map((index) => ({
    index,
    count: progress?.senseUseCounts?.[index] ?? 0,
  }));
  const minimum = Math.min(...candidates.map((item) => item.count));
  const preferred = candidates.filter(
    (item) =>
      item.count === minimum &&
      item.index !== progress?.lastSenseIndex,
  );
  const fallback = candidates.filter((item) => item.count === minimum);
  return (preferred[0] ?? fallback[0])?.index;
}

export function canUseContextChoice(phrase: Phrase): boolean {
  return buildContextPrompt(phrase) !== null;
}

export function availableQuestionTypes(phrase: Phrase): QuestionType[] {
  const types: QuestionType[] = ["meaning", "phraseChoice", "spelling"];
  if (canUseContextChoice(phrase)) types.push("contextChoice");
  if (canUseCloze(phrase)) types.push("cloze");
  if ((phrase.senses?.length ?? 0) > 1) types.push("senseChoice");
  return types;
}

export const CALIBRATION_QUESTION_ORDER: QuestionType[] = [
  "meaning",
  "phraseChoice",
  "contextChoice",
  "spelling",
];

export const MAX_REVIEW_CORRECTION_ROUNDS = 3;

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
      const pair = [preferred, second];
      if (
        (phrase.senses?.length ?? 0) > 1 &&
        !pair.includes("senseChoice")
      ) {
        pair[1] = "senseChoice";
      }
      return pair;
    }
  }

  const shuffled = [...available].sort(() => random() - 0.5);
  const selected = shuffled.slice(0, Math.min(2, shuffled.length));
  if (
    (phrase.senses?.length ?? 0) > 1 &&
    !selected.includes("senseChoice")
  ) {
    selected[selected.length - 1] = "senseChoice";
  }
  return selected;
}

export function buildReviewAttemptTypes(
  phrase: Phrase,
  progress: CardProgress | undefined,
  random = Math.random,
): QuestionType[] {
  return chooseReviewTypes(phrase, progress, random).flatMap(
    (questionType) =>
      questionType === "spelling"
        ? (["spelling", "spelling", "spelling"] as QuestionType[])
        : [questionType],
  );
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
  variantIndex?: number,
  senseIndex?: number,
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

  if (type === "senseChoice") {
    const senses = phrase.senses ?? [];
    const selectedIndex =
      senseIndex !== undefined && senses[senseIndex]
        ? senseIndex
        : Math.max(
            1,
            senses.findIndex((sense) => !sense.primary),
          );
    const sense = senses[selectedIndex] ?? senses[0];
    return {
      type,
      skill: QUESTION_SKILL[type],
      prompt:
        sense?.exampleEn ||
        phrase.exampleEn,
      expected: sense?.meaning ?? phrase.meaning,
      options: [
        ...new Set([
          sense?.meaning ?? phrase.meaning,
          ...senses.map((item) => item.meaning),
          ...distractors,
        ]),
      ].slice(0, 4),
      senseIndex: selectedIndex,
    };
  }

  if (type === "contextChoice") {
    const prompt = buildContextPrompt(phrase, variantIndex);
    if (!prompt) {
      return buildQuestion("phraseChoice", phrase, distractors);
    }
    return {
      type,
      skill: QUESTION_SKILL[type],
      prompt,
      expected: phrase.phrase,
      options: [...new Set([phrase.phrase, ...distractors])].slice(0, 4),
      exampleVariant: variantIndex,
    };
  }

  if (type === "cloze") {
    const context = contextExample(phrase, variantIndex);
    return {
      type,
      skill: QUESTION_SKILL[type],
      prompt: context.exampleEn.replace(
        new RegExp(escapeRegExp(phrase.phrase), "i"),
        "______",
      ),
      expected: phrase.phrase,
      options: [...new Set([phrase.phrase, ...distractors])].slice(0, 4),
      exampleVariant: variantIndex,
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
  if (question.type === "meaning" || question.type === "senseChoice") {
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

function contextPattern(phrase: string): RegExp | null {
  const primaryForm = phrase.split(/\s+\/\s+/)[0];
  if (/can'?t help but/i.test(primaryForm)) {
    return new RegExp(
      "(?:can't|cannot|couldn't|could not)\\s+help\\s+but\\s+[A-Za-z]+(?:\\s+[A-Za-z][A-Za-z'’-]*){0,10}",
      "i",
    );
  }
  const tokens = primaryForm
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z]+|[^a-z.]+$/g, ""))
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const parts: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];

    if (token === "be") {
      parts.push("(?:be|am|is|are|was|were|been|being)");
      continue;
    }
    if (token === "can't" || token === "cant") {
      parts.push("(?:can't|cannot|couldn't|could not|cant|couldnt)");
      continue;
    }
    if (token === "sb" || token === "sb.") {
      parts.push("[A-Za-z][A-Za-z'’-]*(?:\\s+[A-Za-z][A-Za-z'’-]*){0,3}");
      continue;
    }
    if (token === "doing") {
      parts.push("[A-Za-z]+ing(?:\\s+[A-Za-z][A-Za-z'’-]*){0,8}");
      continue;
    }
    if (token === "to" && (next === "do" || next === "doing")) {
      const tail = next === "doing" ? "[A-Za-z]+ing" : "[A-Za-z]+";
      parts.push(`to\\s+${tail}(?:\\s+[A-Za-z][A-Za-z'’-]*){0,8}`);
      index += 1;
      if (tokens[index + 1] === "sth" || tokens[index + 1] === "sth.") {
        index += 1;
      }
      continue;
    }
    if (token === "do" || token === "sth" || token === "sth.") {
      parts.push("[A-Za-z][A-Za-z'’-]*(?:\\s+[A-Za-z][A-Za-z'’-]*){0,8}");
      continue;
    }

    const cleaned = token.replace(/\./g, "");
    const isFirstContentWord =
      index === 0 || tokens.slice(0, index).every((item) => item === "be");
    parts.push(
      isFirstContentWord
        ? verbWordPattern(cleaned)
        : escapeRegExp(cleaned),
    );
  }

  return new RegExp(`\\b${parts.join("\\s+")}\\b`, "i");
}

function headWordPattern(phrase: string): RegExp | null {
  const head = phrase
    .split(/\s+/)
    .map((token) => token.toLowerCase().replace(/[^a-z]/g, ""))
    .find((token) => token && token !== "be" && token !== "to");
  if (!head) return null;
  return new RegExp(`\\b${verbWordPattern(head)}\\b`, "i");
}

function verbWordPattern(word: string): string {
  const forms = new Set<string>([
    word,
    ...(IRREGULAR_VERB_FORMS[word] ?? []),
  ]);
  if (/[^aeiou]y$/i.test(word)) {
    forms.add(`${word.slice(0, -1)}ies`);
    forms.add(`${word.slice(0, -1)}ied`);
    forms.add(`${word}ing`);
  } else if (/e$/i.test(word)) {
    forms.add(`${word}s`);
    forms.add(`${word}d`);
    forms.add(`${word.slice(0, -1)}ing`);
  } else {
    forms.add(`${word}s`);
    forms.add(`${word}es`);
    forms.add(`${word}ed`);
    forms.add(`${word}ing`);
    if (
      word.length >= 3 &&
      /[^aeiou][aeiou][bdgklmnprt]$/i.test(word)
    ) {
      forms.add(`${word}${word.at(-1)}ed`);
      forms.add(`${word}${word.at(-1)}ing`);
    }
  }
  return `(?:${[...forms].map(escapeRegExp).join("|")})`;
}

function replaceWithBlank(value: string, start: number, end: number): string {
  return `${value.slice(0, start)}______${value.slice(end)}`;
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
