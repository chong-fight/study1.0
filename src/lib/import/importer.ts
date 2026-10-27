import { db } from "@/lib/data/db";
import { getAllPhrases } from "@/lib/data/repositories";
import type { Phrase } from "@/lib/domain/types";
import type { ImportPreview } from "./schema";

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  jobId: number;
}

export async function inspectExistingPreview(preview: ImportPreview) {
  const existing = await getAllPhrases(preview.trackId);
  const existingById = new Map(existing.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const phrase of preview.phrases) {
    const current = existingById.get(phrase.id);
    if (!current) added += 1;
    else if (sameContent(current, phrase)) unchanged += 1;
    else updated += 1;
  }
  return { added, updated, unchanged, total: preview.phrases.length };
}

export async function importPhrases(preview: ImportPreview): Promise<ImportResult> {
  if (preview.errors.length > 0) {
    throw new Error("导入文件仍有错误，请修复后重试");
  }
  if (preview.phrases.length === 0) {
    throw new Error("导入文件中没有可用的短语");
  }

  return db.transaction(
    "rw",
    [db.phrases, db.importJobs],
    async () => {
      let added = 0;
      let updated = 0;
      let skipped = 0;
      const now = Date.now();

      for (const phrase of preview.phrases) {
        const current = await db.phrases.get(phrase.id);
        if (!current) {
          await db.phrases.add(phrase);
          added += 1;
          continue;
        }
        if (sameContent(current, phrase)) {
          skipped += 1;
          continue;
        }
        await db.phrases.put({
          ...current,
          ...phrase,
          createdAt: current.createdAt,
          archived: current.archived,
          updatedAt: now,
        });
        updated += 1;
      }

      const jobId = await db.importJobs.add({
        sourceName: preview.sourceName,
        trackId: preview.trackId,
        detectedSchema: preview.schemaVersion,
        importedAt: now,
        added,
        updated,
        skipped,
      });

      return { added, updated, skipped, jobId: jobId! };
    },
  );
}

function sameContent(left: Phrase, right: Phrase): boolean {
  return JSON.stringify(stableFields(left)) === JSON.stringify(stableFields(right));
}

function stableFields(phrase: Phrase) {
  return {
    phrase: phrase.phrase,
    meaning: phrase.meaning,
    exampleEn: phrase.exampleEn,
    exampleZh: phrase.exampleZh,
    category: phrase.category,
    entryType: phrase.entryType,
    tags: phrase.tags,
    priority: phrase.priority,
    exerciseModes: phrase.exerciseModes,
    supportsCloze: phrase.supportsCloze,
    confusionGroup: phrase.confusionGroup,
    synonyms: phrase.synonyms,
    contentStatus: phrase.contentStatus,
  };
}
