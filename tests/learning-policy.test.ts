import { describe, expect, it } from "vitest";
import {
  isPreviewRecognized,
  meaningRecallRequirement,
  previewRecognitionRequirement,
} from "@/lib/domain/learning-policy";
import type { CardProgress } from "@/lib/domain/types";

describe("adaptive learning policy", () => {
  it("sets preview targets from the initial rating", () => {
    expect(previewRecognitionRequirement("know")).toBe(2);
    expect(previewRecognitionRequirement("vague")).toBe(3);
    expect(previewRecognitionRequirement("unknown")).toBe(4);
  });

  it("sets meaning-recall targets from the initial rating", () => {
    expect(meaningRecallRequirement("know")).toBe(1);
    expect(meaningRecallRequirement("vague")).toBe(2);
    expect(meaningRecallRequirement("unknown")).toBe(3);
    expect(meaningRecallRequirement(undefined)).toBe(1);
  });

  it("completes preview only when the stored recognition target is reached", () => {
    const base = {
      previewRequiredCount: 3,
      previewRecognizedCount: 2,
    } as CardProgress;
    expect(isPreviewRecognized(base)).toBe(false);
    expect(
      isPreviewRecognized({
        ...base,
        previewRecognizedCount: 3,
      }),
    ).toBe(true);
  });
});
