import { db } from "@/lib/data/db";
import type { Phrase } from "@/lib/domain/types";

export async function resetTestDatabase(): Promise<void> {
  await db.delete();
  await db.open();
}

export async function seedPhrases(phrases: readonly Phrase[]): Promise<void> {
  await db.phrases.bulkPut([...phrases]);
}
