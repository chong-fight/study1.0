"use client";

import { useState } from "react";
import MeaningSenses from "@/components/MeaningSenses";
import type { CardProgress, Phrase, Rating } from "@/lib/domain/types";

interface Props {
  phrase: Phrase;
  progress?: CardProgress;
  position: number;
  total: number;
  busy: boolean;
  onRate: (rating: Rating) => void | Promise<void>;
}

const RATING_LABELS: { value: Rating; label: string }[] = [
  { value: "unknown", label: "陌生" },
  { value: "vague", label: "模糊" },
  { value: "know", label: "认识" },
];

export default function PreviewStudyCard({
  phrase,
  progress,
  position,
  total,
  busy,
  onRate,
}: Props) {
  const [flipped, setFlipped] = useState(false);
  const needsInitialRating = !progress?.day0Rating;
  const recognizedCount = progress?.previewRecognizedCount ?? 0;
  const requiredCount = progress?.previewRequiredCount ?? 0;

  function toggleCard() {
    setFlipped((current) => !current);
  }

  return (
    <>
      <div className="preview-card-stage">
        <div
          className={`preview-card${flipped ? " flipped" : ""}`}
          role="button"
          tabIndex={0}
          aria-pressed={flipped}
          aria-label={
            flipped
              ? "背面，显示中文意思和例句。轻点翻回英文。"
              : "正面，只显示英文短语。轻点查看中文意思和例句。"
          }
          onClick={toggleCard}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleCard();
            }
          }}
        >
          <section
            className="focus-card preview-card-face preview-card-front"
            aria-hidden={flipped}
          >
            <h2 className="study-phrase">{phrase.phrase}</h2>
          </section>

          <section
            className="focus-card preview-card-face preview-card-back"
            aria-hidden={!flipped}
          >
            <div className="card-meta">
              <span className="outline-tag">{phrase.entryType}</span>
              <span className="card-index">
                预览 {position}/{total}
              </span>
            </div>
            <h2 className="study-phrase">{phrase.phrase}</h2>
            <MeaningSenses phrase={phrase} showExamples />
            <div className="example-block">
              <p className="example-en">
                {phrase.exampleEn || "英文例句待补全。"}
              </p>
              <p className="example-zh">
                {phrase.exampleZh || "中文翻译待补全。"}
              </p>
            </div>
          </section>
        </div>
      </div>

      <p className="rating-label">
        {needsInitialRating
          ? "你对这条短语的初始感觉是？"
          : "再次看到时，你现在的感觉是？"}
      </p>
      <div className="rating-options">
        {RATING_LABELS.map((item) => (
          <button
            type="button"
            className="rating-button"
            key={item.value}
            disabled={busy}
            onClick={() => void onRate(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="quiet-note">
        {needsInitialRating
          ? "陌生、模糊、认识分别需要累计 4、3、2 次确认。"
          : `已连续认识 ${recognizedCount}/${requiredCount} 次；选择陌生或模糊会重新计数。`}
      </p>
    </>
  );
}
