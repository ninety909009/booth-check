/* 부스 체크 — 로그인 동기화·실시간 공유 (Firebase)
   index.html이 js/ 파일들을 정해진 순서로 불러와요. 파일끼리 함수·변수를 그대로 함께 써요(전역). */
"use strict";
/* ---------- cloud: Google 로그인 동기화 + 실시간 공유 (Firebase) ---------- */
const FB_VER = "12.19.0";
function cfgOk(c) {
  return !!(c && typeof c === "object" && ["apiKey", "authDomain", "projectId"].every((k) => typeof c[k] === "string" && c[k].trim()));
}
const FB_RAW = (() => {
  let a = window.BOOTHCHECK_FIREBASE,
    b = null;
  try {
    b = typeof firebaseConfig !== "undefined" ? firebaseConfig : null;
  } catch (e) {
    b = null;
  }
  /* 둘 다 있으면 값이 채워진 쪽을 씀 */
  const c = cfgOk(a) ? a : cfgOk(b) ? b : a || b;
  return c && typeof c === "object" ? c : null;
})();
const CFG_KEY = "boothcheck.fbcfg";
const CFG_FIELDS = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId", "measurementId", "appCheckKey"];
function cfgPick(c) {
  const o = {};
  for (const k of CFG_FIELDS) if (typeof c[k] === "string" && c[k].trim() && c[k].length <= 200) o[k] = c[k].trim();
  return o;
}
/* firebase-config.js를 잠깐 못 읽거나(느린 인터넷·옛 캐시) 빈 파일이 올라가도 로그인이 풀리지 않게, 마지막으로 성공한 설정을 이 기기에 기억 */
const FB_SAVED = (() => {
  if (location.protocol === "file:") return null;
  try {
    const c = JSON.parse(lsGet(CFG_KEY) || "null");
    return cfgOk(c) ? cfgPick(c) : null;
  } catch (e) {
    return null;
  }
})();
const FB_CFG = cfgOk(FB_RAW) ? cfgPick(FB_RAW) : FB_SAVED;
const FB_FALLBACK = !cfgOk(FB_RAW) && !!FB_SAVED;
if (cfgOk(FB_RAW) && location.protocol !== "file:") lsSet(CFG_KEY, JSON.stringify(FB_CFG));
const IN_CLAUDE = !!(window.claude && typeof window.claude.use === "function");
function cfgProblem() {
  if (IN_CLAUDE) return "Claude 안에서 보는 화면에서는 로그인·실시간 공유를 쓸 수 없어요. GitHub Pages 주소로 열어 주세요.";
  const st = (window.__bcCfg && window.__bcCfg.state) || "";
  if (location.protocol === "file:") return "파일을 바로 연 화면이라 로그인을 쓸 수 없어요. GitHub Pages 주소로 열어 주세요.";
  if (st === "missing")
    return "firebase-config.js 파일을 찾지 못했어요. index.html과 같은 위치(레포 맨 위)에 이 이름 그대로 올렸는지 확인해 주세요. 올린 직후라면 1~2분 뒤 새로고침해 보세요.";
  if (st === "syntax")
    return "firebase-config.js에 문법 오류가 있어요. Firebase가 준 코드 중 { } 안의 값(apiKey 등)만 옮겨 적었는지 확인해 주세요. import 줄이나 initializeApp 줄이 들어가면 안 돼요.";
  if (!FB_RAW)
    return "firebase-config.js는 불러왔지만 설정값을 찾지 못했어요. 파일이 window.BOOTHCHECK_FIREBASE = { ... }; 모양인지 확인해 주세요.";
  const miss = ["apiKey", "authDomain", "projectId"].filter((k) => !String(FB_RAW[k] || "").trim());
  if (miss.length)
    return `firebase-config.js에서 ${miss.join(", ")} 값이 비어 있어요. Firebase 콘솔 → 프로젝트 설정 → 내 앱에서 값을 복사해 넣어 주세요.`;
  return "";
}
const CL = {
  on: !!FB_CFG,
  failed: false,
  A: null,
  F: null,
  auth: null,
  db: null,
  user: null,
  authKnown: false,
  syncing: false,
  inflight: 0,
  lastSync: 0,
  err: "",
  userT: {},
  pubT: {},
  pubBusy: {},
  pubAgain: {},
  pubInfo: {},
  hold: new Set(),
  unsubUser: null,
  unsubPub: null,
  pubKey: "",
  pending: {},
  ed: {},
  bigWarned: false,
  gen: 0,
};
const CODE_ABC = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PB_PREFIX = "boothcheck.pb.";
function genCode(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => CODE_ABC[x % 32]).join("");
}
function entOf(id) {
  return LIB.list.find((x) => x.id === id) || null;
}
function linkOf(id) {
  const e = entOf(id);
  return e && e.link && e.link.code ? e.link : null;
}
function roleOf(id) {
  const l = linkOf(id);
  return l ? l.role : "";
}
function isSub() {
  return roleOf(LIB.current) === "sub";
}
function roleName(r) {
  return r === "sub" ? "구독" : r === "own" ? "공유 중" : r === "edit" ? "공동 편집" : "";
}
function roleBadge(id) {
  const r = roleOf(id);
  return r ? `<span class="np lk ${r}">${roleName(r)}</span>` : "";
}
function getBase(id) {
  if (id in pbMem) return pbMem[id];
  let v = null;
  try {
    const r = lsGet(PB_PREFIX + id);
    if (r) {
      const o = JSON.parse(r);
      if (o && o.p) v = { v: Math.max(0, Math.floor(Number(o.v)) || 0), p: sanitizeProj(o.p) };
    }
  } catch (e) {
    v = null;
  }
  return (pbMem[id] = v);
}
const SB_PREFIX = "boothcheck.sb.",
  sbMem = {};
function getSB(id) {
  if (id in sbMem) return sbMem[id];
  let v = null;
  try {
    const r = lsGet(SB_PREFIX + id);
    if (r) v = JSON.parse(r);
  } catch (e) {}
  return (sbMem[id] = v);
}
function setSB(id, json) {
  if (json) {
    try {
      sbMem[id] = JSON.parse(json);
    } catch (e) {
      sbMem[id] = null;
    }
    lsSet(SB_PREFIX + id, json);
  } else {
    sbMem[id] = null;
    lsDel(SB_PREFIX + id);
  }
}
function setBase(id, b) {
  pbMem[id] = b || null;
  if (b) lsSet(PB_PREFIX + id, JSON.stringify(b));
  else lsDel(PB_PREFIX + id);
}
function setLink(id, link) {
  const e = entOf(id);
  if (!e) return;
  e.link = link || null;
  e.mod = nextStamp(e);
  if (!link) setBase(id, null);
  saveIndex();
  clQueueUser(id, 300);
}
let srcCache = { b: null, booths: null, items: null };
function srcSets() {
  const base = isSub() ? getBase(LIB.current) : null;
  if (!base) return null;
  if (srcCache.b !== base) {
    const bs = new Set(),
      is = new Set();
    for (const b of base.p.booths) {
      bs.add(b.id);
      for (const i of b.items || []) is.add(i.id);
    }
    srcCache = { b: base, booths: bs, items: is };
  }
  return srcCache;
}
function lockedBooth(b) {
  const s = srcSets();
  return !!(s && b && s.booths.has(b.id));
}
function lockedItem(i) {
  const s = srcSets();
  return !!(s && i && s.items.has(i.id));
}
function isBlank(st) {
  return !st.event.name && !st.booths.length && !st.people.length && !st.event.schedule.length && !(st.event.extras || []).length;
}

