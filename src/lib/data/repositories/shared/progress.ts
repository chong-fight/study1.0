import { calculateFirstRoundWeaknessScore } from "@/lib/domain/booster-selection";import type { CardProgress, Grade } from "@/lib/domain/types";

export function markExampleUsage(
  progress: CardProgress,
  exampleVariant?: number,
): CardProgress {
  if (exampleVariant === undefined) return progress;
  const counts = [...(progress.exampleUseCounts ?? [])];
  while (counts.length <= exampleVariant) counts.push(0);
  counts[exampleVariant] += 1;
  return {
    ...progress,
    exampleUseCounts: counts,
    lastExampleIndex: exampleVariant,
  };
}

export function markSenseUsage(
  progress: CardProgress,
  senseIndex?: number,
): CardProgress {
  if (senseIndex === undefined) return progress;
  const counts = [...(progress.senseUseCounts ?? [])];
  while (counts.length <= senseIndex) counts.push(0);
  counts[senseIndex] += 1;
  return {
    ...progress,
    senseUseCounts: counts,
    lastSenseIndex: senseIndex,
  };
}

export function withFirstRoundWeakness(
  progress: CardProgress,
  grade?: Grade,
): CardProgress {
  return {
    ...progress,
    firstRoundWeaknessScore: calculateFirstRoundWeaknessScore(
      progress,
      grade,
    ),
  };
}
