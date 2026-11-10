import { expect, test } from "@playwright/test";

test("loads the app and service worker from the Pages subpath", async ({
  page,
  request,
}) => {
  await page.goto("http://127.0.0.1:4178/phrase-memory-2/");
  await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();
  const manifest = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(manifest).toBe("/phrase-memory-2/manifest.json");
  expect(page.url()).toContain("/phrase-memory-2/");

  const serviceWorker = await page.request.get(
    "/phrase-memory-2/sw.js",
  );
  expect(serviceWorker.ok()).toBe(true);
  expect(await serviceWorker.text()).toContain(
    'const CACHE_PREFIX = "phrase-memory-2-";',
  );
  await request.get("/phrase-memory-2/__e2e_done");
});
