import { seededShuffle } from "./text";
import type { CardProgress, Grade, Rating } from "./types";

export interface BoosterCandidate {
  phraseId: string;
  grade?: Grade;
  provisionalGrade?: Grade;
  day0Rating?: Rating;
  mistakeCount: number;
  lapses: number;
  lastReviewAt?: number;
  lastBoosterAt?: number;
  boosterMistakeCount?: number;
  firstRoundWeaknessScore?: number;
}

const GRADE_RISK: Record<Grade, number> = {
  D: 50,
  C: 40,
  B: 30,
  A: 20,
  S: 10,
};

const RATING_RISK: Record<Rating, number> = {
  unknown: 35,
  vague: 25,
  know: 15,
};

function candidateRisk(candidate: BoosterCandidate): number {
  if (candidate.grade) return GRADE_RISK[candidate.grade];
  if (candidate.provisionalGrade) {
    return GRADE_RISK[candidate.provisionalGrade];
  }
  if (candidate.day0Rating) return RATING_RISK[candidate.day0Rating];
  return 0;
}

function lastPracticedAt(candidate: BoosterCandidate): number {
  return Math.max(
    candidate.lastReviewAt ?? 0,
    candidate.lastBoosterAt ?? 0,
  );
}

export function calculateFirstRoundWeaknessScore(
  progress: CardProgress,
  grade?: Grade,
): number {
  const resolvedGrade =
    grade ?? progress.confirmedGrade ?? progress.provisionalGrade ?? "D";
  const ratingRisk = progress.day0Rating
    ? RATING_RISK[progress.day0Rating]
    : 15;
  const gateValues = Object.values(progress.day0Gates ?? {});
  const gateErrors = gateValues.reduce(
    (sum, gate) => sum + (gate?.incorrectAttempts ?? 0),
    0,
  );
  const gateRetries = gateValues.reduce(
    (sum, gate) => sum + Math.max(0, (gate?.attempts ?? 1) - 1),
    0,
  );
  const fragileSkills = Object.values(progress.skills).filter(
    (state) => state === "fragile",
  ).length;
  return (
    GRADE_RISK[resolvedGrade] +
    ratingRisk +
    gateErrors * 4 +
    gateRetries * 2 +
    fragileSkills * 5
  );
}

export function selectBoosterCandidates(
  candidates: readonly BoosterCandidate[],
  limit: number,
  seed: string,
  round = 2,
): string[] {
  if (limit <= 0) return [];
  const shuffled = seededShuffle(candidates, seed);
  const shuffledRank = new Map(
    shuffled.map((candidate, index) => [candidate.phraseId, index]),
  );

  return [...candidates]
    .sort((left, right) => {
      if (round >= 3) {
        const boosterMistakeDifference =
          (right.boosterMistakeCount ?? 0) -
          (left.boosterMistakeCount ?? 0);
        if (boosterMistakeDifference !== 0) {
          return boosterMistakeDifference;
        }
      }
      const firstRoundDifference =
        (right.firstRoundWeaknessScore ?? candidateRisk(right)) -
        (left.firstRoundWeaknessScore ?? candidateRisk(left));
      if (firstRoundDifference !== 0) return firstRoundDifference;
      const riskDifference = candidateRisk(right) - candidateRisk(left);
      if (riskDifference !== 0) return riskDifference;
      const boosterAgeDifference =
        (left.lastBoosterAt ?? 0) - (right.lastBoosterAt ?? 0);
      if (boosterAgeDifference !== 0) return boosterAgeDifference;
      const reviewAgeDifference =
        lastPracticedAt(left) - lastPracticedAt(right);
      if (reviewAgeDifference !== 0) return reviewAgeDifference;
      const mistakeDifference =
        right.mistakeCount + right.lapses -
        (left.mistakeCount + left.lapses);
      if (mistakeDifference !== 0) return mistakeDifference;
      return (
        (shuffledRank.get(left.phraseId) ?? 0) -
        (shuffledRank.get(right.phraseId) ?? 0)
      );
    })
    .slice(0, limit)
    .map((candidate) => candidate.phraseId);
}
