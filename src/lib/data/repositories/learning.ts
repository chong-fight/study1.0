import { db } from "@/lib/data/db";import { getSettings } from "@/lib/data/settings";import { isDue, localDateKey } from "@/lib/domain/date";import { createCardProgress, createLearningSession, markDay0Complete, selectNewPhrases } from "@/lib/domain/learning-flow";import { meaningRecallRequirement, previewRecognitionRequirement } from "@/lib/domain/learning-policy";import { provisionalGradeFromDay0 } from "@/lib/domain/grading";import { secondarySenseIndexes, type ReviewQuestion } from "@/lib/domain/review-flow";import { SPELLING_REQUIRED_CORRECT } from "@/lib/domain/constants";import { seededShuffle, unique } from "@/lib/domain/text";import type { AppSettings, CardProgress, Day0Signal, Day0GateName, Day0GateResult, LearningSession, Phrase, Rating, TrackId } from "@/lib/domain/types";import { normalizeLearningSession, phraseMap } from "./shared/helpers";import { markExampleUsage, markSenseUsage, withFirstRoundWeakness } from "./shared/progress";

export async function ensureLearningSession(
  trackId: TrackId,
  today = localDateKey(),
  settings: AppSettings = getSettings(),
  random = Math.random,
): Promise<LearningSession | null> {
  return db.transaction(
    "rw",
    [db.learningSessions, db.cardProgress, db.phrases, db.reviewStates],
    async () => {
      const existing = await db.learningSessions.get(`${today}:${trackId}`);
      if (existing) {
        const normalized = normalizeLearningSession(existing);
        if (
          existing.currentRound !== normalized.currentRound ||
          !existing.roundPassedIds
        ) {
          await db.learningSessions.put(normalized);
        }
        return normalized;
      }

      const [phrases, progresses, sessions, states] = await Promise.all([
        db.phrases.where("trackId").equals(trackId).toArray(),
        db.cardProgress.toArray(),
        db.learningSessions.where("date").equals(today).toArray(),
        db.reviewStates.toArray(),
      ]);
      const learnedIds = new Set(progresses.map((item) => item.phraseId));
      const otherTrackCount = sessions
        .filter((item) => item.trackId !== trackId)
        .reduce((sum, item) => sum + item.phraseIds.length, 0);
      const trackLimit =
        trackId === "fixed" ? settings.fixedNewLimit : settings.verbNewLimit;
      const dueWorkload =
        states.filter((item) => isDue(item.nextReviewOn, today)).length +
        progresses.filter(
          (item) =>
            item.state === "incubating" &&
            item.calibrationDueOn &&
            isDue(item.calibrationDueOn, today),
        ).length;
      const totalRemaining = Math.max(
        0,
        settings.totalNewLimit - otherTrackCount,
      );
      const throttle =
        dueWorkload >= settings.totalReviewLimit
          ? 0
          : dueWorkload >= settings.totalReviewLimit * 0.8
            ? 0.5
            : 1;
      const limit = Math.floor(
        Math.min(trackLimit, totalRemaining) * throttle,
      );
      const phraseById = phraseMap(await db.phrases.toArray());
      const usedGroups = new Set<string>();

      for (const session of sessions) {
        for (const id of session.phraseIds) {
          const group = phraseById.get(id)?.confusionGroup;
          if (group) usedGroups.add(group);
        }
      }

      const selected = selectNewPhrases(
        phrases.filter((item) => !item.archived),
        learnedIds,
        limit,
        usedGroups,
        random,
      );
      if (selected.length === 0) return null;

      const session = createLearningSession(trackId, selected, today);
      const progress = selected.map((phrase) =>
        createCardProgress(phrase, today, session.createdAt),
      );
      await db.learningSessions.put(session);
      await db.cardProgress.bulkPut(progress);
      return session;
    },
  );
}

export async function saveDay0Result(
  session: LearningSession,
  phraseId: string,
  signal: Omit<Day0Signal, "completedAt">,
  now = Date.now(),
): Promise<CardProgress | undefined> {
  const fullSignal: Day0Signal = { ...signal, completedAt: now };
  const progress = await db.cardProgress.get(phraseId);
  if (!progress) return undefined;

  const provisionalGrade = provisionalGradeFromDay0(fullSignal);
  const updated = markDay0Complete(
    progress,
    fullSignal,
    provisionalGrade,
    localDateKey(new Date(fullSignal.completedAt)),
  );
  const cardWithDifficulty = withFirstRoundWeakness(
    updated,
    provisionalGrade,
  );
  await db.cardProgress.put(cardWithDifficulty);
  return cardWithDifficulty;
}

