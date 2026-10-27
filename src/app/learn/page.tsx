"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import MeaningSenses from "@/components/MeaningSenses";
import { TRACKS, TRACK_LIST } from "@/lib/domain/constants";
import { isPreviewRecognized } from "@/lib/domain/learning-policy";
import {
  buildQuestion,
  canUseContextChoice,
  checkAnswer,
  chooseExampleVariant,
  chooseSenseIndex,
  contextExample,
  type ReviewQuestion,
} from "@/lib/domain/review-flow";
import { seededShuffle, shuffle } from "@/lib/domain/text";
import type {
  LearningSession,
  QuestionType,
  Rating,
  TrackId,
} from "@/lib/domain/types";
import {
  ensureLearningSession,
  getDistractors,
  getLearningCards,
  getLearningGateQueue,
  getLearningSession,
  getMeaningDistractors,
  recordLearningPreviewRecognition,
  recordLearningPreviewRating,
  recordLearningGateAnswer,
  type LearningGateQueueItem,
} from "@/lib/data/repositories";
import { getSettings } from "@/lib/data/settings";
import { useLocalDay } from "@/lib/hooks/useLocalDay";
import { useQuestionScroll } from "@/lib/hooks/useQuestionScroll";

type Step = "overview" | "answer" | "feedback" | "done";
type LearningCard = Awaited<ReturnType<typeof getLearningCards>>[number];

const GATE_LABELS = [
  "含义回忆",
  "主动产出",
  "语境应用",
  "出口测试",
];

const RATING_LABELS: { value: Rating; label: string }[] = [
  { value: "unknown", label: "陌生" },
  { value: "vague", label: "模糊" },
  { value: "know", label: "认识" },
];

