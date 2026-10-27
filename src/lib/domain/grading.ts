import { INITIAL_EASE, INITIAL_INTERVALS } from "./constants";
import type {
  CalibrationResult,
  Day0Signal,
  Grade,
  Rating,
} from "./types";

const RATING_COST: Record<Rating, number> = {
  know: 0,
  vague: 1,
  unknown: 2,
};

export function provisionalGradeFromDay0(signal: Day0Signal): Grade {
  if (signal.rating === "know" && signal.firstCorrect && signal.exitCorrect) {
    return "S";
  }
  if (signal.rating !== "unknown" && signal.firstCorrect) {
    return "A";
  }
  if (signal.corrected || signal.firstCorrect) {
    return "C";
  }
  return "D";
}

export function calibrateGrade(
  signal: Day0Signal,
  results: readonly CalibrationResult[],
  allRoundsFinallyCorrect = false,
): Grade {
  if (results.length === 0) return "D";

  const calibrationErrors = results.filter((result) => !result.correct).length;
  const day0Cost =
    RATING_COST[signal.rating] +
    (signal.firstCorrect ? 0 : 1) +
    (signal.exitCorrect ? 0 : 1);

  if (calibrationErrors === 0) {
    if (day0Cost === 0) return "S";
    if (day0Cost <= 2) return "A";
    return "B";
  }

  if (calibrationErrors === 1) {
    return day0Cost <= 1 ? "B" : "C";
  }

  if (allRoundsFinallyCorrect) return "C";
  return "D";
}

export function initialReviewParameters(grade: Grade) {
  return {
    intervalDays: INITIAL_INTERVALS[grade],
    easeFactor: INITIAL_EASE[grade],
  };
}
