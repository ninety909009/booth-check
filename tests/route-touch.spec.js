// 휴대폰(터치) 화면에서 동선 순서 바꾸기
const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers");
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
test("동선: 휴대폰에서 손가락으로 ⠿를 끌어 순서를 바꾼다", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const T = window.__bcTest;
    const S = T.normalize({
      booths: ["b1", "b2", "b3", "b4"].map((id, k) => ({
        id,
        section: "A",
        num: String(k + 1),
        name: "부스" + (k + 1),
        items: [{ id: "i" + k, name: "물품", price: 1000, type: "on" }],
      })),
    });
    S.booths.forEach((b, k) => (b.pos = { hall: S.halls[0].id, x: 2 + k * 6, y: 2 }));
    T.setS(S);
    T.flush();
  });
  await page.reload();
  await page.click('.tabbar [data-tab="map"]');
  await page.click('[data-act="mroute"]');
  const ids = () => page.locator(".rstop.rs").evaluateAll((rs) => rs.map((r) => r.dataset.id));
  const before = await ids();
  const box = await page.locator(".rstop.rs").nth(2).locator(".rgrip").boundingBox();
  const first = await page.locator(".rstop.rs").first().boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: box.y + box.height / 2 }] });
  for (let k = 1; k <= 10; k++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: box.y + box.height / 2 + ((first.y + 4 - (box.y + box.height / 2)) * k) / 10 }],
    });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
  const after = await ids();
  expect(after).toEqual([before[2], before[0], before[1], before[3]]);
});
