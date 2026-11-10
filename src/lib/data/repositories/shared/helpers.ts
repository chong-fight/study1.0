import type { LearningSession, Phrase } from "@/lib/domain/types";

export function phraseMap(phrases: readonly Phrase[]): Map<string, Phrase> {
  return new Map(phrases.map((phrase) => [phrase.id, phrase]));
}

export function normalizeLearningSession(
  session: LearningSession,
): LearningSession {
  return {
    ...session,
    previewedPhraseIds: session.previewedPhraseIds ?? [],
    currentRound: session.currentRound ?? 1,
    roundPassedIds: session.roundPassedIds ?? {
      "1": [],
      "2": [],
      "3": [],
      "4": [],
    },
  };
}
