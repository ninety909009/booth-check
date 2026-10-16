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
    const T = window.__bcTest,
      S = T.getS();
    S.event.name = "테스트 행사";
    S.booths.push({ ...T.normalize({ booths: [{ id: "b1", section: "A", num: "12", name: "부스1" }] }).booths[0] });
    T.setS(S);
    T.flush();
  });
  await page.reload();
  await page.waitForSelector("#top");
  const got = await page.evaluate(() => {
    const S = window.__bcTest.getS();
    return [S.event.name, S.booths.map((b) => b.name)];
  });
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

test("체크 목록을 다시 그려도 보던 부스가 같은 자리에 있다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.evaluate(() => {
    const T = window.__bcTest;
    const booths = Array.from({ length: 60 }, (_, k) => ({
      id: "b" + k,
      section: "A",
      num: String(k + 1),
      name: "부스 " + k,
      items: Array.from({ length: 1 + (k % 7) }, (_, j) => ({ id: `i${k}_${j}`, name: "물품 " + j, price: 3000, type: "on" })),
    }));
    T.setS(T.normalize({ booths }));
    T.flush();
  });
  await page.reload();
  await page.click('.tabbar [data-tab="check"]');
  const anchor = () =>
    page.evaluate(() => {
      const mt = document.getElementById("main").getBoundingClientRect().top + 120;
      const g = [...document.querySelectorAll("#checkList .cgroup")].find((x) => x.getBoundingClientRect().bottom > mt);
      return g.querySelector(".chead").dataset.id + "@" + Math.round(g.getBoundingClientRect().top);
    });
  await page.evaluate(() => {
    document.getElementById("main").scrollTop = 6000;
  });
  await page.waitForTimeout(200);
  const before = await anchor();
  await page.click('[data-act="ckfold"]');
  await page.click('[data-act="remain"]'); // 목록 전체를 다시 그림
  await page.waitForTimeout(200);
  expect(await anchor()).toBe(before);
});
