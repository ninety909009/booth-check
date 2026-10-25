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

test("무료 나눔 '안 받기'(수량 0)가 새로고침 뒤에도 유지된다", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const T = window.__bcTest;
    const S = T.normalize({
      booths: [
        {
          id: "b1",
          section: "A",
          num: "1",
          items: [
            { id: "f1", name: "무료 엽서", type: "free", want: 1 },
            { id: "o1", name: "회지", type: "on", price: 5000, want: 2 },
          ],
        },
      ],
    });
    S.booths[0].items[0].want = 0; // 안 받기
    S.booths[0].items[1].want = 0; // 구매 리스트에서 뺌
    T.setS(S);
    T.flush();
  });
  await page.reload();
  await page.waitForSelector("#top");
  const items = await page.evaluate(() => window.__bcTest.getS().booths[0].items.map((i) => [i.id, i.want, i.maybe]));
  expect(items).toEqual([
    ["f1", 0, false],
    ["o1", 0, false],
  ]);
});

test("선입금·수요조사를 동시에 가진 작가가 새로고침 뒤에도 남고, 예전 '수요조사' 데이터는 옮겨진다", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const T = window.__bcTest;
    const S = T.normalize({
      booths: [
        {
          id: "b1",
          section: "A",
          num: "1",
          artists: [
            {
              id: "a1",
              nick: "둘다",
              svFrom: "2026-10-01",
              svTo: "2026-10-10",
              svLink: "https://forms.gle/sv",
              preFrom: "2026-10-11",
              preTo: "2026-10-20",
              preLink: "https://witchform.com/pre",
            },
            {
              id: "a2",
              nick: "옛수요조사",
              preKind: "survey",
              preFrom: "2026-09-01",
              preTo: "2026-09-05",
              preLink: "https://forms.gle/old",
            },
            { id: "a3", svFrom: "2026-09-01" }, // 닉네임 없이 수요조사 기간만
          ],
        },
      ],
    });
    T.setS(S);
    T.flush();
  });
  await page.reload();
  await page.waitForSelector("#top");
  const got = await page.evaluate(() =>
    window.__bcTest.getS().booths[0].artists.map((a) => [a.nick, a.svFrom, a.svLink, a.preFrom, a.preLink, "preKind" in a])
  );
  expect(got).toEqual([
    ["둘다", "2026-10-01", "https://forms.gle/sv", "2026-10-11", "https://witchform.com/pre", false],
    ["옛수요조사", "2026-09-01", "https://forms.gle/old", "", "", false],
    ["", "2026-09-01", "", "", "", false],
  ]);
  expect(errors).toEqual([]);
});

test("부스 편집에서 수요조사·선입금을 둘 다 켜고 저장할 수 있다", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const T = window.__bcTest;
    T.setS(T.normalize({ booths: [{ id: "b1", section: "A", num: "1", name: "부스1", artists: [{ id: "a1", nick: "작가" }] }] }));
    T.flush();
  });
  await page.reload();
  await page.locator('[data-act="open"][data-id="b1"], .bcard[data-id="b1"]').first().click();
  await page.click('[data-act="editBooth"]');
  const svBtn = page.locator('[data-kind="sv"]');
  await expect(page.locator('[data-kind="pre"]')).toHaveAttribute("aria-pressed", "true");
  await expect(svBtn).toHaveAttribute("aria-pressed", "false");
  await svBtn.click();
  await expect(svBtn).toHaveAttribute("aria-pressed", "true");
  await page.fill('[data-af="svFrom"]', "2026-10-01");
  await page.fill('[data-af="svTo"]', "2026-10-30");
  await page.fill('[data-af="svLink"]', "forms.gle/abc");
  await page.fill('[data-af="preFrom"]', "2026-11-01");
  await page.fill('[data-af="preTo"]', "2026-11-10");
  await page.fill('[data-af="preToTime"]', "2200");
  await page.click('[data-act="saveBooth"]');
  const a = await page.evaluate(() => window.__bcTest.getS().booths[0].artists[0]);
  expect([a.svFrom, a.svTo, a.svLink, a.preFrom, a.preTo, a.preToTime]).toEqual([
    "2026-10-01",
    "2026-10-30",
    "https://forms.gle/abc",
    "2026-11-01",
    "2026-11-10",
    "22:00",
  ]);
  // 선입금을 끄고 저장하면 선입금 기간만 지워짐
  await page.click('[data-act="editBooth"]');
  await page.click('[data-kind="pre"]');
  await expect(page.locator('[data-af="preFrom"]')).toHaveCount(0);
  await page.click('[data-act="saveBooth"]');
  const b = await page.evaluate(() => window.__bcTest.getS().booths[0].artists[0]);
  expect([b.svFrom, b.preFrom, b.preTo]).toEqual(["2026-10-01", "", ""]);
  expect(errors).toEqual([]);
});

