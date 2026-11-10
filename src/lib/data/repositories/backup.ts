import { db } from "@/lib/data/db";import type { AppSettings, CalibrationPlan, CardProgress, LearningSession, Phrase, ReviewLog, ReviewPlan, ReviewState } from "@/lib/domain/types";

export interface BackupPayload {
  schemaVersion: string;
  exportedAt: string;
  settings?: Partial<AppSettings>;
  data: {
    phrases?: Phrase[];
    learningSessions?: LearningSession[];
    cardProgress?: CardProgress[];
    calibrationPlans?: CalibrationPlan[];
    reviewStates?: ReviewState[];
    reviewPlans?: ReviewPlan[];
    reviewLogs?: ReviewLog[];
  };
}

export async function restoreBackup(payload: BackupPayload): Promise<void> {
  if (payload.schemaVersion !== "phrase-memory-backup-3.0") {
    throw new Error("备份版本不受支持");
  }
  const data = payload.data;
  if (
    !Array.isArray(data.phrases) ||
    !Array.isArray(data.learningSessions) ||
    !Array.isArray(data.cardProgress) ||
    !Array.isArray(data.reviewStates) ||
    !Array.isArray(data.reviewPlans) ||
    !Array.isArray(data.reviewLogs)
  ) {
    throw new Error("备份结构不完整");
  }

  await db.transaction(
    "rw",
    [
      db.phrases,
      db.learningSessions,
      db.cardProgress,
      db.calibrationPlans,
      db.reviewStates,
      db.reviewPlans,
      db.reviewLogs,
    ],
    async () => {
      await Promise.all([
        db.phrases.clear(),
        db.learningSessions.clear(),
        db.cardProgress.clear(),
        db.calibrationPlans.clear(),
        db.reviewStates.clear(),
        db.reviewPlans.clear(),
        db.reviewLogs.clear(),
      ]);
      await db.phrases.bulkPut(data.phrases ?? []);
      await db.learningSessions.bulkPut(data.learningSessions ?? []);
      await db.cardProgress.bulkPut(data.cardProgress ?? []);
      await db.calibrationPlans.bulkPut(data.calibrationPlans ?? []);
      await db.reviewStates.bulkPut(data.reviewStates ?? []);
      await db.reviewPlans.bulkPut(data.reviewPlans ?? []);
      await db.reviewLogs.bulkPut(data.reviewLogs ?? []);
    },
  );
}
