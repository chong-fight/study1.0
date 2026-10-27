import type {
  ContentStatus,
  ExerciseMode,
  Phrase,
  Synonym,
  TrackId,
} from "@/lib/domain/types";

export interface ImportIssue {
  row: number;
  field?: string;
  message: string;
  severity: "error" | "warning";
}

export interface ImportPreview {
  sourceName: string;
  schemaVersion: string;
  trackId: TrackId;
  phrases: Phrase[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  stats: {
    totalRows: number;
    validRows: number;
    duplicates: number;
    missingExamples: number;
    missingTranslations: number;
    clozeReady: number;
  };
}

export interface RawImportDocument {
  schemaVersion?: unknown;
  metadata?: {
    role?: unknown;
    track?: unknown;
    [key: string]: unknown;
  };
  phrases?: unknown[];
  items?: unknown[];
}

export interface RawSynonym {
  phrase?: unknown;
  usage?: unknown;
  example?: unknown;
  exampleEn?: unknown;
  exampleZh?: unknown;
  example_translation?: unknown;
}

export interface RawPhrase {
  id?: unknown;
  phrase?: unknown;
  meaning?: unknown;
  example?: unknown;
  exampleEn?: unknown;
  exampleZh?: unknown;
  example_translation?: unknown;
  category?: unknown;
  entryType?: unknown;
  tags?: unknown;
  notes?: unknown;
  synonym_details?: unknown;
  synonyms?: unknown;
  common_mistake?: unknown;
  supportsCloze?: unknown;
  exerciseModes?: unknown;
  confusionGroup?: unknown;
  priority?: unknown;
  source?: unknown;
  contentStatus?: unknown;
  [key: string]: unknown;
}

export type { ContentStatus, ExerciseMode, Phrase, Synonym, TrackId };