test("기간 목록: 작가 한 명의 수요조사·선입금이 둘 다 나온다", async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const T = window.__bcTest;
    const S = T.normalize({
      booths: [{ id: "b1", section: "A", num: "1", artists: [{ id: "a1", nick: "작가", svTo: "2099-01-01", preTo: "2099-02-01" }] }],
    });
    T.setS(S);
    const P = T.shareProj(S).booths[0].artists[0];
    return { kinds: T.boothPeriods(S.booths[0]).map((x) => x.p.kind || "pre"), shared: [P.svTo, P.preTo, "preKind" in P] };
  });
  expect(r.kinds).toEqual(["survey", "pre"]);
  expect(r.shared).toEqual(["2099-01-01", "2099-02-01", false]);
});

async function openArtistEdit(page, artist) {
  await page.evaluate((artist) => {
    const T = window.__bcTest;
    T.setS(T.normalize({ booths: [{ id: "b1", section: "A", num: "1", name: "부스1", artists: artist ? [artist] : [] }] }));
    T.flush();
  }, artist);
  await page.reload();
  await page.locator('[data-act="open"][data-id="b1"], .bcard[data-id="b1"]').first().click();
  await page.click('[data-act="editBooth"]');
  if (!artist) await page.click("#fArtAdd"); // 빈 작가는 저장되지 않으므로 화면에서 추가
}
const OEMBED = /publish\.twitter\.com\/oembed/;

test("인포 링크가 트위터 글이면 비어 있는 사이트·닉네임을 채운다", async ({ page }) => {
  const errors = await openApp(page);
  let asked = "";
  await page.route(OEMBED, (r) => {
    asked = r.request().url();
    r.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
      body: JSON.stringify({ author_name: "부스 작가", author_url: "https://twitter.com/booth_artist" }),
    });
  });
  await openArtistEdit(page, null);
  await page.fill('[data-af="info"]', "https://x.com/booth_artist/status/123?s=20");
  await expect(page.locator('[data-af="site"]')).toHaveValue("@booth_artist");
  await expect(page.locator('[data-af="nick"]')).toHaveValue("부스 작가");
  expect(asked).toContain(encodeURIComponent("https://twitter.com/booth_artist/status/123"));
  await page.click('[data-act="saveBooth"]');
  const a = await page.evaluate(() => window.__bcTest.getS().booths[0].artists[0]);
  expect([a.nick, a.site, a.info]).toEqual(["부스 작가", "https://x.com/booth_artist", "https://x.com/booth_artist/status/123?s=20"]);
  expect(errors).toEqual([]);
});

test("이미 적은 닉네임·사이트는 덮어쓰지 않는다", async ({ page }) => {
  await openApp(page);
  await page.route(OEMBED, (r) =>
    r.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
      body: '{"author_name":"다른 이름","author_url":"https://twitter.com/other"}',
    })
  );
  await openArtistEdit(page, { id: "a1", nick: "내가 적은 이름", site: "@mine", info: "" });
  await page.fill('[data-af="info"]', "https://x.com/someone/status/9");
  await page.waitForTimeout(900);
  await expect(page.locator('[data-af="nick"]')).toHaveValue("내가 적은 이름");
  await expect(page.locator('[data-af="site"]')).toHaveValue("https://x.com/mine");
});

