import { expect, test } from "@playwright/test";
import {
  localToday,
  makeFixturePhrase,
  seedTestData,
} from "./fixtures/seed";

test.use({ viewport: { width: 390, height: 700 } });

test("keeps the quick review sheet inside a long mobile page", async ({
  page,
}) => {
  await page.goto("/");
  const today = await localToday(page);
  const phrases = Array.from({ length: 20 }, (_, index) =>
    makeFixturePhrase("fixed", `mobile quick review ${index}`),
  );
  await seedTestData(page, {
    phrases,
    learningSessions: [
      {
        id: `${today}:fixed`,
        date: today,
        trackId: "fixed",
        phraseIds: phrases.map((phrase) => phrase.id),
        previewedPhraseIds: phrases.map((phrase) => phrase.id),
        stage: "day0",
        currentRound: 1,
        roundPassedIds: { "1": [], "2": [], "3": [], "4": [] },
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });

  await page.getByRole("button", { name: "今日快闪" }).click();
  const sheet = page.getByRole("dialog", { name: "今日快闪" });
  await expect(sheet).toBeVisible();
  expect(
    await sheet.evaluate((element) => element.closest("main.page") === null),
  ).toBe(true);
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(701);
});

test("keeps quick review progress by direction and avoids formal writes", async ({
  page,
}) => {
  await page.goto("/");
  const today = await localToday(page);
  const phrase = makeFixturePhrase("fixed", "look into", "调查");
  await seedTestData(page, {
    phrases: [phrase],
    learningSessions: [
      {
        id: `${today}:fixed`,
        date: today,
        trackId: "fixed",
        phraseIds: [phrase.id],
        previewedPhraseIds: [phrase.id],
        stage: "day0",
        currentRound: 1,
        roundPassedIds: { "1": [], "2": [], "3": [], "4": [] },
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    cardProgress: [
      {
        id: phrase.id,
        phraseId: phrase.id,
        trackId: "fixed",
        state: "day0",
        day0Rating: "know",
        previewRequiredCount: 2,
        previewRecognizedCount: 0,
        skills: {
          recognition: "unseen",
          production: "unseen",
          usage: "unseen",
          pattern: "unseen",
        },
        firstLearnedOn: today,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });

  await page.getByRole("button", { name: "今日快闪" }).click();
  await page.getByRole("button", { name: "中文 → English" }).click();
  const input = page.getByRole("textbox", { name: "快闪答案" });
  await input.fill("wrong");
  await page.getByRole("button", { name: "确认" }).click();
  await expect(page.getByText(/还不对/)).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "[]"),
      `phrase-memory-2-quick-review:${today}:zh-en`,
    ),
  ).toEqual([]);

  await input.fill("look into");
  await page.getByRole("button", { name: "确认" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "[]"),
        `phrase-memory-2-quick-review:${today}:zh-en`,
      ),
    )
    .toEqual([phrase.id]);

  await page.getByRole("button", { name: "关闭今日快闪" }).click();
  await page.getByRole("button", { name: "今日快闪" }).click();
  await page.getByRole("button", { name: "中文 → English" }).click();
  await expect(page.getByText("1/1")).toBeVisible();

  const counts = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("PhraseMemory2");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = (storeName: string) =>
      new Promise<number>((resolve, reject) => {
        const request = db.transaction(storeName).objectStore(storeName).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const result = {
      logs: await count("reviewLogs"),
      states: await count("reviewStates"),
      progress: await count("cardProgress"),
    };
    db.close();
    return result;
  });
  expect(counts).toEqual({ logs: 0, states: 0, progress: 1 });
});