export async function setDay0Rating(
  phraseId: string,
  rating: CardProgress["day0Rating"],
): Promise<void> {
  await db.cardProgress.update(phraseId, {
    day0Rating: rating,
    updatedAt: Date.now(),
  });
}

export async function recordLearningPreviewRating(
  sessionId: string,
  phraseId: string,
  rating: Rating,
  exampleVariant = 0,
): Promise<LearningSession> {
  return db.transaction(
    "rw",
    [db.learningSessions, db.cardProgress],
    async () => {
      const session = await db.learningSessions.get(sessionId);
      const progress = await db.cardProgress.get(phraseId);
      if (!session || !progress) throw new Error("Learning card not found");

      const normalized = normalizeLearningSession(session);
      const requiredCount = previewRecognitionRequirement(rating);
      const recognizedCount =
        normalized.previewedPhraseIds?.includes(phraseId)
          ? progress.previewRecognizedCount ?? 0
          : rating === "know"
            ? 1
            : 0;
      normalized.previewedPhraseIds = unique([
        ...(normalized.previewedPhraseIds ?? []),
        phraseId,
      ]);
      normalized.updatedAt = Date.now();
      await db.cardProgress.put({
        ...markExampleUsage(progress, exampleVariant),
        day0Rating: rating,
        previewRequiredCount: requiredCount,
        previewRecognizedCount: recognizedCount,
        lastPreviewedAt: normalized.updatedAt,
        updatedAt: normalized.updatedAt,
      });
      await db.learningSessions.put(normalized);
      return normalized;
    },
  );
}

export async function recordLearningPreviewRecognition(
  sessionId: string,
  phraseId: string,
  recognized: boolean,
): Promise<LearningSession> {
  return db.transaction(
    "rw",
    [db.learningSessions, db.cardProgress],
    async () => {
      const session = await db.learningSessions.get(sessionId);
      const progress = await db.cardProgress.get(phraseId);
      if (!session || !progress) throw new Error("Learning card not found");
      if (!progress.day0Rating) {
        throw new Error("Preview rating not found");
      }

      const normalized = normalizeLearningSession(session);
      const requiredCount = previewRecognitionRequirement(
        progress.day0Rating,
      );
      const recognizedCount = recognized
        ? Math.min(
            requiredCount,
            (progress.previewRecognizedCount ?? 0) + 1,
          )
        : 0;
      const updatedAt = Date.now();
      await db.cardProgress.put({
        ...progress,
        previewRequiredCount: requiredCount,
        previewRecognizedCount: recognizedCount,
        lastPreviewedAt: updatedAt,
        updatedAt,
      });
      normalized.updatedAt = updatedAt;
      await db.learningSessions.put(normalized);
      return normalized;
    },
  );
}

export interface LearningGateQueueItem {
  phrase: Phrase;
  progress: CardProgress;
  gate: Day0GateName;
}

const LEARNING_GATES: Day0GateName[] = [
  "meaning",
  "production",
  "application",
  "exit",
];

export async function getLearningGateQueue(
  session: LearningSession,
): Promise<LearningGateQueueItem[]> {
  const roundKey = String(session.currentRound) as "1" | "2" | "3" | "4";
  const gate = LEARNING_GATES[session.currentRound - 1];
  const passed = new Set(session.roundPassedIds[roundKey] ?? []);
  const pendingIds = session.phraseIds.filter((id) => !passed.has(id));
  const [phrases, progresses] = await Promise.all([
    db.phrases.bulkGet(pendingIds),
    db.cardProgress.bulkGet(pendingIds),
  ]);
  const phraseById = new Map(
    phrases.filter((item): item is Phrase => Boolean(item)).map((item) => [
      item.id,
      item,
    ]),
  );
  const progressById = new Map(
    progresses
      .filter((item): item is CardProgress => Boolean(item))
      .map((item) => [item.phraseId, item]),
  );

  const items = pendingIds
    .map((id) => {
      const phrase = phraseById.get(id);
      const progress = progressById.get(id);
      return phrase && progress ? { phrase, progress, gate } : null;
    })
    .filter((item): item is LearningGateQueueItem => Boolean(item));
  const attemptCounts = unique(
    items.map(
      (item) => item.progress.day0Gates?.[gate]?.attempts ?? 0,
    ),
  ).sort((left, right) => left - right);
  return attemptCounts.flatMap((attempts) =>
    seededShuffle(
      items.filter(
        (item) =>
          (item.progress.day0Gates?.[gate]?.attempts ?? 0) === attempts,
      ),
      `${session.id}:${gate}:${attempts}`,
    ),
  );
}