/* 공유되는 부분만 뽑기: 행사 정보·구역·종류·배치도·부스·작가·태그·부스 메모·무료 배포 물품. 수령 방법도 포함. 나머지 구매 리스트·지인은 빠짐 */
function clone(o) {
  return o == null ? o : JSON.parse(JSON.stringify(o));
}
function eqJ(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function shareProj(st) {
  const e = st.event;
  return {
    event: {
      name: e.name,
      date: e.date,
      time: e.time,
      place: e.place,
      info: e.info,
      host: e.host || "",
      schedule: clone(e.schedule),
      extras: (e.extras || []).map((x) => ({
        id: x.id,
        title: x.title,
        from: x.from,
        to: x.to,
        place: x.place,
        note: x.note,
        subs: (x.subs || []).map((y) => ({ id: y.id, title: y.title, from: y.from, to: y.to, note: y.note })),
      })),
    },
    sections: [...st.sections],
    cats: [...st.cats],
    halls: clone(st.halls),
    marks: clone(st.marks),
    booths: st.booths.map((b) => ({
      id: b.id,
      section: b.section,
      num: b.num,
      half: b.half || 0,
      span: spanOf(b),
      name: b.name,
      memo: b.memo || "",
      tags: [...(b.tags || [])],
      recv: [...(b.recv || [])],
      rmemo: b.rmemo || "",
      pickup: b.pickup || "",
      pickupFrom: b.pickupFrom || "",
      openFrom: b.openFrom || "",
      openTo: b.openTo || "",
      times: clone(b.times || []),
      pos: clone(b.pos || null),
      artists: (b.artists || []).map((a) => ({
        id: a.id,
        nick: a.nick || "",
        site: a.site || "",
        info: a.info || "",
        recv: [...(a.recv || [])],
        memo: a.memo || "",
        preFrom: a.preFrom || "",
        preTo: a.preTo || "",
        preToTime: a.preToTime || "",
        preLink: a.preLink || "",
        preKind: a.preKind === "survey" ? "survey" : "",
        imgs: [...(a.imgs || [])],
      })),
      items: (b.items || [])
        .filter((i) => i.type === "free")
        .map((i) => ({ id: i.id, name: i.name, price: 0, type: "free", cat: i.cat || "", artist: i.artist || "" })),
    })),
  };
}
function sanitizeProj(p) {
  if (!p || typeof p !== "object" || !Array.isArray(p.booths)) throw new Error("bad data");
  const st = normalize({ event: p.event, sections: p.sections, cats: p.cats, halls: p.halls, marks: p.marks, booths: p.booths });
  if (!(Array.isArray(p.halls) && p.halls.length)) {
    st.halls = [];
    st.marks = [];
    for (const b of st.booths) b.pos = null;
  }
  const out = shareProj(st);
  if (!p.booths.some((b) => b && typeof b === "object" && ("memo" in b || "tags" in b)))
    out.booths.forEach((b) => {
      delete b.memo;
      delete b.tags;
    });
  if (!p.booths.some((b) => b && typeof b === "object" && Array.isArray(b.items)))
    out.booths.forEach((b) => {
      delete b.items;
    });
  if (!(p.event && typeof p.event === "object" && Array.isArray(p.event.extras))) delete out.event.extras;
  /* 예전 버전 공유본(수령 방법 없음)이면 받는 쪽 값을 그대로 둠 */
  if (
    !p.booths.some(
      (b) =>
        b &&
        typeof b === "object" &&
        ("recv" in b || (Array.isArray(b.artists) && b.artists.some((a) => a && typeof a === "object" && "recv" in a)))
    )
  )
    out.booths.forEach((b) => {
      delete b.recv;
      delete b.rmemo;
      b.artists.forEach((a) => {
        delete a.recv;
        delete a.memo;
      });
    });
  return out;
}
function itemPersonal(i) {
  return !!(i && (i.st > 0 || String(i.note || "").trim() || i.must));
}
function boothPersonal(b) {
  return !!(
    b &&
    (String(b.pmemo || "").trim() ||
      b.isFriend ||
      (b.friends || []).length ||
      (b.items || []).some((i) => i.type !== "free" || itemPersonal(i)))
  );
}
function mergeIds(local, remote, prev, keepLocal, upd, keepFn) {
  const lm = new Map((local || []).map((x) => [x.id, x])),
    rs = new Set(remote.map((x) => x.id)),
    ps = new Set((prev || []).map((x) => x.id));
  const out = remote.map((r) => upd(lm.get(r.id), r));
  if (keepLocal) for (const l of local || []) if (!rs.has(l.id) && (!ps.has(l.id) || (keepFn && keepFn(l)))) out.push(l);
  return out;
}
function mergeStrs(local, remote, prev, keepLocal) {
  const out = [...remote];
  if (keepLocal) for (const s of local || []) if (!out.includes(s) && !(prev || []).includes(s)) out.push(s);
  return out;
}
/* P(공유본)를 st에 덮어씀. 개인 정보(구매 체크·수량·메모·태그·지인)는 유지. keepLocal이면 원본에 없던 내 부스·물품도 유지 */
function applyShared(st, P, prev, keepLocal) {
  const e = P.event;
  Object.assign(st.event, {
    name: e.name,
    date: e.date,
    time: e.time,
    place: e.place,
    info: e.info,
    host: e.host || "",
    schedule: clone(e.schedule),
  });
  if (Array.isArray(e.extras)) {
    const dn = new Set();
    for (const x of st.event.extras || []) {
      if (x.done) dn.add(x.id);
      for (const y of x.subs || []) if (y.done) dn.add(x.id + "/" + y.id);
    }
    st.event.extras = e.extras.map((x) => ({
      ...clone(x),
      done: dn.has(x.id),
      subs: (x.subs || []).map((y) => ({ ...clone(y), done: dn.has(x.id + "/" + y.id) })),
    }));
  }
  st.sections = mergeStrs(st.sections, P.sections, prev && prev.sections, keepLocal);
  st.cats = mergeStrs(st.cats, P.cats, prev && prev.cats, keepLocal);
  st.halls = mergeIds(st.halls, P.halls, prev && prev.halls, keepLocal, (l, r) => Object.assign(l || {}, clone(r)));
  st.marks = mergeIds(st.marks, P.marks, prev && prev.marks, keepLocal, (l, r) => Object.assign(l || {}, clone(r)));
  const pb = new Map(((prev && prev.booths) || []).map((b) => [b.id, b]));
  st.booths = mergeIds(
    st.booths,
    P.booths,
    prev && prev.booths,
    keepLocal,
    (l, r) => {
      const b = l || { id: r.id, memo: "", pmemo: "", tags: [], isFriend: false, friends: [], items: [] };
      const pv0 = pb.get(r.id);
      if ("memo" in r) {
        if (keepLocal && l && String(l.memo || "").trim() && !String(l.pmemo || "").trim() && !(pv0 && "memo" in pv0) && l.memo !== r.memo)
          b.pmemo = l.memo;
        b.memo = r.memo;
      }
      if ("tags" in r) b.tags = [...r.tags];
      if ("recv" in r) {
        b.recv = [...r.recv];
        b.rmemo = r.rmemo || "";
      }
      Object.assign(b, {
        section: r.section,
        num: r.num,
        half: r.half,
        span: r.span,
        size: r.half ? 1 : 2 * r.span,
        name: r.name,
        pickup: r.pickup,
        pickupFrom: r.pickupFrom || "",
        openFrom: r.openFrom || "",
        openTo: r.openTo || "",
        times: clone(r.times),
        pos: clone(r.pos),
      });
      const la = new Map((b.artists || []).map((a) => [a.id, a]));
      if (keepLocal && !(pv0 && Array.isArray(pv0.artists) && pv0.artists.some((x) => "recv" in x))) {
        /* 처음 수령 방법을 받을 때, 내가 적어 둔 작가 메모가 덮이지 않게 ‘내 메모’로 옮김 */
        const keep = r.artists
          .filter((ra) => "memo" in ra)
          .map((ra) => {
            const l = la.get(ra.id);
            return l && String(l.memo || "").trim() && l.memo !== ra.memo ? `${l.nick || "작가"}: ${l.memo.trim()}` : "";
          })
          .filter((x) => x && !String(b.pmemo || "").includes(x));
        if (keep.length) b.pmemo = [String(b.pmemo || "").trim(), ...keep].filter(Boolean).join("\n").slice(0, 2000);
      }
      b.artists = r.artists.map((ra) => Object.assign(la.get(ra.id) || { memo: "", recv: [], hidden: false }, clone(ra)));
      const pv = pb.get(r.id);
      if (!Array.isArray(b.items)) b.items = [];
      if (Array.isArray(r.items)) {
        const rIds = new Set(r.items.map((x) => x.id)),
          pIds = new Set(((pv && pv.items) || []).map((x) => x.id)),
          rm = new Map(r.items.map((x) => [x.id, x]));
        const out = [],
          seen = new Set();
        for (const i of b.items) {
          if (rIds.has(i.id)) {
            out.push(Object.assign(i, clone(rm.get(i.id))));
            seen.add(i.id);
          } else if (i.type !== "free" || !pIds.has(i.id) || (keepLocal && itemPersonal(i))) out.push(i);
        }
        for (const ri of r.items)
          if (!seen.has(ri.id)) out.push(Object.assign({ st: 0, want: 1, must: false, maybe: false, note: "" }, clone(ri)));
        b.items = out;
      }
      return b;
    },
    boothPersonal
  );
  const hs = new Set(st.halls.map((h) => h.id));
  for (const b of st.booths) if (b.pos && !hs.has(b.pos.hall)) b.pos = null;
  if (keepLocal) for (const b of st.booths) if (b.section && !st.sections.includes(b.section)) st.sections.push(b.section);
}
/* 3-way 병합: base 이후 내가 바꾼 칸은 내 것, 안 바꾼 칸은 상대 것 */
function m3leaf(b, m, t) {
  return b !== undefined && eqJ(b, m) ? t : m;
}
function m3obj(b, m, t, skip) {
  const o = {};
  for (const k of Object.keys(t)) if (k !== skip && k !== "__proto__") o[k] = m3leaf(b ? b[k] : undefined, m[k], t[k]);
  for (const k of Object.keys(m)) if (k !== skip && k !== "__proto__" && !(k in o)) o[k] = m[k];
  return o;
}
function m3list(b, m, t, fn) {
  const bm = new Map((b || []).map((x) => [x.id, x])),
    mm = new Map(m.map((x) => [x.id, x])),
    tm = new Map(t.map((x) => [x.id, x]));
  const pick = (id) => {
    const bx = bm.get(id),
      mx = mm.get(id),
      tx = tm.get(id);
    if (mx && tx) return bx ? fn(bx, mx, tx) : mx;
    if (mx) return bx && eqJ(bx, mx) ? null : mx;
    if (tx) return bx && eqJ(bx, tx) ? null : tx;
    return null;
  };
  const out = [];
  for (const x of t) {
    const r = pick(x.id);
    if (r) out.push(r);
  }
  for (const x of m)
    if (!tm.has(x.id)) {
      const r = pick(x.id);
      if (r) out.push(r);
    }
  return out;
}
function m3booth(b, m, t) {
  const o = m3obj(b, m, t, "items");
  if (Array.isArray(m.items) && Array.isArray(t.items)) o.items = m3list(b && b.items, m.items, t.items, (x, y, z) => m3obj(x, y, z));
  else if (Array.isArray(m.items)) o.items = m.items;
  return o;
}
function merge3(b, m, t) {
  b = b || {};
  const ob = (x, y, z) => m3obj(x, y, z);
  return {
    event: m3obj(b.event, m.event, t.event),
    sections: m3leaf(b.sections, m.sections, t.sections),
    cats: m3leaf(b.cats, m.cats, t.cats),
    halls: m3list(b.halls, m.halls, t.halls, ob),
    marks: m3list(b.marks, m.marks, t.marks, ob),
    booths: m3list(b.booths, m.booths, t.booths, m3booth),
  };
}
function isObj(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}
function isIdList(a) {
  return Array.isArray(a) && a.length > 0 && a.every((x) => isObj(x) && typeof x.id === "string");
}
function m3deep(b, m, t) {
  if (eqJ(m, t)) return m;
  if (b !== undefined && eqJ(b, m)) return t;
  if (b !== undefined && eqJ(b, t)) return m;
  if (isObj(m) && isObj(t)) {
    const o = {};
    for (const k of new Set([...Object.keys(t), ...Object.keys(m)])) {
      if (k === "__proto__") continue;
      if (!(k in m)) o[k] = t[k];
      else if (!(k in t)) o[k] = m[k];
      else o[k] = m3deep(isObj(b) ? b[k] : undefined, m[k], t[k]);
    }
    return o;
  }
  if (Array.isArray(m) && Array.isArray(t) && (isIdList(m) || isIdList(t)) && (isIdList(m) || !m.length) && (isIdList(t) || !t.length))
    return m3list(Array.isArray(b) ? b : undefined, m, t, (x, y, z) => m3deep(x, y, z));
  return m;
}
function projSig(p) {
  const by = (a) => a.slice().sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return JSON.stringify({
    ...p,
    halls: by(p.halls),
    marks: by(p.marks),
    booths: by(p.booths).map((b) => (Array.isArray(b.items) ? { ...b, items: by(b.items) } : b)),
  });
}
/* 구독한 행사: 원본 정보를 고치면 저장할 때 원래대로 돌림 */
function guardShared() {
  if (!isSub()) return;
  const base = getBase(LIB.current);
  if (!base) return;
  const before = projSig(shareProj(S));
  applyShared(S, base.p, base.p, true);
  if (projSig(shareProj(S)) !== before) {
    toast("구독한 행사라 원본 정보는 바꿀 수 없어요");
    setTimeout(() => {
      rerenderSoft();
      if (sh && sh.kind === "booth") renderSheet();
    }, 0);
  }
}
function clChanged(id) {
  if (!CL.on || CL.quiet) return;
  clQueueUser(id);
  const r = roleOf(id);
  if (r === "own" || r === "edit") clQueuePub(id);
}

/* encode: JSON → deflate → Firestore Bytes */
async function zEnc(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let z = bytes,
    c = 0;
  if (typeof CompressionStream !== "undefined") {
    try {
      z = await pipe(bytes, CompressionStream, "deflate-raw");
      c = 1;
    } catch (e) {
      z = bytes;
      c = 0;
    }
  }
  return { z: CL.F.Bytes.fromUint8Array(z), c, size: z.length };
}
const PUB_MAX = 3 * 1024 * 1024;
async function zDec(d, max) {
  if (!d || !d.z || typeof d.z.toUint8Array !== "function") throw new Error("no data");
  let bytes = d.z.toUint8Array();
  if (d.c) bytes = await pipe(bytes, DecompressionStream, "deflate-raw", max || MAX_INFLATE);
  return JSON.parse(new TextDecoder().decode(bytes));
}
function clErrText(e) {
  const c = (e && e.code) || "";
  if (/permission-denied/.test(c)) return "권한이 없어요";
  if (/unavailable|failed-precondition|network/.test(c)) return "인터넷에 연결되면 다시 시도할게요";
  if (/resource-exhausted/.test(c)) return "오늘 무료 사용량을 넘었어요. 내일 다시 시도해 주세요";
  if (/unauthenticated/.test(c)) return "다시 로그인해 주세요";
  if (c === "bc/big") return "행사 데이터가 너무 커서 올리지 못했어요";
  if (c === "bc/bad") return "공유 데이터가 손상돼서 반영하지 못했어요. 만든 사람이 한 번 고치면 다시 돼요";
  return "문제가 생겼어요" + (c ? ` (${c})` : "");
}
function clErr(e, quiet) {
  CL.err = clErrText(e);
  if (!quiet) toast(CL.err);
  clRefreshUI();
}
function fmtWhen(ms) {
  if (!ms) return "";
  const d = new Date(ms),
    n = new Date(),
    hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  return d.toDateString() === n.toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
function viewerOpen() {
  const v = document.getElementById("imgv");
  return !!(v && v.classList.contains("show"));
}

/* ---- init / auth ---- */
async function clInit() {
  if (!CL.on) return;
  try {
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    const [ap, A, F] = await Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-auth.js"),
      import(base + "firebase-firestore.js"),
    ]);
    const { appCheckKey, ...fbOpts } = FB_CFG;
    const app = ap.initializeApp(fbOpts);
    /* App Check(선택): firebase-config.js에 appCheckKey(reCAPTCHA v3 사이트 키)가 있을 때만. 실패해도 앱은 계속 돌아감 */
    if (appCheckKey) {
      try {
        const AC = await import(base + "firebase-app-check.js");
        AC.initializeAppCheck(app, { provider: new AC.ReCaptchaV3Provider(appCheckKey), isTokenAutoRefreshEnabled: true });
      } catch (e) {
        try {
          console.warn("부스 체크: App Check를 켜지 못함", e);
        } catch (e2) {}
      }
    }
    CL.A = A;
    CL.F = F;
    CL.auth = A.getAuth(app);
    CL.db = F.getFirestore(app);
  } catch (e) {
    CL.failed = true;
    clRefreshUI();
    return;
  }
  clListenPub();
  let first = true;
  CL.A.onAuthStateChanged(CL.auth, (u) => {
    clOnUser(u);
    if (first) {
      first = false;
      clHash();
    }
  });
  window.addEventListener("online", () => {
    for (const e of LIB.list) {
      const r = roleOf(e.id);
      if (r === "own" || r === "edit") clQueuePub(e.id, 500);
    }
    if (CL.user) clResync(true);
  });
}
function inAppBrowser() {
  return /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|\bLine\/|DaumApps|everytimeApp/i.test(navigator.userAgent);
}
function clLogin() {
  if (/KAKAOTALK/i.test(navigator.userAgent)) {
    confirmBox("카카오톡 안의 브라우저에서는 Google 로그인이 막혀 있어요.\n기본 브라우저로 열까요?", "브라우저로 열기").then((ok) => {
      if (ok) location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href);
    });
    return;
  }
  if (inAppBrowser()) {
    toast("앱 안의 브라우저에서는 Google 로그인이 안 돼요. 크롬이나 사파리로 열어 주세요");
    return;
  }
  if (!CL.auth) {
    toast(CL.failed ? "로그인 기능을 불러오지 못했어요" : "잠시 후 다시 눌러 주세요");
    return;
  }
  CL.A.signInWithPopup(CL.auth, new CL.A.GoogleAuthProvider())
    .then(() => toast("로그인했어요"))
    .catch((e) => {
      const c = (e && e.code) || "";
      if (/popup-closed-by-user|cancelled-popup-request/.test(c)) return;
      if (/popup-blocked/.test(c)) toast("팝업이 막혔어요. 이 사이트의 팝업을 허용하고 다시 눌러 주세요");
      else if (/unauthorized-domain/.test(c)) toast("Firebase의 ‘승인된 도메인’에 이 사이트 주소가 없어요");
      else if (/operation-not-allowed/.test(c)) toast("Firebase에서 Google 로그인이 꺼져 있어요");
      else toast("로그인하지 못했어요" + (c ? ` (${c})` : ""));
    });
}
async function clLogout() {
  if (!CL.auth || !CL.user) return;
  const ch = await choiceBox(
    "로그아웃할까요?\n이 기기에 있는 행사는 그대로 남아요. 다른 사람과 같이 쓰는 기기라면 이 기기에서도 지우세요.",
    [
      { label: "로그아웃", v: "out", cls: "pre" },
      { label: "이 기기에서도 지우기", v: "wipe", cls: "danger" },
    ]
  );
  if (!ch) return;
  const me = CL.user.uid;
  for (const id of Object.keys(CL.userT)) {
    clearTimeout(CL.userT[id]);
  }
  CL.userT = {};
  if (ch === "wipe") {
    for (const e of LIB.list.slice()) if (e.acct === me) removeLocal(e.id);
  }
  try {
    await CL.A.signOut(CL.auth);
  } catch (e) {}
  toast(ch === "wipe" ? "로그아웃하고 이 기기에서 지웠어요" : "로그아웃했어요");
}
function clOnUser(u) {
  CL.authKnown = true;
  CL.hold = new Set();
  CL.user = u
    ? {
        uid: u.uid,
        dname: u.displayName || "",
        name: u.displayName || (u.email ? u.email.split("@")[0] : ""),
        email: u.email || "",
        photo: u.photoURL || "",
      }
    : null;
  CL.gen++;
  if (CL.unsubUser) {
    try {
      CL.unsubUser();
    } catch (e) {}
    CL.unsubUser = null;
  }
  CL.err = "";
  if (CL.user) clStartUserSync();
  clRefreshUI();
}
function clNeedLogin() {
  if (CL.user) return true;
  toast(CL.on ? "먼저 ‘Google로 로그인’을 눌러 주세요" : "이 화면에서는 로그인 기능을 쓸 수 없어요");
  const a = document.getElementById("clAcc");
  if (a) a.scrollIntoView({ behavior: "smooth", block: "center" });
  return false;
}

