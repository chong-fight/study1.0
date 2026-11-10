import { expect, test } from "@playwright/test";
import { makeFixturePhrase, seedTestData } from "./fixtures/seed";

test("keeps the 320px layout usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await seedTestData(page, {
    phrases: [
      makeFixturePhrase("fixed", "a deliberately long fixed fixture phrase"),
      makeFixturePhrase("verb-pattern", "a deliberately long verb pattern"),
    ],
  });
  await page.goto("/");

  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth);
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(navigation).toBeVisible();
  for (const label of ["今日", "学习", "短语库", "复习", "我的"]) {
    await expect(
      navigation.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }
});
