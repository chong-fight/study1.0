"use client";

import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { useMemo, useReducer, useState } from "react";
import Sheet from "@/components/Sheet";
import {
  INITIAL_QUICK_REVIEW_STATE,
  quickReviewReducer,
  type QuickReviewMode,
} from "@/lib/domain/quick-review";
import {
  isAcceptedMeaning,
  isAcceptedPhrase,
  seededShuffle,
} from "@/lib/domain/text";
import type { Phrase } from "@/lib/domain/types";
import {
  clearQuickReviewProgress,
  readQuickReviewProgress,
  saveQuickReviewProgress,
} from "@/lib/data/quick-review-storage";

interface Props {
  phrases: Phrase[];
  today: string;
  onClose: () => void;
}

export default function QuickReviewSheet({
  phrases,
  today,
  onClose,
}: Props) {
  const [state, dispatch] = useReducer(
    quickReviewReducer,
    INITIAL_QUICK_REVIEW_STATE,
  );
  const { mode, completedIds, activeId, feedback } = state;
  const [answer, setAnswer] = useState("");
  const orderedIds = useMemo(
    () =>
      mode
        ? seededShuffle(
            phrases.map((phrase) => phrase.id),
            `${today}:${mode}`,
          )
        : [],
    [mode, phrases, today],
  );
  const completed = useMemo(() => new Set(completedIds), [completedIds]);
  const remainingIds = orderedIds.filter((id) => !completed.has(id));
  const currentId = activeId ?? remainingIds[0] ?? null;
  const current = phrases.find((phrase) => phrase.id === currentId);
  const finished = Boolean(mode) && remainingIds.length === 0 && !activeId;

  function selectMode(nextMode: QuickReviewMode) {
    dispatch({
      type: "choose-mode",
      mode: nextMode,
      completedIds: readQuickReviewProgress(
        window.localStorage,
        today,
        nextMode,
      ),
    });
    setAnswer("");
  }

  function markCorrect() {
    if (!mode || !current || completed.has(current.id)) return;
    const nextCompleted = [...completedIds, current.id];
    dispatch({ type: "correct", phraseId: current.id });
    saveQuickReviewProgress(
      window.localStorage,
      today,
      mode,
      nextCompleted,
    );
  }

  function submit() {
    if (!mode || !current || !answer.trim() || feedback === "correct") return;
    const correct =
      mode === "en-zh"
        ? isAcceptedMeaning(answer, current.meaning)
        : isAcceptedPhrase(answer, current.phrase);
    if (correct) {
      markCorrect();
    } else {
      dispatch({ type: "wrong", phraseId: current.id });
    }
  }

  function next() {
    dispatch({ type: "next" });
    setAnswer("");
  }

  function restart() {
    if (!mode) return;
    dispatch({ type: "restart" });
    setAnswer("");
    clearQuickReviewProgress(window.localStorage, today, mode);
  }

  const completedCount = orderedIds.filter((id) => completed.has(id)).length;

  return (
    <Sheet title="今日快闪" onClose={onClose}>
      {!mode ? (
        <div className="quick-review-chooser">
          <p className="quick-review-lede">
            从今天的学习内容中任选一种方向，每张卡答对一次即可。成绩不会影响校准和正式复习。
          </p>
          <button
            type="button"
            className="quick-review-mode"
            onClick={() => selectMode("en-zh")}
          >
            <span>English → 中文</span>
            <small>看英语，写出中文意思</small>
            <ArrowRight aria-hidden="true" />
          </button>
          <button
            type="button"
            className="quick-review-mode"
            onClick={() => selectMode("zh-en")}
          >
            <span>中文 → English</span>
            <small>看中文，写出英语短语</small>
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="quick-review-session">
          <div className="quick-review-progress">
            <span>
              {mode === "en-zh" ? "看英写中" : "看中写英"}
            </span>
            <strong>
              {completedCount}/{orderedIds.length}
            </strong>
          </div>
          <div className="segmented-progress" aria-hidden="true">
            {orderedIds.map((id) => (
              <i
                key={id}
                className={completed.has(id) ? "done" : id === currentId ? "current" : ""}
              />
            ))}
          </div>

          {finished ? (
            <div className="quick-review-finished">
              <Check aria-hidden="true" />
              <h3>今天这一方向已全部答对</h3>
              <p>只记录今天的快闪进度，不会改动正式复习安排。</p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => dispatch({ type: "back-to-modes" })}
              >
                换个方向
              </button>
              <button type="button" className="primary-button" onClick={restart}>
                <RotateCcw aria-hidden="true" />
                再来一遍
              </button>
            </div>
          ) : current ? (
            <article className="quick-review-card">
              <p className="quick-review-kicker">
                {mode === "en-zh" ? "写出中文意思" : "写出英语短语"}
              </p>
              <h3>{mode === "en-zh" ? current.phrase : current.meaning}</h3>
              <label>
                <span className="sr-only">快闪答案</span>
                <input
                  className="answer-input"
                  value={answer}
                  placeholder="输入答案"
                  autoFocus
                  disabled={feedback === "correct"}
                  onChange={(event) => {
                    setAnswer(event.target.value);
                    if (feedback === "wrong") {
                      dispatch({ type: "next" });
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (feedback === "correct") next();
                      else submit();
                    }
                  }}
                />
              </label>
              {feedback === "wrong" ? (
                <div className="quick-review-feedback wrong" role="status">
                  还不对，再想一下。正确答案：
                  <strong>
                    {mode === "en-zh" ? current.meaning : current.phrase}
                  </strong>
                </div>
              ) : null}
              {feedback === "correct" ? (
                <div className="quick-review-feedback" role="status">
                  答对了。{mode === "en-zh" ? current.meaning : current.phrase}
                </div>
              ) : null}
              <button
                type="button"
                className="primary-button wide"
                onClick={feedback === "correct" ? next : submit}
                disabled={!answer.trim() && feedback !== "correct"}
              >
                {feedback === "correct" ? "下一张" : "确认"}
              </button>
            </article>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
