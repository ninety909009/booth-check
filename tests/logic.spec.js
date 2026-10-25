// 순수 함수 단위 테스트 (브라우저 안에서 window.__bcTest로 호출)
const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers");

let page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await openApp(page);
});
test.afterAll(async () => {
  await page.close();
});
const run = (fn, ...args) => page.evaluate(([src, args]) => (0, eval)(src)(window.__bcTest, ...args), [fn.toString(), args]);

test("parseLive: 구독·편집 코드와 링크를 읽는다", async () => {
  const r = await run((T) => [
    T.parseLive("BCL-ab2cd3ef"),
    T.parseLive("https://x.github.io/booth-check/#s=AB2CD3EF"),
    T.parseLive("BCE-AB2CD3EF-123456789ABC"),
    T.parseLive("BCL-AB2CD3EFG"),
    T.parseLive("아무 글"),
  ]);
  expect(r[0]).toEqual({ code: "AB2CD3EF" });
  expect(r[1]).toEqual({ code: "AB2CD3EF" });
  expect(r[2]).toEqual({ code: "AB2CD3EF", key: "123456789ABC" });
  expect(r[3]).toBeNull();
  expect(r[4]).toBeNull();
});

test("normTime·normRange: 여러 시간 표기를 HH:MM으로 맞춘다", async () => {
  const r = await run((T) => [
    T.normTime("9시"),
    T.normTime("1430"),
    T.normTime("7:5"),
    T.normTime("25:00"),
    T.normTime(""),
    T.normRange("10:00~12:30"),
    T.normRange("~15시"),
    T.normRange("abc"),
  ]);
  expect(r.slice(0, 5)).toEqual(["09:00", "14:30", "07:05", null, ""]);
  expect(r[5]).toEqual({ from: "10:00", to: "12:30" });
  expect(r[6]).toEqual({ from: "", to: "15:00" });
  expect(r[7]).toBeNull();
});

test("normLink·normSite: http(s)만 링크로 받는다", async () => {
  const r = await run((T) => [
    T.normLink("example.com/a"),
    T.normLink("https://a.b/c"),
    T.normLink("javascript:alert(1)"),
    T.normSite("@abc_1"),
  ]);
  expect(r).toEqual(["https://example.com/a", "https://a.b/c", null, "https://x.com/abc_1"]);
});

test("esc: HTML 특수문자를 바꾼다", async () => {
  expect(await run((T) => T.esc(`<img src=x onerror="a">'&`))).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;&#39;&amp;");
});

test("parseWitch: 윗치폼 복붙을 물품으로 나눈다", async () => {
  const text = [
    "1. 아크릴 스탠드 (15,000원/1개)",
    "- 2 +",
    "엽서 세트",
    "3,000원 / 1개",
    "스티커 2,000원",
    "합계",
    "[품절] 키링 (8,000원)",
  ].join("\n");
  const r = await run((T, t) => T.parseWitch(t).map((x) => [x.name, x.price, x.qty, x.sold]), text);
  expect(r).toEqual([
    ["아크릴 스탠드", 15000, 2, false],
    ["엽서 세트", 3000, 0, false],
    ["스티커", 2000, 0, false],
    ["키링", 8000, 0, true],
  ]);
});

test("boothCode·josaRo", async () => {
  const r = await run((T) => [
    T.boothCode({ section: "A", num: "01", span: 2 }),
    T.boothCode({ section: "B", num: "3", half: "a" }),
    T.josaRo("현장"),
    T.josaRo("선입금"),
    T.josaRo("서울"),
  ]);
  expect(r).toEqual(["A01~02", "B3-a", "으로", "으로", "로"]);
});

test("백업 코드: 만들고 다시 읽으면 같은 내용", async () => {
  const r = await run(async (T) => {
    const S = T.normalize({
      event: { name: "행사" },
      booths: [{ id: "b1", section: "A", num: "1", name: "부스", items: [{ id: "i1", name: "회지", price: 5000 }] }],
    });
    T.setS(S);
    const code = await T.makeCode({ items: true, status: true, people: true, memo: true });
    const back = await T.parseCode(code);
    return [code.slice(0, 3), back.app, back.d.event.name, back.d.booths[0].items[0].name];
  });
  expect(r).toEqual(["BC1", "boothcheck", "행사", "회지"]);
});

