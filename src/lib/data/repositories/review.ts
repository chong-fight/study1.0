import { db } from "@/lib/data/db";import { getSettings } from "@/lib/data/settings";import { addDays, isDue, localDateKey } from "@/lib/domain/date";import { MAX_REVIEW_CORRECTION_ROUNDS, buildReviewAttemptTypes } from "@/lib/domain/review-flow";import { calibrateGrade } from "@/lib/domain/grading";import { createInitialReviewState, compareReviewPriority, qualityFromResults, updateReviewSchedule } from "@/lib/domain/scheduler";import { SPELLING_REQUIRED_CORRECT } from "@/lib/domain/constants";import { normalizeEnglishAnswer, seededShuffle, shuffle, unique } from "@/lib/domain/text";import type { AppSettings, CalibrationResult, CardProgress, Phrase, ReviewAttempt, ReviewLog, ReviewPlan, ReviewState, TrackId } from "@/lib/domain/types";import { phraseMap } from "./shared/helpers";import { markExampleUsage, markSenseUsage, withFirstRoundWeakness } from "./shared/progress";

export interface ReviewQueueItem {
  phrase: Phrase;
  kind: "calibration" | "review";
  progress?: CardProgress;
  reviewState?: ReviewState;
  attempt?: ReviewAttempt;
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
        kind: "scheduled",
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
    spellingCorrectCount: 0,
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
      const spellingCorrectCount =
        questionType === "spelling"
          ? (attempt.spellingCorrectCount ?? 0) + (correct ? 1 : 0)
          : (attempt.spellingCorrectCount ?? 0);

      attempt.answers.push({
        questionType,
        skill,
        correct,
        answer,
        expectedAnswer,
        responseTimeMs,
      });
      attempt.spellingCorrectStreak = spellingCorrectStreak;
      attempt.spellingCorrectCount = spellingCorrectCount;
      attempt.lastAnsweredAt = Date.now();

      const log: ReviewLog = {
        phraseId,
        trackId: plan.trackId,
        planId,
        dateKey: plan.date,
        timestamp: Date.now(),
        mode:
          plan.kind === "booster"
            ? "booster"
            : plan.calibrationIds.includes(phraseId)
              ? "calibration"
              : "review",
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

      const passStartBeforeCheck = attempt.passStartIndex ?? 0;
      const passSpellingCorrect = attempt.answers
        .slice(passStartBeforeCheck)
        .filter(
          (item) => item.questionType === "spelling" && item.correct,
        ).length;
      if (
        questionType === "spelling" &&
        passSpellingCorrect < SPELLING_REQUIRED_CORRECT
      ) {
        const remainingSpelling = attempt.types
          .slice(attempt.answers.length)
          .filter((item) => item === "spelling").length;
        const missingSpelling = Math.max(
          0,
          SPELLING_REQUIRED_CORRECT -
            passSpellingCorrect -
            remainingSpelling,
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
        const passAnswers = attempt.answers.slice(passStart);
        const passHasSpelling = passAnswers.some(
          (item) => item.questionType === "spelling",
        );
        const passSpellingPassed =
          !passHasSpelling ||
          passAnswers.filter(
            (item) => item.questionType === "spelling" && item.correct,
          ).length >= SPELLING_REQUIRED_CORRECT;
        const otherTypesPassed = passAnswers
          .filter((item) => item.questionType !== "spelling")
          .every((item) => item.correct);
        const passPassed = passSpellingPassed && otherTypesPassed;
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

  if (plan.kind === "booster") {
    const progress = await db.cardProgress.get(attempt.phraseId);
    if (progress) {
      const firstPassHadErrors = results.some((correct) => !correct);
      const boosterRound = plan.boosterRound ?? 2;
      await db.cardProgress.put({
        ...progress,
        lastBoosterAt: now,
        boosterMistakeCount: results.filter((correct) => !correct).length,
        lastBoosterPassed: !firstPassHadErrors && !forceFailure,
        lastBoosterRound: boosterRound,
        boosterCompletedRounds: Math.max(
          progress.boosterCompletedRounds ?? 0,
          boosterRound,
        ),
        updatedAt: now,
        skills: updateSkills(progress, gradedAttempt),
      });
    }
  } else if (plan.calibrationIds.includes(attempt.phraseId)) {
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
        const nextProgress: CardProgress = {
          ...progress,
          state: "incubating",
          provisionalGrade: grade,
          confirmedGrade: undefined,
          calibrationDueOn: addDays(plan.date, 1),
          graduatedOn: undefined,
          updatedAt: now,
          skills: updateSkills(progress, gradedAttempt),
        };
        await db.cardProgress.put(
          withFirstRoundWeakness(nextProgress, grade),
        );
      } else {
      const reviewState = createInitialReviewState(
        attempt.phraseId,
        plan.trackId,
        grade,
        plan.date,
        now,
      );
      await db.reviewStates.put(reviewState);
      const nextProgress: CardProgress = {
        ...progress,
        state: "scheduled",
        confirmedGrade: grade,
        graduatedOn: plan.date,
        updatedAt: now,
        skills: updateSkills(progress, gradedAttempt),
      };
      await db.cardProgress.put(
        withFirstRoundWeakness(nextProgress, grade),
      );
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

export async function getReviewPlan(
  trackId: TrackId,
  today = localDateKey(),
): Promise<ReviewPlan | undefined> {
  return db.reviewPlans.get(`${today}:${trackId}`);
}