/* ---- 내 행사 동기화: users/{uid}/ev/{행사id} ---- */
function evDocRef(id) {
  return CL.F.doc(CL.db, "users", CL.user.uid, "ev", id);
}
function removeLocal(id) {
  if (id === LIB.current) {
    clearTimeout(saveT);
    saveT = null;
    if (sh) {
      sheet.classList.remove("show");
      scrim.classList.remove("show");
      sh = null;
    }
  }
  LIB.list = LIB.list.filter((x) => x.id !== id);
  lsDel(EV_PREFIX + id);
  delete memEvents[id];
  delete lastJs[id];
  setBase(id, null);
  setSB(id, null);
  if (!LIB.list.length) {
    const nid = uid(),
      st = defaultState();
    memEvents[nid] = st;
    lastJs[nid] = JSON.stringify(st);
    lsSet(EV_PREFIX + nid, lastJs[nid]);
    LIB.list.push({ id: nid, ...evMeta(st) });
  }
  if (id === LIB.current) {
    LIB.current = LIB.list[0].id;
    saveIndex();
    S = loadEvent(LIB.current);
    resetUI();
    renderTop();
    setView(view);
    clListenPub();
  } else saveIndex();
}
async function clStartUserSync() {
  if (!CL.user || !CL.db) return;
  const gen = CL.gen;
  CL.syncing = true;
  clRefreshUI();
  try {
    const snap = await CL.F.getDocs(CL.F.collection(CL.db, "users", CL.user.uid, "ev"));
    if (gen !== CL.gen) return;
    const remote = [];
    snap.forEach((d) => remote.push({ id: d.id, ...d.data() }));
    for (const r of remote) await clApplyUserDoc(r);
    if (gen !== CL.gen) return;
    const ids = new Set(remote.map((r) => r.id)),
      liveRemote = remote.some((r) => !r.del);
    if (liveRemote) for (const e of LIB.list.slice()) if (!ids.has(e.id) && !e.cu && !e.link && isBlank(loadEvent(e.id))) removeLocal(e.id);
    const localOnly = LIB.list.filter((e) => !ids.has(e.id) && !e.cu && !e.acct && !isBlank(loadEvent(e.id)));
    if (liveRemote && localOnly.length) {
      const names =
        localOnly
          .slice(0, 3)
          .map((e) => "‘" + (loadEvent(e.id).event.name || "이름 없는 행사") + "’")
          .join(", ") + (localOnly.length > 3 ? ` 외 ${localOnly.length - 3}개` : "");
      const ch = await choiceBox(
        `이 기기에만 있는 행사가 ${localOnly.length}개 있어요.\n${names}\n\n계정에 있는 행사와 합칠까요?\n취소하면 이 기기에만 두고, 다음에 로그인할 때 다시 물어봐요.`,
        [
          { label: "계정에 합치기", v: "merge", cls: "pre" },
          { label: "이 기기에서 지우기", v: "drop", cls: "danger" },
        ]
      );
      if (gen !== CL.gen) return;
      if (
        ch === "drop" &&
        (await confirmBox(
          `이 기기에만 있는 행사 ${localOnly.length}개를 지울까요?\n계정에는 없는 내용이라 되돌릴 수 없어요. 필요하면 먼저 설정 → ‘백업 파일 저장’을 해 두세요.`,
          "지우기",
          true
        ))
      ) {
        if (gen !== CL.gen) return;
        for (const e of localOnly) removeLocal(e.id);
        toast(`이 기기의 행사 ${localOnly.length}개를 지웠어요`);
      } else if (ch !== "merge") {
        for (const e of localOnly) CL.hold.add(e.id);
      }
      renderTop();
      if (sh && sh.kind === "events") renderEvents();
    }
    for (const e of LIB.list) if (!CL.hold.has(e.id) && (!ids.has(e.id) || (e.mod || 0) > (e.cu || 0))) clQueueUser(e.id, 0);
    CL.unsubUser = CL.F.onSnapshot(
      CL.F.collection(CL.db, "users", CL.user.uid, "ev"),
      (qs) => {
        if (gen !== CL.gen) return;
        qs.docChanges().forEach((ch) => {
          if (ch.type === "removed" || ch.doc.metadata.hasPendingWrites) return;
          clApplyUserDoc({ id: ch.doc.id, ...ch.doc.data() });
        });
      },
      (e) => clErr(e, true)
    );
    CL.lastSync = Date.now();
    CL.err = "";
  } catch (e) {
    clErr(e, true);
  }
  CL.syncing = false;
  clRefreshUI();
  if (sh && sh.kind === "events") renderEvents();
  for (const e of LIB.list) {
    const r = roleOf(e.id);
    if (r === "own" || r === "edit") clQueuePub(e.id, 800);
  }
}
async function clApplyUserDoc(r) {
  if (!CL.user) return;
  const id = r.id,
    ent0 = entOf(id);
  if (BROKEN.has(id)) return;
  if (!sid(id)) return;
  if (ent0 && ent0.acct && ent0.acct !== CL.user.uid) return;
  if (r.del) {
    if (ent0 && (ent0.mod || 0) <= (r.upd || 0)) {
      removeLocal(id);
      if (sh && sh.kind === "events") renderEvents();
    }
    return;
  }
  if (ent0 && (r.upd || 0) <= (ent0.cu || 0)) return;
  if (id === LIB.current && (sh || viewerOpen() || uiBusy())) {
    CL.pending[id] = r;
    return;
  }
  let payload;
  try {
    payload = await zDec(r);
  } catch (e) {
    return;
  }
  if (!CL.user) return;
  if (id === LIB.current && (sh || viewerOpen() || uiBusy())) {
    CL.pending[id] = r;
    return;
  }
  if (id === LIB.current && saveT) flush();
  let ent = entOf(id);
  if (ent && (r.upd || 0) <= (ent.cu || 0)) return;
  let R;
  try {
    R = normalize(payload.s);
  } catch (e) {
    return;
  }
  const rjs = JSON.stringify(R);
  const dirty = !!ent && (ent.mod || 0) > (ent.cu || 0);
  let st = R;
  if (dirty) {
    const local = id === LIB.current ? S : loadEvent(id),
      sb = getSB(id);
    st = normalize(m3deep(sb || undefined, clone(local), clone(R)));
  }
  const js = JSON.stringify(st);
  memEvents[id] = st;
  lastJs[id] = js;
  lsSet(EV_PREFIX + id, js);
  if (!ent) {
    LIB.list.push({ id });
    ent = entOf(id);
  }
  const rl =
    payload.l && /^[A-Z0-9]{8}$/.test(payload.l.code || "") && ["own", "edit", "sub"].includes(payload.l.role)
      ? { role: payload.l.role, code: payload.l.code }
      : null;
  const link = dirty && ent.link !== undefined ? ent.link : rl;
  Object.assign(ent, evMeta(st), { link: link && link.code ? link : null, cu: r.upd, acct: CL.user.uid });
  ent.mod = dirty && js !== rjs ? nextStamp(ent) : r.upd;
  setSB(id, rjs);
  const lb = getBase(id),
    rb = (() => {
      try {
        return payload.b && payload.b.p ? { v: Math.max(0, Math.floor(Number(payload.b.v)) || 0), p: sanitizeProj(payload.b.p) } : null;
      } catch (e) {
        return null;
      }
    })();
  if (!ent.link) setBase(id, null);
  else if (!dirty || !lb || (rb && (rb.v || 0) > (lb.v || 0))) setBase(id, rb);
  saveIndex();
  if (ent.mod > ent.cu) clQueueUser(id, 300);
  if (id === LIB.current) {
    S = st;
    srcCache = { b: null };
    renderTop();
    renderView();
    clListenPub();
  } else if (sh && sh.kind === "events") renderEvents();
  CL.lastSync = Date.now();
  clRefreshUI();
}
function clFlushPending() {
  for (const id of Object.keys(CL.pending)) {
    const r = CL.pending[id];
    delete CL.pending[id];
    clApplyUserDoc(r);
  }
}
function clQueueUser(id, ms) {
  if (!CL.user) return;
  clearTimeout(CL.userT[id]);
  CL.userT[id] = setTimeout(
    () => {
      delete CL.userT[id];
      clPushUser(id);
    },
    ms == null ? 1500 : ms
  );
}
async function clPushUser(id) {
  if (BROKEN.has(id) || CL.hold.has(id)) return;
  const ent = entOf(id);
  if (!ent || !CL.user || !CL.db) return;
  if (ent.acct && ent.acct !== CL.user.uid) return;
  if (id === LIB.current && saveT) flush();
  const st = loadEvent(id);
  if (!ent.cu && !ent.link && isBlank(st)) return;
  if (!ent.mod) ent.mod = nextStamp(ent);
  const upd = ent.mod,
    me = CL.user.uid,
    sj = JSON.stringify(st);
  CL.inflight++;
  clRefreshUI();
  try {
    const enc = await zEnc({ s: JSON.parse(sj), l: ent.link || null, b: getBase(id) });
    if (enc.size > 1000000) throw { code: "bc/big" };
    await CL.F.setDoc(evDocRef(id), { z: enc.z, c: enc.c, upd, name: st.event.name || "", del: false });
    if (CL.user && CL.user.uid === me) {
      if ((ent.cu || 0) < upd) {
        ent.cu = upd;
        setSB(id, sj);
      }
      ent.acct = me;
      saveIndex();
      CL.lastSync = Date.now();
      CL.err = "";
    }
  } catch (e) {
    if (e && e.code === "bc/big") {
      if (!CL.bigWarned) {
        CL.bigWarned = true;
        toast("행사 데이터가 너무 커서 계정에 저장하지 못했어요");
      }
    } else clErr(e, true);
  }
  CL.inflight--;
  clRefreshUI();
}
async function clResync(quiet) {
  if (!CL.user) return;
  CL.gen++;
  if (CL.unsubUser) {
    try {
      CL.unsubUser();
    } catch (e) {}
    CL.unsubUser = null;
  }
  await clStartUserSync();
  if (!quiet) toast(CL.err ? CL.err : "동기화했어요");
}
function clDelNote(id) {
  const r = roleOf(id),
    e = entOf(id);
  let s = "";
  if (r === "own") s += "\n실시간 공유도 끝나서 구독한 사람들은 더 이상 업데이트를 받지 못해요.";
  if (r === "edit") s += "\n공동 편집에서도 빠져요.";
  if (CL.user && e && e.cu) s += "\n로그인한 다른 기기에서도 지워져요.";
  return s;
}
function clDeleted(id) {
  const e = entOf(id),
    l = linkOf(id);
  if (!CL.db) return;
  if (l && l.role === "own" && CL.user) clStopRemote(l.code).catch(() => {});
  if (l && l.role === "edit" && CL.user) CL.F.deleteDoc(CL.F.doc(CL.db, "pub", l.code, "editors", CL.user.uid)).catch(() => {});
  if (CL.user && e && e.cu && (!e.acct || e.acct === CL.user.uid))
    CL.F.setDoc(evDocRef(id), { del: true, upd: nextStamp(e) }).catch((e2) => clErr(e2, true));
  clearTimeout(CL.userT[id]);
  delete CL.userT[id];
}

