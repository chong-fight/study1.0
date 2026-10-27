import { DEFAULT_EXERCISE_MODES, TRACKS } from "@/lib/domain/constants";
import {
  makeContentKey,
  makePhraseId,
  normalizeChinese,
  normalizePhrase,
} from "@/lib/domain/text";
import type {
  ContentStatus,
  ExerciseMode,
  MeaningSense,
  Phrase,
  PhraseExample,
  Synonym,
  TrackId,
} from "@/lib/domain/types";
import type {
  ImportIssue,
  ImportPreview,
  RawImportDocument,
  RawPhrase,
  RawSynonym,
} from "./schema";

const ROLE_TO_TRACK: Record<string, TrackId> = {
  fixed_collocation_library: "fixed",
  verb_usage_library: "verb-pattern",
  fixed: "fixed",
  "verb-pattern": "verb-pattern",
};

export function normalizeImportJson(
  text: string,
  sourceName: string,
  forcedTrack?: TrackId,
): ImportPreview {
  let document: RawImportDocument;
  try {
    const parsed = JSON.parse(text) as RawImportDocument | RawPhrase[];
    document = Array.isArray(parsed) ? { phrases: parsed } : parsed;
  } catch {
    return {
      sourceName,
      schemaVersion: "unknown",
      trackId: forcedTrack ?? "fixed",
      phrases: [],
      errors: [
        {
          row: 0,
          message: "文件不是有效的 JSON",
          severity: "error",
        },
      ],
      warnings: [],
      stats: emptyStats(),
    };
  }

  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const schemaVersion =
    typeof document.schemaVersion === "string"
      ? document.schemaVersion
      : "phrase-app-audit-2.0-compatible";
  const rawRows = Array.isArray(document.phrases)
    ? document.phrases
    : Array.isArray(document.items)
      ? document.items
      : [];
  const trackId =
    forcedTrack ??
    detectTrack(document.metadata?.role) ??
    detectTrack(document.metadata?.track) ??
    inferTrackFromRows(rawRows) ??
    "fixed";
  const now = Date.now();
  const phrases: Phrase[] = [];
  const seen = new Map<string, number>();
  let duplicates = 0;
  let missingExamples = 0;
  let missingTranslations = 0;
  let clozeReady = 0;

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 1;
    const phrase = isRecord(raw) ? (raw as RawPhrase) : null;
    if (!phrase) {
      errors.push({
        row: rowNumber,
        message: "该行不是对象",
        severity: "error",
      });
      return;
    }

    const phraseText = stringValue(phrase.phrase).trim();
    const sourceMeaning = stringValue(phrase.meaning).trim();
    if (!phraseText) {
      errors.push({
        row: rowNumber,
        field: "phrase",
        message: "缺少英文短语",
        severity: "error",
      });
      return;
    }
    if (!sourceMeaning) {
      errors.push({
        row: rowNumber,
        field: "meaning",
        message: "缺少中文释义",
        severity: "error",
      });
      return;
    }
    const senses = normalizeMeaningSenses(
      phrase.senses ?? phrase.otherMeanings,
      sourceMeaning,
    );
    const primarySense =
      senses.find((item) => item.primary) ?? senses[0];
    const meaning = primarySense?.meaning || sourceMeaning;

    const id = makePhraseId(trackId, phraseText);
    if (seen.has(id)) {
      duplicates += 1;
      warnings.push({
        row: rowNumber,
        field: "phrase",
        message: `与第 ${seen.get(id)} 行重复，预览中以最后一行为准`,
        severity: "warning",
      });
    }
    seen.set(id, rowNumber);

    const exampleEn = cleanSentence(
      stringValue(phrase.exampleEn) || stringValue(phrase.example),
    );
    const exampleZh = cleanSentence(
      stringValue(phrase.exampleZh) ||
        stringValue(phrase.example_translation),
    );
    const declaredQuizExampleEn = cleanSentence(
      stringValue(phrase.quizExampleEn) ||
        stringValue(phrase.quizExample),
    );
    const declaredQuizExampleZh = cleanSentence(
      stringValue(phrase.quizExampleZh),
    );
    const exampleVariants = normalizeExampleVariants({
      raw: phrase.exampleVariants ?? phrase.examples,
      exampleEn,
      exampleZh,
      quizExampleEn: declaredQuizExampleEn,
      quizExampleZh: declaredQuizExampleZh,
    });
    const quizExampleEn =
      exampleVariants[1]?.exampleEn || declaredQuizExampleEn;
    const quizExampleZh =
      exampleVariants[1]?.exampleZh || declaredQuizExampleZh;
    const primaryExampleIndexes = normalizePrimaryExampleIndexes(
      phrase.primaryExampleIndexes,
      exampleVariants.length,
    );
    if (!exampleEn) missingExamples += 1;
    if (exampleEn && !exampleZh) missingTranslations += 1;

    const synonyms = normalizeSynonyms(
      phrase.synonym_details ?? phrase.synonyms,
    );
    const normalizedPhrase = normalizePhrase(phraseText);
    const exerciseModes = normalizeExerciseModes(
      phrase.exerciseModes,
      trackId,
      Boolean(phrase.supportsCloze) &&
        Boolean(exampleEn) &&
        exampleEn.toLowerCase().includes(phraseText.toLowerCase()),
    );
    const supportsCloze =
      Boolean(phrase.supportsCloze) &&
      Boolean(exampleEn) &&
      exampleEn.toLowerCase().includes(phraseText.toLowerCase());
    if (supportsCloze) clozeReady += 1;
    const contentStatus = getContentStatus(
      exampleEn,
      exampleZh,
      exampleVariants,
      senses,
      primaryExampleIndexes,
    );

    phrases.push({
      id,
      trackId,
      externalId:
        phrase.id === undefined || phrase.id === null
          ? undefined
          : String(phrase.id),
      contentKey: makeContentKey(trackId, phraseText),
      phrase: phraseText,
      normalizedPhrase,
      meaning,
      senses,
      exampleEn,
      exampleZh,
      quizExampleEn: quizExampleEn || undefined,
      quizExampleZh: quizExampleZh || undefined,
      exampleVariants,
      primaryExampleIndexes,
      entryType: stringValue(phrase.entryType) || inferEntryType(trackId),
      category: stringValue(phrase.category) || "其他",
      tags: normalizeTags(phrase.tags),
      priority: normalizePriority(phrase.priority),
      exerciseModes,
      supportsCloze,
      confusionGroup:
        stringValue(phrase.confusionGroup) ||
        buildConfusionGroup(phraseText, synonyms),
      synonyms,
      source: stringValue(phrase.source) || sourceName,
      contentStatus,
      archived: false,
      createdAt: Number.isFinite(Number(phrase.createdAt))
        ? Number(phrase.createdAt)
        : now,
      updatedAt: now,
    });
  });

  const deduped = [...new Map(phrases.map((phrase) => [phrase.id, phrase])).values()];
  if (!forcedTrack && !detectTrack(document.metadata?.role) && !detectTrack(document.metadata?.track)) {
    warnings.push({
      row: 0,
      field: "metadata.role",
      message: `未能从文件元数据识别学习线，暂按“${TRACKS[trackId].label}”处理`,
      severity: "warning",
    });
  }

  return {
    sourceName,
    schemaVersion,
    trackId,
    phrases: deduped,
    errors,
    warnings,
    stats: {
      totalRows: rawRows.length,
      validRows: deduped.length,
      duplicates,
      missingExamples,
      missingTranslations,
      clozeReady,
    },
  };
}

