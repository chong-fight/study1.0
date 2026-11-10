import type { Page } from "@playwright/test";
import type {
  CardProgress,
  LearningSession,
  Phrase,
  ReviewPlan,
  ReviewState,
  TrackId,
} from "@/lib/domain/types";

export interface TestData {
  phrases?: Phrase[];
  learningSessions?: LearningSession[];
  cardProgress?: CardProgress[];
  reviewStates?: ReviewState[];
  reviewPlans?: ReviewPlan[];
}

export function makeFixturePhrase(
  trackId: TrackId,
  phrase: string,
  meaning = `${phrase} 的含义`,
): Phrase {
  const prefix = trackId === "fixed" ? "fixed" : "verb-pattern";
  const id = `${prefix}:e2e-${encodeURIComponent(phrase)}`;
  return {
    id,
    trackId,
    contentKey: `${trackId}:${phrase.toLowerCase()}`,
    phrase,
    normalizedPhrase: phrase.toLowerCase(),
    meaning,
    senses: [
      {
        meaning,
        primary: true,
        exampleEn: `The context contains ${phrase}.`,
        exampleZh: `这个语境包含 ${phrase}。`,
      },
    ],
    exampleEn: `The context contains ${phrase}.`,
    exampleZh: `这个语境包含 ${phrase}。`,
    quizExampleEn: `Another example uses ${phrase} here.`,
    quizExampleZh: `另一个例子在这里使用 ${phrase}。`,
    exampleVariants: [
      {
        exampleEn: `The context contains ${phrase}.`,
        exampleZh: `这个语境包含 ${phrase}。`,
      },
      {
        exampleEn: `Another example uses ${phrase} here.`,
        exampleZh: `另一个例子在这里使用 ${phrase}。`,
      },
      {
        exampleEn: `Students can practise ${phrase} today.`,
        exampleZh: `学生今天可以练习 ${phrase}。`,
      },
      {
        exampleEn: `This sentence also includes ${phrase}.`,
        exampleZh: `这个句子也包含 ${phrase}。`,
      },
    ],
    primaryExampleIndexes: [0, 1, 2, 3],
    entryType: trackId === "fixed" ? "固定短语" : "动词句型",
    category: "E2E",
    tags: ["e2e-fixture"],
    priority: 1,
    exerciseModes:
      trackId === "fixed"
        ? ["recognition", "production", "cloze"]
        : ["recognition", "production", "patternChoice"],
    supportsCloze: true,
    confusionGroup: "",
    synonyms: [],
    source: "e2e-fixed-fixture",
    contentStatus: "complete",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

export async function localToday(page: Page): Promise<string> {
  return page.evaluate(() => {
    const date = new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  });
}

export async function seedTestData(
  page: Page,
  data: TestData,
): Promise<void> {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(async (payload) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("PhraseMemory2");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = [
      "phrases",
      "learningSessions",
      "cardProgress",
      "reviewStates",
      "reviewPlans",
      "calibrationPlans",
      "reviewLogs",
    ];
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(stores, "readwrite");
      for (const storeName of stores) {
        transaction.objectStore(storeName).clear();
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(stores, "readwrite");
      const putAll = (storeName: string, values: unknown[] = []) => {
        const store = transaction.objectStore(storeName);
        for (const value of values) store.put(value);
      };
      putAll("phrases", payload.phrases);
      putAll("learningSessions", payload.learningSessions);
      putAll("cardProgress", payload.cardProgress);
      putAll("reviewStates", payload.reviewStates);
      putAll("reviewPlans", payload.reviewPlans);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, data);
  await page.reload();
  await page.waitForLoadState("networkidle");
}
