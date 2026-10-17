/* 부스 체크 — 데이터: 기본 모양·불러오기·저장 (localStorage)
   index.html이 js/ 파일들을 정해진 순서로 불러와요. 파일끼리 함수·변수를 그대로 함께 써요(전역). */
"use strict";
const KEY = "boothcheck.v1";
const SEC_COLORS = ["#3D6BF0", "#EB6A00", "#0E9F8F", "#D93A72", "#7C4DEB", "#4F8A0B", "#0A8FCF", "#B9831A", "#C2410C", "#2F7D5B"];
const ICON_CHECK =
  '<svg class="chk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_PAY = '<i class="pay">₩</i>';
const ICON_BACK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_TRASH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

/* ---------- state ---------- */
function defaultState() {
  return {
    v: 1,
    event: { name: "", date: "", time: "", place: "", info: "", host: "", schedule: [], extras: [] },
    sections: ["A", "B", "C", "D"],
    booths: [],
    halls: [{ id: uid(), name: "1관", w: 36, h: 24 }],
    marks: [],
    cats: ["스티커", "만화 회지", "글 회지", "엽서", "아크릴", "포토카드", "기타"],
    people: [],
  };
}
function normalize(d) {
  const s = defaultState();
  if (!d || typeof d !== "object") return s;
  if (d.event && typeof d.event === "object") {
    for (const k of Object.keys(s.event)) {
      if (k !== "schedule" && k !== "extras")
        s.event[k] = typeof d.event[k] === "string" ? d.event[k].slice(0, k === "info" ? 3000 : 200) : "";
    }
    s.event.host = normSite(s.event.host) || "";
    if (Array.isArray(d.event.schedule))
      s.event.schedule = d.event.schedule
        .slice(0, 300)
        .filter((x) => x && typeof x === "object")
        .map((x) => ({
          id: sid(x.id) || uid(),
          time: /^\d{2}:\d{2}$/.test(str(x.time)) ? x.time : "",
          text: str(x.text || "").slice(0, 200),
        }));
    /* 행사에서 진행하는 이벤트 (스탬프 랠리·추첨·입장 특전 등). done은 나만 보는 참여 체크 */
    if (Array.isArray(d.event.extras))
      s.event.extras = d.event.extras
        .slice(0, 100)
        .filter((x) => x && typeof x === "object")
        .map((x) => ({
          id: sid(x.id) || uid(),
          title: str(x.title || "").slice(0, 80),
          from: normTime(x.from) || "",
          to: normTime(x.to) || "",
          place: str(x.place || "").slice(0, 80),
          note: str(x.note || "").slice(0, 1000),
          done: !!x.done,
          subs: Array.isArray(x.subs)
            ? x.subs
                .slice(0, 50)
                .filter((y) => y && typeof y === "object")
                .map((y) => ({
                  id: sid(y.id) || uid(),
                  title: str(y.title || "").slice(0, 80),
                  from: normTime(y.from) || "",
                  to: normTime(y.to) || "",
                  note: str(y.note || "").slice(0, 300),
                  done: !!y.done,
                }))
                .filter((y) => y.title || y.note || y.from || y.to)
            : [],
        }))
        .filter((x) => x.title || x.note || x.from || x.to || x.place || x.subs.length);
  }
  if (Array.isArray(d.sections))
    s.sections = d.sections
      .slice(0, 100)
      .map((x) => str(x).trim().slice(0, 20))
      .filter((x) => x && !isReserved(x))
      .filter((x, i, a) => a.indexOf(x) === i);
  const cint = (v, lo, hi, df) => {
    v = Math.round(num(v));
    return isNaN(v) ? df : Math.max(lo, Math.min(hi, v));
  };
  if (Array.isArray(d.halls) && d.halls.length) {
    s.halls = d.halls
      .slice(0, 30)
      .filter((h) => h && typeof h === "object")
      .map((h) => ({
        id: sid(h.id) || uid(),
        name: str(h.name || "관").slice(0, 30),
        w: cint(h.w, 8, 150, 36),
        h: cint(h.h, 6, 150, 24),
      }));
    if (!s.halls.length) s.halls = defaultState().halls;
  }
  const hallIds = new Set(s.halls.map((h) => h.id));
  if (Array.isArray(d.marks))
    s.marks = d.marks
      .slice(0, 1000)
      .filter((m) => m && typeof m === "object" && hallIds.has(str(m.hall)))
      .map((m) => ({
        id: sid(m.id) || uid(),
        hall: str(m.hall),
        x: cint(m.x, -999, 999, 0),
        y: cint(m.y, -999, 999, 0),
        w: cint(m.w, 1, 200, 2),
        h: cint(m.h, 1, 200, 2),
        label: str(m.label || "").slice(0, 60),
        color: /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : "#8A90AD",
      }));
  if (Array.isArray(d.people))
    s.people = d.people
      .slice(0, 1000)
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        id: sid(x.id) || uid(),
        nick: str(x.nick || "")
          .trim()
          .slice(0, 30),
        memo: str(x.memo || "").slice(0, 500),
        boothId: sid(x.boothId),
        met: !!x.met,
        gifts: Array.isArray(x.gifts)
          ? x.gifts
              .slice(0, 100)
              .filter((g) => g && typeof g === "object")
              .map((g) => ({
                id: sid(g.id) || uid(),
                name: str(g.name || "")
                  .trim()
                  .slice(0, 60),
                done: !!g.done,
              }))
              .filter((g) => g.name)
          : [],
      }));
  if (Array.isArray(d.cats))
    s.cats = [
      ...new Set(
        d.cats
          .slice(0, 200)
          .map((c) =>
            str(c || "")
              .trim()
              .slice(0, 20)
          )
          .filter((c) => c && !isReserved(c))
      ),
    ];
  const normPos = (p) =>
    p && typeof p === "object" && hallIds.has(str(p.hall))
      ? { hall: str(p.hall), x: cint(p.x, -999, 999, 0), y: cint(p.y, -999, 999, 0), rot: p.rot ? 1 : 0 }
      : null;
  if (Array.isArray(d.booths)) {
    s.booths = d.booths
      .slice(0, 5000)
      .filter((b) => b && typeof b === "object")
      .map((b) => ({
        id: sid(b.id) || uid(),
        section: ((t) => (isReserved(t) ? "" : t))(
          str(b.section || "")
            .trim()
            .slice(0, 20)
        ),
        num: str(b.num || "").slice(0, 12),
        half: b.half === 1 || b.half === 2 ? b.half : b.half === 0 ? 0 : b.size === 2 ? 0 : 1,
        span: Math.max(1, Math.min(4, Math.round(num(b.span) || 1))),
        tags: Array.isArray(b.tags)
          ? [
              ...new Set(
                b.tags
                  .slice(0, 50)
                  .map(cleanTag)
                  .filter((t) => t && !isReserved(t))
              ),
            ].slice(0, 12)
          : [],
        name: str(b.name || "").slice(0, 100),
        memo: str(b.memo || "").slice(0, 3000),
        pmemo: str(b.pmemo || "").slice(0, 2000),
        recv: normRecv(b.recv, b.rmemo),
        rmemo: str(b.rmemo || "").slice(0, 200),
        _link: normLink(b.link) || "",
        pickup: normTime(b.pickup) || "",
        pickupFrom: normTime(b.pickupFrom) || "",
        openFrom: normTime(b.openFrom) || "",
        openTo: normTime(b.openTo) || "",
        artists: Array.isArray(b.artists)
          ? b.artists
              .slice(0, 30)
              .filter((a) => a && typeof a === "object")
              .map((a) => {
                /* 예전 데이터: 기간 하나 + 종류(preKind). 수요조사였으면 수요조사 칸(sv*)으로 옮김 */
                const oldSv = a.preKind === "survey" && !(a.svFrom || a.svTo || a.svLink);
                return {
                  id: sid(a.id) || uid(),
                  nick: str(a.nick || "")
                    .trim()
                    .slice(0, 30),
                  site: normSite(a.site) || "",
                  info: normLink(a.info) || "",
                  memo: str(a.memo || "").slice(0, 200),
                  recv: normRecv(a.recv, a.memo),
                  preFrom: oldSv ? "" : validDate(a.preFrom),
                  preTo: oldSv ? "" : validDate(a.preTo),
                  preToTime: oldSv ? "" : normTime(a.preToTime) || "",
                  preLink: oldSv ? "" : normLink(a.preLink) || "",
                  svFrom: validDate(oldSv ? a.preFrom : a.svFrom),
                  svTo: validDate(oldSv ? a.preTo : a.svTo),
                  svToTime: normTime(oldSv ? a.preToTime : a.svToTime) || "",
                  svLink: normLink(oldSv ? a.preLink : a.svLink) || "",
                  hidden: !!a.hidden,
                  imgs: Array.isArray(a.imgs) ? [...new Set(a.imgs.map((u) => normLink(u)).filter(Boolean))].slice(0, 12) : [],
                };
              })
              .filter(
                (a) =>
                  a.imgs.length ||
                  a.nick ||
                  a.site ||
                  a.info ||
                  a.memo ||
                  a.recv.length ||
                  a.preFrom ||
                  a.preTo ||
                  a.preLink ||
                  a.svFrom ||
                  a.svTo ||
                  a.svLink
              )
          : [],
        friends: Array.isArray(b.friends)
          ? [
              ...new Set(
                b.friends
                  .map((f) =>
                    str(f || "")
                      .trim()
                      .slice(0, 30)
                  )
                  .filter(Boolean)
              ),
            ]
          : str(b.friend || "").trim()
            ? [str(b.friend).trim().slice(0, 30)]
            : [],
        isFriend: !!b.isFriend || !!str(b.friend || "").trim() || (Array.isArray(b.friends) && b.friends.some((f) => str(f || "").trim())),
        _bp: { preFrom: validDate(b.preFrom), preTo: validDate(b.preTo), preToTime: normTime(b.preToTime) || "" },
        times: Array.isArray(b.times)
          ? b.times
              .slice(0, 30)
              .filter((x) => x && typeof x === "object")
              .map((x) => ({
                label: str(x.label || "")
                  .trim()
                  .slice(0, 60),
                time: normTime(x.time) || "",
                end: normTime(x.end) || "",
                text: str(x.text || "")
                  .trim()
                  .slice(0, 120),
                note: str(x.note || "")
                  .trim()
                  .slice(0, 200),
              }))
              .filter((x) => x.label || x.time || x.end || x.text)
          : [],
        pos: normPos(b.pos),
        items: Array.isArray(b.items)
          ? b.items
              .slice(0, 500)
              .filter((i) => i && typeof i === "object")
              .flatMap(flattenSubs)
              .slice(0, 500)
              .map(normItem)
          : [],
      }));
    for (const b of s.booths) for (const i of b.items) if (i.cat && !s.cats.includes(i.cat)) s.cats.push(i.cat);
    for (const b of s.booths) {
      const lk = b._link;
      delete b._link;
      if (lk && !b.memo.includes(lk)) b.memo = (b.memo.trim() ? b.memo.trim() + "\n" : "") + "인포: " + lk;
      const bp = b._bp;
      delete b._bp;
      if (bp && (bp.preFrom || bp.preTo)) {
        if (b.artists.length)
          b.artists.forEach((a) => {
            if (!a.preFrom && !a.preTo) Object.assign(a, bp);
          });
        else b.artists.push({ id: uid(), nick: "", site: "", info: "", memo: "", ...bp });
      }
      if (b.artists.length === 1) for (const i of b.items) i.artist = b.artists[0].id;
    }
    for (const b of s.booths) {
      if (b.half) b.span = 1;
      b.size = b.half ? 1 : 2 * b.span;
      if (b.section && !s.sections.includes(b.section)) s.sections.push(b.section);
    }
  }
  return s;
}
const IDX_KEY = "boothcheck.index.v2",
  EV_PREFIX = "boothcheck.ev.";
