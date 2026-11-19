import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TEST_URL || "http://localhost:5173");
  await page.waitForSelector(".chapter-card");
  assert.equal(await page.locator(".chapter-card").count(), 3);
  await page.screenshot({ path: "desktop.png", fullPage: true });
  await page.locator(".chapter-card").first().click();
  await page.locator("#notation").fill("e4");
  await page.locator("#move-form button").click();
  assert.equal(
    await page.locator("#progress-text").textContent(),
    "1 of 9 half-moves",
  );
  await page.locator("#back").click();
  await page.locator(".chapter-card").nth(1).click();
  await page.locator("#grade").click();
  assert.match(await page.locator("#score").textContent(), /0%/);
  await page.locator('[aria-label="white pawn"]').click();
  await page.locator("#board").click({ position: { x: 200, y: 200 } });
  await page.waitForTimeout(200);
  assert.equal(await page.locator("#board piece:not(.ghost)").count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.locator("#back").click();
  await page.locator("#paste").fill("8/8/8/8/8/8/P7/8 w - - 0 1");
  await page.locator("#import button").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".chapter-card").length === 4,
  );
  await page.reload();
  await page.waitForSelector(".chapter-card");
  assert.equal(await page.locator(".chapter-card").count(), 4);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/mobility layout, PGN move, FEN grading/editing, import, persistence, no browser exceptions",
  );
} finally {
  await browser.close();
}
