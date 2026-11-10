import { db } from "@/lib/data/db";import { getSettings } from "@/lib/data/settings";import { compareDateKeys, addDays, isDue, localDateKey } from "@/lib/domain/date";import { meaningRecallRequirement } from "@/lib/domain/learning-policy";import { calibrateGrade } from "@/lib/domain/grading";import { CALIBRATION_QUESTION_ORDER, canUseContextChoice, chooseSenseIndex, secondarySenseIndexes, type ReviewQuestion } from "@/lib/domain/review-flow";import { createInitialReviewState } from "@/lib/domain/scheduler";import { SPELLING_REQUIRED_CORRECT } from "@/lib/domain/constants";import { seededShuffle, unique } from "@/lib/domain/text";import type { AppSettings, CalibrationPlan, CalibrationResult, CalibrationRoundResult, CardProgress, Grade, Phrase, QuestionType, TrackId } from "@/lib/domain/types";import { phraseMap } from "./shared/helpers";import { markExampleUsage, markSenseUsage, withFirstRoundWeakness } from "./shared/progress";

export interface CalibrationQueueItem {
  phrase: Phrase;
  progress: CardProgress;
  questionType: QuestionType;
  senseIndex?: number;
}

function normalizeCalibrationPlan(plan: CalibrationPlan): CalibrationPlan {
  return {
    ...plan,
    currentRound: plan.currentRound ?? 1,
    roundPassedIds: {
      "1": plan.roundPassedIds?.["1"] ?? [],
      "2": plan.roundPassedIds?.["2"] ?? [],
      "3": plan.roundPassedIds?.["3"] ?? [],
      "4": plan.roundPassedIds?.["4"] ?? [],
    },
    failedIds: plan.failedIds ?? [],
    results: plan.results ?? {},
  };
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
      if (existing) {
        const normalized = normalizeCalibrationPlan(existing);
        if (normalized.currentRound === 3) {
          const existingPhrases = await db.phrases.bulkGet(
            normalized.roundPassedIds["3"],
          );
          const reopenedIds = new Set(
            existingPhrases
              .filter(
                (phrase): phrase is Phrase => {
                  if (!phrase) return false;
                  return (
                    secondarySenseIndexes(phrase).length > 0 &&
                    !normalized.results[phrase.id]?.["3"]?.senses
                  );
                },
              )
              .map((phrase) => phrase.id),
          );
          if (reopenedIds.size > 0) {
            normalized.roundPassedIds["3"] = normalized.roundPassedIds[
              "3"
            ].filter((phraseId) => !reopenedIds.has(phraseId));
            await db.calibrationPlans.put(normalized);
          }
        }
        return normalized;
      }

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
  inputPlan: CalibrationPlan,
): Promise<CalibrationQueueItem[]> {
  const plan = normalizeCalibrationPlan(inputPlan);
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
    const availableSenseIndexes = secondarySenseIndexes(phrase);
    const passedSenseIndexes = Object.entries(
      plan.results[id]?.[roundKey]?.senses ?? {},
    )
      .filter(([, result]) => result.finalCorrect)
      .map(([index]) => Number(index));
    const pendingSenseIndexes = availableSenseIndexes.filter(
      (index) => !passedSenseIndexes.includes(index),
    );
    const questionType =
      preferred === "contextChoice" &&
      pendingSenseIndexes.length > 0
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
          ? chooseSenseIndex(phrase, progress, pendingSenseIndexes)
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
): Promise<{
  plan: CalibrationPlan;
  failed: boolean;
  passed: boolean;
  requiredCorrect: number;
  correctStreak: number;
  correctCount: number;
  failureStreak: number;
}> {
  return db.transaction(
    "rw",
    [
      db.calibrationPlans,
      db.reviewLogs,
      db.cardProgress,
      db.reviewStates,
      db.phrases,
    ],
    async () => {
      const storedPlan = await db.calibrationPlans.get(planId);
      if (!storedPlan) throw new Error("Calibration plan not found");
      const plan = normalizeCalibrationPlan(storedPlan);
      if (plan.status === "completed" || plan.failedIds.includes(phraseId)) {
        return {
          plan,
          failed: plan.failedIds.includes(phraseId),
          passed: false,
          requiredCorrect: 0,
          correctStreak: 0,
          correctCount: 0,
          failureStreak: 0,
        };
      }

      const roundKey = String(plan.currentRound) as "1" | "2" | "3" | "4";
      if (plan.roundPassedIds[roundKey].includes(phraseId)) {
        return {
          plan,
          failed: false,
          passed: true,
          requiredCorrect: 1,
          correctStreak: 1,
          correctCount: 1,
          failureStreak: 0,
        };
      }
      const phraseResults = plan.results[phraseId] ?? {};
      const current = phraseResults[roundKey];
      const attemptAt = Date.now();
      const cardProgress = await db.cardProgress.get(phraseId);
      const phrase = await db.phrases.get(phraseId);
      if (!cardProgress || !phrase) {
        throw new Error("Calibration card not found");
      }
      const availableSenseIndexes = secondarySenseIndexes(phrase);
      const isSenseChoice =
        roundKey === "3" && questionType === "senseChoice";
      if (
        isSenseChoice &&
        (senseIndex === undefined ||
          !availableSenseIndexes.includes(senseIndex))
      ) {
        throw new Error("Invalid secondary sense for calibration");
      }
      const previousSenseResult =
        isSenseChoice && senseIndex !== undefined
          ? current?.senses?.[String(senseIndex)]
          : undefined;
      if (previousSenseResult?.finalCorrect) {
        return {
          plan,
          failed: false,
          passed: false,
          requiredCorrect: availableSenseIndexes.length,
          correctStreak: Object.values(current?.senses ?? {}).filter(
            (item) => item.finalCorrect,
          ).length,
          correctCount: Object.values(current?.senses ?? {}).filter(
            (item) => item.finalCorrect,
          ).length,
          failureStreak: current?.failureStreak ?? 0,
        };
      }
      const previousFailureStreak = current?.failureStreak ?? 0;
      const failureStreak = correct ? 0 : previousFailureStreak + 1;
      const incorrectAttempts =
        (current?.incorrectAttempts ?? 0) + (correct ? 0 : 1);
      let nextResult: CalibrationRoundResult;
      let requiredCorrect: number;
      let correctStreak: number;
      let correctCount: number;

      if (isSenseChoice && senseIndex !== undefined) {
        const senseKey = String(senseIndex);
        const senseResults = { ...(current?.senses ?? {}) };
        const previousSense = senseResults[senseKey];
        const senseCorrectStreak = correct
          ? (previousSense?.correctStreak ?? 0) + 1
          : 0;
        const senseCorrectCount =
          (previousSense?.correctCount ?? 0) + (correct ? 1 : 0);
        senseResults[senseKey] = {
          firstCorrect: previousSense?.firstCorrect ?? correct,
          finalCorrect: correct,
          correctStreak: senseCorrectStreak,
          correctCount: senseCorrectCount,
          incorrectAttempts:
            (previousSense?.incorrectAttempts ?? 0) + (correct ? 0 : 1),
          attempts: (previousSense?.attempts ?? 0) + 1,
          lastAttemptAt: attemptAt,
        };
        const completedSenses = availableSenseIndexes
          .map((index) => senseResults[String(index)])
          .filter((item) => Boolean(item));
        const passedSenses = completedSenses.filter(
          (item) => item.finalCorrect,
        ).length;
        const allSensesPresent =
          completedSenses.length === availableSenseIndexes.length;
        const firstCorrect =
          allSensesPresent &&
          completedSenses.every((item) => item.firstCorrect);
        const finalCorrect =
          allSensesPresent &&
          completedSenses.every((item) => item.finalCorrect);
        requiredCorrect = availableSenseIndexes.length;
        correctStreak = passedSenses;
        correctCount = passedSenses;
        nextResult = {
          firstCorrect,
          finalCorrect,
          correctStreak,
          correctCount,
          incorrectAttempts,
          failureStreak,
          attempts: (current?.attempts ?? 0) + 1,
          lastAttemptAt: attemptAt,
          senses: senseResults,
        };
      } else {
        requiredCorrect =
          questionType === "spelling"
            ? SPELLING_REQUIRED_CORRECT
            : questionType === "meaning"
              ? meaningRecallRequirement(cardProgress.day0Rating)
              : 1;
        correctStreak = correct
          ? (current?.correctStreak ?? 0) + 1
          : 0;
        correctCount =
          questionType === "spelling"
            ? (current?.correctCount ?? 0) + (correct ? 1 : 0)
            : correct
              ? 1
              : 0;
        nextResult = {
          firstCorrect: current?.firstCorrect ?? correct,
          finalCorrect: (current?.finalCorrect ?? false) || correct,
          correctStreak,
          correctCount,
          incorrectAttempts,
          failureStreak,
          attempts: (current?.attempts ?? 0) + 1,
          lastAttemptAt: attemptAt,
          ...(current?.senses ? { senses: current.senses } : {}),
        };
      }
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

      const passed = isSenseChoice
        ? nextResult.finalCorrect
        : questionType === "spelling"
          ? correctCount >= requiredCorrect
          : correct && correctStreak >= requiredCorrect;
      let failed = false;
      if (passed) {
        plan.roundPassedIds[roundKey] = unique([
          ...plan.roundPassedIds[roundKey],
          phraseId,
        ]);
      } else if (failureStreak >= 3) {
        failed = true;
        plan.failedIds = unique([...plan.failedIds, phraseId]);
        const progress = await db.cardProgress.get(phraseId);
        if (progress) {
          await db.cardProgress.put(
            withFirstRoundWeakness(
              {
                ...progress,
                state: "incubating",
                provisionalGrade: "D",
                confirmedGrade: undefined,
                calibrationDueOn: addDays(plan.date, 1),
                updatedAt: Date.now(),
              },
              "D",
            ),
          );
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
      return {
        plan,
        failed,
        passed,
        requiredCorrect,
        correctStreak,
        correctCount,
        failureStreak,
      };
    },
  );
}

export async function getCalibrationPlan(
  trackId: TrackId,
  today = localDateKey(),
): Promise<CalibrationPlan | undefined> {
  const plan = await db.calibrationPlans.get(
    `calibration:${today}:${trackId}`,
  );
  return plan ? normalizeCalibrationPlan(plan) : undefined;
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
    const nextProgress: CardProgress = {
      ...progress,
      state: "scheduled",
      confirmedGrade: grade,
      graduatedOn: plan.date,
      updatedAt: now,
      skills: updateSkillsFromCalibration(progress, results),
    };
    await db.cardProgress.put(
      withFirstRoundWeakness(nextProgress, grade),
    );
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