export function normalizeSinglePhrase(
  raw: RawPhrase,
  trackId: TrackId,
  sourceName = "manual",
): Phrase | null {
  const preview = normalizeImportJson(
    JSON.stringify({ schemaVersion: "manual", phrases: [raw] }),
    sourceName,
    trackId,
  );
  return preview.phrases[0] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cleanSentence(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMeaningSenses(
  value: unknown,
  sourceMeaning: string,
): MeaningSense[] {
  const result: MeaningSense[] = [];
  const add = (
    meaning: string,
    note = "",
    primary = false,
    exampleEn = "",
    exampleZh = "",
  ) => {
    const cleanedMeaning = meaning.trim();
    if (!cleanedMeaning) return;
    const duplicate = result.some(
      (item) =>
        normalizeChinese(item.meaning) ===
        normalizeChinese(cleanedMeaning),
    );
    if (!duplicate) {
      result.push({
        meaning: cleanedMeaning,
        note: note.trim() || undefined,
        primary,
        exampleEn: exampleEn.trim() || undefined,
        exampleZh: exampleZh.trim() || undefined,
      });
    }
  };

  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[；;]/)
      : [];
  for (const item of rawItems) {
    if (isRecord(item)) {
      add(
        stringValue(item.meaning) || stringValue(item.label),
        stringValue(item.note),
        Boolean(item.primary),
        stringValue(item.exampleEn),
        stringValue(item.exampleZh),
      );
    } else if (typeof item === "string") {
      add(item);
    }
  }
  if (result.length === 0) {
    add(sourceMeaning, "", true);
  } else if (!result.some((item) => item.primary)) {
    result[0] = { ...result[0], primary: true };
  }
  return result;
}

function normalizePrimaryExampleIndexes(
  value: unknown,
  variantCount: number,
): number[] {
  const indexes = Array.isArray(value)
    ? value
        .map(Number)
        .filter(
          (index) =>
            Number.isInteger(index) && index >= 0 && index < variantCount,
        )
    : [];
  return indexes.length > 0
    ? [...new Set(indexes)]
    : Array.from({ length: variantCount }, (_, index) => index);
}

function normalizeExampleVariants(input: {
  raw: unknown;
  exampleEn: string;
  exampleZh: string;
  quizExampleEn: string;
  quizExampleZh: string;
}): PhraseExample[] {
  const variants: PhraseExample[] = [];
  const add = (exampleEn: string, exampleZh: string) => {
    const en = cleanSentence(exampleEn);
    const zh = cleanSentence(exampleZh);
    if (!en || !zh) return;
    const duplicate = variants.some(
      (item) => item.exampleEn.toLowerCase() === en.toLowerCase(),
    );
    if (!duplicate) variants.push({ exampleEn: en, exampleZh: zh });
  };

  add(input.exampleEn, input.exampleZh);
  add(input.quizExampleEn, input.quizExampleZh);
  if (Array.isArray(input.raw)) {
    for (const item of input.raw) {
      if (!isRecord(item)) continue;
      add(
        stringValue(item.exampleEn) || stringValue(item.example),
        stringValue(item.exampleZh) ||
          stringValue(item.example_translation),
      );
    }
  }
  return variants;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizePriority(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 2;
}

function normalizeSynonyms(value: unknown): Synonym[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => item as RawSynonym)
    .map((item) => ({
      phrase: stringValue(item.phrase).trim(),
      usage: stringValue(item.usage).trim(),
      exampleEn: cleanSentence(
        stringValue(item.exampleEn) || stringValue(item.example),
      ),
      exampleZh: cleanSentence(
        stringValue(item.exampleZh) ||
          stringValue(item.example_translation),
      ),
    }))
    .filter((item) => item.phrase);
}

function normalizeExerciseModes(
  value: unknown,
  trackId: TrackId,
  supportsCloze: boolean,
): ExerciseMode[] {
  const allowed = new Set<ExerciseMode>([
    "recognition",
    "production",
    "cloze",
    "patternChoice",
    "sentenceJudgement",
    "structureTransform",
  ]);
  const parsed = Array.isArray(value)
    ? value.filter(
        (mode): mode is ExerciseMode =>
          typeof mode === "string" && allowed.has(mode as ExerciseMode),
      )
    : [];
  const modes =
    parsed.length > 0 ? parsed : [...DEFAULT_EXERCISE_MODES[trackId]];
  if (supportsCloze && !modes.includes("cloze")) modes.push("cloze");
  return [...new Set(modes)];
}

function getContentStatus(
  exampleEn: string,
  exampleZh: string,
  variants: readonly PhraseExample[],
  senses: readonly MeaningSense[],
  primaryExampleIndexes: readonly number[],
): ContentStatus {
  if (!exampleEn) return "missingExample";
  if (!exampleZh) return "missingTranslation";
  if (
    variants.some(
      (item) => !item.exampleEn || !item.exampleZh,
    )
  ) {
    return "missingTranslation";
  }
  if (variants.length < 4) return "needsReview";
  if (
    senses.length > 1 &&
    senses.some((sense) => !sense.exampleEn || !sense.exampleZh)
  ) {
    return "needsReview";
  }
  if (primaryExampleIndexes.length === 0) return "needsReview";
  return "complete";
}

function buildConfusionGroup(
  phrase: string,
  synonyms: readonly Synonym[],
): string {
  const values = [phrase, ...synonyms.map((item) => item.phrase)]
    .map(normalizePhrase)
    .sort();
  return values.length > 1 ? values.join("|") : "";
}

function detectTrack(value: unknown): TrackId | undefined {
  if (typeof value !== "string") return undefined;
  return ROLE_TO_TRACK[value];
}

function inferTrackFromRows(rows: readonly unknown[]): TrackId | undefined {
  const entries = rows
    .map((row) => (isRecord(row) ? stringValue(row.entryType) : ""))
    .filter(Boolean);
  if (entries.some((entry) => /动词|句型|非谓语|双宾/.test(entry))) {
    return "verb-pattern";
  }
  if (entries.some((entry) => /固定|搭配|短语/.test(entry))) {
    return "fixed";
  }
  return undefined;
}

function inferEntryType(trackId: TrackId): string {
  return trackId === "fixed" ? "固定短语" : "动词用法";
}

function emptyStats(): ImportPreview["stats"] {
  return {
    totalRows: 0,
    validRows: 0,
    duplicates: 0,
    missingExamples: 0,
    missingTranslations: 0,
    clozeReady: 0,
  };
}
