import { db } from "@/lib/data/db";import { getSettings } from "@/lib/data/settings";import { isDue, localDateKey } from "@/lib/domain/date";import { calculateFirstRoundWeaknessScore, selectBoosterCandidates, type BoosterCandidate } from "@/lib/domain/booster-selection";import type { AppSettings, ReviewPlan, TrackId } from "@/lib/domain/types";import { ensureReviewPlan } from "./review";import { phraseMap } from "./shared/helpers";import { hasBlockingFormalWorkSnapshot, nextBoosterRound } from "./shared/workload";

export async function ensureBoosterReviewPlan(
  trackId: TrackId,
  today = localDateKey(),
  settings: AppSettings = getSettings(),
): Promise<ReviewPlan> {
  const scheduledPlan = await ensureReviewPlan(trackId, today, settings);
  if (scheduledPlan.phraseIds.length > 0) return scheduledPlan;

  return db.transaction(
    "rw",
    [
      db.reviewPlans,
      db.cardProgress,
      db.reviewStates,
      db.phrases,
      db.learningSessions,
      db.calibrationPlans,
    ],
    async () => {
      const existing = await db.reviewPlans.get(scheduledPlan.id);
      if (!existing || existing.phraseIds.length > 0) {
        return existing ?? scheduledPlan;
      }

      const [
        sessions,
        calibrationPlans,
        allProgresses,
        allStates,
        phrases,
        allPlans,
      ] =
        await Promise.all([
          db.learningSessions.where("date").equals(today).toArray(),
          db.calibrationPlans.where("date").equals(today).toArray(),
          db.cardProgress.toArray(),
          db.reviewStates.toArray(),
          db.phrases.where("trackId").equals(trackId).toArray(),
          db.reviewPlans.toArray(),
        ]);
      const progresses = allProgresses.filter(
        (item) => item.trackId === trackId,
      );
      const states = allStates.filter(
        (item) => item.trackId === trackId,
      );
      const trackPlans = allPlans.filter(
        (plan) => plan.trackId === trackId,
      );
      const todayPlans = allPlans.filter(
        (plan) => plan.date === today,
      );
      const staleBoosters = trackPlans.filter(
        (plan) =>
          plan.kind === "booster" &&
          plan.status === "active" &&
          plan.date < today,
      );
      if (staleBoosters.length > 0) {
        const now = Date.now();
        await db.reviewPlans.bulkPut(
          staleBoosters.map((plan) => ({
            ...plan,
            status: "completed" as const,
            updatedAt: now,
            completedAt: now,
          })),
        );
      }
      if (
        sessions.some(
          (session) =>
            session.trackId === trackId && session.status === "active",
        ) ||
        calibrationPlans.some(
          (plan) =>
            plan.trackId === trackId &&
            plan.status === "active" &&
            plan.phraseIds.length > 0,
        ) ||
        hasBlockingFormalWorkSnapshot(
          allStates,
          allProgresses,
          todayPlans,
          calibrationPlans,
          today,
        )
      ) {
        return existing;
      }

      const phraseById = phraseMap(phrases);
      const progressIds = new Set(
        progresses.map((progress) => progress.phraseId),
      );
      if (
        phrases.some(
          (phrase) => !phrase.archived && !progressIds.has(phrase.id),
        )
      ) {
        return existing;
      }
      const stateById = new Map(states.map((item) => [item.phraseId, item]));
      const boosterRound = nextBoosterRound(progresses);
      const dueIds = new Set(
        progresses
          .filter(
            (item) =>
              (item.state === "incubating" &&
                item.calibrationDueOn &&
                isDue(item.calibrationDueOn, today)) ||
              (stateById.get(item.phraseId) &&
                isDue(
                  stateById.get(item.phraseId)!.nextReviewOn,
                  today,
                )),
          )
          .map((item) => item.phraseId),
      );
      const candidates: BoosterCandidate[] = progresses
        .filter(
          (item) =>
            item.state !== "day0" &&
            (item.boosterCompletedRounds ?? 0) < boosterRound &&
            !dueIds.has(item.phraseId) &&
            Boolean(phraseById.get(item.phraseId)) &&
            !phraseById.get(item.phraseId)?.archived,
        )
        .map((item) => {
          const state = stateById.get(item.phraseId);
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
      const trackLimit =
        trackId === "fixed" ? settings.fixedNewLimit : settings.verbNewLimit;
      const selectedIds = selectBoosterCandidates(
        candidates,
        trackLimit,
        `${today}:${trackId}:booster`,
        boosterRound,
      );
      if (selectedIds.length === 0) return existing;

      const nextPlan: ReviewPlan = {
        ...existing,
        kind: "booster",
        boosterRound,
        phraseIds: selectedIds,
        calibrationIds: [],
        deferredPhraseIds: [],
        completedPhraseIds: [],
        attempts: {},
        status: "active",
        updatedAt: Date.now(),
        completedAt: undefined,
      };
      await db.reviewPlans.put(nextPlan);
      return nextPlan;
    },
  );
}