test("X에서 닉네임을 못 받아와도 아이디는 채우고 오류가 없다", async ({ page }) => {
  const errors = await openApp(page);
  await page.route(OEMBED, (r) => r.abort());
  await openArtistEdit(page, null);
  await page.fill('[data-af="info"]', "https://twitter.com/abc_1/status/77");
  await expect(page.locator('[data-af="site"]')).toHaveValue("@abc_1");
  await page.waitForTimeout(900);
  await expect(page.locator('[data-af="nick"]')).toHaveValue("");
  expect(errors).toEqual([]);
});

async function openBooth(page, booth) {
  await page.evaluate((booth) => {
    const T = window.__bcTest;
    T.setS(T.normalize({ booths: [booth] }));
    T.flush();
  }, booth);
  await page.reload();
  await page.locator(`[data-act="open"][data-id="${booth.id}"], .bcard[data-id="${booth.id}"]`).first().click();
}

test("작가가 여럿이면 묶음마다 ＋ 물품 버튼으로 그 작가 물품을 추가한다", async ({ page }) => {
  const errors = await openApp(page);
  await openBooth(page, {
    id: "b1",
    section: "A",
    num: "1",
    artists: [
      { id: "a1", nick: "하나" },
      { id: "a2", nick: "둘" },
    ],
  });
  await expect(page.locator("#nArt")).toHaveCount(0); // 드롭다운 없음
  await expect(page.locator("#qAdd")).toBeHidden();
  await expect(page.locator('#bItems [data-act="addFor"]')).toHaveCount(3); // 공통 + 작가 2명
  await page.click('#bItems [data-act="addFor"][data-aid="a2"]');
  await expect(page.locator('.agbox[data-aid="a2"] #addBox')).toBeVisible();
  await expect(page.locator("#addTitle")).toHaveText("물품 추가 · 둘");
  await page.fill("#nName", "둘의 회지");
  await page.fill("#nPrice", "5000");
  await page.click("#nAdd");
  // 추가한 뒤에도 같은 묶음에서 계속 적을 수 있음
  await expect(page.locator('.agbox[data-aid="a2"] #addBox')).toBeVisible();
  await expect(page.locator('.agbox[data-aid="a2"] .item')).toHaveCount(1);
  await page.click('#bItems [data-act="addFor"][data-aid=""]');
  await expect(page.locator("#addTitle")).toHaveText("물품 추가 · 공통");
  await page.fill("#nName", "공통 엽서");
  await page.click("#nAdd");
  const items = await page.evaluate(() => window.__bcTest.getS().booths[0].items.map((i) => [i.name, i.artist]));
  expect(items).toEqual([
    ["둘의 회지", "a2"],
    ["공통 엽서", ""],
  ]);
  expect(errors).toEqual([]);
});

test("작가가 한 명이면 예전처럼 아래 ‘물품 추가’ 버튼을 쓴다", async ({ page }) => {
  await openApp(page);
  await openBooth(page, { id: "b1", section: "A", num: "1", artists: [{ id: "a1", nick: "하나" }] });
  await expect(page.locator('#bItems [data-act="addFor"]')).toHaveCount(0);
  if (await page.locator("#addBox").isHidden()) await page.click("#qAdd");
  await page.fill("#nName", "회지");
  await page.click("#nAdd");
  expect(await page.evaluate(() => window.__bcTest.getS().booths[0].items[0].artist)).toBe("a1");
});

