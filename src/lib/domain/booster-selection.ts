import { seededShuffle } from "./text";
import type { Grade, Rating } from "./types";

export interface BoosterCandidate {
  phraseId: string;
  grade?: Grade;
  provisionalGrade?: Grade;
  day0Rating?: Rating;
  mistakeCount: number;
  lapses: number;
  lastReviewAt?: number;
  lastBoosterAt?: number;
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

export function selectBoosterCandidates(
  candidates: readonly BoosterCandidate[],
  limit: number,
  seed: string,
): string[] {
  if (limit <= 0) return [];
  const shuffled = seededShuffle(candidates, seed);
  const shuffledRank = new Map(
    shuffled.map((candidate, index) => [candidate.phraseId, index]),
  );

  return [...candidates]
    .sort((left, right) => {
      const leftPracticed = left.lastBoosterAt !== undefined;
      const rightPracticed = right.lastBoosterAt !== undefined;
      if (leftPracticed !== rightPracticed) {
        return leftPracticed ? 1 : -1;
      }
      if (leftPracticed && rightPracticed) {
        const boosterAgeDifference =
          (left.lastBoosterAt ?? 0) - (right.lastBoosterAt ?? 0);
        if (boosterAgeDifference !== 0) return boosterAgeDifference;
      }
      const riskDifference = candidateRisk(right) - candidateRisk(left);
      if (riskDifference !== 0) return riskDifference;
      const mistakeDifference =
        right.mistakeCount + right.lapses -
        (left.mistakeCount + left.lapses);
      if (mistakeDifference !== 0) return mistakeDifference;
      if (!leftPracticed) {
        const reviewAgeDifference =
          lastPracticedAt(left) - lastPracticedAt(right);
        if (reviewAgeDifference !== 0) return reviewAgeDifference;
      }
      return (
        (shuffledRank.get(left.phraseId) ?? 0) -
        (shuffledRank.get(right.phraseId) ?? 0)
      );
    })
    .slice(0, limit)
    .map((candidate) => candidate.phraseId);
}
