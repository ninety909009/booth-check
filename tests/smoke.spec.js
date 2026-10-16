// 앱이 오류 없이 열리고, 탭 이동·저장이 되는지 확인
const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers");

test("오류 없이 열리고 모든 탭을 돌 수 있다", async ({ page }) => {
  const errors = await openApp(page);
  for (const tab of ["map", "check", "people", "evtab", "booths"]) {
    await page.click(`.tabbar [data-tab="${tab}"]`);
    await expect(page.locator(`.tabbar [data-tab="${tab}"]`)).toHaveAttribute("aria-selected", "true");
  }
  await page.click('#top [data-tab="info"]');
  expect(errors).toEqual([]);
});

test("테스트 훅은 ?bctest가 있을 때만 열린다", async ({ page }) => {
  await openApp(page, { query: "" });
  expect(await page.evaluate(() => typeof window.__bcTest)).toBe("undefined");
});

test("고친 내용이 새로고침 뒤에도 남는다", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const T = window.__bcTest, S = T.getS();
    S.event.name = "테스트 행사";
    S.booths.push({ ...T.normalize({ booths: [{ id: "b1", section: "A", num: "12", name: "부스1" }] }).booths[0] });
    T.setS(S);
    T.flush();
  });
  await page.reload();
  await page.waitForSelector("#top");
  const got = await page.evaluate(() => { const S = window.__bcTest.getS(); return [S.event.name, S.booths.map((b) => b.name)]; });
  expect(got[0]).toBe("테스트 행사");
  expect(got[1]).toContain("부스1");
  expect(errors).toEqual([]);
});
