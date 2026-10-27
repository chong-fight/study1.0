import { GRADE_ORDER, INITIAL_EASE, INITIAL_INTERVALS } from "./constants";
import { addDays, localDateKey } from "./date";
import type { Grade, ReviewQuality, ReviewState, TrackId } from "./types";

const MIN_EASE = 1.3;
const MAX_EASE = 3.5;

export function createInitialReviewState(
  phraseId: string,
  trackId: TrackId,
  grade: Grade,
  today = localDateKey(),
  now = Date.now(),
): ReviewState {
  return {
    phraseId,
    trackId,
    grade,
    easeFactor: INITIAL_EASE[grade],
    intervalDays: INITIAL_INTERVALS[grade],
    repetitions: 0,
    lapses: 0,
    successStreak: 0,
    failureStreak: 0,
    deferralCount: 0,
    nextReviewOn: addDays(today, INITIAL_INTERVALS[grade]),
    lastReviewAt: now,
    lastQuality: 4,
    mistakeCount: 0,
  };
}

export function lowerGrade(grade: Grade): Grade {
  const index = GRADE_ORDER.indexOf(grade);
  return GRADE_ORDER[Math.max(0, index - 1)];
}

export function raiseGrade(grade: Grade): Grade {
  const index = GRADE_ORDER.indexOf(grade);
  return GRADE_ORDER[Math.min(GRADE_ORDER.length - 1, index + 1)];
}

export function updateReviewSchedule(
  current: ReviewState,
  quality: ReviewQuality,
  today = localDateKey(),
  now = Date.now(),
): ReviewState {
  let intervalDays = current.intervalDays;
  let easeFactor = current.easeFactor;
  let repetitions = current.repetitions;
  let lapses = current.lapses;
  let successStreak = current.successStreak;
  let failureStreak = current.failureStreak;
  let grade = current.grade;
  let mistakeCount = current.mistakeCount;

  if (quality < 3) {
    intervalDays = 1;
    easeFactor = Math.max(MIN_EASE, easeFactor - 0.2);
    repetitions = 0;
    lapses += 1;
    mistakeCount += 1;
    successStreak = 0;
    failureStreak += 1;

    if (failureStreak >= 2) {
      grade = lowerGrade(grade);
    }
  } else if (quality === 3) {
    intervalDays = Math.max(
      current.intervalDays + 1,
      Math.round(current.intervalDays * 1.2),
    );
    easeFactor = Math.max(MIN_EASE, easeFactor - 0.05);
    repetitions += 1;
    successStreak = 0;
    failureStreak = 0;
  } else {
    const multiplier =
      quality === 5 ? 1.3 : Math.min(MAX_EASE, Math.max(1.5, easeFactor));
    intervalDays = Math.max(
      current.intervalDays + 1,
      Math.round(current.intervalDays * multiplier),
    );
    easeFactor = Math.min(MAX_EASE, easeFactor + 0.05);
    repetitions += 1;
    successStreak += 1;
    failureStreak = 0;

    if (successStreak >= 2) {
      grade = raiseGrade(grade);
      successStreak = 0;
    }
  }

  return {
    ...current,
    grade,
    intervalDays: Math.max(1, intervalDays),
    easeFactor: Math.round(easeFactor * 100) / 100,
    repetitions,
    lapses,
    successStreak,
    failureStreak,
    nextReviewOn: addDays(today, Math.max(1, intervalDays)),
    lastReviewAt: now,
    lastQuality: quality,
    mistakeCount,
    deferralCount: 0,
  };
}

export function reviewUrgency(
  state: ReviewState,
  today = localDateKey(),
): number {
  const overdueDays = Math.max(
    0,
    Math.round(
      (new Date(`${today}T12:00:00`).getTime() -
        new Date(`${state.nextReviewOn}T12:00:00`).getTime()) /
        86_400_000,
    ),
  );
  const risk: Record<Grade, number> = {
    D: 40,
    C: 30,
    B: 20,
    A: 10,
    S: 0,
  };
  return (
    overdueDays * 100 +
    risk[state.grade] +
    (state.deferralCount ?? 0) * 20 +
    state.mistakeCount
  );
}

export function qualityFromResults(results: readonly boolean[]): ReviewQuality {
  const correct = results.filter(Boolean).length;
  if (correct === results.length && results.length > 0) return 4;
  if (correct > 0) return 3;
  return 0;
}
