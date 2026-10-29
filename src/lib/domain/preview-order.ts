import { seededShuffle } from "./text";

export interface PreviewOrderCandidate {
  id: string;
  hasInitialRating: boolean;
  recognizedCount: number;
}

function cohortOrder(ids: string[], seed: string): string[] {
  const cohortKey = [...ids].sort().join("\u0000");
  return seededShuffle(ids, `${seed}:cohort:${cohortKey}`);
}

function shuffleRecognitionRound(ids: string[], seed: string, count: number) {
  const ordered = cohortOrder(ids, seed);
  if (ordered.length < 2) return ordered;
  const offset = count % ordered.length;
  return [...ordered.slice(offset), ...ordered.slice(0, offset)];
}

export function orderPreviewCandidates(
  candidates: PreviewOrderCandidate[],
  seed: string,
): string[] {
  const unratedIds = candidates
    .filter((item) => !item.hasInitialRating)
    .map((item) => item.id);
  const ratedByCount = new Map<number, string[]>();

  for (const item of candidates) {
    if (!item.hasInitialRating) continue;
    const group = ratedByCount.get(item.recognizedCount) ?? [];
    group.push(item.id);
    ratedByCount.set(item.recognizedCount, group);
  }

  const ordered = cohortOrder(unratedIds, seed);
  const counts = [...ratedByCount.keys()].sort((left, right) => left - right);
  for (const count of counts) {
    ordered.push(
      ...shuffleRecognitionRound(
        ratedByCount.get(count) ?? [],
        seed,
        count,
      ),
    );
  }
  return ordered;
}