const SYND = /cdn\.syndication\.twimg\.com\/tweet-result/;
test("인포 트윗을 읽어 닉네임·수요조사/선입금 기간·폼·인포 이미지를 채운다", async ({ page }) => {
  const errors = await openApp(page);
  let asked = "";
  await page.route(SYND, (r) => {
    asked = r.request().url();
    r.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
      body: JSON.stringify({
        created_at: "2026-09-20T03:00:00.000Z",
        text: "📢 수요조사 10/1~10/10 23:59\nhttps://t.co/sv1\n💸 선입금 10/15 ~ 10/25\nhttps://t.co/pre1 https://t.co/pic1",
        user: { name: "부스 작가", screen_name: "booth_artist" },
        entities: {
          urls: [
            { url: "https://t.co/sv1", expanded_url: "https://forms.gle/AbC", display_url: "forms.gle/AbC" },
            { url: "https://t.co/pre1", expanded_url: "https://witchform.com/payform/?uuid=1", display_url: "witchform.com/payform/…" },
          ],
          media: [{ url: "https://t.co/pic1" }],
        },
        mediaDetails: [
          { type: "photo", media_url_https: "https://pbs.twimg.com/media/AAA.jpg" },
          { type: "photo", media_url_https: "https://pbs.twimg.com/media/BBB.png" },
        ],
      }),
    });
  });
  await openArtistEdit(page, null);
  await page.fill('[data-af="info"]', "https://x.com/booth_artist/status/1844000000000000001");
  await expect(page.locator('[data-af="nick"]')).toHaveValue("부스 작가");
  await expect(page.locator('[data-af="svFrom"]')).toHaveValue("2026-10-01");
  expect(asked).toContain("id=1844000000000000001");
  await expect(page.locator('[data-af="svTo"]')).toHaveValue("2026-10-10");
  await expect(page.locator('[data-af="svToTime"]')).toHaveValue("23:59");
  await expect(page.locator('[data-af="svLink"]')).toHaveValue("https://forms.gle/AbC");
  await expect(page.locator('[data-af="preFrom"]')).toHaveValue("2026-10-15");
  await expect(page.locator('[data-af="preLink"]')).toHaveValue("https://witchform.com/payform/?uuid=1");
  await page.click('[data-act="saveBooth"]');
  const a = await page.evaluate(() => window.__bcTest.getS().booths[0].artists[0]);
  expect(a.imgs).toEqual([
    "https://pbs.twimg.com/media/AAA?format=jpg&name=large",
    "https://pbs.twimg.com/media/BBB?format=png&name=large",
  ]);
  expect([a.nick, a.site, a.svFrom, a.preTo]).toEqual(["부스 작가", "https://x.com/booth_artist", "2026-10-01", "2026-10-25"]);
  expect(errors).toEqual([]);
});

test("이미 적은 기간·이미지는 트윗을 읽어도 덮어쓰지 않는다", async ({ page }) => {
  await openApp(page);
  await page.route(SYND, (r) =>
    r.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        text: "선입금 10/15~10/25",
        user: { name: "x" },
        mediaDetails: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/NEW.jpg" }],
      }),
    })
  );
  await openArtistEdit(page, { id: "a1", nick: "작가", preFrom: "2026-11-01", imgs: ["https://example.com/mine.jpg"] });
  await page.fill('[data-af="info"]', "https://x.com/someone/status/9");
  await page.waitForTimeout(900);
  await expect(page.locator('[data-af="preFrom"]')).toHaveValue("2026-11-01");
  await page.click('[data-act="saveBooth"]');
  const a = await page.evaluate(() => window.__bcTest.getS().booths[0].artists[0]);
  expect([a.preFrom, a.preTo, a.imgs]).toEqual(["2026-11-01", "", ["https://example.com/mine.jpg"]]);
});