test("parseCode: 깨진 코드는 오류를 낸다", async () => {
  const r = await run(async (T) => {
    try {
      await T.parseCode("BC1z:!!!");
      return "ok";
    } catch (e) {
      return "err";
    }
  });
  expect(r).toBe("err");
});

test("merge3: 내가 바꾼 칸과 남이 바꾼 칸을 둘 다 살린다", async () => {
  const r = await run((T) => {
    const base = T.shareProj(
      T.normalize({
        event: { name: "행사", place: "A홀" },
        booths: [
          { id: "b1", section: "A", num: "1", name: "원래" },
          { id: "b2", section: "A", num: "2", name: "둘" },
        ],
      })
    );
    const mine = JSON.parse(JSON.stringify(base)),
      theirs = JSON.parse(JSON.stringify(base));
    mine.event.name = "내가 바꾼 이름";
    mine.booths[0].name = "내 부스명";
    theirs.event.place = "B홀";
    theirs.booths = theirs.booths.filter((b) => b.id !== "b2"); // 상대가 b2 삭제
    const m = T.merge3(base, mine, theirs);
    return [m.event.name, m.event.place, m.booths.map((b) => b.id + ":" + b.name)];
  });
  expect(r).toEqual(["내가 바꾼 이름", "B홀", ["b1:내 부스명"]]);
});

test("m3deep: 기준이 없으면 내 값을 우선, 한쪽만 바뀌면 바뀐 쪽", async () => {
  const r = await run((T) => [
    T.m3deep({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 3 }),
    T.m3deep(undefined, { a: 1 }, { a: 2 }),
    T.m3deep(
      { l: [{ id: "x", v: 1 }] },
      {
        l: [
          { id: "x", v: 1 },
          { id: "y", v: 2 },
        ],
      },
      { l: [{ id: "x", v: 5 }] }
    ),
  ]);
  expect(r[0]).toEqual({ a: 2, b: 3 });
  expect(r[1]).toEqual({ a: 1 });
  expect(r[2]).toEqual({
    l: [
      { id: "x", v: 5 },
      { id: "y", v: 2 },
    ],
  });
});

test("nextStamp: 기기 시계가 늦어도 받은 것보다 큰 값을 준다", async () => {
  const r = await run((T) => {
    const future = Date.now() + 3600e3; // 다른 기기 시계가 1시간 빠른 경우
    const a = T.nextStamp({ cu: future });
    const b = T.nextStamp({ cu: 5, mod: future });
    const c = T.nextStamp(null);
    return [a > future, b > future, Math.abs(c - Date.now()) < 5000];
  });
  expect(r).toEqual([true, true, true]);
});

test("normalize: 이상한 값이 들어와도 기본 모양을 갖춘다", async () => {
  const r = await run((T) => {
    const s = T.normalize({ booths: [{ id: "__proto__" }, null, { section: 3, items: "x" }], people: "nope" });
    return [
      Array.isArray(s.booths),
      s.booths.every((b) => Array.isArray(b.items)),
      Array.isArray(s.people),
      Array.isArray(s.halls) && s.halls.length > 0,
    ];
  });
  expect(r).toEqual([true, true, true, true]);
});

test("tweetRef: 트위터 주소에서 아이디·글 번호를 읽는다", async () => {
  const r = await run((T) => [
    T.tweetRef("https://x.com/booth_artist/status/1844000000000000001?s=20"),
    T.tweetRef("twitter.com/Abc_12/status/55"),
    T.tweetRef("https://mobile.twitter.com/abc"),
    T.tweetRef("https://x.com/search?q=a"),
    T.tweetRef("https://x.com/i/status/1"),
    T.tweetRef("https://www.pixiv.net/users/1"),
  ]);
  expect(r).toEqual([
    { handle: "booth_artist", status: "1844000000000000001" },
    { handle: "Abc_12", status: "55" },
    { handle: "abc", status: "" },
    null,
    null,
    null,
  ]);
});

