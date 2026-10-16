// 서비스 워커: 설치되고, 한 번 연 뒤에는 인터넷 없이도 열리는지
const { test, expect } = require("@playwright/test");

test.use({ serviceWorkers: "allow" });

test("한 번 열면 오프라인에서도 열린다", async ({ page, context }) => {
  await context.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.goto("index.html");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // 서비스 워커가 페이지를 맡은 상태로 한 번 더
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".tabbar")).toBeVisible();
  await context.setOffline(false);
});
