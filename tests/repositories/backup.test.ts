import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/data/db";
import {
  restoreBackup,
  type BackupPayload,
} from "@/lib/data/repositories";
import { makePhrase } from "../fixtures/phrases";
import { resetTestDatabase } from "../fixtures/db";

describe("backup repository contracts", () => {
  beforeEach(resetTestDatabase);

  it("keeps the versioned payload and restores the complete data set", async () => {
    const phrase = makePhrase("fixed", "backup fixture");
    const payload: BackupPayload = {
      schemaVersion: "phrase-memory-backup-3.0",
      exportedAt: "2026-01-01T00:00:00.000Z",
      data: {
        phrases: [phrase],
        learningSessions: [],
        cardProgress: [],
        calibrationPlans: [],
        reviewStates: [],
        reviewPlans: [],
        reviewLogs: [],
      },
    };
    await restoreBackup(payload);
    expect(await db.phrases.toArray()).toEqual([phrase]);
    expect(await db.cardProgress.count()).toBe(0);
  });
});