test("트위터 사진을 작가 칸에 끌어다 놓으면 큰 사진으로 인포 이미지에 들어간다", async ({ page }) => {
  const errors = await openApp(page);
  await openArtistEdit(page, { id: "a1", nick: "작가" });
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData(
      "text/html",
      '<a href="https://x.com/a/status/1/photo/1"><img src="https://pbs.twimg.com/media/GxYz?format=jpg&amp;name=small" alt=""></a>'
    );
    dt.setData("text/uri-list", "https://x.com/a/status/1/photo/1");
    const el = document.querySelector('[data-af="imgIn"]');
    el.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator(".imgchip img")).toHaveCount(1);
  await page.click('[data-act="saveBooth"]');
  const imgs = await page.evaluate(() => window.__bcTest.getS().booths[0].artists[0].imgs);
  expect(imgs).toEqual(["https://pbs.twimg.com/media/GxYz?format=jpg&name=large"]);
  expect(errors).toEqual([]);
});

async function openRoute(page) {
  await page.evaluate(() => {
    const T = window.__bcTest;
    const S = T.normalize({
      booths: ["b1", "b2", "b3"].map((id, k) => ({
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
  await expect(page.locator(".rstop.rs")).toHaveCount(3);
}
const routeIds = (page) => page.locator(".rstop.rs").evaluateAll((rs) => rs.map((r) => r.dataset.id));

test("동선: ⠿를 끌어서 부스 순서를 바꾸고, 새로고침 뒤에도 남는다", async ({ page }) => {
  const errors = await openApp(page);
  await openRoute(page);
  const auto = await routeIds(page);
  const g = page.locator(`.rstop[data-id="${auto[2]}"] .rgrip`);
  const first = await page.locator(`.rstop[data-id="${auto[0]}"]`).boundingBox();
  const box = await g.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, first.y + 2, { steps: 8 });
  await page.mouse.up();
  const moved = [auto[2], auto[0], auto[1]];
  await expect.poll(() => routeIds(page)).toEqual(moved);
  await expect(page.locator(".rstop.rs .rno").first()).toHaveText("1");
  await expect(page.locator('[data-act="rauto"]')).toBeVisible();
  await page.reload();
  await page.click('.tabbar [data-tab="map"]');
  await expect.poll(() => routeIds(page)).toEqual(moved);
  // 키보드 ↓로 첫 부스를 한 칸 아래로
  await page.locator(`.rstop[data-id="${moved[0]}"] .rgrip`).focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => routeIds(page)).toEqual([moved[1], moved[0], moved[2]]);
  // 자동 순서로 되돌리기
  await page.click('[data-act="rauto"]');
  await expect.poll(() => routeIds(page)).toEqual(auto);
  await expect(page.locator(".rorder")).toBeVisible();
  expect(errors).toEqual([]);
});

test("동선: 직접 정한 순서 뒤에 새로 살 것이 생긴 부스는 끝에 붙는다", async ({ page }) => {
  await openApp(page);
  await openRoute(page);
  const auto = await routeIds(page);
  await page.evaluate((ids) => {
    const T = window.__bcTest,
      S = T.getS();
    S.booths.find((b) => b.id === ids[0]).items[0].st = 1; // 첫 부스는 다 삼 → 빠짐
    T.flush();
  }, auto);
  await page.reload();
  await page.click('.tabbar [data-tab="map"]');
  await expect(page.locator(".rstop.rs")).toHaveCount(2);
  await page.locator(`.rstop[data-id="${auto[2]}"] .rgrip`).focus();
  await page.keyboard.press("ArrowUp"); // 직접 순서 저장
  const manual = await routeIds(page);
  expect(manual).toEqual([auto[2], auto[1]]);
  await page.evaluate((ids) => {
    const T = window.__bcTest,
      S = T.getS();
    S.booths.find((b) => b.id === ids[0]).items[0].st = 0; // 다시 살 것 생김
    T.flush();
  }, auto);
  await page.reload();
  await page.click('.tabbar [data-tab="map"]');
  await expect.poll(() => routeIds(page)).toEqual([auto[2], auto[1], auto[0]]);
});
