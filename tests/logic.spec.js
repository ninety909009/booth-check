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
