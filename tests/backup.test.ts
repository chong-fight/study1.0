import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/data/db";
import { restoreBackup, type BackupPayload } from "@/lib/data/repositories";
import type { Phrase } from "@/lib/domain/types";

const phrase: Phrase = {
  id: "fixed:restore-test",
  trackId: "fixed",
  contentKey: "fixed:restore test",
  phrase: "restore test",
  normalizedPhrase: "restore test",
  meaning: "恢复测试",
  exampleEn: "This is a restore test.",
  exampleZh: "这是一次恢复测试。",
  entryType: "固定短语",
  category: "测试",
  tags: [],
  priority: 1,
  exerciseModes: ["recognition"],
  supportsCloze: false,
  confusionGroup: "",
  synonyms: [],
  source: "test",
  contentStatus: "complete",
  archived: false,
  createdAt: 1,
  updatedAt: 1,
};

describe("complete backup", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("restores all data atomically and removes current rows", async () => {
    const payload: BackupPayload = {
      schemaVersion: "phrase-memory-backup-3.0",
      exportedAt: "2026-01-01T00:00:00.000Z",
      settings: undefined,
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

    await db.phrases.put({
      ...phrase,
      id: "fixed:current-extra",
      contentKey: "fixed:current extra",
      phrase: "current extra",
    });
    await restoreBackup(payload);

    expect(await db.phrases.toArray()).toEqual([phrase]);
    expect(await db.learningSessions.count()).toBe(0);
    expect(await db.cardProgress.count()).toBe(0);
  });

  it("rejects unsupported or incomplete backups", async () => {
    await expect(
      restoreBackup({
        schemaVersion: "wrong",
        exportedAt: "",
        data: {},
      }),
    ).rejects.toThrow("不受支持");
    await expect(
      restoreBackup({
        schemaVersion: "phrase-memory-backup-3.0",
        exportedAt: "",
        data: { phrases: [] },
      }),
    ).rejects.toThrow("结构不完整");
  });
});
