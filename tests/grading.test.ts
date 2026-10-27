import { describe, expect, it } from "vitest";
import { calibrateGrade, provisionalGradeFromDay0 } from "@/lib/domain/grading";
import type { CalibrationResult, Day0Signal } from "@/lib/domain/types";

const strongDay0: Day0Signal = {
  rating: "know",
  firstCorrect: true,
  corrected: false,
  exitCorrect: true,
  completedAt: 1,
};

function result(correct: boolean, index = 0): CalibrationResult {
  return {
    questionType: index === 0 ? "meaning" : "spelling",
    skill: index === 0 ? "recognition" : "production",
    correct,
  };
}

describe("day 1 calibration", () => {
  it("awards S only after a strong day 0 and clean calibration", () => {
    expect(provisionalGradeFromDay0(strongDay0)).toBe("S");
    expect(calibrateGrade(strongDay0, [result(true, 0), result(true, 1)])).toBe(
      "S",
    );
  });

  it("lowers the grade when delayed recall is weak", () => {
    const weakDay0 = {
      ...strongDay0,
      rating: "unknown" as const,
      firstCorrect: false,
      corrected: true,
    };
    expect(
      calibrateGrade(weakDay0, [result(true, 0), result(false, 1)]),
    ).toBe("C");
    expect(
      calibrateGrade(weakDay0, [result(false, 0), result(false, 1)]),
    ).toBe("D");
  });

  it("keeps four completed rounds at C when first attempts were weak", () => {
    const weakDay0 = {
      ...strongDay0,
      rating: "unknown" as const,
      firstCorrect: false,
      corrected: true,
    };
    expect(
      calibrateGrade(
        weakDay0,
        [result(false, 0), result(false, 1), result(true, 2), result(true, 3)],
        true,
      ),
    ).toBe("C");
  });
});