const memEvents = {},
  lastJs = {},
  pbMem = {};
/* 불러오다 오류가 난 행사: 저장된 원본을 덮어쓰지 않도록 저장·동기화를 멈춤 */
const BROKEN = new Set(),
  RESCUE_PREFIX = "boothcheck.rescue.";
function lsGet(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch (e) {
    return false;
  }
}
function lsDel(k) {
  try {
    localStorage.removeItem(k);
  } catch (e) {}
}
function loadEvent(id) {
  if (memEvents[id]) return memEvents[id];
  let st = null,
    raw = null;
  try {
    raw = lsGet(EV_PREFIX + id);
    if (raw) st = normalize(JSON.parse(raw));
  } catch (e) {
    st = null;
    try {
      console.error("부스 체크: 행사를 불러오지 못함", id, e);
    } catch (e2) {}
    if (raw) {
      BROKEN.add(id);
      if (!lsGet(RESCUE_PREFIX + id)) lsSet(RESCUE_PREFIX + id, raw);
    }
  }
  st = st || defaultState();
  lastJs[id] = JSON.stringify(st);
  return (memEvents[id] = st);
}
/* 동기화 순서표: 기기 시계가 어긋나도, 마지막으로 받은 것(cu)·내 마지막 수정(mod)보다 항상 커지게 함 */
function nextStamp(ent) {
  return Math.max(Date.now(), ((ent && ent.cu) || 0) + 1, ((ent && ent.mod) || 0) + 1);
}
function evMeta(st) {
  return { name: st.event.name, date: st.event.date, count: st.booths.length, updated: Date.now() };
}
function saveIndex() {
  lsSet(IDX_KEY, JSON.stringify(LIB));
}
function loadIndex() {
  try {
    const r = lsGet(IDX_KEY);
    if (r) {
      const d = JSON.parse(r);
      if (d && Array.isArray(d.list) && d.list.length) {
        if (!d.list.some((x) => x.id === d.current)) d.current = d.list[0].id;
        return d;
      }
    }
  } catch (e) {}
  let old = null;
  try {
    const r = lsGet(KEY);
    if (r) old = normalize(JSON.parse(r));
  } catch (e) {}
  const id = uid(),
    st = old || defaultState();
  memEvents[id] = st;
  lsSet(EV_PREFIX + id, JSON.stringify(st));
  const lib = { current: id, list: [{ id, ...evMeta(st) }] };
  lsSet(IDX_KEY, JSON.stringify(lib));
  return lib;
}
const LIB = loadIndex();
const UIP = (() => {
  const wide = !window.matchMedia || window.matchMedia("(min-width:560px)").matches;
  const df = { addOpen: false, ckBar: wide };
  try {
    return Object.assign(df, JSON.parse(lsGet("boothcheck.ui") || "{}"));
  } catch (e) {
    return df;
  }
})();
const infoEdit = new Set();
function saveUIP() {
  lsSet("boothcheck.ui", JSON.stringify(UIP));
}
let S = loadEvent(LIB.current);
let saveT = null,
  saveWarned = false,
  brokenWarned = false;
