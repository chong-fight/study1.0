import { db } from "./db";
import { getSettings } from "./settings";
import {
  compareDateKeys,
  addDays,
  isDue,
  localDateKey,
} from "@/lib/domain/date";
import {
  createCardProgress,
  createLearningSession,
  markDay0Complete,
  selectNewPhrases,
} from "@/lib/domain/learning-flow";
import {
  meaningRecallRequirement,
  previewRecognitionRequirement,
} from "@/lib/domain/learning-policy";
import {
  calibrateGrade,
  provisionalGradeFromDay0,
} from "@/lib/domain/grading";
import {
  CALIBRATION_QUESTION_ORDER,
  MAX_REVIEW_CORRECTION_ROUNDS,
  buildReviewAttemptTypes,
  canUseContextChoice,
  chooseSenseIndex,
  type ReviewQuestion,
} from "@/lib/domain/review-flow";
import {
  createInitialReviewState,
  compareReviewPriority,
  qualityFromResults,
  updateReviewSchedule,
} from "@/lib/domain/scheduler";
import { TRACKS } from "@/lib/domain/constants";
import {
  normalizeEnglishAnswer,
  seededShuffle,
  shuffle,
  unique,
} from "@/lib/domain/text";
import type {
  AppSettings,
  CalibrationResult,
  CalibrationPlan,
  CardProgress,
  Day0Signal,
  Day0GateName,
  Day0GateResult,
  Grade,
  LearningSession,
  Phrase,
  QuestionType,
  Rating,
  ReviewAttempt,
  ReviewLog,
  ReviewPlan,
  ReviewState,
  TrackId,
} from "@/lib/domain/types";

export interface ReviewQueueItem {
  phrase: Phrase;
  kind: "calibration" | "review";
  progress?: CardProgress;
  reviewState?: ReviewState;
  attempt?: ReviewAttempt;
}

export interface TrackTodayData {
  trackId: TrackId;
  session?: LearningSession;
  plan?: ReviewPlan;
  calibrationPlan?: CalibrationPlan;
  newPhrases: Phrase[];
  learningPhrases: Phrase[];
  learningCompletedIds: string[];
  learningDone: number;
  calibrationPhrases: Phrase[];
  duePhrases: Phrase[];
  reviewPhrases: Phrase[];
  reviewCompletedIds: string[];
  reviewFailedIds: string[];
  completedPhrases: Phrase[];
  deferredCount: number;
}

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

export async function getAllPhrases(trackId?: TrackId): Promise<Phrase[]> {
  if (trackId) {
    return db.phrases.where("trackId").equals(trackId).toArray();
  }
  return db.phrases.toArray();
}

export async function getPhrase(phraseId: string): Promise<Phrase | undefined> {
  return db.phrases.get(phraseId);
}

export async function getTrackCounts() {
  const [all, progress, states] = await Promise.all([
    db.phrases.toArray(),
    db.cardProgress.toArray(),
    db.reviewStates.toArray(),
  ]);
  const learnedIds = new Set(progress.map((item) => item.phraseId));

  return {
    fixed: {
      total: all.filter((item) => item.trackId === "fixed").length,
      learned: all.filter(
        (item) => item.trackId === "fixed" && learnedIds.has(item.id),
      ).length,
      scheduled: states.filter((item) => item.trackId === "fixed").length,
    },
    "verb-pattern": {
      total: all.filter((item) => item.trackId === "verb-pattern").length,
      learned: all.filter(
        (item) =>
          item.trackId === "verb-pattern" && learnedIds.has(item.id),
      ).length,
      scheduled: states.filter((item) => item.trackId === "verb-pattern")
        .length,
    },
  };
}

function phraseMap(phrases: readonly Phrase[]): Map<string, Phrase> {
  return new Map(phrases.map((phrase) => [phrase.id, phrase]));
}

