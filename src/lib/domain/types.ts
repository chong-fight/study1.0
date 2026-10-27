export type TrackId = "fixed" | "verb-pattern";

export type Rating = "know" | "vague" | "unknown";
export type Grade = "S" | "A" | "B" | "C" | "D";
export type Skill = "recognition" | "production" | "usage" | "pattern";
export type SkillState = "unseen" | "fragile" | "stable" | "automatized";
export type ExerciseMode =
  | "recognition"
  | "production"
  | "cloze"
  | "patternChoice"
  | "sentenceJudgement"
  | "structureTransform";

export type QuestionType =
  | "meaning"
  | "phraseChoice"
  | "contextChoice"
  | "spelling"
  | "cloze";
export type ReviewQuality = 0 | 3 | 4 | 5;

export interface Synonym {
  phrase: string;
  usage: string;
  exampleEn?: string;
  exampleZh?: string;
}

export type ContentStatus =
  | "complete"
  | "missingExample"
  | "missingTranslation"
  | "missingCloze"
  | "needsReview";

export interface Phrase {
  id: string;
  trackId: TrackId;
  externalId?: string;
  contentKey: string;
  phrase: string;
  normalizedPhrase: string;
  meaning: string;
  exampleEn: string;
  exampleZh: string;
  entryType: string;
  category: string;
  tags: string[];
  priority: number;
  exerciseModes: ExerciseMode[];
  supportsCloze: boolean;
  confusionGroup: string;
  synonyms: Synonym[];
  source: string;
  contentStatus: ContentStatus;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Day0Signal {
  rating: Rating;
  firstCorrect: boolean;
  corrected: boolean;
  exitCorrect: boolean;
  gates?: {
    meaning: Day0GateResult;
    production: Day0GateResult;
    application: Day0GateResult;
    exit: Day0GateResult;
  };
  completedAt: number;
}

export interface Day0GateResult {
  questionType: QuestionType;
  firstCorrect: boolean;
  finalCorrect: boolean;
  attempts: number;
  lastAttemptAt: number;
}

export type Day0GateName =
  | "meaning"
  | "production"
  | "application"
  | "exit";

export type CardState =
  | "day0"
  | "incubating"
  | "calibrating"
  | "scheduled"
  | "relearning";

export interface CardProgress {
  id: string;
  phraseId: string;
  trackId: TrackId;
  state: CardState;
  day0?: Day0Signal;
  day0Rating?: Rating;
  day0Gates?: Partial<Record<Day0GateName, Day0GateResult>>;
  provisionalGrade?: Grade;
  confirmedGrade?: Grade;
  skills: Record<Skill, SkillState>;
  firstLearnedOn: string;
  calibrationDueOn?: string;
  graduatedOn?: string;
  createdAt: number;
  updatedAt: number;
}

export interface LearningSession {
  id: string;
  date: string;
  trackId: TrackId;
  phraseIds: string[];
  stage: "day0" | "completed";
  currentRound: 1 | 2 | 3 | 4;
  roundPassedIds: Record<"1" | "2" | "3" | "4", string[]>;
  status: "active" | "completed";
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface ReviewState {
  phraseId: string;
  trackId: TrackId;
  grade: Grade;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  successStreak: number;
  failureStreak: number;
  deferralCount: number;
  nextReviewOn: string;
  lastReviewAt: number;
  lastQuality: ReviewQuality;
  mistakeCount: number;
}

export interface ReviewPlan {
  id: string;
  date: string;
  trackId: TrackId;
  phraseIds: string[];
  calibrationIds: string[];
  deferredPhraseIds: string[];
  completedPhraseIds: string[];
  attempts: Record<string, ReviewAttempt>;
  status: "active" | "completed";
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface ReviewAttempt {
  phraseId: string;
  types: QuestionType[];
  answers: {
    questionType: QuestionType;
    skill: Skill;
    correct: boolean;
    answer: string;
    expectedAnswer: string;
    responseTimeMs: number;
  }[];
  startedAt: number;
  finalizedAt?: number;
}

export interface CalibrationPlan {
  id: string;
  date: string;
  trackId: TrackId;
  phraseIds: string[];
  currentRound: 1 | 2 | 3 | 4;
  roundPassedIds: Record<"1" | "2" | "3" | "4", string[]>;
  failedIds: string[];
  results: Record<
    string,
    Partial<
      Record<
        "1" | "2" | "3" | "4",
        {
          firstCorrect: boolean;
          finalCorrect: boolean;
          attempts: number;
          lastAttemptAt: number;
        }
      >
    >
  >;
  status: "active" | "completed";
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface ReviewLog {
  id?: number;
  phraseId: string;
  trackId: TrackId;
  planId: string;
  dateKey: string;
  timestamp: number;
  mode: "learning" | "calibration" | "review";
  questionType: QuestionType;
  skill: Skill;
  correct: boolean;
  answer: string;
  expectedAnswer: string;
  selectedOption?: string;
  quality: ReviewQuality;
  responseTimeMs: number;
}

export interface ImportJob {
  id?: number;
  sourceName: string;
  trackId: TrackId;
  detectedSchema: string;
  importedAt: number;
  added: number;
  updated: number;
  skipped: number;
}

export interface AppSettings {
  fixedNewLimit: number;
  verbNewLimit: number;
  totalNewLimit: number;
  fixedReviewLimit: number;
  verbReviewLimit: number;
  totalReviewLimit: number;
}

export interface CalibrationResult {
  questionType: QuestionType;
  skill: Skill;
  correct: boolean;
}
