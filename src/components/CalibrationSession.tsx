"use client";

import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { TRACKS, TRACK_LIST } from "@/lib/domain/constants";
import {
  buildQuestion,
  checkAnswer,
  type ReviewQuestion,
} from "@/lib/domain/review-flow";
import { shuffle } from "@/lib/domain/text";
import type {
  CalibrationPlan,
  QuestionType,
  TrackId,
} from "@/lib/domain/types";
import {
  getCalibrationPlan,
  getCalibrationQueue,
  getDistractors,
  recordCalibrationAnswer,
} from "@/lib/data/repositories";
import { useLocalDay } from "@/lib/hooks/useLocalDay";
import { useQuestionScroll } from "@/lib/hooks/useQuestionScroll";

const ROUND_LABELS = ["英→中", "选正确形式", "语境应用", "中→英"];

interface Props {
  initialPlan: CalibrationPlan;
  trackId: TrackId;
  onComplete: () => void;
  onTrackChange: (trackId: TrackId) => void;
}

export default function CalibrationSession({
  initialPlan,
  trackId,
  onComplete,
  onTrackChange,
}: Props) {
  const today = useLocalDay();
  const [plan, setPlan] = useState(initialPlan);
  const [started, setStarted] = useState(false);
  const [question, setQuestion] = useState<ReviewQuestion | null>(null);
  const [currentPhraseId, setCurrentPhraseId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    failed: boolean;
    expected: string;
    exampleEn: string;
    exampleZh: string;
    synonyms: string[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const startedAt = useRef(0);
  useQuestionScroll(Boolean(question), Boolean(feedback));

  const roundKey = String(plan.currentRound) as "1" | "2" | "3" | "4";
  const roundDone = plan.roundPassedIds[roundKey].length;
  const total = plan.phraseIds.length;

  const prepare = useCallback(async () => {
    setError("");
    const latest =
      (await getCalibrationPlan(trackId, today)) ?? initialPlan;
    setPlan(latest);
    if (latest.status === "completed") {
      onComplete();
      return;
    }
    const queue = await getCalibrationQueue(latest);
    const item = queue[0];
    if (!item) {
      onComplete();
      return;
    }
    const type: QuestionType = item.questionType;
    const distractors = ["phraseChoice", "contextChoice", "cloze"].includes(type)
      ? await getDistractors(item.phrase, 3)
      : [];
    const nextQuestion = buildQuestion(type, item.phrase, distractors);
    if (nextQuestion.options) {
      nextQuestion.options = shuffle(nextQuestion.options);
    }
    setQuestion(nextQuestion);
    setCurrentPhraseId(item.phrase.id);
    setAnswer("");
    setSelected("");
    setFeedback(null);
    startedAt.current = Date.now();
  }, [initialPlan, onComplete, today, trackId]);

  async function begin() {
    setStarted(true);
    await prepare();
  }

  async function submit() {
    if (!question || !currentPhraseId || submitting) return;
    const value = question.options ? selected : answer;
    if (!value.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const latestPlan = (await getCalibrationPlan(trackId, today)) ?? plan;
      const queue = await getCalibrationQueue(latestPlan);
      const item = queue.find((entry) => entry.phrase.id === currentPhraseId);
      const correct = checkAnswer(question, value);
      const result = await recordCalibrationAnswer(
        plan.id,
        currentPhraseId,
        question.type,
        question.skill,
        correct,
        value,
        question.expected,
        Date.now() - startedAt.current,
      );
      setPlan(result.plan);
      setFeedback({
        correct,
        failed: result.failed,
        expected: item?.phrase.meaning ?? question.expected,
        exampleEn: item?.phrase.exampleEn || "英文例句待补全。",
        exampleZh: item?.phrase.exampleZh || "中文翻译待补全。",
        synonyms:
          item?.phrase.synonyms.map(
            (entry) => `${entry.phrase}：${entry.usage}`,
          ) ?? [],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "验证结果保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function next() {
    if (feedback?.failed) {
      await prepare();
      return;
    }
    const latest = await getCalibrationPlan(trackId, today);
    if (!latest || latest.status === "completed") {
      onComplete();
      return;
    }
    await prepare();
  }

  if (!started) {
    return (
      <main className="page">
        <header className="title-band compact">
          <div className="session-header">
            <Link href="/" className="back-link">
              <ArrowLeft size={17} aria-hidden="true" />
              今日
            </Link>
            <span className="meta">{TRACKS[trackId].label}</span>
          </div>
          <div className="filter-row" style={{ marginTop: 0 }}>
            {TRACK_LIST.map((track) => (
              <button
                key={track.id}
                type="button"
                className="filter-pill"
                aria-pressed={track.id === trackId}
                onClick={() => onTrackChange(track.id)}
              >
                {track.label}
              </button>
            ))}
          </div>
        </header>
        <div className="page-body">
          <div className="empty-state">
            <RotateCcw aria-hidden="true" />
            <div>
              <h2>隔天四轮验证</h2>
              <p>
                共 {total} 条。每轮覆盖全部卡片：
                {ROUND_LABELS.join("、")}。每轮最终答对后进入下一轮。
              </p>
              <button type="button" className="primary-button" onClick={begin}>
                开始验证
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="title-band compact">
        <div className="session-header">
          <Link href="/" className="back-link">
            <ArrowLeft size={17} aria-hidden="true" />
            今日
          </Link>
          <span className="meta">
            {TRACKS[trackId].label} · 第 {plan.currentRound}/4 轮
          </span>
        </div>
        <div
          className="segmented-progress"
          aria-label={`校准进度 ${roundDone}/${total}`}
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          {[1, 2, 3, 4].map((round) => (
            <i
              key={round}
              className={
                round < plan.currentRound
                  ? "done"
                  : round === plan.currentRound
                    ? "current"
                    : ""
              }
            />
          ))}
        </div>
        <p className="quiet-note" style={{ marginTop: 9 }}>
          第 1 天 · {ROUND_LABELS[plan.currentRound - 1]} · {roundDone}/{total}
        </p>
      </header>

      <div className="page-body">
        {error ? (
          <div className="error-list" role="alert">
            {error}
          </div>
        ) : null}
        {!question ? (
          <div className="spinner" aria-label="正在准备验证" />
        ) : (
          <>
            <article className="focus-card">
              <div className="card-meta">
                <span className="outline-tag">
                  第 {plan.currentRound} 轮
                </span>
                <span className="card-index">
                  {roundDone + 1}/{total}
                </span>
              </div>
              <div className="answer-area" style={{ marginTop: 0 }}>
                <p className="answer-prompt">
                  {question.type === "meaning"
                    ? "写出中文释义"
                    : question.type === "spelling"
                      ? "看中文写出英文短语"
                      : question.type === "contextChoice"
                        ? "选择最符合语境的短语"
                        : "选择正确短语"}
                </p>
                <h2
                  className={`answer-question${
                    question.type === "contextChoice" ||
                    question.type === "cloze"
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
                        if (event.key === "Enter") void submit();
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
                    {feedback.failed
                      ? "本轮未通过，明天重新验证"
                      : feedback.correct
                        ? "本轮通过"
                        : "这次没有答对"}
                  </div>
                  <div
                    className={`feedback-copy${feedback.correct ? "" : " wrong"}`}
                  >
                    <p className="feedback-answer">
                      你的回答：{question.options ? selected : answer}
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
                  onClick={next}
                >
                  {feedback.correct ? "下一张" : "继续"}
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button wide"
                  disabled={
                    submitting ||
                    (question.options ? !selected : !answer.trim())
                  }
                  onClick={submit}
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