/* ---- 실시간 공유: pub/{코드} ---- */
function cleanPubMeta(d) {
  if (d) {
    d._hadOwnerName = "ownerName" in d;
    d.ver = Math.max(0, Math.floor(Number(d.ver)) || 0);
    d.upd = Number(d.upd) || 0;
    d.ownerName = String(d.ownerName || "").slice(0, 40);
    d.name = String(d.name || "").slice(0, 200);
  }
  return d;
}
function pubRef(code) {
  return CL.F.doc(CL.db, "pub", code);
}
function clListenPub() {
  if (CL.unsubPub) {
    try {
      CL.unsubPub();
    } catch (e) {}
    CL.unsubPub = null;
  }
  const id = LIB.current,
    l = linkOf(id);
  CL.pubKey = l ? id + ":" + l.code : "";
  srcCache = { b: null };
  if (!l || !CL.db) return;
  const key = CL.pubKey;
  CL.unsubPub = CL.F.onSnapshot(
    pubRef(l.code),
    (snap) => {
      if (CL.pubKey === key) clOnPub(id, l.code, snap);
    },
    (e) => clErr(e, true)
  );
}
async function clOnPub(id, code, snap) {
  if (BROKEN.has(id)) return;
  const l = linkOf(id);
  if (!l || l.code !== code) return;
  if (snap.metadata && snap.metadata.hasPendingWrites) return;
  if (!snap.exists() || snap.data().closed) {
    if (!snap.exists() && snap.metadata && snap.metadata.fromCache) return;
    setLink(id, null);
    if (id === LIB.current) {
      clListenPub();
      renderTop();
      rerenderSoft();
      clRefreshUI();
    }
    toast(l.role === "own" ? "실시간 공유가 꺼졌어요" : "원본 공유가 끝나서 더 이상 업데이트되지 않아요. 지금 내용은 그대로 남아요.");
    return;
  }
  const d = cleanPubMeta(snap.data());
  CL.pubInfo[id] = { ver: d.ver, upd: d.upd, name: d.name, ownerName: d.ownerName || "", owner: d.owner };
  const base0 = getBase(id);
  if (base0 && (d.ver || 0) <= (base0.v || 0)) {
    clRefreshUI();
    return;
  }
  let R;
  try {
    R = sanitizeProj(await zDec(d, PUB_MAX));
  } catch (e) {
    return;
  }
  const cur = getBase(id);
  if (cur && (d.ver || 0) <= (cur.v || 0)) return;
  const l2 = linkOf(id);
  if (!l2 || l2.code !== code) return;
  if (l2.role === "sub") {
    setBase(id, { v: d.ver, p: R });
    applyTo(id, R, cur ? cur.p : null, true);
  } else {
    const P = shareProj(id === LIB.current ? S : loadEvent(id));
    const mine = !!cur && !eqJ(P, cur.p);
    const target = mine ? merge3(cur.p, P, R) : cur ? R : merge3(null, P, R);
    setBase(id, { v: d.ver, p: R });
    applyTo(id, target, cur ? cur.p : null, false);
    if (!eqJ(target, R)) clQueuePub(id, 300);
  }
  clRefreshUI();
}
/* 글자를 입력하는 중에 다른 기기·공유 업데이트가 오면, 입력칸이 다시 그려져 포커스가 풀리지 않게 화면 갱신을 미룸 */
let uiDeferred = false;
function uiBusy() {
  const a = document.activeElement;
  return !!(
    a &&
    /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) &&
    !/^(checkbox|radio|file|button)$/.test(a.type || "") &&
    (main.contains(a) || sheet.contains(a))
  );
}
function uiRefreshRemote() {
  if (uiBusy()) {
    uiDeferred = true;
    return;
  }
  uiDeferred = false;
  renderTop();
  if (sh && sh.kind === "booth") renderSheet();
  rerenderSoft();
  if (view === "info") renderInfo();
}
document.addEventListener("focusout", () => {
  setTimeout(() => {
    if (uiBusy()) return;
    if (uiDeferred) uiRefreshRemote();
    if (!sh && Object.keys(CL.pending || {}).length) clFlushPending();
  }, 60);
});
function applyTo(id, P, prev, keepLocal) {
  if (id === LIB.current) {
    srcCache = { b: null };
    applyShared(S, P, prev, keepLocal);
    CL.quiet = true;
    try {
      flush();
    } finally {
      CL.quiet = false;
    }
    uiRefreshRemote();
  } else {
    const st = loadEvent(id);
    applyShared(st, P, prev, keepLocal);
    const js = JSON.stringify(st);
    lsSet(EV_PREFIX + id, js);
    lastJs[id] = js;
    const e = entOf(id);
    if (e) {
      Object.assign(e, evMeta(st));
      saveIndex();
    }
  }
}
function clQueuePub(id, ms) {
  clearTimeout(CL.pubT[id]);
  CL.pubT[id] = setTimeout(
    () => {
      delete CL.pubT[id];
      clPushPub(id);
    },
    ms == null ? 1200 : ms
  );
}
async function clPushPub(id) {
  if (BROKEN.has(id)) return;
  const l = linkOf(id);
  if (!l || (l.role !== "own" && l.role !== "edit") || !CL.db) return;
  if (!CL.user) {
    clRefreshUI();
    return;
  }
  if (CL.pubBusy[id]) {
    CL.pubAgain[id] = true;
    return;
  }
  if (id === LIB.current && saveT) flush();
  const base = getBase(id),
    P = shareProj(id === LIB.current ? S : loadEvent(id));
  if (base && eqJ(P, base.p)) return;
  CL.pubBusy[id] = true;
  CL.inflight++;
  clRefreshUI();
  try {
    const ref = pubRef(l.code);
    let out = null;
    await CL.F.runTransaction(CL.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists() || snap.data().closed) throw { code: "bc/gone" };
      const d = cleanPubMeta(snap.data());
      let R = null;
      if (!(base && d.ver === base.v)) {
        try {
          R = sanitizeProj(await zDec(d, PUB_MAX));
        } catch (err) {
          if (l.role !== "own") throw { code: "bc/bad" };
          R = null;
        }
      }
      const merged = R ? merge3(base ? base.p : null, P, R) : P;
      const enc = await zEnc(merged);
      if (enc.size > 1000000) throw { code: "bc/big" };
      const v = (d.ver || 0) + 1;
      const upd = { z: enc.z, c: enc.c, ver: v, upd: Date.now(), name: String(merged.event.name || "").slice(0, 200) };
      if (l.role === "own" && d._hadOwnerName) upd.ownerName = CL.F.deleteField();
      tx.update(ref, upd);
      out = { v, p: merged };
    });
    const prev = getBase(id);
    if (!prev || (out.v || 0) > (prev.v || 0)) setBase(id, out);
    CL.pubInfo[id] = Object.assign(CL.pubInfo[id] || {}, { ver: out.v, upd: Date.now() });
    const nowP = shareProj(id === LIB.current ? S : loadEvent(id));
    if (!eqJ(out.p, nowP)) applyTo(id, merge3(P, nowP, out.p), prev ? prev.p : null, false);
    clQueueUser(id);
    CL.err = "";
  } catch (e) {
    const c = (e && e.code) || "";
    if (c === "bc/gone") {
      setLink(id, null);
      if (id === LIB.current) {
        clListenPub();
        renderTop();
      }
      toast("실시간 공유가 이미 끝난 행사예요");
    } else if (/permission-denied/.test(c) && l.role === "edit") {
      setLink(id, { role: "sub", code: l.code });
      if (id === LIB.current) {
        clListenPub();
        flush();
        renderTop();
        rerenderSoft();
      }
      toast("편집 권한이 없어져서 구독으로 바뀌었어요");
    } else {
      clErr(e, true);
      if (/unavailable|failed-precondition|network|aborted|deadline/.test(c)) clQueuePub(id, 15000);
    }
  }
  CL.pubBusy[id] = false;
  CL.inflight--;
  clRefreshUI();
  if (CL.pubAgain[id]) {
    CL.pubAgain[id] = false;
    clQueuePub(id, 300);
  }
}
async function clStartShare() {
  if (!clNeedLogin() || !CL.db) return;
  const id = LIB.current;
  if (linkOf(id)) return;
  flush();
  if (!S.booths.length && !(await confirmBox("아직 부스가 없어요. 그래도 실시간 공유를 시작할까요?", "시작"))) return;
  const P = shareProj(S),
    code = genCode(8);
  try {
    const enc = await zEnc(P);
    if (enc.size > 1000000) throw { code: "bc/big" };
    await CL.F.setDoc(pubRef(code), { owner: CL.user.uid, name: P.event.name || "", z: enc.z, c: enc.c, ver: 1, upd: Date.now() });
    setBase(id, { v: 1, p: P });
    setLink(id, { role: "own", code });
    clListenPub();
    renderTop();
    if (view === "info") renderInfo();
    toast("실시간 공유를 시작했어요. 코드를 친구에게 보내 주세요");
  } catch (e) {
    clErr(e);
  }
}
async function clStopRemote(code) {
  const ref = pubRef(code);
  await CL.F.runTransaction(CL.db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().closed) return;
    const sd = snap.data(),
      u = {
        closed: true,
        ver: (Math.floor(Number(sd.ver)) || 0) + 1,
        upd: Date.now(),
        z: CL.F.Bytes.fromUint8Array(new Uint8Array(0)),
        c: 0,
        name: "",
      };
    if ("ownerName" in sd) u.ownerName = CL.F.deleteField();
    tx.update(ref, u);
  });
  try {
    const qs = await CL.F.getDocs(CL.F.collection(CL.db, "pub", code, "editors"));
    const ds = [];
    qs.forEach((d) => ds.push(CL.F.deleteDoc(d.ref)));
    await Promise.all(ds);
  } catch (e) {}
  try {
    await CL.F.deleteDoc(CL.F.doc(CL.db, "pubkeys", code));
  } catch (e) {}
}
async function clStopShare() {
  const id = LIB.current,
    l = linkOf(id);
  if (!l || l.role !== "own") return;
  if (!clNeedLogin()) return;
  if (
    !(await confirmBox(
      "실시간 공유를 끝낼까요?\n구독한 사람과 공동 편집자에게는 지금 내용이 남지만, 더 이상 업데이트되지 않아요. 같은 코드는 다시 쓸 수 없어요.",
      "공유 끝내기",
      true
    ))
  )
    return;
  try {
    await clStopRemote(l.code);
    setLink(id, null);
    delete CL.ed[l.code];
    clListenPub();
    renderTop();
    if (view === "info") renderInfo();
    toast("실시간 공유를 끝냈어요");
  } catch (e) {
    clErr(e);
  }
}
async function clUnsub() {
  const id = LIB.current,
    l = linkOf(id);
  if (!l || l.role !== "sub") return;
  if (
    !(await confirmBox(
      "구독을 끊을까요?\n지금 내용은 내 행사로 남고 자유롭게 고칠 수 있어요. 원본이 바뀌어도 더 이상 업데이트되지 않아요.",
      "구독 끊기",
      true
    ))
  )
    return;
  setLink(id, null);
  clListenPub();
  renderTop();
  rerenderSoft();
  if (view === "info") renderInfo();
  toast("구독을 끊었어요. 이제 내 행사예요");
}
async function clLeave() {
  const id = LIB.current,
    l = linkOf(id);
  if (!l || l.role !== "edit") return;
  if (!(await confirmBox("공동 편집을 그만둘까요?\n이 행사는 구독으로 바뀌어서 원본 업데이트는 계속 받아요.", "그만두기", true))) return;
  try {
    if (CL.user) await CL.F.deleteDoc(CL.F.doc(CL.db, "pub", l.code, "editors", CL.user.uid));
  } catch (e) {}
  setLink(id, { role: "sub", code: l.code });
  clListenPub();
  flush();
  renderTop();
  rerenderSoft();
  if (view === "info") renderInfo();
  toast("구독으로 바꿨어요");
}
function parseLive(raw) {
  const s = String(raw || "").trim(),
    C = "([A-Za-z0-9]{8})",
    K = "([A-Za-z0-9]{12})";
  let m = s.match(new RegExp("(?:BCE-|[#&?]e=)" + C + "-" + K + "(?![A-Za-z0-9])", "i"));
  if (m) return { code: m[1].toUpperCase(), key: m[2].toUpperCase() };
  m = s.match(new RegExp("(?:BCL-|[#&?]s=)" + C + "(?![A-Za-z0-9])", "i"));
  if (m) return { code: m[1].toUpperCase() };
  return null;
}
function clHash() {
  const live = parseLive(location.hash);
  if (!live) return;
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch (e) {}
  setTimeout(() => {
    if (live.key) clJoinEdit(live.code, live.key);
    else clSubscribe(live.code);
  }, 200);
}
async function clFetchPub(code) {
  let snap;
  try {
    snap = await CL.F.getDoc(pubRef(code));
  } catch (e) {
    clErr(e);
    return null;
  }
  if (!snap.exists() || snap.data().closed) {
    toast("없는 코드이거나 공유가 끝난 행사예요");
    return null;
  }
  const d = cleanPubMeta(snap.data());
  let R;
  try {
    R = sanitizeProj(await zDec(d, PUB_MAX));
  } catch (e) {
    toast("행사 데이터를 읽지 못했어요");
    return null;
  }
  return { d, R };
}
function newLinkedEvent(R, ver, link) {
  const st = defaultState();
  st.halls = [];
  st.sections = [];
  st.cats = [];
  applyShared(st, R, null, link.role === "sub");
  if (!st.halls.length) st.halls = defaultState().halls;
  const prev = LIB.current,
    pe = entOf(prev);
  const drop = pe && !pe.link && !pe.cu && isBlank(loadEvent(prev)) ? prev : null;
  const id = addEvent(st);
  setBase(id, { v: ver, p: R });
  setLink(id, link);
  CL.dropAfter = drop;
  return id;
}
function dropBlank() {
  const d = CL.dropAfter;
  CL.dropAfter = null;
  if (d && d !== LIB.current && entOf(d)) {
    removeLocal(d);
    renderTop();
  }
}
async function clSubscribe(code) {
  if (!CL.db) {
    toast(CL.on ? "잠시 후 다시 시도해 주세요" : "이 화면에서는 실시간 공유 코드를 쓸 수 없어요");
    return;
  }
  const ex = LIB.list.find((x) => x.link && x.link.code === code);
  if (ex) {
    if (ex.id !== LIB.current) switchEvent(ex.id);
    toast(ex.link.role === "sub" ? "이미 구독 중인 행사예요" : "내가 공유 중인 행사예요");
    return;
  }
  const got = await clFetchPub(code);
  if (!got) return;
  const { d, R } = got;
  if (
    !(await confirmBox(
      `‘${R.event.name || "이름 없는 행사"}’\n부스 ${R.booths.length}개\n\n구독하면 원본이 바뀔 때마다 자동으로 업데이트돼요. 구매 리스트·지인·내 메모는 각자 따로예요.`,
      "구독하기"
    ))
  )
    return;
  const id = newLinkedEvent(R, d.ver, { role: "sub", code });
  CL.pubInfo[id] = { ver: d.ver, upd: d.upd, name: d.name, ownerName: d.ownerName || "", owner: d.owner };
  closeSheet();
  switchEvent(id);
  setView("booths");
  dropBlank();
  toast("구독했어요. 무료 배포 물품만 같이 들어오고, 구매 리스트는 각자 따로 적어요");
}
async function clJoinEdit(code, key) {
  if (!CL.db) {
    toast(CL.on ? "잠시 후 다시 시도해 주세요" : "이 화면에서는 실시간 공유 코드를 쓸 수 없어요");
    return;
  }
  if (!clNeedLogin()) return;
  const ex = LIB.list.find((x) => x.link && x.link.code === code);
  if (ex && (ex.link.role === "own" || ex.link.role === "edit")) {
    if (ex.id !== LIB.current) switchEvent(ex.id);
    toast("이미 편집할 수 있는 행사예요");
    return;
  }
  const got = await clFetchPub(code);
  if (!got) return;
  const { d, R } = got;
  if (d.owner === CL.user.uid) {
    toast("내가 만든 행사예요");
    return;
  }
  let mineN = 0;
  if (ex) {
    const bs = new Set(((getBase(ex.id) || { p: { booths: [] } }).p.booths || []).map((b) => b.id));
    mineN = loadEvent(ex.id).booths.filter((b) => !bs.has(b.id)).length;
  }
  if (
    !(await confirmBox(
      `‘${R.event.name || "이름 없는 행사"}’의 공동 편집자로 참여할까요?${mineN ? `\n내가 직접 추가한 부스 ${mineN}개도 모두에게 공유돼요.` : ""}\n내가 고친 부스·물품 정보가 모두에게 반영돼요.`,
      "참여하기"
    ))
  )
    return;
  try {
    await CL.F.setDoc(CL.F.doc(CL.db, "pub", code, "editors", CL.user.uid), {
      key,
      name: String(CL.user.dname || "").slice(0, 40),
      at: Date.now(),
    });
  } catch (e) {
    toast(/permission-denied/.test((e && e.code) || "") ? "편집 코드가 맞지 않거나 바뀌었어요" : clErrText(e));
    return;
  }
  let id;
  if (ex) {
    id = ex.id;
    setLink(id, { role: "edit", code });
  } else id = newLinkedEvent(R, d.ver, { role: "edit", code });
  CL.pubInfo[id] = { ver: d.ver, upd: d.upd, name: d.name, ownerName: d.ownerName || "", owner: d.owner };
  closeSheet();
  if (id !== LIB.current) switchEvent(id);
  else {
    clListenPub();
    renderTop();
    rerenderSoft();
  }
  dropBlank();
  if (view === "info") renderInfo();
  toast("공동 편집자로 참여했어요");
}
async function clEdLoad(quiet) {
  const l = linkOf(LIB.current);
  if (!l || l.role !== "own") return;
  if (quiet ? !CL.user : !clNeedLogin()) return;
  const code = l.code,
    old = CL.ed[code];
  if (old && old.busy) return;
  if (old && old.key) {
    old.busy = true;
  } else {
    CL.ed[code] = { loading: true, busy: true, list: [], key: "" };
    clRefreshUI();
  }
  try {
    const kref = CL.F.doc(CL.db, "pubkeys", code);
    const ks = await CL.F.getDoc(kref);
    let key = ks.exists() ? ks.data().key : "";
    if (!key) {
      key = genCode(12);
      await CL.F.setDoc(kref, { key });
    }
    const qs = await CL.F.getDocs(CL.F.collection(CL.db, "pub", code, "editors"));
    const list = [];
    qs.forEach((d) => {
      const x = d.data();
      list.push({ uid: d.id, name: x.name || "", at: x.at || 0 });
    });
    CL.ed[code] = { loading: false, busy: false, list, key, at: Date.now() };
  } catch (e) {
    if (old && old.key) old.busy = false;
    else delete CL.ed[code];
    if (!quiet) clErr(e);
  }
  clRefreshUI();
}
async function clEdNewKey() {
  const l = linkOf(LIB.current);
  if (!l || l.role !== "own" || !clNeedLogin()) return;
  if (
    !(await confirmBox(
      "편집 코드를 새로 만들까요?\n지금 코드는 더 이상 쓸 수 없어요. 이미 참여한 공동 편집자는 그대로 남아요.",
      "새로 만들기"
    ))
  )
    return;
  try {
    const key = genCode(12);
    await CL.F.setDoc(CL.F.doc(CL.db, "pubkeys", l.code), { key });
    if (CL.ed[l.code]) CL.ed[l.code].key = key;
    clRefreshUI();
    toast("편집 코드를 바꿨어요");
  } catch (e) {
    clErr(e);
  }
}
async function clEdRemove(euid) {
  const l = linkOf(LIB.current);
  if (!l || l.role !== "own" || !clNeedLogin()) return;
  const ed = CL.ed[l.code],
    x = ed && ed.list.find((y) => y.uid === euid);
  if (
    !(await confirmBox(
      `‘${(x && x.name) || "이 편집자"}’를 공동 편집에서 뺄까요?\n그 사람은 구독자로 바뀌고, 편집 코드도 새로 바뀌어요.`,
      "빼기",
      true
    ))
  )
    return;
  try {
    await CL.F.deleteDoc(CL.F.doc(CL.db, "pub", l.code, "editors", euid));
    if (ed) ed.list = ed.list.filter((y) => y.uid !== euid);
    const key = genCode(12);
    await CL.F.setDoc(CL.F.doc(CL.db, "pubkeys", l.code), { key });
    if (ed) ed.key = key;
    clRefreshUI();
    toast("뺐어요. 같은 코드로 다시 들어오지 못하게 편집 코드도 바꿨어요");
  } catch (e) {
    clErr(e);
  }
}
function liveLink(code, key) {
  return location.origin + location.pathname + (key ? `#e=${code}-${key}` : `#s=${code}`);
}
function clCopy(kind) {
  const l = linkOf(LIB.current);
  if (!l) return;
  const ed = CL.ed[l.code];
  const v =
    kind === "code"
      ? "BCL-" + l.code
      : kind === "link"
        ? liveLink(l.code)
        : kind === "edit" && ed && ed.key
          ? "BCE-" + l.code + "-" + ed.key
          : kind === "editlink" && ed && ed.key
            ? liveLink(l.code, ed.key)
            : "";
  if (!v) return;
  const ta = document.createElement("textarea");
  ta.value = v;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(ta);
  copyText(v, ta).finally(() => setTimeout(() => ta.remove(), 100));
}

