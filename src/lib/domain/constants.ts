import type {
  AppSettings,
  ExerciseMode,
  Grade,
  Skill,
  TrackId,
} from "./types";

export interface TrackDefinition {
  id: TrackId;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  colorSoft: string;
  defaultNewLimit: number;
  defaultReviewLimit: number;
  requiredSkills: Skill[];
}

export const TRACKS: Record<TrackId, TrackDefinition> = {
  fixed: {
    id: "fixed",
    label: "固定搭配",
    shortLabel: "搭配",
    description: "词组、介词和固定表达",
    color: "#315bdc",
    colorSoft: "#e9edfb",
    defaultNewLimit: 6,
    defaultReviewLimit: 25,
    requiredSkills: ["recognition", "production", "usage"],
  },
  "verb-pattern": {
    id: "verb-pattern",
    label: "动词句型",
    shortLabel: "句型",
    description: "补语、介词与非谓语结构",
    color: "#a65d43",
    colorSoft: "#f4e8e0",
    defaultNewLimit: 4,
    defaultReviewLimit: 25,
    requiredSkills: ["recognition", "pattern"],
  },
};

export const TRACK_LIST = [TRACKS.fixed, TRACKS["verb-pattern"]];

export const GRADE_ORDER: Grade[] = ["D", "C", "B", "A", "S"];

export const INITIAL_INTERVALS: Record<Grade, number> = {
  S: 4,
  A: 2,
  B: 1,
  C: 1,
  D: 1,
};

export const INITIAL_EASE: Record<Grade, number> = {
  S: 3,
  A: 2.7,
  B: 2.5,
  C: 2.3,
  D: 2,
};

export const GRADE_PRIORITY: Record<Grade, number> = {
  D: 100,
  C: 80,
  B: 60,
  A: 40,
  S: 20,
};

export const DEFAULT_EXERCISE_MODES: Record<TrackId, ExerciseMode[]> = {
  fixed: ["recognition", "production", "cloze"],
  "verb-pattern": ["recognition", "production", "patternChoice"],
};

export const DEFAULT_SETTINGS: AppSettings = {
  fixedNewLimit: 6,
  verbNewLimit: 4,
  totalNewLimit: 10,
  fixedReviewLimit: 25,
  verbReviewLimit: 25,
  totalReviewLimit: 50,
};