export default function LearnPage() {
  const today = useLocalDay();
  const [trackId, setTrackId] = useState<TrackId>("fixed");
  const [session, setSession] = useState<LearningSession | null>(null);
  const [learningCards, setLearningCards] = useState<LearningCard[]>([]);
  const [queue, setQueue] = useState<LearningGateQueueItem[]>([]);
  const [question, setQuestion] = useState<ReviewQuestion | null>(null);
  const [step, setStep] = useState<Step>("overview");
  const [answer, setAnswer] = useState("");
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    expected: string;
    exampleEn: string;
    exampleZh: string;
    synonyms: string[];
    correctStreak: number;
    requiredCorrect: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const startedAt = useRef(0);
  useQuestionScroll(Boolean(question), Boolean(feedback));

  const current = queue[0];
  const previewShuffleOrder = seededShuffle(
    learningCards.map((item) => item.phrase.id),
    `${session?.id ?? today}:preview`,
  );
  const previewShuffleRank = new Map(
    previewShuffleOrder.map((id, index) => [id, index]),
  );
  const learningCardOrder = new Map(
    learningCards.map((item, index) => [item.phrase.id, index]),
  );
  const previewQueue = learningCards
    .filter((item) => !isPreviewRecognized(item.progress))
    .sort((left, right) => {
      const leftRated = Boolean(left.progress?.day0Rating);
      const rightRated = Boolean(right.progress?.day0Rating);
      if (leftRated !== rightRated) return leftRated ? 1 : -1;
      if (!leftRated) {
        return (
          (learningCardOrder.get(left.phrase.id) ?? 0) -
          (learningCardOrder.get(right.phrase.id) ?? 0)
        );
      }
      const countDifference =
        (left.progress?.previewRecognizedCount ?? 0) -
        (right.progress?.previewRecognizedCount ?? 0);
      if (countDifference !== 0) return countDifference;
      return (
        (previewShuffleRank.get(left.phrase.id) ?? 0) -
        (previewShuffleRank.get(right.phrase.id) ?? 0)
      );
    });
  const previewItem = previewQueue[0];
  const previewCompletedCount = learningCards.length - previewQueue.length;
  const needsInitialPreviewRating = !previewItem?.progress?.day0Rating;
  const inOverview = step === "overview" && Boolean(previewItem);
  const activePhrase = inOverview ? previewItem?.phrase : current?.phrase;
  const total = session?.phraseIds.length ?? 0;
  const currentRound = session?.currentRound ?? 1;
  const roundKey = String(currentRound) as "1" | "2" | "3" | "4";
  const roundDone =
    session?.roundPassedIds?.[roundKey]?.length ??
    0;

  async function buildGateQuestion(item: LearningGateQueueItem) {
    const gate = item.gate;
    const available: QuestionType[] = ["meaning", "phraseChoice", "spelling"];
    if (canUseContextChoice(item.phrase)) available.push("contextChoice");
    let type: QuestionType;
    let senseIndex: number | undefined;
    if (gate === "meaning") type = "meaning";
    else if (gate === "production") type = "spelling";
    else if (gate === "application") {
      type = canUseContextChoice(item.phrase)
        ? "contextChoice"
        : "phraseChoice";
    } else if ((item.phrase.senses ?? []).length > 1) {
      type = "senseChoice";
      const pendingSenseIndexes = (item.phrase.senses ?? [])
        .map((_, index) => index)
        .filter(
          (index) =>
            index > 0 &&
            !(item.progress.sensePassedIndexes ?? []).includes(index),
        );
      senseIndex = chooseSenseIndex(
        item.phrase,
        item.progress,
        pendingSenseIndexes,
      );
    } else {
      type = shuffle(available)[0];
    }
    const distractors =
      type === "senseChoice"
        ? await getMeaningDistractors(item.phrase, 3)
        : ["phraseChoice", "contextChoice", "cloze"].includes(type)
          ? await getDistractors(item.phrase, 3)
          : [];
    const variantIndex = ["contextChoice", "cloze"].includes(type)
      ? chooseExampleVariant(item.phrase, item.progress)
      : undefined;
    const nextQuestion = buildQuestion(
      type,
      item.phrase,
      distractors,
      variantIndex,
      senseIndex,
    );
    if (nextQuestion.options) {
      nextQuestion.options = shuffle(nextQuestion.options);
    }
    return nextQuestion;
  }

  const loadSession = useCallback(
    async (selectedTrack: TrackId) => {
      setLoading(true);
      setError("");
      const currentSession = await getLearningSession(selectedTrack, today);
      setSession(currentSession ?? null);
      if (!currentSession || currentSession.status === "completed") {
        setQueue([]);
        setLearningCards([]);
        setQuestion(null);
        setCompleted(currentSession?.status === "completed");
        setStep(currentSession?.status === "completed" ? "done" : "overview");
        setLoading(false);
        return;
      }

      const cards = await getLearningCards(currentSession);
      setLearningCards(cards);
      const nextQueue = await getLearningGateQueue(currentSession);
      setQueue(
        nextQueue.filter((item) =>
          cards.some((card) => card.phrase.id === item.phrase.id),
        ),
      );
      const first = nextQueue[0];
      const currentRoundKey = String(
        currentSession.currentRound,
      ) as "1" | "2" | "3" | "4";
      const roundProgress =
        currentSession.roundPassedIds?.[currentRoundKey]?.length ?? 0;
      const hasGateProgress = cards.some(
        (card) => Object.keys(card.progress?.day0Gates ?? {}).length > 0,
      );
      const previewIncomplete = cards.some(
        (card) => !isPreviewRecognized(card.progress),
      );
      const needsOverview =
        currentSession.currentRound === 1 &&
        roundProgress === 0 &&
        !hasGateProgress &&
        previewIncomplete;
      if (!first) {
        setCompleted(true);
        setStep("done");
        setQuestion(null);
      } else if (needsOverview) {
        setQuestion(null);
        setStep("overview");
      } else {
        setQuestion(await buildGateQuestion(first));
        setStep("answer");
      }
      setAnswer("");
      setSelected("");
      setFeedback(null);
      startedAt.current = Date.now();
      setLoading(false);
    },
    [today],
  );

  useEffect(() => {
    void loadSession(trackId);
  }, [loadSession, trackId]);

  async function startSession() {
    if (starting) return;
    setStarting(true);
    setError("");
    try {
      const created = await ensureLearningSession(
        trackId,
        today,
        getSettings(),
      );
      if (!created) {
        setSession(null);
        setQueue([]);
        return;
      }
      await loadSession(trackId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "学习会话创建失败");
    } finally {
      setStarting(false);
    }
  }

  async function beginMeaningRecall(nextRating: Rating) {
    if (!session || !previewItem) return;
    setError("");
    try {
      await recordLearningPreviewRating(
        session.id,
        previewItem.phrase.id,
        nextRating,
      );
      await loadSession(trackId);
      setAnswer("");
      setSelected("");
      setFeedback(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "学习状态保存失败");
    }
  }

  async function continuePreview(recognized: boolean) {
    if (!session || !previewItem) return;
    setError("");
    try {
      await recordLearningPreviewRecognition(
        session.id,
        previewItem.phrase.id,
        recognized,
      );
      await loadSession(trackId);
      setAnswer("");
      setSelected("");
      setFeedback(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "\u5b66\u4e60\u72b6\u6001\u4fdd\u5b58\u5931\u8d25",
      );
    }
  }

  async function submitAnswer() {
    if (!current || !question || !session || submitting) return;
    const value = question.options ? selected : answer;
    if (!value.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const correct = checkAnswer(question, value);
      const result = await recordLearningGateAnswer(
        session.id,
        current.phrase.id,
        current.gate,
        question.type,
        question.skill,
        correct,
        value,
        question.expected,
        Date.now() - startedAt.current,
        question.exampleVariant,
        question.senseIndex,
      );
      setSession(result.session);
      setCompleted(result.completed);
      const selectedSense =
        question.type === "senseChoice" &&
        question.senseIndex !== undefined
          ? current.phrase.senses?.[question.senseIndex]
          : undefined;
      const feedbackExample = selectedSense
        ? {
            exampleEn: selectedSense.exampleEn ?? "",
            exampleZh: selectedSense.exampleZh ?? "",
          }
        : contextExample(current.phrase, question.exampleVariant);
      setFeedback({
        correct,
        expected: question.expected,
        exampleEn: feedbackExample.exampleEn || "英文例句待补全。",
        exampleZh: feedbackExample.exampleZh || "中文翻译待补全。",
        synonyms: current.phrase.synonyms.map(
          (item) => `${item.phrase}：${item.usage}`,
        ),
        correctStreak: result.correctStreak,
        requiredCorrect: result.requiredCorrect,
      });
      setStep("feedback");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "学习结果保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function continueLearning() {
    if (completed) {
      setStep("done");
      return;
    }
    await loadSession(trackId);
  }

  if (loading) return <div className="spinner" aria-label="正在加载" />;

  return (
    <main className="page">
      <header className="title-band compact">
        <div className="session-header">
          <Link href="/" className="back-link">
            <ArrowLeft size={17} aria-hidden="true" />
            今日
          </Link>
          <span className="meta">
            {TRACKS[trackId].label} ·{" "}
            {session
              ? inOverview
                ? `\u9884\u89c8 ${Math.min(previewCompletedCount + 1, total)}/${total}`
                : `${GATE_LABELS[currentRound - 1]} ${roundDone}/${total}`
              : "尚未开始"}
          </span>
        </div>
        {session ? (
          <>
            <div
              className="segmented-progress"
              aria-label={`学习关卡 ${currentRound}/4，本关完成 ${roundDone}/${total}`}
              style={{
                gridTemplateColumns: inOverview
                  ? `repeat(${Math.max(total, 1)}, 1fr)`
                  : "repeat(4, 1fr)",
              }}
            >
              {inOverview
                ? Array.from({ length: Math.max(total, 1) }).map((_, index) => (
                    <i
                      key={index}
                      className={
                        index < previewCompletedCount
                          ? "done"
                          : index === previewCompletedCount
                            ? "current"
                            : ""
                      }
                    />
                  ))
                : [1, 2, 3, 4].map((round) => (
                    <i
                      key={round}
                      className={
                        round < currentRound
                          ? "done"
                          : round === currentRound
                            ? "current"
                            : ""
                      }
                    />
                  ))}
            </div>
            <p className="quiet-note" style={{ marginTop: 9 }}>
              {inOverview
                ? `反复确认到认识目标（${previewCompletedCount}/${total} 已完成）`
                : `第 0 天 · ${GATE_LABELS[currentRound - 1]} · ${roundDone}/${total}`}
            </p>
          </>
        ) : null}
        <div className="filter-row" style={{ marginTop: 12 }}>
          {TRACK_LIST.map((track) => (
            <button
              type="button"
              className="filter-pill"
              aria-pressed={trackId === track.id}
              onClick={() => setTrackId(track.id)}
              key={track.id}
            >
              {track.label}
            </button>
          ))}
        </div>
      </header>

      <div className="page-body">
        {error ? (
          <div className="error-list" role="alert">
            {error}
          </div>
        ) : null}
        {!session ? (
          <div className="empty-state">
            <BookOpen aria-hidden="true" />
            <div>
              <h2>{TRACKS[trackId].label}尚未开始</h2>
              <p>
                第 0 天包含含义、产出、语境和出口测试，完成后明天进入四轮校准。
              </p>
              <button
                type="button"
                className="primary-button"
                onClick={startSession}
                disabled={starting}
              >
                {starting ? "正在准备…" : "开始今日学习"}
                {!starting ? <ArrowRight size={17} aria-hidden="true" /> : null}
              </button>
            </div>
          </div>
        ) : step === "done" || completed || !current ? (
          <div className="empty-state">
            <BookOpen aria-hidden="true" />
            <div>
              <h2>第 0 天学习完成</h2>
              <p>
                已完成含义、产出、语境和出口测试。明天进行四轮验证，全部通过后进入长期复习。
              </p>
              <Link href="/" className="primary-button">
                返回今日
              </Link>
            </div>
          </div>
        ) : (
          <>
            <article className="focus-card">
              <div className="card-meta">
                <span className="outline-tag">{activePhrase?.entryType}</span>
                <span className="card-index">
                  {inOverview
                    ? `预览 ${previewCompletedCount + 1}/${total}`
                    : `${GATE_LABELS[currentRound - 1]} · ${roundDone + 1}/${total}`}
                </span>
              </div>

              {inOverview && activePhrase ? (
                <>
                  <p className="answer-prompt">{"\u5148\u8ba4\u8bc6\uff0c\u4e0d\u6025\u7740\u7b54\u3002"}</p>
                  <h2 className="study-phrase">{activePhrase.phrase}</h2>
                  <MeaningSenses phrase={activePhrase} showExamples />
                  <div className="example-block">
                    <p className="example-en">
                      {activePhrase.exampleEn || "英文例句待补全。"}
                    </p>
                    <p className="example-zh">
                      {activePhrase.exampleZh || "中文翻译待补全。"}
                    </p>
                  </div>
                </>
              ) : step === "answer" && question ? (
                <div className="answer-area" style={{ marginTop: 0 }}>
                  <p className="answer-prompt">
                    {question.type === "meaning"
                      ? "写出中文释义"
                      : question.type === "spelling"
                        ? "写出英文短语"
                        : question.type === "contextChoice"
                          ? "选择最符合语境的短语"
                        : question.type === "senseChoice"
                          ? "选择句中短语的意思"
                          : "选择正确短语"}
                  </p>
                  <h2
                    className={`answer-question${
                      question.type === "contextChoice" ||
                      question.type === "cloze" ||
                      question.type === "senseChoice"
                        ? " context"
                        : ""
                    }`}
                  >
                    {question.prompt}
                  </h2>
                  {question.hint ? (
                    <p className="answer-hint">首字母提示：{question.hint}</p>
                  ) : null}
                  {question.options ? (
                    <div className="choice-list">
                      {question.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="choice-button"
                          aria-pressed={selected === option}
                          onClick={() => setSelected(option)}
                          disabled={submitting}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <label>
                      <span className="sr-only">答案</span>
                      <input
                        className="answer-input"
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                        placeholder="在这里输入"
                        autoFocus
                        disabled={submitting}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void submitAnswer();
                        }}
                      />
                    </label>
                  )}
                </div>
              ) : null}

              {step === "feedback" && feedback ? (
                <div className="feedback-panel" aria-live="polite">
                  <div
                    className={`feedback-state${feedback.correct ? "" : " wrong"}`}
                  >
                    <i />
                    {feedback.correct ? "回答正确" : "还差一点"}
                  </div>
                  {(question?.type === "spelling" ||
                    (question?.type === "meaning" &&
                      feedback.requiredCorrect > 1) ||
                    question?.type === "senseChoice") ? (
                    <p className="streak-note">
                      {question.type === "spelling"
                        ? "默写"
                        : question.type === "senseChoice"
                          ? "义项"
                          : "释义"}
                      {question.type === "senseChoice" ? "已完成" : "连续正确"}{" "}
                      {feedback.correctStreak}/
                      {feedback.requiredCorrect}
                      {feedback.correctStreak < feedback.requiredCorrect
                        ? "，继续下一张后再回来"
                        : "，本轮通过"}
                    </p>
                  ) : null}
                  <div
                    className={`feedback-copy${feedback.correct ? "" : " wrong"}`}
                  >
                    <p className="feedback-answer">
                      你的回答：{question?.options ? selected : answer}
                    </p>
                    <strong>{feedback.expected}</strong>
                    {feedback.exampleEn}
                    <br />
                    {feedback.exampleZh}
                  </div>
                  {!feedback.correct && feedback.synonyms.length > 0 ? (
                    <div className="synonym-note">
                      {feedback.synonyms.join("；")}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>

            {inOverview && activePhrase ? (
              <>
                <p className="rating-label">
                  {needsInitialPreviewRating
                    ? "你对这条短语的初始感觉是？"
                    : "再次看到时，你现在的感觉是？"}
                </p>
                <div className="rating-options">
                  {RATING_LABELS.map((item) => (
                    <button
                      type="button"
                      className="rating-button"
                      key={item.value}
                      onClick={() => {
                        if (needsInitialPreviewRating) {
                          void beginMeaningRecall(item.value);
                        } else {
                          void continuePreview(item.value === "know");
                        }
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="quiet-note">
                  {needsInitialPreviewRating
                    ? "陌生、模糊、认识分别需要累计 4、3、2 次确认。"
                    : `连续认识 ${
                        previewItem?.progress?.previewRecognizedCount ?? 0
                      }/${
                        previewItem?.progress?.previewRequiredCount ?? 2
                      }；选择陌生或模糊会重新计数。`}
                </p>
              </>
            ) : step === "feedback" ? (
              <div style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="primary-button wide"
                  onClick={continueLearning}
                >
                  {feedback?.correct
                    ? completed
                      ? "完成第 0 天"
                      : "继续"
                    : "继续，稍后重试"}
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="primary-button wide"
                  disabled={
                    submitting || (question?.options ? !selected : !answer.trim())
                  }
                  onClick={submitAnswer}
                >
                  {submitting ? "正在记录…" : "确认答案"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