export async function recordLearningGateAnswer(
  sessionId: string,
  phraseId: string,
  gate: Day0GateName,
  questionType: ReviewQuestion["type"],
  skill: ReviewQuestion["skill"],
  correct: boolean,
  answer: string,
  expectedAnswer: string,
  responseTimeMs: number,
  exampleVariant?: number,
  senseIndex?: number,
): Promise<{
  session: LearningSession;
  completed: boolean;
  passed: boolean;
  correctStreak: number;
  correctCount: number;
  requiredCorrect: number;
}> {
  return db.transaction(
    "rw",
    [db.learningSessions, db.cardProgress, db.reviewLogs, db.phrases],
    async () => {
      const session = await db.learningSessions.get(sessionId);
      const progress = await db.cardProgress.get(phraseId);
      const phrase = await db.phrases.get(phraseId);
      if (!session || !progress || !phrase) {
        throw new Error("Learning card not found");
      }
      const normalized = normalizeLearningSession(session);
      const roundKey = String(
        normalized.currentRound,
      ) as "1" | "2" | "3" | "4";
      if (gate !== LEARNING_GATES[normalized.currentRound - 1]) {
        throw new Error("Learning gate does not match current round");
      }
      if (normalized.roundPassedIds[roundKey].includes(phraseId)) {
        return {
          session: normalized,
          completed: normalized.status === "completed",
          passed: true,
          correctStreak: 1,
          correctCount: 1,
          requiredCorrect: 1,
        };
      }
      const current = progress.day0Gates?.[gate];
      const availableSenseIndexes = secondarySenseIndexes(phrase);
      const senseGate =
        gate === "exit" &&
        questionType === "senseChoice" &&
        senseIndex !== undefined &&
        availableSenseIndexes.includes(senseIndex);
      if (
        gate === "exit" &&
        questionType === "senseChoice" &&
        !senseGate
      ) {
        throw new Error("Invalid secondary sense for exit gate");
      }
      const validSensePassedIndexes = (
        progress.sensePassedIndexes ?? []
      ).filter((index) => availableSenseIndexes.includes(index));
      const sensePassedIndexes = senseGate && correct
        ? unique([...validSensePassedIndexes, senseIndex])
        : validSensePassedIndexes;
      const requiredCorrect = senseGate
        ? availableSenseIndexes.length
        : questionType === "spelling"
          ? SPELLING_REQUIRED_CORRECT
          : gate === "meaning" && questionType === "meaning"
            ? meaningRecallRequirement(progress.day0Rating)
            : 1;
      const correctStreak = senseGate
        ? sensePassedIndexes.length
        : correct
          ? (current?.correctStreak ?? 0) + 1
          : 0;
      const correctCount =
        questionType === "spelling"
          ? (current?.correctCount ?? 0) + (correct ? 1 : 0)
          : correct
            ? 1
            : 0;
      const incorrectAttempts =
        (current?.incorrectAttempts ?? 0) + (correct ? 0 : 1);
      const nextResult: Day0GateResult = current
        ? {
            ...current,
            finalCorrect: current.finalCorrect || correct,
            correctStreak,
            correctCount,
            incorrectAttempts,
            attempts: current.attempts + 1,
            lastAttemptAt: Date.now(),
          }
        : {
            questionType,
            firstCorrect: correct,
            finalCorrect: correct,
            correctStreak,
            correctCount,
            incorrectAttempts,
            attempts: 1,
            lastAttemptAt: Date.now(),
          };
      const nextProgress = markSenseUsage(markExampleUsage({
        ...progress,
        day0Gates: {
          ...progress.day0Gates,
          [gate]: nextResult,
        },
        sensePassedIndexes,
        updatedAt: Date.now(),
      }, exampleVariant), senseIndex);
      await db.cardProgress.put(nextProgress);
      await db.reviewLogs.add({
        phraseId,
        trackId: normalized.trackId,
        planId: normalized.id,
        dateKey: normalized.date,
        timestamp: Date.now(),
        mode: "learning",
        questionType,
        skill,
        correct,
        answer,
        expectedAnswer,
        quality: correct ? 4 : 0,
        responseTimeMs,
        exampleVariant,
        senseIndex,
      });

      const passed =
        questionType === "spelling"
          ? correctCount >= requiredCorrect
          : correct && correctStreak >= requiredCorrect;
      if (passed) {
        normalized.roundPassedIds[roundKey] = unique([
          ...normalized.roundPassedIds[roundKey],
          phraseId,
        ]);
      }

      const allPassed = normalized.phraseIds.every((id) =>
        normalized.roundPassedIds[roundKey].includes(id),
      );
      if (allPassed) {
        if (normalized.currentRound < 4) {
          normalized.currentRound = (normalized.currentRound + 1) as
            | 2
            | 3
            | 4;
        } else {
          await finalizeDay0Session(normalized);
          return {
            session: normalized,
            completed: true,
            passed,
            correctStreak,
            correctCount,
            requiredCorrect,
          };
        }
      }

      normalized.updatedAt = Date.now();
      await db.learningSessions.put(normalized);
      return {
        session: normalized,
        completed: false,
        passed,
        correctStreak,
        correctCount,
        requiredCorrect,
      };
    },
  );
}

