import { isDue } from "@/lib/domain/date";import type { CalibrationPlan, CardProgress, ReviewPlan, ReviewState } from "@/lib/domain/types";

export function nextBoosterRound(
  progresses: readonly CardProgress[],
): number {
  const completed = progresses.map(
    (progress) => progress.boosterCompletedRounds ?? 0,
  );
  if (completed.length === 0) return 2;
  return Math.max(2, Math.min(...completed) + 1);
}

export function hasBlockingFormalWorkSnapshot(
  states: readonly ReviewState[],
  progresses: readonly CardProgress[],
  plans: readonly ReviewPlan[],
  calibrationPlans: readonly CalibrationPlan[],
  today: string,
): boolean {
  const dueReview = states.some((item) =>
    isDue(item.nextReviewOn, today),
  );
  const dueCalibration = progresses.some(
    (item) =>
      item.state === "incubating" &&
      item.calibrationDueOn &&
      isDue(item.calibrationDueOn, today),
  );
  const activeCalibration = calibrationPlans.some(
    (plan) =>
      plan.status === "active" &&
      plan.phraseIds.length > 0,
  );
  const activeFormalPlan = plans.some(
    (plan) =>
      plan.kind !== "booster" &&
      (plan.status === "active" || plan.deferredPhraseIds.length > 0),
  );
  return dueReview || dueCalibration || activeCalibration || activeFormalPlan;
}
