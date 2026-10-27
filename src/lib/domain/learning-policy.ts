import type { CardProgress, Rating } from "./types";

export function previewRecognitionRequirement(rating: Rating): number {
  if (rating === "unknown") return 4;
  if (rating === "vague") return 3;
  return 2;
}

export function meaningRecallRequirement(
  rating: Rating | undefined,
): number {
  if (rating === "unknown") return 3;
  if (rating === "vague") return 2;
  return 1;
}

export function isPreviewRecognized(
  progress?: CardProgress,
): boolean {
  const required = progress?.previewRequiredCount ?? 0;
  return required > 0 && (progress?.previewRecognizedCount ?? 0) >= required;
}
