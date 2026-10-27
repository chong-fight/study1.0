import Dexie, { type EntityTable } from "dexie";
import type {
  CalibrationPlan,
  CardProgress,
  ImportJob,
  LearningSession,
  Phrase,
  ReviewLog,
  ReviewPlan,
  ReviewState,
} from "@/lib/domain/types";

class PhraseMemoryDB extends Dexie {
  phrases!: EntityTable<Phrase, "id">;
  learningSessions!: EntityTable<LearningSession, "id">;
  cardProgress!: EntityTable<CardProgress, "id">;
  reviewStates!: EntityTable<ReviewState, "phraseId">;
  reviewPlans!: EntityTable<ReviewPlan, "id">;
  calibrationPlans!: EntityTable<CalibrationPlan, "id">;
  reviewLogs!: EntityTable<ReviewLog, "id">;
  importJobs!: EntityTable<ImportJob, "id">;

  constructor() {
    super("PhraseMemory2");

    this.version(1).stores({
      phrases:
        "&id, &contentKey, trackId, normalizedPhrase, category, entryType, priority, archived, updatedAt",
      learningSessions: "&id, date, trackId, status",
      cardProgress:
        "&id, phraseId, trackId, state, calibrationDueOn, graduatedOn",
      reviewStates:
        "&phraseId, trackId, nextReviewOn, grade, lastReviewAt, [trackId+nextReviewOn]",
      reviewPlans: "&id, date, trackId, status, updatedAt",
      reviewLogs:
        "++id, phraseId, trackId, planId, dateKey, timestamp, correct",
      importJobs: "++id, importedAt, trackId",
    });

    this.version(2).stores({
      phrases:
        "&id, &contentKey, trackId, normalizedPhrase, category, entryType, priority, archived, updatedAt",
      learningSessions: "&id, date, trackId, status",
      cardProgress:
        "&id, phraseId, trackId, state, calibrationDueOn, graduatedOn",
      reviewStates:
        "&phraseId, trackId, nextReviewOn, grade, lastReviewAt, [trackId+nextReviewOn]",
      reviewPlans: "&id, date, trackId, status, updatedAt",
      calibrationPlans: "&id, date, trackId, status, currentRound",
      reviewLogs:
        "++id, phraseId, trackId, planId, dateKey, timestamp, correct",
      importJobs: "++id, importedAt, trackId",
    });
  }
}

export const db = new PhraseMemoryDB();
