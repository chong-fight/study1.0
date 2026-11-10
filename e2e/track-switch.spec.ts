import { expect, test } from "@playwright/test";
import { makeFixturePhrase, seedTestData } from "./fixtures/seed";

test("restores the selected learning line and preserves query parameters", async ({
  page,
}) => {
  await seedTestData(page, {
    phrases: [
      makeFixturePhrase("fixed", "fixed track fixture"),
      makeFixturePhrase("verb-pattern", "verb track fixture"),
    ],
  });
  await page.goto("/learn/?track=fixed&source=e2e");
  await expect(
    page.getByRole("heading", { name: "固定搭配尚未开始" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "动词句型" }).click();
  await expect(
    page.getByRole("heading", { name: "动词句型尚未开始" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/track=verb-pattern/);
  await expect(page).toHaveURL(/source=e2e/);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "动词句型尚未开始" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "动词句型" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("settles rapid switching on the final learning line", async ({
  page,
  request,
}) => {
  await seedTestData(page, {
    phrases: [
      makeFixturePhrase("fixed", "rapid fixed fixture"),
      makeFixturePhrase("verb-pattern", "rapid verb fixture"),
    ],
  });
  await page.goto("/learn/?track=fixed");

  await page.getByRole("button", { name: "动词句型" }).click();
  await page.getByRole("button", { name: "固定搭配" }).click();
  await expect(page).toHaveURL(/track=fixed/);
  await expect(page.getByRole("button", { name: "固定搭配" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await request.get("/__e2e_done");
});
