import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  localDateKey,
  parseDateKey,
} from "@/lib/domain/date";
import {
  isAcceptedMeaning,
  isAcceptedPhrase,
  makeContentKey,
  normalizePhrase,
  seededShuffle,
} from "@/lib/domain/text";

describe("local date helpers", () => {
  it("formats a local date without UTC conversion", () => {
    const local = new Date(2026, 0, 1, 0, 5, 0);
    expect(localDateKey(local)).toBe("2026-01-01");
  });

  it("adds calendar days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
  });

  it("parses keys at local noon to avoid daylight-saving boundary drift", () => {
    expect(parseDateKey("2026-03-08").getHours()).toBe(12);
  });
});

describe("text matching", () => {
  it("normalizes spacing, case, and apostrophes", () => {
    expect(normalizePhrase("  Take   Part In ")).toBe("take part in");
    expect(makeContentKey("fixed", " Make a mistake ")).toBe(
      "fixed:make a mistake",
    );
  });

  it("accepts a useful Chinese alternative without accepting empty input", () => {
    expect(isAcceptedMeaning("参加", "参与；参加")).toBe(true);
    expect(isAcceptedMeaning("参", "参与；参加")).toBe(false);
    expect(isAcceptedMeaning("", "参与；参加")).toBe(false);
    expect(isAcceptedMeaning("放弃", "参与；参加")).toBe(false);
  });

  it("normalizes ellipsis placeholders and accepts meaningful partial Chinese", () => {
    expect(isAcceptedMeaning("对...感激", "对……感激")).toBe(true);
    expect(isAcceptedMeaning("对感激", "对……感激")).toBe(true);
    expect(isAcceptedMeaning("感激", "对……感激")).toBe(true);
    expect(isAcceptedMeaning("什么", "对……感激")).toBe(false);
    expect(isAcceptedMeaning("感", "对……感激")).toBe(false);
  });

  it("requires normalized English punctuation and spacing", () => {
    expect(isAcceptedPhrase("Take part in", "take part in")).toBe(true);
    expect(isAcceptedPhrase("take  part in", "take part in")).toBe(true);
    expect(isAcceptedPhrase("take in", "take part in")).toBe(false);
  });

  it("accepts placeholder-free and slash-alternative English answers", () => {
    expect(
      isAcceptedPhrase(
        "can't bear doing sth.",
        "can't bear to do sth. / can't bear doing sth.",
      ),
    ).toBe(true);
    expect(
      isAcceptedPhrase("accuse sb of sth", "accuse sb. of sth."),
    ).toBe(true);
  });

  it("shuffles by a stable round seed instead of the learning-list order", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const first = seededShuffle(items, "2026-01-01:fixed:meaning:0");
    const repeated = seededShuffle(items, "2026-01-01:fixed:meaning:0");
    expect(first).toEqual(repeated);
    expect(first).not.toEqual(items);
  });
});
