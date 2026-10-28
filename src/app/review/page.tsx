"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import CalibrationSession from "@/components/CalibrationSession";
import { TRACKS, TRACK_LIST } from "@/lib/domain/constants";
import {
  buildQuestion,
  checkAnswer,
  chooseExampleVariant,
  chooseSenseIndex,
  contextExample,
  type ReviewQuestion,
} from "@/lib/domain/review-flow";
import { shuffle } from "@/lib/domain/text";
import type {
  CalibrationPlan,
  Grade,
  ReviewPlan,
  TrackId,
} from "@/lib/domain/types";
import {
  ensureCalibrationPlan,
  ensureReviewPlan,
  getCalibrationSummary,
  getDistractors,
  getMeaningDistractors,
  getReviewQueue,
  recordReviewAnswer,
  startReviewAttempt,
} from "@/lib/data/repositories";
import { getSettings } from "@/lib/data/settings";
import { useLocalDay } from "@/lib/hooks/useLocalDay";
import { useQuestionScroll } from "@/lib/hooks/useQuestionScroll";

interface FeedbackState {
  correct: boolean;
  expected: string;
  answer: string;
  exampleEn: string;
  exampleZh: string;
  synonyms: string[];
  correctStreak: number;
  requiredCorrect: number;
}

export default function ReviewPage() {
  const today = useLocalDay();
  const [trackId, setTrackId] = useState<TrackId>("fixed");
  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [calibrationPlan, setCalibrationPlan] =
    useState<CalibrationPlan | null>(null);
  const [calibrationSummary, setCalibrationSummary] = useState<
    Record<Grade, number> & { failed: number }
  >({ S: 0, A: 0, B: 0, C: 0, D: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [question, setQuestion] = useState<ReviewQuestion | null>(null);
  const [currentPhraseId, setCurrentPhraseId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const startTime = useRef(0);
  useQuestionScroll(Boolean(question), Boolean(feedback));

  const loadReady = useCallback(
    async (selectedTrack: TrackId) => {
      setLoading(true);
      const nextCalibration = await ensureCalibrationPlan(
        selectedTrack,
        today,
        getSettings(),
      );
      setCalibrationPlan(nextCalibration);
      setCalibrationSummary(
        nextCalibration.status === "completed" &&
          nextCalibration.phraseIds.length > 0
          ? await getCalibrationSummary(nextCalibration)
          : { S: 0, A: 0, B: 0, C: 0, D: 0, failed: 0 },
      );
      if (
        nextCalibration.status === "active" &&
        nextCalibration.phraseIds.length > 0
      ) {
        setPlan(null);
        setStarted(false);
        setQuestion(null);
        setFeedback(null);
        setLoading(false);
        return;
      }
      const nextPlan = await ensureReviewPlan(
        selectedTrack,
        today,
        getSettings(),
      );
      setPlan(nextPlan);
      setDoneCount(nextPlan.completedPhraseIds.length);
      setStarted(false);
      setQuestion(null);
      setFeedback(null);
      setLoading(false);
    },
    [today],
  );

  useEffect(() => {
    void loadReady(trackId);
  }, [loadReady, trackId]);

  const prepareCurrent = useCallback(async () => {
    const currentPlan = await ensureReviewPlan(trackId, today, getSettings());
    const queue = await getReviewQueue(currentPlan);
    if (queue.length === 0) {
      setPlan(currentPlan);
      setDoneCount(currentPlan.completedPhraseIds.length);
      setQuestion(null);
      setCurrentPhraseId(null);
      return;
    }

    const item = queue[0];
    let latestPlan = currentPlan;
    if (!latestPlan.attempts[item.phrase.id]) {
      latestPlan = await startReviewAttempt(latestPlan.id, item.phrase.id);
    }
    const attempt = latestPlan.attempts[item.phrase.id];
    const nextType = attempt.types[attempt.answers.length];
    if (!nextType) {
      setPlan(latestPlan);
      setQuestion(null);
      setCurrentPhraseId(item.phrase.id);
      return;
    }
    const senseIndex =
      nextType === "senseChoice"
        ? chooseSenseIndex(item.phrase, item.progress)
        : undefined;
    const distractors =
      nextType === "senseChoice"
        ? await getMeaningDistractors(item.phrase, 3)
        : ["cloze", "contextChoice", "phraseChoice"].includes(nextType)
          ? await getDistractors(item.phrase, 3)
          : [];
    const variantIndex = ["cloze", "contextChoice"].includes(nextType)
      ? chooseExampleVariant(item.phrase, item.progress)
      : undefined;
    const nextQuestion = buildQuestion(
      nextType,
      item.phrase,
      distractors,
      variantIndex,
      senseIndex,
    );
    if (nextQuestion.options) {
      nextQuestion.options = shuffle(nextQuestion.options);
    }

    setPlan(latestPlan);
    setCurrentPhraseId(item.phrase.id);
    setQuestion(nextQuestion);
    setInput("");
    setSelected("");
    setFeedback(null);
    setAnswered(false);
    setDoneCount(latestPlan.completedPhraseIds.length);
    startTime.current = Date.now();
  }, [today, trackId]);

  async function beginReview() {
    setStarted(true);
    await prepareCurrent();
  }

  async function submitAnswer() {
    if (!question || !currentPhraseId || answered || submitting) return;
    setSubmitting(true);
    setError("");
    try {
    const planForAnswer = await ensureReviewPlan(
      trackId,
      today,
      getSettings(),
    );
    const queue = await getReviewQueue(planForAnswer);
    const item = queue.find((entry) => entry.phrase.id === currentPhraseId);
    if (!item) {
      return;
    }
    const answer = question.options ? selected : input;
    const correct = checkAnswer(question, answer);
    const result = await recordReviewAnswer(
      planForAnswer.id,
      currentPhraseId,
      question.type,
      question.skill,
      correct,
      answer,
      question.expected,
      Date.now() - startTime.current,
      question.exampleVariant,
      question.senseIndex,
    );
    setPlan(result.plan);
    const latestAttempt = result.plan.attempts[currentPhraseId];
    const passStart = latestAttempt?.passStartIndex ?? 0;
    const spellingCorrectCount =
      latestAttempt?.answers
        .slice(passStart)
        .filter(
          (item) => item.questionType === "spelling" && item.correct,
        ).length ?? 0;
    const selectedSense =
      question.type === "senseChoice" &&
      question.senseIndex !== undefined
        ? item.phrase.senses?.[question.senseIndex]
        : undefined;
    const feedbackExample = selectedSense
      ? {
          exampleEn: selectedSense.exampleEn ?? "",
          exampleZh: selectedSense.exampleZh ?? "",
        }
      : contextExample(item.phrase, question.exampleVariant);
    setFeedback({
      correct,
      expected: item.phrase.meaning,
      answer,
      exampleEn: feedbackExample.exampleEn || "英文例句待补全。",
      exampleZh: feedbackExample.exampleZh || "中文翻译待补全。",
      synonyms: item.phrase.synonyms.map(
        (entry) => `${entry.phrase}：${entry.usage}`,
      ),
      correctStreak: spellingCorrectCount,
      requiredCorrect: 3,
    });
    setAnswered(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "答案保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function continueReview() {
    const latest = await ensureReviewPlan(trackId, today, getSettings());
    setPlan(latest);
    setDoneCount(latest.completedPhraseIds.length);
    if (latest.status === "completed") {
      setStarted(false);
      setQuestion(null);
      return;
    }
    await prepareCurrent();
  }

  if (loading) return <div className="spinner" aria-label="正在加载" />;

  if (
    calibrationPlan?.status === "active" &&
    calibrationPlan.phraseIds.length > 0
  ) {
    return (
      <CalibrationSession
        key={`${calibrationPlan.id}:${calibrationPlan.updatedAt}`}
        initialPlan={calibrationPlan}
        trackId={trackId}
        onTrackChange={setTrackId}
        onComplete={() => {
          setCalibrationPlan(null);
          void loadReady(trackId);
        }}
      />
    );
  }

  const total = plan?.phraseIds.length ?? 0;
  const calibrationCompletedToday =
    calibrationPlan?.status === "completed" &&
    calibrationPlan.phraseIds.length > 0;

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
            {total > 0
              ? `复习 ${Math.min(doneCount + 1, total)} / ${total}`
              : "暂无到期"}
          </span>
        </div>
        <div
          className="segmented-progress"
          aria-label={`复习进度 ${doneCount}/${total}`}
          style={{
            gridTemplateColumns: `repeat(${Math.max(total, 1)}, 1fr)`,
          }}
        >
          {Array.from({ length: Math.max(total, 1) }).map((_, index) => (
            <i
              key={index}
              className={
                index < doneCount
                  ? "done"
                  : index === doneCount && started
                    ? "current"
                    : ""
              }
            />
          ))}
        </div>
        <div className="filter-row">
          {TRACK_LIST.map((track) => (
            <button
              key={track.id}
              type="button"
              className="filter-pill"
              aria-pressed={trackId === track.id}
              onClick={() => {
                setTrackId(track.id);
              }}
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
        {total === 0 ? (
          <div className="empty-state">
            <RotateCcw aria-hidden="true" />
            <div>
              <h2>
                {calibrationCompletedToday
                  ? "今日四轮验证完成"
                  : "今天没有到期内容"}
              </h2>
              {calibrationCompletedToday ? (
                <>
                  <p>
                    已完成 {calibrationPlan.phraseIds.length} 条隔天验证。
                    {calibrationSummary.failed > 0
                      ? ` ${calibrationSummary.failed} 条明天重新验证。`
                      : " 全部进入长期复习。"}
                  </p>
                  <div className="grade-summary">
                    {(["S", "A", "B", "C", "D"] as Grade[]).map(
                      (grade) =>
                        calibrationSummary[grade] > 0 ? (
                          <span key={grade}>
                            <b className={`grade grade-${grade}`}>{grade}</b>
                            {calibrationSummary[grade]}
                          </span>
                        ) : null,
                    )}
                  </div>
                </>
              ) : (
                <p>
                  新学的短语会在明天进入校准，长期复习也会按本地日期自动出现。
                </p>
              )}
              <Link href="/" className="secondary-button">
                返回今日
              </Link>
            </div>
          </div>
        ) : !started || !question ? (
          <div className="empty-state">
            <RotateCcw aria-hidden="true" />
            <div>
              <h2>{plan?.status === "completed" ? "今日复习完成" : "今日复习"}</h2>
              <p>
                共 {total} 条。每张卡会抽取两种不同题型，首次作答和纠错结果分别记录。
              </p>
              {plan?.status !== "completed" ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={beginReview}
                >
                  开始复习
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
              ) : (
                <Link href="/" className="secondary-button">
                  返回今日
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
            <article className="focus-card">
              <div className="card-meta">
                <span className="outline-tag">
                  {question.type === "meaning"
                    ? "看英想中"
                    : question.type === "spelling"
                      ? "看中拼英"
                      : question.type === "phraseChoice"
                        ? "形式选择"
                        : question.type === "senseChoice"
                          ? "义项辨析"
                          : "语境选择"}
                </span>
                <span className="card-index">
                  {doneCount + 1} / {total}
                </span>
              </div>
              <div className="answer-area" style={{ marginTop: 0 }}>
                <p className="answer-prompt">
                  {question.type === "meaning"
                    ? "写出中文释义"
                    : question.type === "spelling"
                      ? "写出英文短语"
                      : question.type === "phraseChoice"
                        ? "选择正确英文形式"
                        : question.type === "senseChoice"
                          ? "选择句中短语的意思"
                        : "选择最符合语境的短语"}
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
                        disabled={answered || submitting}
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
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="在这里输入"
                      autoFocus
                      disabled={answered || submitting}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void submitAnswer();
                      }}
                    />
                  </label>
                )}
              </div>

              {feedback ? (
                <div className="feedback-panel" aria-live="polite">
                  <div
                    className={`feedback-state${feedback.correct ? "" : " wrong"}`}
                  >
                    <i />
                    {feedback.correct ? "回答正确" : "这次没有答对"}
                  </div>
                  {question.type === "spelling" ? (
                    <p className="streak-note">
                      默写累计写对 {feedback.correctStreak}/
                      {feedback.requiredCorrect}
                      {feedback.correctStreak < feedback.requiredCorrect
                        ? "，稍后会再次出现"
                        : "，已通过"}
                    </p>
                  ) : null}
                  <div
                    className={`feedback-copy${feedback.correct ? "" : " wrong"}`}
                  >
                    <p className="feedback-answer">
                      你的回答：{feedback.answer || "未作答"}
                    </p>
                    <strong>{question.expected}</strong>
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

            <div style={{ marginTop: 18 }}>
              {feedback ? (
                <button
                  type="button"
                  className="primary-button wide"
                  onClick={continueReview}
                >
                  继续
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button wide"
                  disabled={
                    submitting || (question.options ? !selected : !input.trim())
                  }
                  onClick={submitAnswer}
                >
                  {submitting ? "正在记录…" : "提交答案"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
