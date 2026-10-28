import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/domain/constants";
import { createCardProgress } from "@/lib/domain/learning-flow";
import { createInitialReviewState } from "@/lib/domain/scheduler";
import {
  buildQuestion,
  chooseExampleVariant,
  chooseReviewTypes,
  chooseSenseIndex,
} from "@/lib/domain/review-flow";
import type { CardProgress, Phrase } from "@/lib/domain/types";
import { db } from "@/lib/data/db";
import {
  ensureLearningSession,
  ensureReviewPlan,
  getLearningSession,
  getReviewQueue,
  recordLearningGateAnswer,
  recordLearningPreviewRating,
  recordLearningPreviewRecognition,
  recordReviewAnswer,
  setDay0Rating,
  startReviewAttempt,
} from "@/lib/data/repositories";
import { importPhrases } from "@/lib/import/importer";
import { normalizeImportJson } from "@/lib/import/normalize";

function source(rows: { phrase: string; meaning: string; example: string }[]) {
  return JSON.stringify({
    metadata: { role: "fixed_collocation_library" },
    phrases: rows,
  });
}

function phrase(
  id: string,
  text: string,
  meaning: string,
  exampleEn: string,
): Phrase {
  return {
    id,
    trackId: "fixed",
    contentKey: `fixed:${text}`,
    phrase: text,
    normalizedPhrase: text,
    meaning,
    exampleEn,
    exampleZh: "example translation",
    entryType: "fixed phrase",
    category: "test",
    tags: [],
    priority: 1,
    exerciseModes: ["recognition", "production"],
    supportsCloze: true,
    confusionGroup: "",
    synonyms: [],
    source: "test",
    contentStatus: "complete",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("learning experience", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("blanks the target phrase in context questions", () => {
    const item = {
      ...phrase(
        "fixed:look-into",
        "look into",
        "investigate",
        "We need to look into the cause of the failure.",
      ),
      quizExampleEn: "The police promised to look into the complaint.",
      quizExampleZh: "警方承诺会调查这项投诉。",
    };
    const question = buildQuestion("contextChoice", item, [
      "hold back",
      "stick out",
      "recover from a loss",
    ]);
    expect(question.prompt).toContain("______");
    expect(question.prompt.toLowerCase()).not.toContain("look into");
    expect(question.prompt).toContain("police");
    expect(question.prompt).not.toContain("system failure");
  });

  it("rotates all four examples without immediately repeating the last one", () => {
    const item = {
      ...phrase(
        "fixed:look-into",
        "look into",
        "investigate",
        "We need to look into the cause.",
      ),
      exampleVariants: [
        { exampleEn: "One.", exampleZh: "一。" },
        { exampleEn: "Two.", exampleZh: "二。" },
        { exampleEn: "Three.", exampleZh: "三。" },
        { exampleEn: "Four.", exampleZh: "四。" },
      ],
    };
    const progress = {
      exampleUseCounts: [0, 0, 0, 0],
      lastExampleIndex: undefined,
    } as unknown as CardProgress;
    const sequence: number[] = [];
    let last: number | undefined;
    for (let index = 0; index < 12; index += 1) {
      const selected = chooseExampleVariant(item, {
        ...progress,
        lastExampleIndex: last,
      });
      expect(selected).not.toBe(last);
      sequence.push(selected);
      progress.exampleUseCounts![selected] += 1;
      last = selected;
    }
    expect(sequence).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
  });

  it("tests a secondary meaning with its own example and rotates senses", () => {
    const item = {
      ...phrase(
        "fixed:be-open-to",
        "be open to",
        "对……开放",
        "The library is open to all students.",
      ),
      senses: [
        {
          meaning: "对……开放",
          primary: true,
          exampleEn: "The library is open to all students.",
          exampleZh: "图书馆对所有学生开放。",
        },
        {
          meaning: "愿意接受",
          exampleEn: "The manager is open to new ideas.",
          exampleZh: "经理愿意接受新想法。",
        },
        {
          meaning: "可供……使用",
          exampleEn: "The equipment is open to trained staff.",
          exampleZh: "该设备可供受训员工使用。",
        },
      ],
    };
    const question = buildQuestion(
      "senseChoice",
      item,
      ["负责", "依靠", "参加"],
      undefined,
      1,
    );
    expect(question.prompt).toBe("The manager is open to new ideas.");
    expect(question.expected).toBe("愿意接受");
    expect(question.options).toContain("对……开放");

    const progress = {
      senseUseCounts: [0, 0, 0],
      lastSenseIndex: undefined,
    } as unknown as CardProgress;
    const sequence: number[] = [];
    let last: number | undefined;
    for (let index = 0; index < 6; index += 1) {
      const selected = chooseSenseIndex(item, {
        ...progress,
        lastSenseIndex: last,
      });
      expect(selected).not.toBe(last);
      sequence.push(selected!);
      progress.senseUseCounts![selected!] += 1;
      last = selected;
    }
    expect(sequence).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it("includes a sense-choice question in reviews of multi-sense cards", () => {
    const item = {
      ...phrase(
        "fixed:be-open-to",
        "be open to",
        "对……开放",
        "The library is open to all students.",
      ),
      senses: [
        { meaning: "对……开放", primary: true },
        { meaning: "愿意接受" },
      ],
    };
    expect(chooseReviewTypes(item, undefined, () => 0)).toContain(
      "senseChoice",
    );
  });

  it("persists preview progress before any quiz starts", async () => {
    await importPhrases(
      normalizeImportJson(
        source([
          {
            phrase: "look into",
            meaning: "investigate",
            example: "We need to look into the cause.",
          },
        ]),
        "preview.json",
      ),
    );
    const session = await ensureLearningSession(
      "fixed",
      "2026-01-01",
      DEFAULT_SETTINGS,
      () => 0,
    );
    const phraseId = session!.phraseIds[0];
    const updated = await recordLearningPreviewRating(
      session!.id,
      phraseId,
      "unknown",
    );

    expect(updated.previewedPhraseIds).toEqual([phraseId]);
    expect(
      (await getLearningSession("fixed", "2026-01-01"))?.previewedPhraseIds,
    ).toEqual([phraseId]);
    expect((await db.cardProgress.get(phraseId))?.day0Rating).toBe("unknown");
  });

  it("repeats unfamiliar previews until the adaptive recognition target is met", async () => {
    await importPhrases(
      normalizeImportJson(
        source([
          {
            phrase: "look into",
            meaning: "investigate",
            example: "We need to look into the cause.",
          },
        ]),
        "adaptive-preview.json",
      ),
    );
    const session = await ensureLearningSession(
      "fixed",
      "2026-01-01",
      DEFAULT_SETTINGS,
      () => 0,
    );
    const phraseId = session!.phraseIds[0];
    await recordLearningPreviewRating(session!.id, phraseId, "unknown");
    expect((await db.cardProgress.get(phraseId))?.previewRequiredCount).toBe(4);

    for (let count = 1; count <= 3; count += 1) {
      await recordLearningPreviewRecognition(session!.id, phraseId, true);
      expect(
        (await db.cardProgress.get(phraseId))?.previewRecognizedCount,
      ).toBe(count);
    }
    await recordLearningPreviewRecognition(session!.id, phraseId, false);
    expect(
      (await db.cardProgress.get(phraseId))?.previewRecognizedCount,
    ).toBe(0);
    for (let count = 1; count <= 4; count += 1) {
      await recordLearningPreviewRecognition(session!.id, phraseId, true);
    }
    expect(
      (await db.cardProgress.get(phraseId))?.previewRecognizedCount,
    ).toBe(4);
  });

  it("uses the initial rating to set the meaning-recall streak target", async () => {
    await importPhrases(
      normalizeImportJson(
        source([
          {
            phrase: "look into",
            meaning: "investigate",
            example: "We need to look into the cause.",
          },
        ]),
        "adaptive-meaning.json",
      ),
    );
    const session = await ensureLearningSession(
      "fixed",
      "2026-01-01",
      DEFAULT_SETTINGS,
      () => 0,
    );
    const phraseId = session!.phraseIds[0];
    await setDay0Rating(phraseId, "vague");

    const first = await recordLearningGateAnswer(
      session!.id,
      phraseId,
      "meaning",
      "meaning",
      "recognition",
      true,
      "investigate",
      "investigate",
      100,
    );
    expect(first.requiredCorrect).toBe(2);
    expect(first.passed).toBe(false);
    const second = await recordLearningGateAnswer(
      session!.id,
      phraseId,
      "meaning",
      "meaning",
      "recognition",
      true,
      "investigate",
      "investigate",
      100,
    );
    expect(second.passed).toBe(true);
  });

  it("requires three correct spelling attempts and keeps progress after an error", async () => {
    await importPhrases(
      normalizeImportJson(
        source([
          {
            phrase: "look into",
            meaning: "investigate",
            example: "We need to look into the cause.",
          },
        ]),
        "spelling.json",
      ),
    );
    const session = await ensureLearningSession(
      "fixed",
      "2026-01-01",
      DEFAULT_SETTINGS,
      () => 0,
    );
    const phraseId = session!.phraseIds[0];
    await setDay0Rating(phraseId, "know");
    await recordLearningGateAnswer(
      session!.id,
      phraseId,
      "meaning",
      "meaning",
      "recognition",
      true,
      "investigate",
      "investigate",
      100,
    );

    const first = await recordLearningGateAnswer(
      session!.id,
      phraseId,
      "production",
      "spelling",
      "production",
      true,
      "look into",
      "look into",
      100,
    );
    expect(first.correctStreak).toBe(1);
    expect(first.correctCount).toBe(1);
    expect(first.passed).toBe(false);

    const reset = await recordLearningGateAnswer(
      session!.id,
      phraseId,
      "production",
      "spelling",
      "production",
      false,
      "look in",
      "look into",
      100,
    );
    expect(reset.correctStreak).toBe(0);
    expect(reset.correctCount).toBe(1);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await recordLearningGateAnswer(
        session!.id,
        phraseId,
        "production",
        "spelling",
        "production",
        true,
        "look into",
        "look into",
        100,
      );
      expect(result.passed).toBe(attempt === 2);
    }
  });

  it("interleaves review questions across cards", async () => {
    await importPhrases(
      normalizeImportJson(
        source([
          {
            phrase: "look into",
            meaning: "investigate",
            example: "We need to look into the cause.",
          },
          {
            phrase: "hold back",
            meaning: "prevent progress",
            example: "Do not hold back the team.",
          },
        ]),
        "review.json",
      ),
    );
    const phrases = await db.phrases.toArray();
    await db.reviewStates.bulkPut(
      phrases.map((item, index) => ({
        ...createInitialReviewState(
          item.id,
          "fixed",
          "B",
          "2026-01-01",
          index,
        ),
        nextReviewOn: "2026-01-02",
      })),
    );
    const plan = await ensureReviewPlan(
      "fixed",
      "2026-01-02",
      DEFAULT_SETTINGS,
    );
    const firstId = plan.phraseIds[0];
    const withAttempt = await startReviewAttempt(plan.id, firstId);
    const firstType = withAttempt.attempts[firstId].types[0];
    await recordReviewAnswer(
      plan.id,
      firstId,
      firstType,
      firstType === "spelling"
        ? "production"
        : firstType === "contextChoice"
          ? "usage"
          : "recognition",
      true,
      "answer",
      "answer",
      100,
    );

    const queue = await getReviewQueue(
      (await ensureReviewPlan("fixed", "2026-01-02", DEFAULT_SETTINGS))!,
    );
    expect(queue[0].phrase.id).not.toBe(firstId);
  });

  it("requeues a review card after a wrong answer and completes the second pass", async () => {
    await importPhrases(
      normalizeImportJson(
        source([
          {
            phrase: "look into",
            meaning: "investigate",
            example: "We need to look into the cause.",
          },
        ]),
        "review-retry.json",
      ),
    );
    const phrase = (await db.phrases.toArray())[0];
    await db.cardProgress.put({
      ...createCardProgress(phrase, "2026-01-01"),
      state: "scheduled",
    });
    await db.reviewStates.put({
      ...createInitialReviewState(
        phrase.id,
        "fixed",
        "B",
        "2026-01-01",
        1,
      ),
      nextReviewOn: "2026-01-02",
    });
    let plan = await ensureReviewPlan(
      "fixed",
      "2026-01-02",
      DEFAULT_SETTINGS,
    );
    plan.attempts[phrase.id] = {
      phraseId: phrase.id,
      types: ["meaning", "phraseChoice"],
      answers: [],
      initialTypesLength: 2,
      passStartIndex: 0,
      reviewRound: 1,
      spellingCorrectStreak: 0,
      startedAt: Date.now(),
    };
    await db.reviewPlans.put(plan);

    await recordReviewAnswer(
      plan.id,
      phrase.id,
      "meaning",
      "recognition",
      false,
      "wrong",
      phrase.meaning,
      100,
    );
    await recordReviewAnswer(
      plan.id,
      phrase.id,
      "phraseChoice",
      "recognition",
      true,
      phrase.phrase,
      phrase.phrase,
      100,
    );
    plan = (await db.reviewPlans.get(plan.id))!;
    expect(plan.status).toBe("active");
    expect(plan.completedPhraseIds).toHaveLength(0);
    expect(plan.attempts[phrase.id].reviewRound).toBe(2);
    expect(plan.attempts[phrase.id].types.length).toBeGreaterThan(2);

    const correctionTypes = plan.attempts[phrase.id].types.slice(2);
    for (const [index, questionType] of correctionTypes.entries()) {
      const skill =
        questionType === "spelling"
          ? "production"
          : questionType === "contextChoice" || questionType === "cloze"
            ? "usage"
            : "recognition";
      await recordReviewAnswer(
        plan.id,
        phrase.id,
        questionType,
        skill,
        true,
        "answer",
        "answer",
        100 + index,
      );
    }
    plan = (await db.reviewPlans.get(plan.id))!;
    expect(plan.status).toBe("completed");
    expect(plan.completedPhraseIds).toEqual([phrase.id]);
  });

  it("stops after three failed correction rounds and schedules the card for tomorrow", async () => {
    await importPhrases(
      normalizeImportJson(
        source([
          {
            phrase: "look into",
            meaning: "investigate",
            example: "We need to look into the cause.",
          },
        ]),
        "review-failure.json",
      ),
    );
    const phrase = (await db.phrases.toArray())[0];
    await db.cardProgress.put({
      ...createCardProgress(phrase, "2026-01-01"),
      state: "scheduled",
    });
    await db.reviewStates.put({
      ...createInitialReviewState(
        phrase.id,
        "fixed",
        "B",
        "2026-01-01",
        1,
      ),
      nextReviewOn: "2026-01-02",
    });
    let plan = await ensureReviewPlan(
      "fixed",
      "2026-01-02",
      DEFAULT_SETTINGS,
    );
    plan.attempts[phrase.id] = {
      phraseId: phrase.id,
      types: ["meaning", "phraseChoice"],
      answers: [],
      initialTypesLength: 2,
      passStartIndex: 0,
      reviewRound: 3,
      spellingCorrectStreak: 0,
      startedAt: Date.now(),
    };
    await db.reviewPlans.put(plan);

    await recordReviewAnswer(
      plan.id,
      phrase.id,
      "meaning",
      "recognition",
      false,
      "wrong",
      phrase.meaning,
      100,
    );
    await recordReviewAnswer(
      plan.id,
      phrase.id,
      "phraseChoice",
      "recognition",
      false,
      "wrong",
      phrase.phrase,
      100,
    );
    plan = (await db.reviewPlans.get(plan.id))!;
    expect(plan.status).toBe("completed");
    expect((await db.reviewStates.get(phrase.id))?.nextReviewOn).toBe(
      "2026-01-03",
    );
    expect((await db.cardProgress.get(phrase.id))?.state).toBe("relearning");
  });

  it("requires every secondary sense before passing the multi-sense exit gate", async () => {
    const raw = JSON.stringify({
      metadata: { role: "fixed_collocation_library" },
      phrases: [
        {
          phrase: "be open to",
          meaning: "对……开放",
          example: "The library is open to all students.",
          exampleZh: "图书馆对所有学生开放。",
          quizExampleEn: "The hall is open to the public today.",
          quizExampleZh: "大厅今天向公众开放。",
          exampleVariants: [
            {
              exampleEn: "The library is open to all students.",
              exampleZh: "图书馆对所有学生开放。",
            },
            {
              exampleEn: "The hall is open to the public today.",
              exampleZh: "大厅今天向公众开放。",
            },
            {
              exampleEn: "The garden is open to visitors.",
              exampleZh: "花园向游客开放。",
            },
            {
              exampleEn: "The service is open to new members.",
              exampleZh: "这项服务向新成员开放。",
            },
          ],
          senses: [
            {
              meaning: "对……开放",
              primary: true,
              exampleEn: "The library is open to all students.",
              exampleZh: "图书馆对所有学生开放。",
            },
            {
              meaning: "愿意接受",
              exampleEn: "The manager is open to new ideas.",
              exampleZh: "经理愿意接受新想法。",
            },
            {
              meaning: "可供……使用",
              exampleEn: "The equipment is open to trained staff.",
              exampleZh: "该设备可供受训员工使用。",
            },
          ],
          primaryExampleIndexes: [0, 1, 2, 3],
        },
      ],
    });
    await importPhrases(normalizeImportJson(raw, "multi-sense.json"));
    const session = await ensureLearningSession(
      "fixed",
      "2026-01-01",
      DEFAULT_SETTINGS,
      () => 0,
    );
    const phraseId = session!.phraseIds[0];
    await setDay0Rating(phraseId, "know");
    await recordLearningGateAnswer(
      session!.id,
      phraseId,
      "meaning",
      "meaning",
      "recognition",
      true,
      "对……开放",
      "对……开放",
      100,
    );
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await recordLearningGateAnswer(
        session!.id,
        phraseId,
        "production",
        "spelling",
        "production",
        true,
        "be open to",
        "be open to",
        100,
      );
    }
    await recordLearningGateAnswer(
      session!.id,
      phraseId,
      "application",
      "contextChoice",
      "usage",
      true,
      "be open to",
      "be open to",
      100,
    );
    const firstSense = await recordLearningGateAnswer(
      session!.id,
      phraseId,
      "exit",
      "senseChoice",
      "usage",
      true,
      "愿意接受",
      "愿意接受",
      100,
      undefined,
      1,
    );
    expect(firstSense.passed).toBe(false);
    const secondSense = await recordLearningGateAnswer(
      session!.id,
      phraseId,
      "exit",
      "senseChoice",
      "usage",
      true,
      "可供……使用",
      "可供……使用",
      100,
      undefined,
      2,
    );
    expect(secondSense.passed).toBe(true);
    expect(
      (await db.cardProgress.get(phraseId))?.sensePassedIndexes,
    ).toEqual([1, 2]);
  });
});