async function finalizeDay0Session(session: LearningSession): Promise<void> {
  const now = Date.now();
  const progresses = await db.cardProgress.bulkGet(session.phraseIds);
  for (const progress of progresses) {
    if (!progress?.day0Gates) continue;
    const gates = progress.day0Gates;
    if (
      !gates.meaning ||
      !gates.production ||
      !gates.application ||
      !gates.exit ||
      !gates.meaning.finalCorrect ||
      !gates.production.finalCorrect ||
      !gates.application.finalCorrect ||
      !gates.exit.finalCorrect
    ) {
      continue;
    }
    const signal: Day0Signal = {
      rating: progress.day0Rating ?? "vague",
      firstCorrect: gates.meaning.firstCorrect,
      corrected:
        !gates.production.firstCorrect ||
        !gates.application.firstCorrect ||
        !gates.exit.firstCorrect,
      exitCorrect: gates.exit.firstCorrect,
      gates: {
        meaning: gates.meaning,
        production: gates.production,
        application: gates.application,
        exit: gates.exit,
      },
      completedAt: now,
    };
    const provisionalGrade = provisionalGradeFromDay0(signal);
    const completedProgress = markDay0Complete(
        progress,
        signal,
        provisionalGrade,
        localDateKey(new Date(now)),
      );
    await db.cardProgress.put(
      withFirstRoundWeakness(completedProgress, provisionalGrade),
    );
  }
  session.stage = "completed";
  session.status = "completed";
  session.completedAt = now;
  session.updatedAt = now;
  await db.learningSessions.put(session);
}

export async function completeLearningSession(sessionId: string): Promise<void> {
  const now = Date.now();
  await db.learningSessions.update(sessionId, {
    stage: "completed",
    status: "completed",
    updatedAt: now,
    completedAt: now,
  });
}

export async function getLearningSession(
  trackId: TrackId,
  today = localDateKey(),
): Promise<LearningSession | undefined> {
  const session = await db.learningSessions.get(`${today}:${trackId}`);
  return session ? normalizeLearningSession(session) : undefined;
}

export async function getLearningPhrases(
  session: LearningSession,
): Promise<Phrase[]> {
  const records = await db.phrases.bulkGet(session.phraseIds);
  return records.filter((item): item is Phrase => Boolean(item));
}

export async function getLearningCards(session: LearningSession) {
  const [phrases, progresses] = await Promise.all([
    db.phrases.bulkGet(session.phraseIds),
    db.cardProgress.bulkGet(session.phraseIds),
  ]);
  const progressById = new Map(
    progresses
      .filter((item): item is CardProgress => Boolean(item))
      .map((item) => [item.phraseId, item]),
  );
  return phrases
    .filter((item): item is Phrase => Boolean(item))
    .map((phrase) => ({
      phrase,
      progress: progressById.get(phrase.id),
    }));
}
