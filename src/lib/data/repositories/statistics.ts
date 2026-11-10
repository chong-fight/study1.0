import { db } from "@/lib/data/db";import { getSettings } from "@/lib/data/settings";import { addDays, isDue, localDateKey } from "@/lib/domain/date";import { calculateFirstRoundWeaknessScore, selectBoosterCandidates, type BoosterCandidate } from "@/lib/domain/booster-selection";import { compareReviewPriority } from "@/lib/domain/scheduler";import { TRACKS } from "@/lib/domain/constants";import { unique } from "@/lib/domain/text";import type { AppSettings, CalibrationPlan, Grade, LearningSession, Phrase, ReviewPlan, TrackId } from "@/lib/domain/types";import { normalizeLearningSession, phraseMap } from "./shared/helpers";import { hasBlockingFormalWorkSnapshot, nextBoosterRound } from "./shared/workload";

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
  reviewSettledIds: string[];
  reviewPendingIds: string[];
  boosterPhrases: Phrase[];
  boosterRound?: number;
  completedPhrases: Phrase[];
  deferredCount: number;
}

export interface TodaySummary {
  total: number;
  done: number;
  newCount: number;
  newPendingCount: number;
  reviewPendingCount: number;
  dueCount: number;
  actualDueCount: number;
  failedTodayCount: number;
  hasDue: boolean;
  hasLearning: boolean;
  boosterOnly: boolean;
  boosterTrackData?: TrackTodayData;
}

export function summarizeTodayData(
  data: readonly TrackTodayData[],
  filter: "all" | TrackId = "all",
): TodaySummary {
  const visibleTracks =
    filter === "all"
      ? data
      : data.filter((item) => item.trackId === filter);
  const total = visibleTracks.reduce(
    (sum, track) =>
      sum +
      (track.session
        ? track.learningPhrases.length
        : track.newPhrases.length) +
      track.reviewPhrases.length,
    0,
  );
  const done = visibleTracks.reduce(
    (sum, track) =>
      sum + track.learningDone + track.reviewSettledIds.length,
    0,
  );
  const newCount = visibleTracks.reduce(
    (sum, track) =>
      sum +
      (track.session
        ? track.learningPhrases.length
        : track.newPhrases.length),
    0,
  );
  const newPendingCount = visibleTracks.reduce(
    (sum, track) =>
      sum +
      (track.session
        ? track.learningPhrases.length - track.learningDone
        : track.newPhrases.length),
    0,
  );
  const reviewPendingCount = visibleTracks.reduce(
    (sum, track) => sum + track.reviewPendingIds.length,
    0,
  );
  const dueCount = data.reduce(
    (sum, track) => sum + track.reviewPendingIds.length,
    0,
  );
  const actualDueCount = data.reduce(
    (sum, track) =>
      sum + track.calibrationPhrases.length + track.duePhrases.length,
    0,
  );
  const hasDue = data.some((track) => track.reviewPendingIds.length > 0);
  const boosterOnly =
    hasDue &&
    actualDueCount === 0 &&
    data.some(
      (track) =>
        track.plan?.kind === "booster" && track.plan.status === "active",
    );
  return {
    total,
    done,
    newCount,
    newPendingCount,
    reviewPendingCount,
    dueCount,
    actualDueCount,
    failedTodayCount: data.reduce(
      (sum, track) => sum + track.reviewFailedIds.length,
      0,
    ),
    hasDue,
    hasLearning: data.some(
      (track) =>
        track.session?.status === "active" || track.newPhrases.length > 0,
    ),
    boosterOnly,
    boosterTrackData:
      data.find((track) => track.boosterPhrases.length > 0) ??
      data.find((track) => track.plan?.kind === "booster"),
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
  const hasBlockingFormalWork = hasBlockingFormalWorkSnapshot(
    states,
    progresses,
    plans,
    calibrationPlans,
    today,
  );
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
      (phrase) => {
        const progress = progressMap.get(phrase.id);
        return Boolean(progress && progress.state !== "day0");
      },
    ).length;
    const learningCompletedIds = learningPhrases
      .filter((phrase) => {
        const progress = progressMap.get(phrase.id);
        return Boolean(progress && progress.state !== "day0");
      })
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
    const reviewSettledIds = unique([
      ...reviewCompletedIds,
      ...reviewFailedIds,
    ]);
    const reviewPendingIds = unique(
      combinedReviewIds.filter(
        (id) =>
          !reviewSettledIds.includes(id),
      ),
    );
    const canOfferBooster =
      (!session || session.status === "completed") &&
      unlearned.length === 0 &&
      newPhrases.length === 0 &&
      calibrationPhrases.length === 0 &&
      duePhrases.length === 0 &&
      (!plan || plan.phraseIds.length === 0) &&
      !hasBlockingFormalWork;
    const reviewStateById = new Map(
      states
        .filter((item) => item.trackId === trackId)
        .map((item) => [item.phraseId, item]),
    );
    const trackProgresses = progresses.filter(
      (item) => item.trackId === trackId,
    );
    const boosterRound = nextBoosterRound(trackProgresses);
    const boosterCandidates: BoosterCandidate[] = trackProgresses
      .filter(
        (item) =>
          item.state !== "day0" &&
          (item.boosterCompletedRounds ?? 0) < boosterRound &&
          Boolean(phraseById.get(item.phraseId)) &&
          !phraseById.get(item.phraseId)?.archived,
      )
      .map((item) => {
        const state = reviewStateById.get(item.phraseId);
        return {
          phraseId: item.phraseId,
          grade: item.confirmedGrade ?? state?.grade,
          provisionalGrade: item.provisionalGrade,
          day0Rating: item.day0Rating,
          mistakeCount: state?.mistakeCount ?? 0,
          lapses: state?.lapses ?? 0,
          lastReviewAt: state?.lastReviewAt,
          lastBoosterAt: item.lastBoosterAt,
          boosterMistakeCount: item.boosterMistakeCount,
          firstRoundWeaknessScore:
            item.firstRoundWeaknessScore ??
            calculateFirstRoundWeaknessScore(
              item,
              item.confirmedGrade ?? state?.grade,
            ),
        };
      });
    const boosterPhrases = canOfferBooster
      ? selectBoosterCandidates(
          boosterCandidates,
          trackLimit,
          `${today}:${trackId}:booster-preview`,
          boosterRound,
        )
          .map((id) => phraseById.get(id))
          .filter((item): item is Phrase => Boolean(item))
      : [];

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
      reviewSettledIds,
      reviewPendingIds,
      boosterPhrases,
      boosterRound:
        plan?.kind === "booster"
          ? plan.boosterRound ?? boosterRound
          : boosterRound,
      completedPhrases,
      deferredCount: plan?.deferredPhraseIds.length ?? 0,
    };
  });
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

export function trackLabel(trackId: TrackId): string {
  return TRACKS[trackId].label;
}