/* ---- 화면 ---- */
function clStatus() {
  if (CL.syncing) return "동기화 중…";
  if (CL.inflight > 0) return "저장하는 중…";
  if (CL.err) return "⚠ " + CL.err;
  const wait = LIB.list.some(
    (e) => (!e.acct || e.acct === (CL.user && CL.user.uid)) && (e.mod || 0) > (e.cu || 0) && (e.cu || e.link || !isBlank(loadEvent(e.id)))
  );
  if (wait) return "곧 저장돼요";
  return CL.lastSync ? `모든 기기와 동기화됨 · ${fmtWhen(CL.lastSync)}` : "모든 기기와 동기화됨";
}
function cfgNote() {
  return FB_FALLBACK && !IN_CLAUDE
    ? `<p class="desc cfgwarn">${esc(cfgProblem())} 지금은 이 기기에 기억해 둔 설정(${esc(FB_CFG.projectId)})으로 연결했어요.</p>`
    : "";
}
function clAccInner() {
  return clAccBody().replace("</h2>", "</h2>" + cfgNote());
}
function clAccBody() {
  if (CL.failed)
    return `<h2>로그인·동기화</h2><p class="desc">로그인 기능을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.</p>`;
  if (!CL.user)
    return `<h2>로그인·동기화</h2><p class="desc">Google 계정으로 로그인하면 행사가 계정에 저장돼서 휴대폰과 PC에서 같은 내용을 볼 수 있어요. 로그인하지 않아도 이 기기에서는 지금처럼 쓸 수 있어요.</p>
    <button class="btn pre block" data-act="clLogin" ${CL.authKnown ? "" : "disabled"}>${CL.authKnown ? "Google로 로그인" : "불러오는 중…"}</button>`;
  const u = CL.user;
  return `<h2>로그인·동기화</h2>
    <div class="acct">${u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="av">${esc((u.name || "?").slice(0, 1))}</span>`}<div><b>${esc(u.name || "Google 사용자")}</b><small>${esc(u.email)}</small></div></div>
    <p class="clst">${esc(clStatus())}</p>
    <div class="btnrow"><button class="btn ghost" data-act="clSync">지금 동기화</button><button class="btn ghost" data-act="clLogout">로그아웃</button></div>`;
}
function codeBox(code, label) {
  return `<div class="lcode"><span class="ll">${label}</span><b>${esc(code)}</b></div>`;
}
function clLiveInner() {
  const id = LIB.current,
    l = linkOf(id),
    pi = CL.pubInfo[id] || {},
    base = getBase(id);
  const busy = !!(CL.pubBusy[id] || CL.pubT[id]);
  const when = pi.upd ? fmtWhen(pi.upd) : "";
  if (!l)
    return `<h2>실시간 공유</h2>
    <p class="desc">공유 코드를 한 번만 보내면, 내가 행사를 고칠 때마다 받은 사람에게 <b>자동으로 반영</b>돼요. 부스·작가·배치도·선입금 기간·수령 방법, 부스 태그·메모, <b>무료 배포 물품</b>이 공유돼요. 나머지 구매 리스트와 체크·지인은 각자 따로예요.</p>
    <button class="btn pre block" data-act="clShare">${CL.user ? "실시간 공유 시작" : "로그인하고 시작하기"}</button>
    <p class="desc" style="margin:10px 0 0">받은 코드(BCL-…, BCE-…)는 아래 ‘불러오기’에 붙여 넣으세요.</p>`;
  if (l.role === "sub")
    return `<h2>구독 중</h2>
    <p class="desc">원본이 바뀌면 자동으로 업데이트돼요. 부스·작가 정보와 태그·부스 메모는 원본에서만 고칠 수 있어요. 무료 배포 물품도 원본을 따라가요. 구매 리스트와 체크·지인·내 메모, 내가 직접 추가한 부스는 내 것이에요.</p>
    ${codeBox("BCL-" + l.code, "구독 코드")}
    <p class="clst">${when ? `마지막 업데이트 ${when}` : "연결하는 중…"}${base ? ` · 버전 ${Number(base.v) || 0}` : ""}</p>
    <div class="btnrow"><button class="btn ghost" data-act="clCopy" data-v="code">코드 복사</button><button class="btn ghost" data-act="clCopy" data-v="link">링크 복사</button></div>
    <div class="btnrow" style="margin-top:8px"><button class="btn danger" data-act="clUnsub">구독 끊기 (내 행사로 바꾸기)</button></div>`;
  const st = !CL.user
    ? "⚠ 로그인해야 고친 내용이 반영돼요"
    : busy
      ? "올리는 중…"
      : (when ? `반영됨 · ${when}` : "연결하는 중…") + (base ? ` · 버전 ${Number(base.v) || 0}` : "");
  if (l.role === "edit")
    return `<h2>공동 편집 중</h2>
    <p class="desc">내가 고친 부스·작가 정보와 무료 배포 물품도 모두에게 반영돼요. 나머지 구매 리스트는 각자 따로예요.</p>
    ${codeBox("BCL-" + l.code, "구독 코드")}
    <p class="clst">${esc(st)}</p>
    <div class="btnrow"><button class="btn ghost" data-act="clCopy" data-v="code">구독 코드 복사</button><button class="btn ghost" data-act="clCopy" data-v="link">링크 복사</button></div>
    <div class="btnrow" style="margin-top:8px"><button class="btn danger" data-act="clLeave">공동 편집 그만두기</button></div>`;
  const ed = CL.ed[l.code];
  return `<h2>실시간 공유 중</h2>
    <p class="desc">이 코드나 링크를 받은 사람은 구독자가 돼요. 내가 고친 내용이 자동으로 반영돼요.</p>
    ${codeBox("BCL-" + l.code, "구독 코드")}
    <p class="clst">${esc(st)}</p>
    <div class="btnrow"><button class="btn pre" data-act="clCopy" data-v="code">코드 복사</button><button class="btn ghost" data-act="clCopy" data-v="link">링크 복사</button></div>
    <div class="edbox">
      <h4>공동 편집자</h4>
      <p class="desc">편집 코드를 받은 사람은 로그인한 뒤 이 행사를 같이 고칠 수 있어요. 구독 코드와 달리 내용을 바꿀 수 있으니 믿을 수 있는 사람에게만 주세요.</p>
      ${
        !ed
          ? `<button class="btn ghost block" data-act="clEdOpen">편집 코드·편집자 보기</button>`
          : ed.loading
            ? `<p class="clst">불러오는 중…</p>`
            : `${codeBox("BCE-" + l.code + "-" + ed.key, "편집 코드")}
  <div class="btnrow"><button class="btn ghost" data-act="clCopy" data-v="edit">편집 코드 복사</button><button class="btn ghost" data-act="clCopy" data-v="editlink">편집 링크 복사</button><button class="btn ghost" data-act="clEdNew">코드 바꾸기</button></div>
  <div class="edlist">${ed.list.length ? ed.list.map((x) => `<div class="edrow"><span>${esc(x.name || "이름 없음")}</span><small>${x.at ? fmtWhen(x.at) + " 참여" : ""}</small><button class="btn ghost sm" data-act="clEdDel" data-uid="${esc(x.uid)}">빼기</button></div>`).join("") : `<p class="clst">아직 공동 편집자가 없어요.</p>`}<button class="btn ghost sm" data-act="clEdOpen" style="margin-top:8px">목록 새로고침</button></div>`
      }
    </div>
    <div class="btnrow" style="margin-top:12px"><button class="btn danger" data-act="clStop">실시간 공유 끝내기</button></div>`;
}
function clCards() {
  if (CL.on) return `<div class="card" id="clAcc">${clAccInner()}</div>`;
  const why = cfgProblem();
  if (!why) return "";
  return `<div class="card" id="clAcc"><h2>로그인·동기화</h2><p class="desc cfgwarn">${esc(why)}</p></div>`;
}
function clLiveCard() {
  if (!CL.on) return "";
  const l = linkOf(LIB.current),
    ed = l && CL.ed[l.code];
  if (l && l.role === "own" && ed && ed.key && Date.now() - (ed.at || 0) > 10000) setTimeout(() => clEdLoad(true), 0);
  return `<div class="card" id="clLive">${clLiveInner()}</div>`;
}
function clRefreshUI() {
  try {
    renderTop();
  } catch (e) {}
  if (view === "info") {
    const a = document.getElementById("clAcc");
    if (a) a.innerHTML = clAccInner();
    const l = document.getElementById("clLive");
    if (l) l.innerHTML = clLiveInner();
  }
}
function lockBoothForm() {
  const body = sheet.querySelector(".sh-body");
  if (!body) return;
  body.insertAdjacentHTML(
    "afterbegin",
    `<p class="lknote">구독한 행사의 원본 부스예요. 지인만 바꿀 수 있어요. 나만 보는 메모는 부스 화면의 ‘내 메모’에 적어 주세요.</p>`
  );
  [
    "#fSec button",
    "#fNum",
    "#fSize button",
    "#fName",
    "#fHours input",
    "#fTimes input",
    "#fTimes button",
    "#fArtAdd",
    "#fTags input",
    "#fMemo",
    "#fArtists [data-kind]",
  ].forEach((q) =>
    body.querySelectorAll(q).forEach((el) => {
      el.disabled = true;
    })
  );
  body.querySelectorAll("#fArtists input, #fArtists [data-rk]").forEach((el) => {
    el.disabled = true;
  });
  body
    .querySelectorAll(
      "#fArtists [data-akdel], #fArtists [data-akimgdel], #fArtists [data-af=imgIn], #fTimeSug, #fTagSug, #fTags [data-tgrm], [data-act=delBooth]"
    )
    .forEach((el) => {
      el.style.display = "none";
    });
}
function lockItemForm() {
  const body = sheet.querySelector(".sh-body");
  if (!body) return;
  body.insertAdjacentHTML("afterbegin", `<p class="lknote">구독한 행사의 원본 물품이에요. 수량·우선순위·메모만 바꿀 수 있어요.</p>`);
  ["#iName", "#iPrice", "#iCat", "#iArt", "#iType button"].forEach((q) =>
    body.querySelectorAll(q).forEach((el) => {
      el.disabled = true;
    })
  );
  body.querySelectorAll("[data-act=delItem]").forEach((el) => {
    el.style.display = "none";
  });
}
const LOCK_ITEM = new Set(["판매 형태", "작가", "하위 물품 추가", "이름 바꾸기", "가격 바꾸기", "하위 물품 삭제", "삭제", "물품 삭제"]);
const LOCK_BOOTH = new Set(["부스 삭제", "회전", "배치도에서 빼기", "배치도에 놓기"]);
function lockMenu(el, list) {
  if (!list || !isSub()) return list;
  const bid = el.dataset.bid || el.dataset.id,
    b = bid && findBooth(bid);
  if (!b) return list;
  const iid = el.dataset.iid,
    i = iid && b.items.find((x) => x.id === iid);
  const ban = i ? (lockedItem(i) ? LOCK_ITEM : null) : el.matches(".agrp[data-aid]") ? null : lockedBooth(b) ? LOCK_BOOTH : null;
  if (!ban) return list;
  const out = list.filter((x) => !(x && x.label && ban.has(x.label)));
  return out.filter((x, k, a) => !(x && x.sep && (k === a.length - 1 || (a[k + 1] && a[k + 1].sep))));
}

/* 탭바 키보드 이동: ←/→, Home/End (화면 낭독기 탭 목록 규칙) */
document.querySelector(".tabbar").addEventListener("keydown", (e) => {
  const tabs = [...document.querySelectorAll(".tabbar .tab")],
    k = tabs.indexOf(document.activeElement);
  if (k < 0) return;
  const n =
    e.key === "ArrowRight"
      ? (k + 1) % tabs.length
      : e.key === "ArrowLeft"
        ? (k - 1 + tabs.length) % tabs.length
        : e.key === "Home"
          ? 0
          : e.key === "End"
            ? tabs.length - 1
            : -1;
  if (n < 0) return;
  e.preventDefault();
  if (sh) closeSheet();
  setView(tabs[n].dataset.tab);
  tabs[n].focus();
});
