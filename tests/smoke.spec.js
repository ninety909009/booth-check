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

test("탭바를 방향키로 옮겨 다닐 수 있다", async ({ page }) => {
  await openApp(page);
  await page.focus('.tabbar [data-tab="booths"]');
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('.tabbar [data-tab="map"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('.tabbar [data-tab="map"]')).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.locator('.tabbar [data-tab="evtab"]')).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('.tabbar [data-tab="booths"]')).toHaveAttribute("aria-selected", "true");
});

test("firebase-config.js를 못 받으면 '파일 없음'으로 알아챈다", async ({ page }) => {
  await page.route("**/firebase-config.js", (r) => r.abort());
  await openApp(page);
  expect(await page.evaluate(() => window.__bcCfg.state)).toBe("missing");
});

test("firebase-config.js가 정상이면 'ok'", async ({ page }) => {
  await openApp(page);
  expect(await page.evaluate(() => window.__bcCfg.state)).toBe("ok");
});

test("깨진 이미지 링크는 bad 표시가 붙는다", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const d = document.createElement("span");
    d.id = "imgtest";
    d.innerHTML = '<img src="nope-404.png" data-bad>';
    document.body.appendChild(d);
  });
  await expect(page.locator("#imgtest")).toHaveClass(/bad/);
});

test("firebase-config.js에 문법 오류가 있으면 'syntax'", async ({ page }) => {
  await page.route("**/firebase-config.js", (r) => r.fulfill({ contentType: "text/javascript", body: "const firebaseConfig = {;" }));
  await openApp(page);
  expect(await page.evaluate(() => window.__bcCfg.state)).toBe("syntax");
});
