import { addDays, localDateKey } from "./date";
import { makePhraseId, normalizePhrase, shuffle } from "./text";
import type {
  CardProgress,
  Day0Signal,
  Grade,
  LearningSession,
  Phrase,
  Skill,
  SkillState,
  TrackId,
} from "./types";

const UNSEEN_SKILLS: Record<Skill, SkillState> = {
  recognition: "unseen",
  production: "unseen",
  usage: "unseen",
  pattern: "unseen",
};

export function selectNewPhrases(
  phrases: readonly Phrase[],
  learnedIds: ReadonlySet<string>,
  limit: number,
  usedConfusionGroups: ReadonlySet<string> = new Set(),
  random = Math.random,
): Phrase[] {
  if (limit <= 0) return [];

  const sorted = [...phrases].sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    return left.createdAt - right.createdAt;
  });
  const selected: Phrase[] = [];
  const groups = new Set(usedConfusionGroups);

  for (const phrase of shuffle(sorted, random)) {
    if (selected.length >= limit) break;
    if (learnedIds.has(phrase.id)) continue;
    if (phrase.confusionGroup && groups.has(phrase.confusionGroup)) continue;
    if (selected.some((item) => phrasesConflict(item, phrase))) continue;

    selected.push(phrase);
    if (phrase.confusionGroup) groups.add(phrase.confusionGroup);
  }

  return selected;
}

export function phrasesConflict(left: Phrase, right: Phrase): boolean {
  if (
    left.confusionGroup &&
    right.confusionGroup &&
    left.confusionGroup === right.confusionGroup
  ) {
    return true;
  }

  const leftTerms = new Set([
    normalizePhrase(left.phrase),
    ...left.synonyms.map((item) => normalizePhrase(item.phrase)),
  ]);
  const rightTerms = new Set([
    normalizePhrase(right.phrase),
    ...right.synonyms.map((item) => normalizePhrase(item.phrase)),
  ]);
  return [...leftTerms].some((term) => rightTerms.has(term));
}

export function createLearningSession(
  trackId: TrackId,
  phrases: readonly Phrase[],
  today = localDateKey(),
  now = Date.now(),
): LearningSession {
  return {
    id: `${today}:${trackId}`,
    date: today,
    trackId,
    phraseIds: phrases.map((phrase) => phrase.id),
    stage: "day0",
    currentRound: 1,
    roundPassedIds: { "1": [], "2": [], "3": [], "4": [] },
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

export function createCardProgress(
  phrase: Phrase,
  today = localDateKey(),
  now = Date.now(),
): CardProgress {
  const id = phrase.id || makePhraseId(phrase.trackId, phrase.phrase);

  return {
    id,
    phraseId: id,
    trackId: phrase.trackId,
    state: "day0",
    day0Rating: undefined,
    day0Gates: {},
    skills: { ...UNSEEN_SKILLS },
    firstLearnedOn: today,
    createdAt: now,
    updatedAt: now,
    provisionalGrade: undefined,
    confirmedGrade: undefined,
    calibrationDueOn: undefined,
    day0: undefined,
    graduatedOn: undefined,
  };
}

export function markDay0Complete(
  progress: CardProgress,
  signal: Day0Signal,
  provisionalGrade: Grade,
  today = localDateKey(),
): CardProgress {
  return {
    ...progress,
    state: "incubating",
    day0: signal,
    provisionalGrade,
    calibrationDueOn: addDays(today, 1),
    updatedAt: signal.completedAt,
  };
}

export function day0ExitCorrect(count: number, total: number): boolean {
  return total > 0 && count / total >= 0.6;
}
