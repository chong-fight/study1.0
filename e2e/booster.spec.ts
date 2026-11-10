import { expect, test } from "@playwright/test";
import {
  localToday,
  makeFixturePhrase,
  seedTestData,
} from "./fixtures/seed";

test("opens the next booster round without formal review state", async ({
  page,
}) => {
  await page.goto("/");
  const today = await localToday(page);
  const phrases = Array.from({ length: 4 }, (_, index) =>
    makeFixturePhrase("fixed", `booster fixture ${index}`),
  );
  await seedTestData(page, {
    phrases,
    cardProgress: phrases.map((phrase, index) => ({
      id: phrase.id,
      phraseId: phrase.id,
      trackId: "fixed",
      state: "incubating",
      day0Rating: index % 2 === 0 ? "unknown" : "vague",
      provisionalGrade: index < 2 ? "D" : "C",
      skills: {
        recognition: "fragile",
        production: "fragile",
        usage: "fragile",
        pattern: "unseen",
      },
      firstLearnedOn: today,
      calibrationDueOn: "2099-01-01",
      createdAt: 1,
      updatedAt: 1,
    })),
  });

  await expect(page.getByText(/第2轮巩固/).first()).toBeVisible();
  await page.getByRole("link", { name: /开始第2轮巩固/ }).click();
  await expect(page.getByText(/第2轮巩固/).first()).toBeVisible();
  await page.getByRole("button", { name: "开始巩固" }).click();
  await expect(
    page.locator(".answer-question, .choice-list, .answer-input").first(),
  ).toBeVisible();

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
      formalReviews: await count("reviewStates"),
      boosterPlans: await count("reviewPlans"),
    };
    db.close();
    return result;
  });
  expect(counts.formalReviews).toBe(0);
  expect(counts.boosterPlans).toBe(1);
});