export async function getTodayData(
  settings: AppSettings = getSettings(),
  today = localDateKey(),
): Promise<TrackTodayData[]> {
  const [phrases, progresses, sessions, plans, calibrationPlans, states] =
    await Promise.all([
    db.phrases.toArray(),
    db.cardProgress.toArray(),
    db.learningSessions.where("date").equals(today).toArray(),
    db.reviewPlans.where("date").equals(today).toArray(),
    db.calibrationPlans.where("date").equals(today).toArray(),
    db.reviewStates.toArray(),
  ]);
  const progressMap = new Map(progresses.map((item) => [item.phraseId, item]));
  const phraseById = phraseMap(phrases);
  const activePhrases = phrases.filter((item) => !item.archived);
  const dueWorkload =
    states.filter((item) => isDue(item.nextReviewOn, today)).length +
    progresses.filter(
      (item) =>
        item.state === "incubating" &&
        item.calibrationDueOn &&
        isDue(item.calibrationDueOn, today),
    ).length;
  const newThrottle =
    dueWorkload >= settings.totalReviewLimit
      ? 0
      : dueWorkload >= settings.totalReviewLimit * 0.8
        ? 0.5
        : 1;

  return (["fixed", "verb-pattern"] as const).map((trackId) => {
    const trackPhrases = activePhrases.filter((item) => item.trackId === trackId);
    const rawSession = sessions.find((item) => item.trackId === trackId);
    const session = rawSession ? normalizeLearningSession(rawSession) : undefined;
    const plan = plans.find((item) => item.trackId === trackId);
    const calibrationPlan = calibrationPlans.find(
      (item) => item.trackId === trackId,
    );
    const learningPhrases = session
      ? session.phraseIds
          .map((id) => phraseById.get(id))
          .filter((item): item is Phrase => Boolean(item))
      : [];
    const learningDone = learningPhrases.filter(
      (phrase) => progressMap.get(phrase.id)?.state !== "day0",
    ).length;
    const learningCompletedIds = learningPhrases
      .filter((phrase) => progressMap.get(phrase.id)?.state !== "day0")
      .map((phrase) => phrase.id);

    const unlearned = trackPhrases.filter((phrase) => !progressMap.has(phrase.id));
    const trackLimit =
      trackId === "fixed" ? settings.fixedNewLimit : settings.verbNewLimit;
    const newPhrases = session
      ? learningPhrases.filter(
          (phrase) => progressMap.get(phrase.id)?.state === "day0",
        )
      : unlearned.slice(0, Math.floor(trackLimit * newThrottle));

    const calibrationPhrases = progresses
      .filter(
        (item) =>
          item.trackId === trackId &&
          item.state === "incubating" &&
          item.calibrationDueOn &&
          isDue(item.calibrationDueOn, today),
      )
      .map((item) => phraseById.get(item.phraseId))
      .filter((item): item is Phrase => Boolean(item));

    const duePhrases = states
      .filter(
        (item) => item.trackId === trackId && isDue(item.nextReviewOn, today),
      )
      .sort((left, right) => compareReviewPriority(left, right, today))
      .map((item) => phraseById.get(item.phraseId))
      .filter((item): item is Phrase => Boolean(item));

    const completedPhrases = plan
      ? plan.completedPhraseIds
          .map((id) => phraseById.get(id))
          .filter((item): item is Phrase => Boolean(item))
      : [];
    const plannedReviewIds = plan
      ? plan.phraseIds
      : unique([
          ...calibrationPhrases.map((phrase) => phrase.id),
          ...duePhrases.map((phrase) => phrase.id),
        ]).slice(
          0,
          trackId === "fixed"
            ? settings.fixedReviewLimit
            : settings.verbReviewLimit,
        );
    const combinedReviewIds = unique([
      ...(calibrationPlan?.phraseIds ?? []),
      ...plannedReviewIds,
    ]);
    const reviewPhrases = combinedReviewIds
      .map((id) => phraseById.get(id))
      .filter((item): item is Phrase => Boolean(item));
    const reviewCompletedIds = unique([
      ...(calibrationPlan?.status === "completed"
        ? calibrationPlan.phraseIds.filter(
            (id) => !calibrationPlan.failedIds.includes(id),
          )
        : []),
      ...(plan?.completedPhraseIds ?? []),
    ]);
    const reviewFailedIds = unique(calibrationPlan?.failedIds ?? []);

    return {
      trackId,
      session,
      plan,
      calibrationPlan,
      newPhrases,
      learningPhrases,
      learningCompletedIds,
      learningDone,
      calibrationPhrases,
      duePhrases,
      reviewPhrases,
      reviewCompletedIds,
      reviewFailedIds,
      completedPhrases,
      deferredCount: plan?.deferredPhraseIds.length ?? 0,
    };
  });
}

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
  await db.cardProgress.put(updated);
  return updated;
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
          requiredCorrect: 1,
        };
      }
      const current = progress.day0Gates?.[gate];
      const senseGate =
        gate === "exit" &&
        questionType === "senseChoice" &&
        senseIndex !== undefined;
      const sensePassedIndexes = senseGate && correct
        ? unique([...(progress.sensePassedIndexes ?? []), senseIndex])
        : progress.sensePassedIndexes ?? [];
      const requiredCorrect = senseGate
        ? Math.max(0, (phrase.senses?.length ?? 1) - 1)
        : questionType === "spelling"
          ? 3
          : gate === "meaning" && questionType === "meaning"
            ? meaningRecallRequirement(progress.day0Rating)
            : 1;
      const correctStreak = senseGate
        ? sensePassedIndexes.length
        : correct
          ? (current?.correctStreak ?? 0) + 1
          : 0;
      const nextResult: Day0GateResult = current
        ? {
            ...current,
            finalCorrect: current.finalCorrect || correct,
            correctStreak,
            attempts: current.attempts + 1,
            lastAttemptAt: Date.now(),
          }
        : {
            questionType,
            firstCorrect: correct,
            finalCorrect: correct,
            correctStreak,
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

      const passed = correct && correctStreak >= requiredCorrect;
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
    await db.cardProgress.put(
      markDay0Complete(
        progress,
        signal,
        provisionalGrade,
        localDateKey(new Date(now)),
      ),
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

export async function ensureReviewPlan(
  trackId: TrackId,
  today = localDateKey(),
  settings: AppSettings = getSettings(),
): Promise<ReviewPlan> {
  const id = `${today}:${trackId}`;
  return db.transaction(
    "rw",
    [
      db.reviewPlans,
      db.reviewStates,
      db.phrases,
      db.calibrationPlans,
      db.cardProgress,
    ],
    async () => {
      const existing = await db.reviewPlans.get(id);
      if (existing) return existing;

      const [allStates, phrases, plans, calibrationPlans, progresses] =
        await Promise.all([
        db.reviewStates.toArray(),
        db.phrases.where("trackId").equals(trackId).toArray(),
        db.reviewPlans.where("date").equals(today).toArray(),
        db.calibrationPlans.where("date").equals(today).toArray(),
        db.cardProgress.toArray(),
      ]);
      const states = allStates.filter((item) => item.trackId === trackId);
      const phraseById = phraseMap(phrases);
      const scheduled = states
        .filter((item) => isDue(item.nextReviewOn, today))
        .sort(
          (left, right) => compareReviewPriority(left, right, today),
        );

      const trackLimit =
        trackId === "fixed"
          ? settings.fixedReviewLimit
          : settings.verbReviewLimit;
      const otherTrackCount = plans
        .filter((plan) => plan.trackId !== trackId)
        .reduce((sum, plan) => sum + plan.phraseIds.length, 0);
      const calibrationCount = calibrationPlans.reduce(
        (sum, plan) => sum + plan.phraseIds.length,
        0,
      );
      const otherTrack = trackId === "fixed" ? "verb-pattern" : "fixed";
      const otherTrackLimit =
        otherTrack === "fixed"
          ? settings.fixedReviewLimit
          : settings.verbReviewLimit;
      const otherDueWorkload =
        allStates.filter(
          (item) =>
            item.trackId === otherTrack &&
            isDue(item.nextReviewOn, today) &&
            !plans.some(
              (plan) =>
                plan.trackId === otherTrack &&
                plan.phraseIds.includes(item.phraseId),
            ),
        ).length +
        progresses.filter(
          (item) =>
            item.trackId === otherTrack &&
            item.state === "incubating" &&
            item.calibrationDueOn &&
            isDue(item.calibrationDueOn, today) &&
            !calibrationPlans.some(
              (plan) =>
                plan.trackId === otherTrack &&
                plan.phraseIds.includes(item.phraseId),
            ),
        ).length;
      const reserveForOtherTrack = Math.min(
        otherDueWorkload,
        otherTrackLimit,
      );
      const totalRemaining = Math.max(
        0,
        settings.totalReviewLimit - otherTrackCount - calibrationCount,
      );
      const limit = Math.min(
        totalRemaining,
        Math.max(trackLimit, totalRemaining - reserveForOtherTrack),
      );
      const reviewIds = scheduled
        .map((item) => item.phraseId)
        .slice(0, limit);
      const allIds = reviewIds.filter((candidateId) =>
        phraseById.has(candidateId),
      );
      const allCandidateIds = unique(
        scheduled.map((item) => item.phraseId),
      );
      const now = Date.now();
      const plan: ReviewPlan = {
        id,
        date: today,
        trackId,
        phraseIds: allIds,
        calibrationIds: [],
        deferredPhraseIds: allCandidateIds.filter(
          (candidateId) => !allIds.includes(candidateId),
        ),
        completedPhraseIds: [],
        attempts: {},
        status: allIds.length === 0 ? "completed" : "active",
        createdAt: now,
        updatedAt: now,
      };
      await db.reviewPlans.put(plan);
      const selected = new Set(allIds);
      for (const state of scheduled) {
        if (!selected.has(state.phraseId)) {
          await db.reviewStates.update(state.phraseId, {
            deferralCount: (state.deferralCount ?? 0) + 1,
          });
        }
      }
      return plan;
    },
  );
}

export interface CalibrationQueueItem {
  phrase: Phrase;
  progress: CardProgress;
  questionType: QuestionType;
  senseIndex?: number;
}

export async function ensureCalibrationPlan(
  trackId: TrackId,
  today = localDateKey(),
  settings: AppSettings = getSettings(),
): Promise<CalibrationPlan> {
  const id = `calibration:${today}:${trackId}`;
  return db.transaction(
    "rw",
    [
      db.calibrationPlans,
      db.cardProgress,
      db.reviewStates,
      db.phrases,
      db.reviewPlans,
      db.calibrationPlans,
    ],
    async () => {
      const existing = await db.calibrationPlans.get(id);
      if (existing) return existing;

      const [progresses, phrases, reviewPlans, calibrationPlans] =
        await Promise.all([
        db.cardProgress.where("trackId").equals(trackId).toArray(),
        db.phrases.where("trackId").equals(trackId).toArray(),
        db.reviewPlans.where("date").equals(today).toArray(),
        db.calibrationPlans.where("date").equals(today).toArray(),
      ]);
      const phraseById = phraseMap(phrases);
      const due = progresses
        .filter(
          (item) =>
            item.state === "incubating" &&
            item.calibrationDueOn &&
            isDue(item.calibrationDueOn, today),
        )
        .sort((left, right) =>
          compareDateKeys(
            left.calibrationDueOn ?? "9999-12-31",
            right.calibrationDueOn ?? "9999-12-31",
          ),
        );
      const trackLimit =
        trackId === "fixed"
          ? settings.fixedReviewLimit
          : settings.verbReviewLimit;
      const regularCount = reviewPlans.reduce(
        (sum, plan) => sum + plan.phraseIds.length,
        0,
      );
      const otherCalibrationCount = calibrationPlans
        .filter((plan) => plan.trackId !== trackId)
        .reduce((sum, plan) => sum + plan.phraseIds.length, 0);
      const limit = Math.min(
        trackLimit,
        Math.max(
          0,
          settings.totalReviewLimit - regularCount - otherCalibrationCount,
        ),
      );
      const phraseIds = unique(
        due.map((item) => item.phraseId).filter((item) => phraseById.has(item)),
      ).slice(0, limit);
      const now = Date.now();
      const plan: CalibrationPlan = {
        id,
        date: today,
        trackId,
        phraseIds,
        currentRound: 1,
        roundPassedIds: { "1": [], "2": [], "3": [], "4": [] },
        failedIds: [],
        results: {},
        status: phraseIds.length === 0 ? "completed" : "active",
        createdAt: now,
        updatedAt: now,
      };
      await db.calibrationPlans.put(plan);
      return plan;
    },
  );
}

export async function getCalibrationQueue(
  plan: CalibrationPlan,
): Promise<CalibrationQueueItem[]> {
  if (plan.status === "completed") return [];
  const roundKey = String(plan.currentRound) as "1" | "2" | "3" | "4";
  const pendingIds = plan.phraseIds.filter(
    (id) =>
      !plan.failedIds.includes(id) &&
      !plan.roundPassedIds[roundKey].includes(id),
  );
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
  const items: CalibrationQueueItem[] = [];
  for (const id of pendingIds) {
    const phrase = phraseById.get(id);
    const progress = progressById.get(id);
    if (!phrase || !progress) continue;
    const preferred = CALIBRATION_QUESTION_ORDER[plan.currentRound - 1];
    const questionType =
      preferred === "contextChoice" &&
      (phrase.senses?.length ?? 0) > 1
        ? "senseChoice"
        : preferred === "contextChoice" &&
            !canUseContextChoice(phrase)
          ? "phraseChoice"
          : preferred;
    items.push({
      phrase,
      progress,
      questionType,
      senseIndex:
        questionType === "senseChoice"
          ? chooseSenseIndex(phrase, progress)
          : undefined,
    });
  }
  const attemptCounts = unique(
    items.map(
      (item) =>
        plan.results[item.phrase.id]?.[roundKey]?.attempts ?? 0,
    ),
  ).sort((left, right) => left - right);
  return attemptCounts.flatMap((attempts) =>
    seededShuffle(
      items.filter(
        (item) =>
          (plan.results[item.phrase.id]?.[roundKey]?.attempts ?? 0) ===
          attempts,
      ),
      `${plan.id}:${roundKey}:${attempts}`,
    ),
  );
}

export async function recordCalibrationAnswer(
  planId: string,
  phraseId: string,
  questionType: ReviewQuestion["type"],
  skill: ReviewQuestion["skill"],
  correct: boolean,
  answer: string,
  expectedAnswer: string,
  responseTimeMs: number,
  exampleVariant?: number,
  senseIndex?: number,
): Promise<{ plan: CalibrationPlan; failed: boolean }> {
  return db.transaction(
    "rw",
    [
      db.calibrationPlans,
      db.reviewLogs,
      db.cardProgress,
      db.reviewStates,
    ],
    async () => {
      const plan = await db.calibrationPlans.get(planId);
      if (!plan) throw new Error("Calibration plan not found");
      if (plan.status === "completed" || plan.failedIds.includes(phraseId)) {
        return { plan, failed: plan.failedIds.includes(phraseId) };
      }

      const roundKey = String(plan.currentRound) as "1" | "2" | "3" | "4";
      if (plan.roundPassedIds[roundKey].includes(phraseId)) {
        return { plan, failed: false };
      }
      const phraseResults = plan.results[phraseId] ?? {};
      const current = phraseResults[roundKey];
      const attemptAt = Date.now();
      const cardProgress = await db.cardProgress.get(phraseId);
      const requiredCorrect =
        questionType === "spelling"
          ? 3
          : questionType === "meaning"
            ? meaningRecallRequirement(cardProgress?.day0Rating)
            : 1;
      const correctStreak = correct
        ? (current?.correctStreak ?? 0) + 1
        : 0;
      const nextResult = current
        ? {
            ...current,
            finalCorrect: current.finalCorrect || correct,
            correctStreak,
            attempts: current.attempts + 1,
            lastAttemptAt: attemptAt,
          }
        : {
            firstCorrect: correct,
            finalCorrect: correct,
            correctStreak,
            attempts: 1,
            lastAttemptAt: attemptAt,
          };
      phraseResults[roundKey] = nextResult;
      plan.results[phraseId] = phraseResults;

      await db.reviewLogs.add({
        phraseId,
        trackId: plan.trackId,
        planId,
        dateKey: plan.date,
        timestamp: Date.now(),
        mode: "calibration",
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

      if (exampleVariant !== undefined || senseIndex !== undefined) {
        const progress = await db.cardProgress.get(phraseId);
        if (progress) {
          await db.cardProgress.put(
            markSenseUsage(
              markExampleUsage(progress, exampleVariant),
              senseIndex,
            ),
          );
        }
      }

      let failed = false;
      if (correct && correctStreak >= requiredCorrect) {
        plan.roundPassedIds[roundKey] = unique([
          ...plan.roundPassedIds[roundKey],
          phraseId,
        ]);
      } else if (nextResult.attempts >= 3) {
        failed = true;
        plan.failedIds = unique([...plan.failedIds, phraseId]);
        const progress = await db.cardProgress.get(phraseId);
        if (progress) {
          await db.cardProgress.put({
            ...progress,
            state: "incubating",
            provisionalGrade: "D",
            confirmedGrade: undefined,
            calibrationDueOn: addDays(plan.date, 1),
            updatedAt: Date.now(),
          });
        }
      }

      const activeIds = plan.phraseIds.filter(
        (id) => !plan.failedIds.includes(id),
      );
      const roundComplete =
        activeIds.every((id) => plan.roundPassedIds[roundKey].includes(id));
      if (activeIds.length === 0) {
        plan.status = "completed";
        plan.completedAt = Date.now();
      } else if (roundComplete) {
        if (plan.currentRound < 4) {
          plan.currentRound = (plan.currentRound + 1) as 2 | 3 | 4;
        } else {
          await finalizeCalibrationPlan(plan);
        }
      }

      plan.updatedAt = Date.now();
      await db.calibrationPlans.put(plan);
      return { plan, failed };
    },
  );
}

export async function getCalibrationPlan(
  trackId: TrackId,
  today = localDateKey(),
): Promise<CalibrationPlan | undefined> {
  return db.calibrationPlans.get(`calibration:${today}:${trackId}`);
}

export async function getCalibrationSummary(plan: CalibrationPlan) {
  const progress = await db.cardProgress.bulkGet(plan.phraseIds);
  const summary: Record<Grade, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  const failed = plan.failedIds.length;
  for (const item of progress) {
    if (!item || plan.failedIds.includes(item.phraseId)) continue;
    if (item.confirmedGrade) summary[item.confirmedGrade] += 1;
  }
  return { ...summary, failed };
}

async function finalizeCalibrationPlan(plan: CalibrationPlan): Promise<void> {
  const now = Date.now();
  for (const phraseId of plan.phraseIds) {
    if (plan.failedIds.includes(phraseId)) continue;
    const progress = await db.cardProgress.get(phraseId);
    if (!progress?.day0) continue;
    const roundResults = plan.results[phraseId];
    if (
      !roundResults ||
      ![1, 2, 3, 4].every((round) => roundResults[String(round) as "1" | "2" | "3" | "4"])
    ) {
      continue;
    }
    const results: CalibrationResult[] = CALIBRATION_QUESTION_ORDER.map(
      (questionType, index) => {
        const result =
          roundResults[(index + 1) as 1 | 2 | 3 | 4]!;
        return {
          questionType,
          skill:
            questionType === "meaning"
              ? "recognition"
              : questionType === "spelling"
                ? "production"
                : questionType === "phraseChoice"
                  ? plan.trackId === "verb-pattern"
                    ? "pattern"
                    : "recognition"
                  : "usage",
          correct: result.firstCorrect,
        };
      },
    );
    const grade = calibrateGrade(progress.day0, results, true);
    await db.reviewStates.put(
      createInitialReviewState(
        phraseId,
        plan.trackId,
        grade,
        plan.date,
        now,
      ),
    );
    await db.cardProgress.put({
      ...progress,
      state: "scheduled",
      confirmedGrade: grade,
      graduatedOn: plan.date,
      updatedAt: now,
      skills: updateSkillsFromCalibration(progress, results),
    });
  }
  plan.status = "completed";
  plan.completedAt = now;
}

function updateSkillsFromCalibration(
  progress: CardProgress,
  results: CalibrationResult[],
): CardProgress["skills"] {
  const skills = { ...progress.skills };
  for (const result of results) {
    if (!result.correct) {
      skills[result.skill] = "fragile";
    } else if (skills[result.skill] === "unseen") {
      skills[result.skill] = "stable";
    } else if (skills[result.skill] === "stable") {
      skills[result.skill] = "automatized";
    }
  }
  return skills;
}

export async function getReviewQueue(
  plan: ReviewPlan,
): Promise<ReviewQueueItem[]> {
  const [phrases, progresses, states] = await Promise.all([
    db.phrases.bulkGet(plan.phraseIds),
    db.cardProgress.bulkGet(plan.phraseIds),
    db.reviewStates.bulkGet(plan.phraseIds),
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
  const stateById = new Map(
    states
      .filter((item): item is ReviewState => Boolean(item))
      .map((item) => [item.phraseId, item]),
  );

  const items: ReviewQueueItem[] = [];
  for (const id of plan.phraseIds) {
    if (plan.completedPhraseIds.includes(id)) continue;
    const phrase = phraseById.get(id);
    if (!phrase) continue;
    items.push({
      phrase,
      kind: plan.calibrationIds.includes(id) ? "calibration" : "review",
      progress: progressById.get(id),
      reviewState: stateById.get(id),
      attempt: plan.attempts[id],
    });
  }
  const depths = unique(
    items.map((item) => item.attempt?.answers.length ?? 0),
  ).sort((left, right) => left - right);
  return depths.flatMap((depth) =>
    seededShuffle(
      items.filter(
        (item) => (item.attempt?.answers.length ?? 0) === depth,
      ),
      `${plan.id}:review:${depth}`,
    ),
  );
}

export async function startReviewAttempt(
  planId: string,
  phraseId: string,
  random = Math.random,
): Promise<ReviewPlan> {
  const plan = await db.reviewPlans.get(planId);
  if (!plan) throw new Error("Review plan not found");
  const existing = plan.attempts[phraseId];
  if (existing) return plan;

  const [phrase, progress] = await Promise.all([
    db.phrases.get(phraseId),
    db.cardProgress.get(phraseId),
  ]);
  if (!phrase) throw new Error("Phrase not found");
  const types = buildReviewAttemptTypes(phrase, progress, random);
  const attempt: ReviewAttempt = {
    phraseId,
    types,
    answers: [],
    initialTypesLength: types.length,
    passStartIndex: 0,
    reviewRound: 1,
    spellingCorrectStreak: 0,
    startedAt: Date.now(),
  };
  plan.attempts[phraseId] = attempt;
  plan.updatedAt = Date.now();
  await db.reviewPlans.put(plan);
  return plan;
}

export async function getDistractors(
  phrase: Phrase,
  count = 3,
): Promise<string[]> {
  const sameTrack = await db.phrases
    .where("trackId")
    .equals(phrase.trackId)
    .toArray();
  const otherPool = shuffle(
    sameTrack
      .filter(
        (item) =>
          item.id !== phrase.id &&
          item.category === phrase.category &&
          !item.archived &&
          item.meaning.trim() !== phrase.meaning.trim() &&
          (!item.confusionGroup ||
            item.confusionGroup !== phrase.confusionGroup),
      )
      .map((item) => item.phrase),
  );
  return unique([...otherPool, ...shuffle(sameTrack.map((p) => p.phrase))])
    .filter((item) => {
      const candidate = sameTrack.find(
        (entry) => normalizeEnglishAnswer(entry.phrase) === normalizeEnglishAnswer(item),
      );
      return (
        normalizeEnglishAnswer(item) !== normalizeEnglishAnswer(phrase.phrase) &&
        candidate?.meaning.trim() !== phrase.meaning.trim() &&
        (!candidate?.confusionGroup ||
          candidate.confusionGroup !== phrase.confusionGroup)
      );
    })
    .slice(0, count);
}

export async function getMeaningDistractors(
  phrase: Phrase,
  count = 3,
): Promise<string[]> {
  const sameTrack = await db.phrases
    .where("trackId")
    .equals(phrase.trackId)
    .toArray();
  const excluded = new Set([
    phrase.meaning,
    ...(phrase.senses ?? []).map((sense) => sense.meaning),
  ]);
  return unique(
    shuffle(
      sameTrack
        .flatMap((item) => [
          item.meaning,
          ...(item.senses ?? []).map((sense) => sense.meaning),
        ])
        .filter((meaning) => meaning && !excluded.has(meaning)),
    ),
  ).slice(0, count);
}

export async function recordReviewAnswer(
  planId: string,
  phraseId: string,
  questionType: ReviewAttempt["types"][number],
  skill: ReviewAttempt["answers"][number]["skill"],
  correct: boolean,
  answer: string,
  expectedAnswer: string,
  responseTimeMs: number,
  exampleVariant?: number,
  senseIndex?: number,
): Promise<{ plan: ReviewPlan; completed: boolean }> {
  return db.transaction(
    "rw",
    [
      db.reviewPlans,
      db.reviewLogs,
      db.cardProgress,
      db.reviewStates,
      db.phrases,
    ],
    async () => {
      const plan = await db.reviewPlans.get(planId);
      if (!plan) throw new Error("Review plan not found");
      const attempt = plan.attempts[phraseId];
      if (!attempt || attempt.finalizedAt) {
        return { plan, completed: Boolean(attempt?.finalizedAt) };
      }
      if (attempt.types[attempt.answers.length] !== questionType) {
        throw new Error("Review question does not match current plan");
      }
      const spellingCorrectStreak =
        questionType === "spelling"
          ? correct
            ? (attempt.spellingCorrectStreak ?? 0) + 1
            : 0
          : (attempt.spellingCorrectStreak ?? 0);

      attempt.answers.push({
        questionType,
        skill,
        correct,
        answer,
        expectedAnswer,
        responseTimeMs,
      });
      attempt.spellingCorrectStreak = spellingCorrectStreak;
      attempt.lastAnsweredAt = Date.now();

      const log: ReviewLog = {
        phraseId,
        trackId: plan.trackId,
        planId,
        dateKey: plan.date,
        timestamp: Date.now(),
        mode: plan.calibrationIds.includes(phraseId) ? "calibration" : "review",
        questionType,
        skill,
        correct,
        answer,
        expectedAnswer,
        quality: correct ? 4 : 0,
        responseTimeMs,
        exampleVariant,
        senseIndex,
      };
      await db.reviewLogs.add(log);
      if (exampleVariant !== undefined) {
        const progress = await db.cardProgress.get(phraseId);
        if (progress) {
          await db.cardProgress.put(markExampleUsage(progress, exampleVariant));
        }
      }
      if (senseIndex !== undefined) {
        const latest = await db.cardProgress.get(phraseId);
        if (latest) {
          await db.cardProgress.put(markSenseUsage(latest, senseIndex));
        }
      }

      if (questionType === "spelling" && spellingCorrectStreak < 3) {
        const remainingSpelling = attempt.types
          .slice(attempt.answers.length)
          .filter((item) => item === "spelling").length;
        const missingSpelling = Math.max(
          0,
          3 - spellingCorrectStreak - remainingSpelling,
        );
        if (missingSpelling > 0) {
          attempt.types.splice(
            attempt.answers.length,
            0,
            ...Array.from({ length: missingSpelling }, () => "spelling" as const),
          );
        }
      }

      if (attempt.answers.length >= attempt.types.length) {
        const passStart = attempt.passStartIndex ?? 0;
        const passPassed = attempt.answers
          .slice(passStart)
          .every((item) => item.correct);
        if (passPassed) {
          await finalizeReviewAttempt(plan, attempt);
        } else if (
          (attempt.reviewRound ?? 1) >= MAX_REVIEW_CORRECTION_ROUNDS
        ) {
          await finalizeReviewAttempt(plan, attempt, true);
        } else {
          const [phrase, progress] = await Promise.all([
            db.phrases.get(phraseId),
            db.cardProgress.get(phraseId),
          ]);
          if (phrase) {
            attempt.types.push(
              ...buildReviewAttemptTypes(phrase, progress),
            );
            attempt.passStartIndex = attempt.answers.length;
            attempt.reviewRound = (attempt.reviewRound ?? 1) + 1;
          }
          await db.reviewPlans.put(plan);
        }
      } else {
        await db.reviewPlans.put(plan);
      }

      return {
        plan: (await db.reviewPlans.get(planId)) ?? plan,
        completed: Boolean(attempt.finalizedAt),
      };
    },
  );
}

async function finalizeReviewAttempt(
  plan: ReviewPlan,
  attempt: ReviewAttempt,
  forceFailure = false,
): Promise<void> {
  const now = Date.now();
  const firstPassAnswers = attempt.answers.slice(
    0,
    attempt.initialTypesLength ?? attempt.answers.length,
  );
  const gradedAttempt = { ...attempt, answers: firstPassAnswers };
  const results = firstPassAnswers.map((item) => item.correct);

  if (plan.calibrationIds.includes(attempt.phraseId)) {
    const progress = await db.cardProgress.get(attempt.phraseId);
    if (progress?.day0) {
      const resultsForGrade: CalibrationResult[] = firstPassAnswers.map(
        (item) => ({
          questionType: item.questionType,
          skill: item.skill,
          correct: item.correct,
        }),
      );
      const grade = calibrateGrade(progress.day0, resultsForGrade);
      if (grade === "D") {
        await db.cardProgress.put({
          ...progress,
          state: "incubating",
          provisionalGrade: grade,
          confirmedGrade: undefined,
          calibrationDueOn: addDays(plan.date, 1),
          graduatedOn: undefined,
          updatedAt: now,
          skills: updateSkills(progress, gradedAttempt),
        });
      } else {
      const reviewState = createInitialReviewState(
        attempt.phraseId,
        plan.trackId,
        grade,
        plan.date,
        now,
      );
      await db.reviewStates.put(reviewState);
      await db.cardProgress.put({
        ...progress,
        state: "scheduled",
        confirmedGrade: grade,
        graduatedOn: plan.date,
        updatedAt: now,
        skills: updateSkills(progress, gradedAttempt),
      });
      }
    }
  } else {
    const state = await db.reviewStates.get(attempt.phraseId);
    const progress = await db.cardProgress.get(attempt.phraseId);
    if (state) {
      const quality = forceFailure ? 0 : qualityFromResults(results);
      await db.reviewStates.put(
        updateReviewSchedule(state, quality, plan.date, now),
      );
    }
    if (progress) {
      await db.cardProgress.put({
        ...progress,
        state:
          !forceFailure && results.some(Boolean)
            ? "scheduled"
            : "relearning",
        updatedAt: now,
        skills: updateSkills(progress, gradedAttempt),
      });
    }
  }

  attempt.finalizedAt = now;
  plan.completedPhraseIds = unique([
    ...plan.completedPhraseIds,
    attempt.phraseId,
  ]);
  plan.updatedAt = now;
  if (plan.completedPhraseIds.length >= plan.phraseIds.length) {
    plan.status = "completed";
    plan.completedAt = now;
  }
  await db.reviewPlans.put(plan);
}

function updateSkills(
  progress: CardProgress,
  attempt: ReviewAttempt,
): CardProgress["skills"] {
  const skills = { ...progress.skills };
  for (const answer of attempt.answers) {
    if (!answer.correct) {
      skills[answer.skill] = "fragile";
      continue;
    }
    const current = skills[answer.skill];
    if (current === "unseen") skills[answer.skill] = "fragile";
    else if (current === "fragile") skills[answer.skill] = "stable";
    else if (current === "stable") skills[answer.skill] = "automatized";
  }
  return skills;
}

export async function getNextReviewWords(
  trackId: TrackId,
  days = 7,
  today = localDateKey(),
) {
  const until = addDays(today, days);
  return db.reviewStates
    .where("[trackId+nextReviewOn]")
    .between([trackId, today], [trackId, until], true, true)
    .toArray();
}

export async function getRecentLogs(days = 30, today = localDateKey()) {
  const from = addDays(today, -(days - 1));
  return db.reviewLogs
    .where("dateKey")
    .between(from, today, true, true)
    .toArray();
}

export async function getGradeDistribution(trackId?: TrackId) {
  const states = trackId
    ? await db.reviewStates.where("trackId").equals(trackId).toArray()
    : await db.reviewStates.toArray();
  const distribution: Record<Grade, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  for (const state of states) distribution[state.grade] += 1;
  return distribution;
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

export async function getReviewPlan(
  trackId: TrackId,
  today = localDateKey(),
): Promise<ReviewPlan | undefined> {
  return db.reviewPlans.get(`${today}:${trackId}`);
}

export async function searchPhrases(options: {
  trackId?: TrackId;
  query?: string;
  status?: "all" | "unlearned" | "learned";
}) {
  const [phrases, progress] = await Promise.all([
    options.trackId
      ? db.phrases.where("trackId").equals(options.trackId).toArray()
      : db.phrases.toArray(),
    db.cardProgress.toArray(),
  ]);
  const progressMap = new Map(progress.map((item) => [item.phraseId, item]));
  const query = options.query?.trim().toLowerCase() ?? "";

  return phrases
    .filter((item) => !item.archived)
    .filter(
      (item) =>
        !query ||
        item.phrase.toLowerCase().includes(query) ||
        item.meaning.includes(query) ||
        (item.senses ?? []).some((sense) =>
          sense.meaning.includes(query),
        ) ||
        item.exampleEn.toLowerCase().includes(query),
    )
    .filter((item) => {
      if (options.status === "learned") return progressMap.has(item.id);
      if (options.status === "unlearned") return !progressMap.has(item.id);
      return true;
    })
    .sort(
      (left, right) =>
        left.trackId.localeCompare(right.trackId) ||
        left.priority - right.priority ||
        left.phrase.localeCompare(right.phrase),
    )
    .map((phrase) => ({
      phrase,
      progress: progressMap.get(phrase.id),
    }));
}

export async function getStats() {
  const [phrases, progress, states, answerCount] = await Promise.all([
    db.phrases.toArray(),
    db.cardProgress.toArray(),
    db.reviewStates.toArray(),
    db.reviewLogs.count(),
  ]);
  return {
    total: phrases.length,
    learned: progress.length,
    graduated: states.length,
    answers: answerCount,
    byTrack: {
      fixed: phrases.filter((item) => item.trackId === "fixed").length,
      "verb-pattern": phrases.filter((item) => item.trackId === "verb-pattern")
        .length,
    },
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

export function trackLabel(trackId: TrackId): string {
  return TRACKS[trackId].label;
}

function normalizeLearningSession(
  session: LearningSession,
): LearningSession {
  return {
    ...session,
    previewedPhraseIds: session.previewedPhraseIds ?? [],
    currentRound: session.currentRound ?? 1,
    roundPassedIds: session.roundPassedIds ?? {
      "1": [],
      "2": [],
      "3": [],
      "4": [],
    },
  };
}

function markExampleUsage(
  progress: CardProgress,
  exampleVariant?: number,
): CardProgress {
  if (exampleVariant === undefined) return progress;
  const counts = [...(progress.exampleUseCounts ?? [])];
  while (counts.length <= exampleVariant) counts.push(0);
  counts[exampleVariant] += 1;
  return {
    ...progress,
    exampleUseCounts: counts,
    lastExampleIndex: exampleVariant,
  };
}

function markSenseUsage(
  progress: CardProgress,
  senseIndex?: number,
): CardProgress {
  if (senseIndex === undefined) return progress;
  const counts = [...(progress.senseUseCounts ?? [])];
  while (counts.length <= senseIndex) counts.push(0);
  counts[senseIndex] += 1;
  return {
    ...progress,
    senseUseCounts: counts,
    lastSenseIndex: senseIndex,
  };
}

