import type { Phrase } from "@/lib/domain/types";
import { TRACKS } from "@/lib/domain/constants";
import MeaningSenses from "@/components/MeaningSenses";

interface PhraseDetailProps {
  phrase: Phrase;
  grade?: string;
  nextReviewOn?: string;
}

export default function PhraseDetail({
  phrase,
  grade,
  nextReviewOn,
}: PhraseDetailProps) {
  return (
    <div>
      <h3 className="detail-phrase">{phrase.phrase}</h3>
      <MeaningSenses
        phrase={phrase}
        primaryClassName="detail-meaning"
        showExamples
      />
      <div className="detail-meta">
        <div>
          <span>学习线</span>
          <strong>{TRACKS[phrase.trackId].label}</strong>
        </div>
        <div>
          <span>学习状态</span>
          <strong>
            {grade
              ? `${grade}${nextReviewOn ? ` · ${nextReviewOn} 复习` : ""}`
              : phrase.contentStatus === "complete"
                ? "未开始"
                : "内容待补全"}
          </strong>
        </div>
      </div>
      <div className="detail-example">
        <p>
          {phrase.exampleEn ||
            "这条内容暂时还没有英文例句。"}
        </p>
        <span>
          {phrase.exampleZh ||
            "例句中文翻译待补全。"}
        </span>
      </div>
      {phrase.synonyms.length > 0 ? (
        <div className="detail-synonyms">
          {phrase.synonyms.map((item) => (
            <div className="detail-synonym" key={`${phrase.id}:${item.phrase}`}>
              <strong>{item.phrase}</strong>
              <p>{item.usage || "暂无用法说明"}</p>
              {item.exampleEn && item.exampleZh ? (
                <p>
                  {item.exampleEn}
                  <br />
                  {item.exampleZh}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
