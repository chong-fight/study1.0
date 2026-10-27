import type { Phrase } from "@/lib/domain/types";

interface Props {
  phrase: Phrase;
  showPrimary?: boolean;
  compact?: boolean;
  primaryClassName?: string;
  showExamples?: boolean;
}

export default function MeaningSenses({
  phrase,
  showPrimary = true,
  compact = false,
  primaryClassName = "study-meaning",
  showExamples = false,
}: Props) {
  const senses = phrase.senses ?? [
    { meaning: phrase.meaning, primary: true },
  ];
  const primary =
    senses.find((item) => item.primary)?.meaning ?? phrase.meaning;
  const secondary = senses.filter(
    (item) => item.meaning !== primary,
  );

  return (
    <div
      className={[
        "meaning-senses",
        compact ? "compact" : "",
        secondary.length > 0 ? "has-secondary" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showPrimary ? (
        <p className={primaryClassName}>{primary}</p>
      ) : null}
      {secondary.length > 0 ? (
        <div className="secondary-senses">
          <span>其他义项</span>
          <ul>
            {secondary.map((sense) => (
              <li key={sense.meaning}>
                <strong>{sense.meaning}</strong>
                {sense.note ? <small>{sense.note}</small> : null}
                {showExamples && sense.exampleEn ? (
                  <span className="sense-example">
                    {sense.exampleEn}
                    {sense.exampleZh ? <small>{sense.exampleZh}</small> : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