function brokenToast() {
  if (brokenWarned) return;
  brokenWarned = true;
  toast("이 행사를 불러오다 오류가 나서 자동 저장을 멈췄어요. 저장된 내용은 지워지지 않았어요. 앱을 최신으로 바꾼 뒤 새로고침해 주세요.");
}
function flush() {
  clearTimeout(saveT);
  saveT = null;
  const id = LIB.current;
  if (BROKEN.has(id)) {
    brokenToast();
    return;
  }
  guardShared();
  memEvents[id] = S;
  const js = JSON.stringify(S);
  const ok = lsSet(EV_PREFIX + id, js);
  const ent = LIB.list.find((x) => x.id === id);
  if (ent) Object.assign(ent, evMeta(S));
  if (lastJs[id] !== js) {
    lastJs[id] = js;
    if (ent) ent.mod = nextStamp(ent);
    clChanged(id);
  }
  saveIndex();
  if (!ok && !saveWarned) {
    saveWarned = true;
    toast("이 화면에서는 자동 저장이 안 돼요. 공유 코드로 백업해 두세요.");
  }
}
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(flush, 200);
}
window.addEventListener("pagehide", () => {
  if (saveT) flush();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && saveT) flush();
});

/* ---------- 데이터 정리 도구 (처음 켤 때 저장된 행사를 불러오면서 바로 쓰여서 이 파일에 둠) ---------- */
function isReserved(t) {
  return (
    t === "__proto__" ||
    t === "constructor" ||
    t === "prototype" ||
    t === "hasOwnProperty" ||
    t === "toString" ||
    t === "valueOf" ||
    t === "isPrototypeOf"
  );
}
function num(v) {
  return typeof v === "number" ? v : typeof v === "string" ? +v : typeof v === "boolean" ? +v : NaN;
}
function str(v) {
  return v == null ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
}
function sid(v) {
  const t = str(v);
  return /^[A-Za-z0-9_-]{1,40}$/.test(t) && !isReserved(t) ? t : "";
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function normLink(v) {
  v = str(v || "").trim();
  if (!v) return "";
  if (/^https?:\/\/\S+$/i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return "https://" + v;
  return null;
}
function normSite(v) {
  v = str(v || "").trim();
  if (!v) return "";
  const m = v.match(/^@([A-Za-z0-9_]{1,30})$/);
  if (m) return "https://x.com/" + m[1];
  return normLink(v);
}
function cleanTag(t) {
  return str(t || "")
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}
function flattenSubs(i) {
  const subs = Array.isArray(i.subs) ? i.subs.filter((x) => x && typeof x === "object" && str(x.name || "").trim()) : [];
  if (!subs.length) return [i];
  return subs.map((x) => ({
    ...i,
    id: sid(x.id) || uid(),
    name: `${i.name} ${str(x.name).trim()}`.trim(),
    price: x.price === null || x.price === undefined || x.price === "" ? i.price : x.price,
    want: num(x.want) || 0,
    st: num(x.st) || 0,
    note: str(x.note || "") || i.note,
    subs: undefined,
  }));
}
function normItem(i) {
  const type = ["pre", "on", "free"].includes(i.type) ? i.type : "on";
  const subs = [];
  return {
    id: sid(i.id) || uid(),
    name: str(i.name || "").slice(0, 100),
    price: Math.max(0, Math.round(num(i.price) || 0)),
    type,
    st: subs.length ? 0 : Math.max(0, Math.min(type === "pre" ? 2 : 1, Math.round(num(i.st) || 0))),
    /* 0 = 무료 '안 받기'·구매 리스트에서 뺀 상태라 그대로 둠 (예전엔 1로 올려서 새로고침마다 풀렸음) */
    want: i.want != null ? Math.max(0, Math.round(num(i.want) || 0)) : optQty(i),
    sample: normLink(i.sample) || "",
    artist: sid(i.artist),
    must: !!i.must,
    note: (str(i.note || "") + optNote(i.opts)).trim().slice(0, 120),
    cat: str(i.cat || "")
      .trim()
      .slice(0, 20),
    maybe: !!i.maybe && !i.must,
    pay: ["cash", "transfer", "card"].includes(i.pay) ? i.pay : "",
    forWho: str(i.forWho || "")
      .trim()
      .slice(0, 30),
  };
}
function optList(opts) {
  return Array.isArray(opts) ? opts.filter((o) => o && str(o.name || "").trim()) : [];
}
function optQty(i) {
  const o = optList(i.opts).filter((x) => num(x.qty) > 0);
  return o.length ? o.reduce((n, x) => n + Math.round(num(x.qty)), 0) : Math.max(1, Math.round(num(i.qty) || 1));
}
function optNote(opts) {
  const o = optList(opts).filter((x) => num(x.qty) > 0);
  if (!o.length) return "";
  return " 옵션: " + o.map((x) => str(x.name).trim() + (num(x.qty) > 1 ? "×" + Math.round(num(x.qty)) : "")).join(", ");
}
function validDate(d) {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}
function normTime(v) {
  v = str(v || "").trim();
  if (!v) return "";
  let h, m;
  const mm = v.match(/^(\d{1,2})\s*[:.시h]\s*(\d{0,2})/i);
  if (mm) {
    h = +mm[1];
    m = mm[2] ? +mm[2] : 0;
  } else {
    const d = v.replace(/\D/g, "");
    if (!d || d.length > 4) return null;
    if (d.length <= 2) {
      h = +d;
      m = 0;
    } else {
      h = +d.slice(0, d.length - 2);
      m = +d.slice(-2);
    }
  }
  if (h > 23 || m > 59) return null;
  return str(h).padStart(2, "0") + ":" + str(m).padStart(2, "0");
}
/* normalize()가 앱 시작 때(이 줄보다 먼저) 불리므로 위쪽 const를 쓰면 안 됨 */
function normRecv(v, memo) {
  const ok = ["name4", "idcard", "wfqr", "tmmqr", "custom"];
  if (Array.isArray(v)) return [...new Set(v.map((x) => str(x)).filter((x) => ok.includes(x)))];
  return str(memo || "").trim() ? ["custom"] : [];
}
