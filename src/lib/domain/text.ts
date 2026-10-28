export function normalizePhrase(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeChinese(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[，,；;、/／|]/g, "；")
    .replace(/\s+/g, "")
    .trim();
}

export function normalizeEnglishAnswer(value: string): string {
  return normalizePhrase(value)
    .replace(/\s*([.,!?;:])\s*/g, "$1")
    .replace(/\s*\/\s*/g, "/");
}

export function acceptedMeaningParts(meaning: string): string[] {
  return meaning
    .split(/[，,；;、/／|]/)
    .map(normalizeChinese)
    .filter(Boolean);
}

export function isAcceptedMeaningLegacy(
  answer: string,
  meaning: string,
): boolean {
  const candidate = normalizeChinese(answer);
  if (candidate.length < 1) return false;

  return acceptedMeaningParts(meaning).some((part) => {
    if (!part) return false;
    if (candidate === part) return true;
    if (candidate.length >= 2 && part.includes(candidate)) return true;
    return part.length >= 2 && candidate.includes(part);
  });
}

export function isAcceptedMeaning(answer: string, meaning: string): boolean {
  const candidate = looseChinese(answer);
  if (!candidate || candidate === "◇") return false;
  if (candidate.length < 2 && !candidate.includes("◇")) return false;

  return meaning
    .split(/[\uFF0C,\uFF1B;\u3002\uFF01\uFF1F?|]/)
    .map(looseChinese)
    .filter(Boolean)
    .some((part) => {
      if (candidate === part) return true;
      if (candidate.length >= 2 && part.includes(candidate)) return true;
      if (part.length >= 2 && candidate.includes(part)) return true;
      const candidateCore = candidate.replace(/◇/g, "");
      const partCore = part.replace(/◇/g, "");
      return (
        candidateCore.length >= 2 &&
        partCore.length >= 2 &&
        (candidateCore.includes(partCore) ||
          partCore.includes(candidateCore))
      );
    });
}

function looseChinese(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2026+|\.{2,}/g, "\u25C7")
    .replace(
      /(?:\u67D0\u4EBA\u7269|\u67D0\u4E8B\u7269|\u67D0\u4EBA|\u67D0\u7269|\u67D0\u4E8B|\u4EC0\u4E48)/g,
      "\u25C7",
    )
    .replace(
      /[\s\uFF0C,\u3002\uFF1B;\uFF1A:\u3001\uFF01!\uFF1F?\uFF08\uFF09()\u3010\u3011\[\]\u201C\u201D"'\u300A\u300B<>]/g,
      "",
    )
    .trim();
}

export function isAcceptedPhraseLegacy(
  answer: string,
  phrase: string,
): boolean {
  const candidate = normalizeEnglishAnswer(answer);
  const alternatives = phrase
    .split(/\s*=\s*/)
    .map(normalizeEnglishAnswer)
    .filter(Boolean);
  if (alternatives.includes(candidate)) return true;

  const withoutPlaceholders = normalizeEnglishAnswer(
    phrase
      .replace(/\s*\b(?:sb|sth)\.?\/\b(?:sb|sth)\.?/gi, " ")
      .replace(/\b(?:sb|sth)\.?/gi, " "),
  );
  return Boolean(withoutPlaceholders) && candidate === withoutPlaceholders;
}

export function isAcceptedPhrase(answer: string, phrase: string): boolean {
  const candidate = normalizeEnglishAnswer(answer);
  const candidateWithoutPlaceholders =
    stripEnglishPlaceholders(candidate);
  const alternatives = phrase
    .split(/\s+(?:=|\uFF0F|\/)\s+/)
    .flatMap((item) => item.split(/\s*=\s*/))
    .map(normalizeEnglishAnswer)
    .filter(Boolean);
  const accepted = new Set<string>();
  for (const alternative of alternatives) {
    accepted.add(alternative);
    accepted.add(stripEnglishPlaceholders(alternative));
  }
  return (
    accepted.has(candidate) ||
    accepted.has(candidateWithoutPlaceholders)
  );
}

function stripEnglishPlaceholders(value: string): string {
  return normalizeEnglishAnswer(
    value
      .replace(
        /\s*\b(?:somebody|something|sb|sth)\.?\s*\/\s*(?:somebody|something|sb|sth)\.?/gi,
        " ",
      )
      .replace(/\b(?:somebody|something|sb|sth)\.?/gi, " ")
      .replace(/\s+/g, " "),
  );
}

export function containsPhrase(sentence: string, phrase: string): boolean {
  return normalizePhrase(sentence).includes(normalizePhrase(phrase));
}

export function makeContentKey(trackId: string, phrase: string): string {
  return `${trackId}:${normalizePhrase(phrase)}`;
}

export function makePhraseId(trackId: string, phrase: string): string {
  return `${trackId}:${encodeURIComponent(normalizePhrase(phrase))}`;
}

export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return shuffle(items, random);
}

export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}