test("twimgBig: 트위터 사진 주소를 큰 사진으로", async () => {
  const r = await run((T) => [
    T.twimgBig("https://pbs.twimg.com/media/GabcD12_x?format=jpg&name=small"),
    T.twimgBig("https://pbs.twimg.com/media/GabcD12_x.png:thumb"),
    T.twimgBig("https://pbs.twimg.com/media/GabcD12_x?format=webp&name=360x360"),
    T.twimgBig("https://example.com/a.jpg"),
  ]);
  expect(r).toEqual([
    "https://pbs.twimg.com/media/GabcD12_x?format=jpg&name=large",
    "https://pbs.twimg.com/media/GabcD12_x?format=png&name=large",
    "https://pbs.twimg.com/media/GabcD12_x?format=webp&name=large",
    "https://example.com/a.jpg",
  ]);
});

test("parseInfoText: 수요조사·선입금 단락이 나뉜 인포", async () => {
  const text = [
    "[부스 인포] 코믹월드 A01 ✨",
    "",
    "📢 수요조사",
    "기간: 10/1(화) ~ 10/10(목) 23:59",
    "폼: https://forms.gle/AbCd123",
    "",
    "💸 선입금",
    "10월 15일 ~ 10월 25일 오후 11시 59분까지",
    "https://witchform.com/payform/?uuid=xyz",
    "아크릴 스탠드 15,000원 / 1.5cm 뱃지",
  ].join("\n");
  const r = await run((T, t) => T.parseInfoText(t, {}, new Date("2026-09-20T12:00:00+09:00")), text);
  expect(r).toEqual({
    sv: { from: "2026-10-01", to: "2026-10-10", time: "23:59", link: "https://forms.gle/AbCd123" },
    pre: { from: "2026-10-15", to: "2026-10-25", time: "23:59", link: "https://witchform.com/payform/?uuid=xyz" },
  });
});

test("parseInfoText: 한 줄짜리, 종류 말 없이 폼만, 해 넘김, 마감만", async () => {
  const r = await run((T) => [
    T.parseInfoText("선입금 ~12/24 자정 마감 https://witchform.com/a", {}, new Date("2026-12-01")),
    T.parseInfoText("12/28~1/5\nhttps://t.co/AAA", { "https://t.co/AAA": "witchform.com/payform/…" }, new Date("2026-12-20")),
    T.parseInfoText("수요조사 2026.11.02 - 2026.11.09 진행합니다!\n신청 링크 https://docs.google.com/forms/d/e/x/viewform", {}, null),
    T.parseInfoText("신간 샘플입니다 3,000원", {}, null),
  ]);
  expect(r[0]).toEqual({ pre: { to: "2026-12-24", time: "23:59", link: "https://witchform.com/a" } });
  expect(r[1]).toEqual({ pre: { link: "https://t.co/AAA", from: "2026-12-28", to: "2027-01-05" } });
  expect(r[2]).toEqual({ sv: { from: "2026-11-02", to: "2026-11-09", link: "https://docs.google.com/forms/d/e/x/viewform" } });
  expect(r[3]).toEqual({});
});

test("parseInfoText: 실제 인포 예시 (TMM, 10-22 10:01 ~ 10-28 10:01)", async () => {
  const text = [
    "🏨버-4 해즈빈호텔 666호실",
    "잘부탁드립니다✨🙇‍♀️",
    "",
    "선입금폼(현장수령):",
    "https://tmm.im/p/72708",
    "🗓 10-22 10:01 ~ 10-28 10:01",
    "",
    "📍현장판매분은 극소량이며 모든 굿즈는 한정수량,소량입니다",
    "📍현장 결제는 계좌이체 (토스,카카오뱅크)또는 금액에 딱 맞는 현금만 받습니다",
  ].join("\n");
  const r = await run((T, t) => T.parseInfoText(t, {}, new Date("2026-10-20T12:00:00+09:00")), text);
  expect(r).toEqual({ pre: { link: "https://tmm.im/p/72708", from: "2026-10-22", to: "2026-10-28", time: "10:01" } });
});

test("parseInfoText: 하이픈 날짜가 전화번호·개수와 헷갈리지 않는다", async () => {
  const r = await run((T) => [
    T.parseInfoText("선입금 문의 010-1234-5678", {}, null),
    T.parseInfoText("선입금 1-2개씩 구매 가능", {}, null),
    T.parseInfoText("선입금 2026-11-01 ~ 2026-11-05", {}, null),
  ]);
  expect(r[0]).toEqual({});
  expect(r[1]).toEqual({});
  expect(r[2]).toEqual({ pre: { from: "2026-11-01", to: "2026-11-05" } });
});
