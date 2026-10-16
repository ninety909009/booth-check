/* 부스 체크 — 배치도: 그리기·동선·길찾기·찾기·확대/이동
   index.html이 js/ 파일들을 정해진 순서로 불러와요. 파일끼리 함수·변수를 그대로 함께 써요(전역). */
"use strict";
/* ---------- map ---------- */
const CELL = 44;
const MARK_COLORS = ["#8A90AD", "#E5B400", "#3FB37F", "#3AA6D8", "#E8833A", "#B36BD6"];
let mapHall = null,
  mapEdit = false,
  mapSel = null,
  mapG = null,
  mapRaf = false;
const mapViews = Object.create(null);
const $ = (id) => document.getElementById(id);
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function clampZ(z) {
  return clamp(z, 0.2, 3);
}
function curHall() {
  if (!S.halls.length) S.halls.push({ id: uid(), name: "1관", w: 36, h: 24 });
  let h = S.halls.find((x) => x.id === mapHall);
  if (!h) {
    h = S.halls[0];
    mapHall = h.id;
  }
  return h;
}
function mv() {
  const h = curHall();
  return mapViews[h.id] || (mapViews[h.id] = { z: 1, tx: 0, ty: 0, init: false });
}
function fp(b) {
  const len = b.half ? 1 : 2 * spanOf(b),
    r = b.pos && b.pos.rot;
  return { w: r ? 1 : len, h: r ? len : 1 };
}
function boothState(b) {
  const st = boothStats(b);
  if (!st.total) return st.maybe ? "maybe" : "none";
  return st.fin === st.total ? "done" : "todo";
}

/* ---------- 동선: 그룹 순서(기본 현장 → 무료 → 선입금) → 그룹 안에서 ★꼭 사기 먼저 → 가까운 순 ---------- */
const ROUTE_G = { on: "현장 판매", free: "무료 배포", pre: "선입금 수령" };
const ROUTE_C = { on: "var(--on)", free: "#0E9F8F", pre: "var(--pre)" };
let mapRouteData = null;
function routeCfg() {
  const r = UIP.route && typeof UIP.route === "object" ? UIP.route : (UIP.route = {});
  if (!Array.isArray(r.order) || r.order.length !== 3 || !["on", "free", "pre"].every((k) => r.order.includes(k)))
    r.order = ["on", "free", "pre"];
  if (!r.start || typeof r.start !== "object") r.start = {};
  return r;
}
function routeStartMark() {
  const id = routeCfg().start[LIB.current];
  if (id === "") return null;
  const m = id ? S.marks.find((x) => x.id === id) : null;
  return m || S.marks.find((x) => /입구|입장/.test(x.label || "")) || null;
}
function boothCenter(b) {
  const f = fp(b);
  return { h: b.pos.hall, x: b.pos.x + f.w / 2, y: b.pos.y + f.h / 2 };
}
function markCenter(m) {
  return { h: m.hall, x: m.x + m.w / 2, y: m.y + m.h / 2 };
}
function pdist(a, b) {
  return (a.h !== b.h ? 10000 : 0) + Math.hypot(a.x - b.x, a.y - b.y);
}
function routeInfo(b) {
  const ls = linesOf(b).filter((L) => !L.maybe && !isFinal(L) && !artHidden(b, L));
  if (!ls.length) return null;
  const n = { on: 0, free: 0, pre: 0 };
  for (const L of ls) n[L.type] = (n[L.type] || 0) + 1;
  const g = routeCfg().order.find((k) => n[k] > 0);
  return g ? { g, n, must: ls.some((L) => L.must) } : null;
}
/* 가까운 순으로 잇고(최근접), 2-opt로 꼬인 길을 풀어 줌. 시작점 고정·끝점 자유 */
/* ---------- 통로 따라 걷기: 부스·구조물은 벽, 빈 칸으로만 이동 (덜 꺾이는 길 우선) ---------- */
let WALK = null;
function walkReset() {
  WALK = { g: Object.create(null), f: Object.create(null), d: new Map(), a: Object.create(null) };
}
function walkGrid(hid) {
  if (!WALK) walkReset();
  if (hid in WALK.g) return WALK.g[hid];
  const bd = contentBounds(hid);
  if (!bd) return (WALK.g[hid] = null);
  const x0 = Math.floor(bd.x0) - 2,
    y0 = Math.floor(bd.y0) - 2,
    w = Math.ceil(bd.x1) + 2 - x0,
    h = Math.ceil(bd.y1) + 2 - y0;
  if (w * h > 250000) return (WALK.g[hid] = null);
  const block = new Uint8Array(w * h);
  const fill = (ox, oy, ow, oh) => {
    for (let i = 0; i < ow; i++)
      for (let j = 0; j < oh; j++) {
        const x = ox + i - x0,
          y = oy + j - y0;
        if (x >= 0 && y >= 0 && x < w && y < h) block[y * w + x] = 1;
      }
  };
  for (const b of S.booths)
    if (b.pos && b.pos.hall === hid) {
      const f = fp(b);
      fill(b.pos.x, b.pos.y, f.w, f.h);
    }
  for (const m of S.marks) if (m.hall === hid) fill(m.x, m.y, m.w, m.h);
  /* 배치도 바깥 테두리 칸은 조금 덜 선호 → 부스 줄 사이 통로로 다니게 */
  const edge = new Uint8Array(w * h),
    bx0 = Math.floor(bd.x0) - x0,
    by0 = Math.floor(bd.y0) - y0,
    bx1 = Math.ceil(bd.x1) - x0,
    by1 = Math.ceil(bd.y1) - y0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < bx0 || y < by0 || x >= bx1 || y >= by1) edge[y * w + x] = 1;
  return (WALK.g[hid] = { x0, y0, w, h, block, edge });
}
function refRect(r) {
  if (r.t === "b") {
    const f = fp(r.o);
    return { h: r.o.pos.hall, x: r.o.pos.x, y: r.o.pos.y, w: f.w, hh: f.h };
  }
  return { h: r.o.hall, x: r.o.x, y: r.o.y, w: r.o.w, hh: r.o.h };
}
function adjFree(G, R) {
  const out = [],
    seen = new Set();
  const add = (x, y, ex, ey) => {
    const gx = x - G.x0,
      gy = y - G.y0;
    if (gx < 0 || gy < 0 || gx >= G.w || gy >= G.h) return;
    const k = gy * G.w + gx;
    if (G.block[k] || seen.has(k)) return;
    seen.add(k);
    out.push({ k, ex, ey });
  };
  for (let i = 0; i < R.w; i++) {
    add(R.x + i, R.y - 1, R.x + i + 0.5, R.y);
    add(R.x + i, R.y + R.hh, R.x + i + 0.5, R.y + R.hh);
  }
  for (let j = 0; j < R.hh; j++) {
    add(R.x - 1, R.y + j, R.x, R.y + j + 0.5);
    add(R.x + R.w, R.y + j, R.x + R.w, R.y + j + 0.5);
  }
  return out;
}
function hpush(H, k, p) {
  H.push([p, k]);
  let i = H.length - 1;
  while (i) {
    const j = (i - 1) >> 1;
    if (H[j][0] <= H[i][0]) break;
    [H[i], H[j]] = [H[j], H[i]];
    i = j;
  }
}
function hpop(H) {
  const top = H[0],
    last = H.pop();
  if (H.length) {
    H[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1,
        r = l + 1;
      let m = i;
      if (l < H.length && H[l][0] < H[m][0]) m = l;
      if (r < H.length && H[r][0] < H[m][0]) m = r;
      if (m === i) break;
      [H[i], H[m]] = [H[m], H[i]];
      i = m;
    }
  }
  return top;
}
const WDX = [1, 0, -1, 0],
  WDY = [0, 1, 0, -1];
function walkPath(a, b) {
  if (!a || !b) return null;
  const ra = refRect(a),
    rb = refRect(b);
  if (ra.h !== rb.h) return null;
  const G = walkGrid(ra.h);
  if (!G) return null;
  const S0 = adjFree(G, ra),
    T = adjFree(G, rb);
  if (!S0.length || !T.length) return null;
  const W = G.w,
    N = W * G.h,
    tm = new Map(T.map((t) => [t.k, t])),
    sm = new Map(S0.map((t) => [t.k, t]));
  const hf = (k) => {
    const x = (k % W) + G.x0,
      y = ((k / W) | 0) + G.y0;
    return Math.max(rb.x - 1 - x, 0, x - rb.x - rb.w) + Math.max(rb.y - 1 - y, 0, y - rb.y - rb.hh);
  };
  const dist = new Float64Array(N * 5).fill(Infinity),
    prev = new Int32Array(N * 5).fill(-1),
    H = [];
  for (const t of S0) {
    const st = t.k * 5 + 4;
    dist[st] = 0;
    hpush(H, st, hf(t.k));
  }
  let end = -1,
    guard = 0;
  while (H.length && guard++ < 400000) {
    const [pr, st] = hpop(H),
      k = (st / 5) | 0,
      d = st % 5,
      cd = dist[st];
    if (pr > cd + hf(k) + 1e-9) continue;
    if (tm.has(k)) {
      end = st;
      break;
    }
    const x = k % W,
      y = (k / W) | 0;
    for (let nd = 0; nd < 4; nd++) {
      const nx = x + WDX[nd],
        ny = y + WDY[nd];
      if (nx < 0 || ny < 0 || nx >= W || ny >= G.h) continue;
      const nk = ny * W + nx;
      if (G.block[nk]) continue;
      const c = cd + 1 + (d !== 4 && d !== nd ? 0.7 : 0) + (G.edge[nk] ? 0.4 : 0),
        ns = nk * 5 + nd;
      if (c < dist[ns]) {
        dist[ns] = c;
        prev[ns] = st;
        hpush(H, ns, c + hf(nk));
      }
    }
  }
  if (end < 0) return null;
  const cells = [];
  for (let st = end; st >= 0; st = prev[st]) cells.push((st / 5) | 0);
  cells.reverse();
  const s0 = sm.get(cells[0]),
    t0 = tm.get(cells[cells.length - 1]);
  const raw = [
    { x: s0.ex, y: s0.ey },
    ...cells.map((k) => ({ x: (k % W) + G.x0 + 0.5, y: ((k / W) | 0) + G.y0 + 0.5 })),
    { x: t0.ex, y: t0.ey },
  ];
  const pts = [raw[0]];
  for (let i = 1; i < raw.length - 1; i++) {
    const a0 = pts[pts.length - 1],
      b0 = raw[i],
      c0 = raw[i + 1];
    if (Math.abs((b0.x - a0.x) * (c0.y - b0.y) - (b0.y - a0.y) * (c0.x - b0.x)) > 1e-9) pts.push(b0);
  }
  pts.push(raw[raw.length - 1]);
  const segs = [];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x,
      dy = pts[i].y - pts[i - 1].y,
      l = Math.abs(dx) + Math.abs(dy);
    len += l;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "→" : "←") : dy > 0 ? "↓" : "↑";
    if (segs.length && segs[segs.length - 1].dir === dir) segs[segs.length - 1].l += l;
    else segs.push({ dir, l });
  }
  return { pts, len, segs: segs.filter((x) => x.l >= 0.5) };
}
/* 한 곳에서 모든 칸까지의 통로 거리 (동선 순서·가까운 순 정렬용) */
function walkField(r) {
  if (!WALK) walkReset();
  const key = r.t + ":" + (r.o.id || r.id);
  if (key in WALK.f) return WALK.f[key];
  const R = refRect(r),
    G = walkGrid(R.h);
  if (!G) return (WALK.f[key] = null);
  const d = new Int32Array(G.w * G.h).fill(-1),
    q = [];
  for (const t of adjFree(G, R)) {
    d[t.k] = 0;
    q.push(t.k);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const k = q[qi],
      x = k % G.w,
      y = (k / G.w) | 0;
    for (let nd = 0; nd < 4; nd++) {
      const nx = x + WDX[nd],
        ny = y + WDY[nd];
      if (nx < 0 || ny < 0 || nx >= G.w || ny >= G.h) continue;
      const nk = ny * G.w + nx;
      if (G.block[nk] || d[nk] >= 0) continue;
      d[nk] = d[k] + 1;
      q.push(nk);
    }
  }
  return (WALK.f[key] = { G, d });
}
function walkDist(a, b) {
  if (!WALK) walkReset();
  const ka = a.t + ":" + (a.o.id || a.id),
    kb = b.t + ":" + (b.o.id || b.id),
    key = ka < kb ? ka + "|" + kb : kb + "|" + ka;
  if (WALK.d.has(key)) return WALK.d.get(key);
  const v = walkDist0(a, b, kb);
  WALK.d.set(key, v);
  return v;
}
function walkDist0(a, b, kb) {
  const ra = refRect(a),
    rb = refRect(b),
    ca = { x: ra.x + ra.w / 2, y: ra.y + ra.hh / 2 },
    cb = { x: rb.x + rb.w / 2, y: rb.y + rb.hh / 2 },
    eu = Math.hypot(ca.x - cb.x, ca.y - cb.y);
  if (ra.h !== rb.h) return 10000 + eu;
  const F = walkField(a);
  if (!F) return eu;
  const adj = WALK.a[kb] || (WALK.a[kb] = adjFree(F.G, rb));
  let m = Infinity;
  for (const t of adj) if (F.d[t.k] >= 0) m = Math.min(m, F.d[t.k]);
  return m === Infinity ? 500 + eu * 3 : m + 1;
}
function pathSvg(pts, fr, attrs) {
  return `<polyline points="${pts.map((c) => ((c.x - fr.ox) * CELL).toFixed(1) + "," + ((c.y - fr.oy) * CELL).toFixed(1)).join(" ")}" ${attrs}/>`;
}
function orderPts(pts, from) {
  if (pts.length < 2) return pts.slice();
  const D = (a, b) => (a && b ? walkDist(a.ref, b.ref) : 0);
  const left = pts.slice(),
    out = [];
  let cur = from;
  while (left.length) {
    let bi = 0,
      bd = Infinity;
    left.forEach((p, i) => {
      const d = cur ? D(cur, p) : p.c.y * 1000 + p.c.x;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const p = left.splice(bi, 1)[0];
    out.push(p);
    cur = p;
  }
  for (let it = 0, better = true; better && it < 30; it++) {
    better = false;
    for (let i = 0; i < out.length - 1; i++) {
      const pi = i ? out[i - 1] : from;
      for (let j = i + 1; j < out.length; j++) {
        const nj = j + 1 < out.length ? out[j + 1] : null;
        if (D(pi, out[j]) + D(out[i], nj) + 1e-9 < D(pi, out[i]) + D(out[j], nj)) {
          out.splice(i, j - i + 1, ...out.slice(i, j + 1).reverse());
          better = true;
        }
      }
    }
  }
  return out;
}
function computeRoute() {
  walkReset();
  const cfg = routeCfg(),
    sm = routeStartMark(),
    hallIds = new Set(S.halls.map((h) => h.id));
  let cur = sm ? { ref: { t: "m", o: sm }, c: markCenter(sm) } : null;
  const stops = [],
    unplaced = [];
  for (const g of cfg.order) {
    const bs = [];
    for (const b of sortedBooths()) {
      const r = routeInfo(b);
      if (r && r.g === g) bs.push({ b, r });
    }
    const placed = bs
      .filter((x) => x.b.pos && hallIds.has(x.b.pos.hall))
      .map((x) => ({ ...x, c: boothCenter(x.b), ref: { t: "b", o: x.b } }));
    for (const seg of [placed.filter((x) => x.r.must), placed.filter((x) => !x.r.must)]) {
      for (const p of orderPts(seg, cur)) {
        stops.push({ ...p, g });
        cur = p;
      }
    }
    for (const x of bs) if (!(x.b.pos && hallIds.has(x.b.pos.hall))) unplaced.push({ ...x, g });
  }
  return { stops, unplaced, start: sm };
}
function routeSvg(h, fr) {
  const R = mapRouteData;
  if (!R || !R.stops.length) return "";
  let prev = R.start ? { ref: { t: "m", o: R.start }, c: markCenter(R.start) } : null,
    segs = "";
  for (const st of R.stops) {
    if (prev && prev.c.h === h.id && st.c.h === h.id) {
      const P = walkPath(prev.ref, st.ref),
        pts = P ? P.pts : [prev.c, st.c];
      segs += pathSvg(pts, fr, `style="stroke:${ROUTE_C[st.g]}" marker-end="url(#rarr-${st.g})"${P ? "" : ' class="straight"'}`);
    }
    prev = st;
  }
  if (!segs) return "";
  const mk = (g) =>
    `<marker id="rarr-${g}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:${ROUTE_C[g]}"/></marker>`;
  return `<svg class="rsvg" width="${fr.w * CELL}" height="${fr.h * CELL}" aria-hidden="true"><defs>${mk("on")}${mk("free")}${mk("pre")}</defs>${segs}</svg>`;
}
/* ---------- 찾기: 내 위치(가장 가까운 부스·구조물) → 화장실·부스 찾기 ---------- */
let herePick = false,
  findTarget = null,
  findQ = "";
function hereCfg() {
  if (!UIP.here || typeof UIP.here !== "object") UIP.here = {};
  return UIP.here;
}
function refObj(r) {
  if (!r) return null;
  if (r.t === "b") {
    const b = findBooth(r.id);
    return b && b.pos && S.halls.some((h) => h.id === b.pos.hall)
      ? { t: "b", id: b.id, o: b, c: boothCenter(b), name: boothCode(b) + (b.name ? " " + b.name : "") }
      : null;
  }
  const m = S.marks.find((x) => x.id === r.id);
  return m ? { t: "m", id: m.id, o: m, c: markCenter(m), name: m.label || "구조물" } : null;
}
function hereRef() {
  return refObj(hereCfg()[LIB.current]);
}
function dirWord(a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 0.6) return { arrow: "•", word: "바로 여기" };
  const k = ((Math.round(Math.atan2(-dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  return [
    ["→", "오른쪽"],
    ["↗", "오른쪽 위"],
    ["↑", "위쪽"],
    ["↖", "왼쪽 위"],
    ["←", "왼쪽"],
    ["↙", "왼쪽 아래"],
    ["↓", "아래쪽"],
    ["↘", "오른쪽 아래"],
  ].map(([arrow, word]) => ({ arrow, word }))[k];
}
const SEGW = { "→": "오른쪽", "←": "왼쪽", "↑": "위", "↓": "아래" };
/* a, b: refObj. 통로 길이와 꺾는 순서 */
function distText(a, b) {
  if (a.c.h !== b.c.h) {
    const h = S.halls.find((x) => x.id === b.c.h);
    return { arrow: "⇢", txt: `${h ? h.name : "다른 관"}에 있어요`, steps: "" };
  }
  const w = dirWord(a.c, b.c),
    P = walkPath(a, b);
  if (!P) {
    const d = Math.hypot(b.c.x - a.c.x, b.c.y - a.c.y);
    return {
      arrow: w.arrow,
      txt: `${w.word}${josaRo(w.word)} 직선 약 ${Math.max(1, Math.round(d))}칸`,
      steps: "통로를 찾지 못해 직선으로 보여 줘요",
    };
  }
  if (P.len < 1.5) return { arrow: "•", txt: "바로 옆이에요", steps: "" };
  return {
    arrow: w.arrow,
    txt: `걸어서 약 ${Math.round(P.len)}칸`,
    steps: P.segs.map((x) => `${SEGW[x.dir]} ${Math.max(1, Math.round(x.l))}`).join(" → "),
  };
}
function walkListDist(here, b) {
  return walkDist(here, { t: "b", o: b });
}
function nearestMark(label, from) {
  let best = null,
    bd = Infinity;
  for (const m of S.marks) {
    if ((m.label || "").trim() !== label) continue;
    const d = walkDist(from, { t: "m", o: m });
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}
function fitTwo(a, b) {
  const V = mv(),
    sz = vpSize(),
    fr = curFrame();
  const x0 = Math.min(a.x, b.x) - 2,
    x1 = Math.max(a.x, b.x) + 2,
    y0 = Math.min(a.y, b.y) - 2,
    y1 = Math.max(a.y, b.y) + 2;
  const z = clampZ(Math.min((sz.w - 24) / ((x1 - x0) * CELL), (sz.h - 24) / ((y1 - y0) * CELL), 1.6));
  V.z = z;
  V.init = true;
  V.tx = sz.w / 2 - ((x0 + x1) / 2 - fr.ox) * CELL * z;
  V.ty = sz.h / 2 - ((y0 + y1) / 2 - fr.oy) * CELL * z;
  applyView();
}
function setFindTarget(r) {
  findTarget = r;
  const here = hereRef(),
    t = refObj(r);
  renderMapItems();
  renderMapBottom();
  if (!t) return;
  if (t.c.h !== mapHall) {
    mapHall = t.c.h;
    renderMap();
  }
  requestAnimationFrame(() => {
    if (here && here.c.h === t.c.h) fitTwo(here.c, t.c);
    else if (t.t === "b") centerOn(t.o);
    else fitTwo(t.c, t.c);
    const el = t.t === "b" ? document.querySelector(`.mb[data-bid="${t.id}"]`) : document.querySelector(`.mk[data-mid="${t.id}"]`);
    if (el) {
      el.classList.add("pulse");
      setTimeout(() => el.classList.remove("pulse"), 3700);
    }
  });
}
function findSvg(h, fr, a, b) {
  if (!a || !b || a.c.h !== h.id || b.c.h !== h.id) return "";
  const P = walkPath(a, b),
    pts = P ? P.pts : [a.c, b.c];
  return `<svg class="rsvg fsvg" width="${fr.w * CELL}" height="${fr.h * CELL}" aria-hidden="true"><defs><marker id="farr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--text)"/></marker></defs>${pathSvg(pts, fr, `marker-end="url(#farr)"${P ? "" : ' class="straight"'}`)}</svg>`;
}
function findPanel() {
  walkReset();
  const here = hereRef(),
    t = refObj(findTarget);
  const labels = [...new Set(S.marks.map((m) => (m.label || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  let head;
  if (herePick || !here)
    head = `<div class="fhere pick"><span class="fpin">📍</span><span class="fht"><b>지금 가장 가까운 부스나 구조물을 배치도에서 누르세요</b><small>누른 곳을 내 위치로 정해요</small></span>${here ? `<button type="button" class="btn ghost sm" data-act="fpick">취소</button>` : ""}</div>`;
  else
    head = `<div class="fhere"><span class="fpin">📍</span><span class="fht"><small>내 위치</small><b>${esc(here.name)} 근처</b></span><button type="button" class="btn ghost sm" data-act="fpick">바꾸기</button></div>`;
  if (!here || herePick) return `<div class="fpanel">${head}</div>`;
  const tgtLine = t
    ? (() => {
        const d = distText(here, t);
        return `<div class="ftgt"><span class="farrow">${d.arrow}</span><span class="fht"><b>${esc(t.name)}</b><small>${esc(d.txt)}${d.steps ? `<span class="fsteps">${esc(d.steps)}</span>` : ""}</small></span>${t.t === "b" ? `<button type="button" class="btn ghost sm" data-act="open" data-id="${t.id}">열기</button>` : ""}<button type="button" class="btn ghost sm" data-act="ftgt" data-t="" aria-label="찾기 끝내기">✕</button></div>`;
      })()
    : "";
  const q = findQ.trim();
  let list = S.booths.filter((b) => b.pos && S.halls.some((h) => h.id === b.pos.hall) && !(here.t === "b" && here.id === b.id));
  if (q) list = list.filter((b) => matchQuery(b, q.toLowerCase()) || matchQuery(b, q));
  else list = list.filter((b) => boothState(b) === "todo");
  list = list
    .map((b) => ({ b, c: boothCenter(b), wd: walkListDist(here, b) }))
    .sort((x, y) => x.wd - y.wd)
    .slice(0, q ? 20 : 6);
  const rows = list
    .map((x) => {
      const w = dirWord(here.c, x.c),
        d =
          x.c.h !== here.c.h
            ? distText(here, refObj({ t: "b", id: x.b.id }))
            : {
                arrow: w.arrow,
                txt: x.wd >= 500 ? `${w.word}${josaRo(w.word)} (통로 없음)` : `${w.word} · 걸어서 약 ${Math.max(1, Math.round(x.wd))}칸`,
              };
      return `<div class="rstop" data-act="ftgt" data-t="b" data-id="${x.b.id}"><b class="farrow sm">${d.arrow}</b><span class="mini" style="--sc:${secColor(x.b.section)}">${esc(boothCode(x.b))}</span><span class="rnm">${esc(x.b.name || "이름 없는 부스")}<small>${esc(d.txt)}</small></span></div>`;
    })
    .join("");
  return `<div class="fpanel">${head}${tgtLine}
    ${labels.length ? `<div class="fchips"><span class="lbl">가장 가까운</span>${labels.map((l) => `<button type="button" class="chip" data-act="ftgt" data-t="lbl" data-l="${esc(l)}">${esc(l)}</button>`).join("")}</div>` : ""}
    <input class="inp" id="findQ" value="${esc(findQ)}" placeholder="찾을 부스 (번호·이름·작가)" autocomplete="off" enterkeyhint="search">
    <p class="rhint">${q ? `‘${esc(q)}’ 가까운 순` : "살 것 남은 부스 · 가까운 순"}</p>
    <div class="rlist">${rows || `<p class="rhint" style="margin:6px 0">${q ? "찾는 부스가 배치도에 없어요." : "근처에 살 것 남은 부스가 없어요."}</p>`}</div>
  </div>`;
}
function routeCounts(n) {
  return [
    ["on", "현장"],
    ["free", "무료"],
    ["pre", "선입금"],
  ]
    .filter(([k]) => n[k])
    .map(([k, l]) => `${l} ${n[k]}`)
    .join(" · ");
}
function routePanel() {
  const R = mapRouteData || (mapRouteData = computeRoute()),
    cfg = routeCfg(),
    multiHall = S.halls.length > 1;
  const hallName = (id) => {
    const h = S.halls.find((x) => x.id === id);
    return h ? h.name : "";
  };
  const marks = S.marks.filter((m) => (m.label || "").trim());
  const curStart = R.start ? R.start.id : "";
  const order = cfg.order
    .map(
      (g, k) =>
        `${k ? `<button type="button" class="rswap" data-act="rswap" data-k="${k}" aria-label="${ROUTE_G[cfg.order[k - 1]]}와 ${ROUTE_G[g]} 순서 바꾸기">⇄</button>` : ""}<span class="rgrp" style="--rc:${ROUTE_C[g]}">${k + 1}. ${ROUTE_G[g]}</span>`
    )
    .join("");
  let n = 0;
  const rows = R.stops
    .map((s) => {
      n++;
      return `<div class="rstop" data-act="rgo" data-id="${s.b.id}"><b class="rno" style="--rc:${ROUTE_C[s.g]}">${n}</b><span class="mini" style="--sc:${secColor(s.b.section)}">${esc(boothCode(s.b))}</span><span class="rnm">${s.r.must ? '<em class="rmust">★</em>' : ""}${esc(s.b.name || "이름 없는 부스")}<small>${routeCounts(s.r.n)}${multiHall ? " · " + esc(hallName(s.b.pos.hall)) : ""}</small></span><button type="button" class="btn ghost sm" data-act="open" data-id="${s.b.id}">열기</button></div>`;
    })
    .join("");
  const un = R.unplaced.length
    ? `<div class="runh">배치도에 없는 부스 ${R.unplaced.length}곳 <small>‘배치 편집’에서 놓으면 동선에 들어가요</small></div>` +
      R.unplaced
        .map(
          (s) =>
            `<div class="rstop" data-act="open" data-id="${s.b.id}"><b class="rno off" style="--rc:${ROUTE_C[s.g]}">–</b><span class="mini" style="--sc:${secColor(s.b.section)}">${esc(boothCode(s.b))}</span><span class="rnm">${s.r.must ? '<em class="rmust">★</em>' : ""}${esc(s.b.name || "이름 없는 부스")}<small>${ROUTE_G[s.g]} · ${routeCounts(s.r.n)}</small></span></div>`
        )
        .join("")
    : "";
  return `<div class="rpanel">
    <div class="rhead"><button type="button" class="rfold" data-act="rfold" aria-expanded="${!UIP.routeFold}"><b>동선</b><span class="rcnt">${R.stops.length + R.unplaced.length ? `${R.stops.length + R.unplaced.length}곳` : ""}</span><i>${UIP.routeFold ? "▲ 펼치기" : "▼ 접기"}</i></button><label class="rstart">출발<select class="inp sm" id="rStart"><option value="">없음 (첫 부스부터)</option>${marks.map((m) => `<option value="${m.id}" ${m.id === curStart ? "selected" : ""}>${esc(m.label)}${multiHall ? " (" + esc(hallName(m.hall)) + ")" : ""}</option>`).join("")}</select></label></div>
    ${
      UIP.routeFold
        ? ""
        : `<div class="rorder">${order}</div>
    <p class="rhint">남은 물품이 있는 부스만, 그룹 순서 → ★꼭 사기 → 가까운 순으로 이었어요. 고민중 물품은 빠져요.</p>
    <div class="rlist">${rows || (R.unplaced.length ? "" : `<p class="rhint" style="margin:6px 0">남은 물품이 있는 부스가 없어요. 다 챙겼어요!</p>`)}${un}</div>`
    }
  </div>`;
}

function renderMap() {
  curHall();
  main.innerHTML = `<div class="mapwrap">
    <div class="maptop">
      <div class="chips" id="hallChips"></div>
      ${mapEdit ? "" : `<button class="btn ${UIP.mapFind ? "pre" : "ghost"} editbtn" data-act="mfind" aria-pressed="${!!UIP.mapFind}">찾기</button><button class="btn ${UIP.mapRoute ? "pre" : "ghost"} editbtn" data-act="mroute" aria-pressed="${!!UIP.mapRoute}">동선</button>`}
      <button class="btn ${mapEdit ? "pre" : "ghost"} editbtn" data-act="mapedit">${mapEdit ? "완료" : "배치 편집"}</button>
    </div>
    ${!mapEdit && (allTags().length || friendCount()) ? `<div class="chips maptags" id="mapTags"></div>` : ""}
    <div class="mapview ${mapEdit ? "editing" : ""}" id="mapview">
      <div class="mapcanvas" id="mapcanvas"></div>
      <div id="mapEmpty"></div>
      ${mapEdit || UIP.mapRoute || UIP.mapFind ? "" : `<div class="legend"><span><i style="background:linear-gradient(90deg,#3D6BF0 33%,#EB6A00 33% 66%,#0E9F8F 66%)"></i>살 것 남음</span><span><i style="border:2px dashed var(--muted)"></i>물품 없음</span><span><i style="background:var(--line)"></i>다 챙김 ✓</span></div>`}
      <div class="zoomctl"><button data-act="zin" aria-label="확대">+</button><button data-act="zout" aria-label="축소">−</button><button class="fit" data-act="zfit">맞춤</button></div>
    </div>
    <div class="mapbottom" id="mapbottom"></div>
  </div>`;
  renderHallChips();
  renderTagChips("mapTags");
  renderMapItems();
  renderMapBottom();
  bindMap();
  requestAnimationFrame(() => {
    const V = mv();
    if (!V.init) fitMap();
    else applyView();
  });
}
function renderHallChips() {
  const el = $("hallChips");
  if (!el) return;
  el.innerHTML =
    S.halls
      .map((h) => `<button class="chip" data-act="hall" data-hid="${h.id}" aria-pressed="${h.id === mapHall}">${esc(h.name)}</button>`)
      .join("") +
    (mapEdit ? `<button class="chip" data-act="hallset">관 설정</button><button class="chip" data-act="halladd">+ 관</button>` : "");
}
const mapFrames = Object.create(null);
function contentBounds(hid) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const b of S.booths)
    if (b.pos && b.pos.hall === hid) {
      const f = fp(b);
      x0 = Math.min(x0, b.pos.x);
      y0 = Math.min(y0, b.pos.y);
      x1 = Math.max(x1, b.pos.x + f.w);
      y1 = Math.max(y1, b.pos.y + f.h);
    }
  for (const m of S.marks)
    if (m.hall === hid) {
      x0 = Math.min(x0, m.x);
      y0 = Math.min(y0, m.y);
      x1 = Math.max(x1, m.x + m.w);
      y1 = Math.max(y1, m.y + m.h);
    }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}
function canvasFrame(h) {
  const b = contentBounds(h.id),
    PAD = mapEdit ? 4 : 1,
    MINW = mapEdit ? 14 : 4,
    MINH = mapEdit ? 10 : 3;
  if (!b) return { ox: 0, oy: 0, w: 14, h: 10 };
  const ox = b.x0 - PAD,
    oy = b.y0 - PAD;
  let w = b.x1 + PAD - ox,
    hh = b.y1 + PAD - oy;
  const ex = Math.max(0, MINW - w),
    ey = Math.max(0, MINH - hh);
  return { ox: ox - Math.floor(ex / 2), oy: oy - Math.floor(ey / 2), w: w + ex, h: hh + ey };
}
function curFrame() {
  const h = curHall();
  return mapFrames[h.id] || canvasFrame(h);
}
function renderMapItems() {
  const cv = $("mapcanvas");
  if (!cv) return;
  const h = curHall();
  const fr = canvasFrame(h),
    prev = mapFrames[h.id],
    V = mv();
  if (prev && V.init && (prev.ox !== fr.ox || prev.oy !== fr.oy)) {
    V.tx += (fr.ox - prev.ox) * CELL * V.z;
    V.ty += (fr.oy - prev.oy) * CELL * V.z;
    cv.style.transform = `translate(${V.tx}px,${V.ty}px) scale(${V.z})`;
  }
  mapFrames[h.id] = fr;
  cv.style.width = fr.w * CELL + "px";
  cv.style.height = fr.h * CELL + "px";
  const marks = S.marks
    .filter((m) => m.hall === h.id)
    .map((m) => {
      const sel = mapEdit && mapSel && mapSel.t === "m" && mapSel.id === m.id;
      return `<div class="mk ${sel ? "sel" : ""}" data-mid="${m.id}" style="left:${(m.x - fr.ox) * CELL}px;top:${(m.y - fr.oy) * CELL}px;width:${m.w * CELL}px;height:${m.h * CELL}px;--mc:${m.color}"><span>${esc(m.label)}</span>${sel ? `<i class="rh" data-mid="${m.id}"></i>` : ""}</div>`;
    })
    .join("");
  const placed = S.booths.filter((b) => b.pos && b.pos.hall === h.id);
  const route = UIP.mapRoute && !mapEdit,
    find = UIP.mapFind && !mapEdit && !route;
  const fHere = find ? hereRef() : null,
    fTgt = find ? refObj(findTarget) : null;
  walkReset();
  mapRouteData = route ? computeRoute() : null;
  const rno = new Map();
  if (route) mapRouteData.stops.forEach((x, k) => rno.set(x.b.id, { n: k + 1, g: x.g }));
  const booths = placed
    .map((b) => {
      const f = fp(b),
        st = boothStats(b),
        code = boothCode(b);
      const x = b.pos.x - fr.ox,
        y = b.pos.y - fr.oy;
      const sel = mapEdit && mapSel && mapSel.t === "b" && mapSel.id === b.id;
      const dim = !mapEdit && ((tagFilter && !matchTag(b)) || (route && !rno.has(b.id)));
      const fcls = find
        ? (fHere && fHere.t === "b" && fHere.id === b.id ? " here" : "") + (fTgt && fTgt.t === "b" && fTgt.id === b.id ? " tgt" : "")
        : "";
      return `<div class="mb ${boothState(b)} ${sel ? "sel" : ""} ${spanOf(b) > 1 && !b.pos.rot ? "" : code.length >= 5 ? "xlong" : code.length >= 4 ? "long" : ""} ${b.half ? "" : "full"} ${spanOf(b) > 1 ? "multi" : ""} ${!b.half && b.pos.rot ? "vert" : ""} ${dim ? "dim" : ""} ${b.isFriend ? "fr" : ""}${fcls}" data-bid="${b.id}" style="left:${x * CELL + 2}px;top:${y * CELL + 2}px;width:${f.w * CELL - 4}px;height:${f.h * CELL - 4}px;--sc:${secColor(b.section)}"><b>${esc(code)}</b>${b.name ? `<i>${esc(b.name)}</i>` : ""}${b.isFriend ? '<em class="mfr">♥</em>' : ""}${st.must ? '<em class="mst">★</em>' : ""}${(() => {
        const ps = pickupState(b);
        return ps && ps.pend && (ps.cls === "soon" || ps.cls === "late") ? '<em class="mdl">⏰</em>' : "";
      })()}${!mapEdit && boothEvents(b).length ? `<em class="mev" title="이벤트 ${boothEvents(b).length}개">${ICON_GIFT}</em>` : ""}${route && rno.has(b.id) ? `<em class="rbadge" style="--rc:${ROUTE_C[rno.get(b.id).g]}">${rno.get(b.id).n}</em>` : ""}${fcls.includes("here") ? '<em class="hpin">나</em>' : ""}</div>`;
    })
    .join("");
  cv.innerHTML = marks + (route ? routeSvg(h, fr) : "") + (find ? findSvg(h, fr, fHere, fTgt) : "") + booths;
  if (find) {
    if (fHere && fHere.t === "m") {
      const me = cv.querySelector(`.mk[data-mid="${fHere.id}"]`);
      if (me) {
        me.classList.add("here");
        me.insertAdjacentHTML("beforeend", '<em class="hpin">나</em>');
      }
    }
    if (fTgt && fTgt.t === "m") {
      const me = cv.querySelector(`.mk[data-mid="${fTgt.id}"]`);
      if (me) me.classList.add("tgt");
    }
    const vpEl = $("mapview");
    if (vpEl) vpEl.classList.toggle("picking", herePick || !fHere);
  } else {
    const vpEl = $("mapview");
    if (vpEl) vpEl.classList.remove("picking");
  }
  if (route && mapRouteData.start && mapRouteData.start.hall === h.id) {
    const me = cv.querySelector(`.mk[data-mid="${mapRouteData.start.id}"]`);
    if (me) me.insertAdjacentHTML("beforeend", '<em class="rstartb">출발</em>');
  }
  const em = $("mapEmpty");
  if (em)
    em.innerHTML =
      !placed.length && !S.marks.some((m) => m.hall === h.id)
        ? `<div class="mapempty"><strong>${esc(h.name)} 배치도가 비어 있어요</strong>${mapEdit ? "아래에서 부스를 눌러 놓거나 ‘자동 배치’를 눌러 보세요." : "‘배치 편집’을 눌러 부스를 놓아 보세요."}</div>`
        : "";
}
function renderMapBottom() {
  const el = $("mapbottom");
  if (!el) return;
  if (!mapEdit && UIP.mapFind && !UIP.mapRoute) {
    el.style.display = "";
    el.classList.add("route");
    const hadFocus = document.activeElement && document.activeElement.id === "findQ",
      pos = hadFocus ? document.activeElement.selectionStart : 0;
    el.innerHTML = findPanel();
    const qi = $("findQ");
    if (qi) {
      qi.addEventListener("input", () => {
        findQ = qi.value;
        renderMapBottom();
      });
      if (hadFocus) {
        qi.focus();
        try {
          qi.setSelectionRange(pos, pos);
        } catch (e) {}
      }
    }
    return;
  }
  if (!mapEdit && UIP.mapRoute) {
    el.style.display = "";
    el.classList.add("route");
    const sc = el.querySelector(".rlist"),
      top = sc ? sc.scrollTop : 0;
    el.innerHTML = routePanel();
    const nl = el.querySelector(".rlist");
    if (nl) nl.scrollTop = top;
    const sel = $("rStart");
    if (sel)
      sel.addEventListener("change", () => {
        routeCfg().start[LIB.current] = sel.value;
        saveUIP();
        renderMapItems();
        renderMapBottom();
      });
    return;
  }
  el.classList.remove("route");
  if (!mapEdit) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  const act = document.activeElement;
  if (act && act.id === "mkLabel" && el.contains(act) && mapSel && mapSel.t === "m") {
    const tr = el.querySelector(".trayhead b");
    const un = sortedBooths().filter((b) => !b.pos).length;
    if (tr) tr.textContent = `안 놓은 부스 ${un}`;
    return;
  }
  el.style.display = "";
  let sel = `<div class="selbar"><span class="hint">끌어서 옮기고, 눌러서 고르세요. 빈 곳을 끌면 화면이 움직여요.</span></div>`;
  if (mapSel && mapSel.t === "b") {
    const b = findBooth(mapSel.id);
    if (b && b.pos)
      sel = `<div class="selbar"><span class="mini" style="--sc:${secColor(b.section)}">${esc(boothCode(b))}</span><span class="nm">${esc(b.name || "이름 없는 부스")}</span>${!b.half ? `<button class="btn ghost sm" data-act="mrot">회전</button>` : ""}<button class="btn ghost sm" data-act="munplace">빼기</button><button class="btn ghost sm" data-act="open" data-id="${b.id}">열기</button></div>`;
    else mapSel = null;
  } else if (mapSel && mapSel.t === "m") {
    const m = S.marks.find((x) => x.id === mapSel.id);
    if (m)
      sel = `<div class="selbar"><input class="inp sm" id="mkLabel" value="${esc(m.label)}" placeholder="이름 (예: 입구)"><div class="sws">${MARK_COLORS.map((c) => `<button class="swc" data-act="mcolor" data-c="${c}" style="--mc:${c}" aria-label="색" aria-pressed="${m.color === c}"></button>`).join("")}</div><button class="iconbtn danger" data-act="mdel" aria-label="구조물 삭제">${ICON_TRASH}</button></div>`;
    else mapSel = null;
  }
  const un = sortedBooths().filter((b) => !b.pos);
  el.innerHTML =
    sel +
    `<div class="trayhead"><b>안 놓은 부스 ${un.length}</b><span style="flex:1"></span>${un.length ? `<button class="btn ghost sm" data-act="mauto">자동 배치</button>` : ""}<button class="btn ghost sm" data-act="madd">+ 구조물</button></div>
    <div class="traychips">${un.length ? un.map((b) => `<button class="tchip" data-act="mplace" data-id="${b.id}" style="--sc:${secColor(b.section)}">${esc(boothCode(b))}${seatsHTML(b)}</button>`).join("") : `<span class="tnone">모든 부스를 놓았어요.</span>`}</div>`;
  const inp = $("mkLabel");
  if (inp)
    inp.addEventListener("input", () => {
      const m = S.marks.find((x) => x.id === mapSel.id);
      if (m) {
        m.label = inp.value;
        save();
        renderMapItems();
      }
    });
}
let mapActiveT = null;
function mapActive() {
  const cv = $("mapcanvas");
  if (!cv) return;
  cv.style.willChange = "transform";
  clearTimeout(mapActiveT);
  mapActiveT = setTimeout(() => {
    const c = $("mapcanvas");
    if (c) c.style.willChange = "auto";
  }, 220);
}
function applyView() {
  if (mapRaf) return;
  mapRaf = true;
  requestAnimationFrame(() => {
    mapRaf = false;
    const cv = $("mapcanvas");
    if (!cv) return;
    const V = mv();
    cv.style.transform = `translate(${V.tx}px,${V.ty}px) scale(${V.z})`;
    cv.classList.toggle("zoomed", V.z >= 1.3);
  });
}
function vpSize() {
  const vp = $("mapview");
  const r = vp ? vp.getBoundingClientRect() : { width: 360, height: 500 };
  return { w: r.width, h: r.height };
}
function fitMap() {
  const h = curHall(),
    V = mv(),
    sz = vpSize(),
    fr = mapFrames[h.id] || canvasFrame(h);
  const b = contentBounds(h.id);
  let x0, y0, x1, y1;
  if (!b) {
    x0 = fr.ox;
    y0 = fr.oy;
    x1 = fr.ox + fr.w;
    y1 = fr.oy + fr.h;
  } else {
    x0 = b.x0 - 1;
    y0 = b.y0 - 1;
    x1 = b.x1 + 1;
    y1 = b.y1 + 1;
  }
  const bw = (x1 - x0) * CELL,
    bh = (y1 - y0) * CELL;
  const z = clampZ(Math.min((sz.w - 16) / bw, (sz.h - 16) / bh, 1.5));
  V.z = z;
  V.tx = (sz.w - bw * z) / 2 - (x0 - fr.ox) * CELL * z;
  V.ty = (sz.h - bh * z) / 2 - (y0 - fr.oy) * CELL * z;
  V.init = true;
  applyView();
}
function zoomAt(x, y, f) {
  const V = mv();
  const cx = (x - V.tx) / V.z,
    cy = (y - V.ty) / V.z;
  V.z = clampZ(V.z * f);
  V.tx = x - cx * V.z;
  V.ty = y - cy * V.z;
  applyView();
}
function centerOn(b) {
  const V = mv(),
    sz = vpSize(),
    f = fp(b);
  V.z = Math.max(V.z, 1.3);
  V.init = true;
  const fr = curFrame();
  V.tx = sz.w / 2 - (b.pos.x - fr.ox + f.w / 2) * CELL * V.z;
  V.ty = sz.h / 2 - (b.pos.y - fr.oy + f.h / 2) * CELL * V.z;
  applyView();
  setTimeout(() => {
    const el = document.querySelector(`.mb[data-bid="${b.id}"]`);
    if (el) {
      el.classList.add("pulse");
      setTimeout(() => el.classList.remove("pulse"), 3700);
    }
  }, 60);
}
function viewCenterCell() {
  const V = mv(),
    sz = vpSize(),
    fr = curFrame();
  return { x: Math.floor((sz.w / 2 - V.tx) / V.z / CELL) + fr.ox, y: Math.floor((sz.h / 2 - V.ty) / V.z / CELL) + fr.oy };
}
function occupied(hallId, except) {
  const set = new Set();
  for (const b of S.booths) {
    if (!b.pos || b.pos.hall !== hallId || b === except) continue;
    const f = fp(b);
    for (let i = 0; i < f.w; i++) for (let j = 0; j < f.h; j++) set.add(b.pos.x + i + "," + (b.pos.y + j));
  }
  return set;
}
function freeSpot(h, w, hh, cx, cy, occ) {
  for (let r = 0; r < 80; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx,
          y = cy + dy;
        let ok = true;
        for (let i = 0; i < w && ok; i++)
          for (let j = 0; j < hh; j++)
            if (occ.has(x + i + "," + (y + j))) {
              ok = false;
              break;
            }
        if (ok) return { x, y };
      }
  }
  return { x: cx, y: cy };
}
/* 배치 편집: 부스를 다른 부스 위에 놓으면 같은 줄의 부스를 옆으로 밀어 줌 (가로 부스는 좌우, 세로 부스는 위아래) */
function pushPlan(mover, nx, ny) {
  const hid = mover.pos.hall,
    mf = fp(mover),
    horiz = mf.h <= mf.w;
  const others = S.booths.filter((b) => b !== mover && b.pos && b.pos.hall === hid);
  const pos = new Map(others.map((b) => [b, { x: b.pos.x, y: b.pos.y }]));
  const rect = (b) => {
    const q = pos.get(b),
      f = fp(b);
    return { x: q.x, y: q.y, w: f.w, h: f.h };
  };
  const ov = (a, c) => a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;
  const moved = new Set();
  let guard = 0;
  const shove = (b, r, dir) => {
    const q = pos.get(b),
      br = rect(b);
    if (horiz) q.x = dir > 0 ? r.x + r.w : r.x - br.w;
    else q.y = dir > 0 ? r.y + r.h : r.y - br.h;
    moved.add(b);
    const nr = rect(b);
    for (const c of others) {
      if (guard++ > 4000) return;
      if (c === b) continue;
      if (ov(nr, rect(c))) shove(c, nr, dir);
    }
  };
  const mr = { x: nx, y: ny, w: mf.w, h: mf.h };
  const hits = others.filter((b) => ov(mr, rect(b)));
  for (const b of hits) {
    const br = rect(b);
    if (!ov(mr, br)) continue;
    const mc = horiz ? mr.x + mr.w / 2 : mr.y + mr.h / 2,
      bc = horiz ? br.x + br.w / 2 : br.y + br.h / 2;
    shove(b, mr, mc <= bc ? 1 : -1);
  }
  return [...moved].map((b) => ({ b, x: pos.get(b).x, y: pos.get(b).y }));
}
function previewPush(g) {
  const fr = curFrame(),
    prev = g.plan || [];
  const plan = pushPlan(g.obj, g.nx, g.ny),
    now = new Set(plan.map((x) => x.b));
  for (const x of prev)
    if (!now.has(x.b)) {
      const el = document.querySelector(`.mb[data-bid="${x.b.id}"]`);
      if (el) {
        el.style.left = (x.b.pos.x - fr.ox) * CELL + 2 + "px";
        el.style.top = (x.b.pos.y - fr.oy) * CELL + 2 + "px";
        el.classList.remove("pushed");
      }
    }
  for (const x of plan) {
    const el = document.querySelector(`.mb[data-bid="${x.b.id}"]`);
    if (el) {
      el.style.left = (x.x - fr.ox) * CELL + 2 + "px";
      el.style.top = (x.y - fr.oy) * CELL + 2 + "px";
      el.classList.add("pushed");
    }
  }
  g.plan = plan;
}
function toastAct(msg, label, fn) {
  const t = document.getElementById("toast");
  t.innerHTML = `<span>${esc(msg)}</span><button type="button" class="tact">${esc(label)}</button>`;
  t.style.pointerEvents = "auto";
  t.classList.add("show");
  t.querySelector(".tact").onclick = () => {
    t.classList.remove("show");
    t.style.pointerEvents = "";
    fn();
  };
  clearTimeout(toastT);
  toastT = setTimeout(() => {
    t.classList.remove("show");
    t.style.pointerEvents = "";
  }, 5000);
}
function placeBooth(b) {
  const h = curHall();
  b.pos = { hall: h.id, x: 0, y: 0, rot: 0 };
  const f = fp(b),
    occ = occupied(h.id, b);
  let c = viewCenterCell();
  if (b.half) {
    const sib = S.booths.find(
      (x) => x !== b && x.section === b.section && x.num === b.num && x.half && x.half !== b.half && x.pos && x.pos.hall === h.id
    );
    if (sib) {
      const tx = sib.pos.x + (b.half === 2 ? 1 : -1),
        ty = sib.pos.y;
      if (!occ.has(tx + "," + ty)) c = { x: tx, y: ty };
      else c = { x: sib.pos.x, y: sib.pos.y };
    }
  }
  const p = freeSpot(h, f.w, f.h, c.x, c.y, occ);
  b.pos.x = p.x;
  b.pos.y = p.y;
  mapSel = { t: "b", id: b.id };
  save();
  renderMapItems();
  renderMapBottom();
}
function autoLayout() {
  const h = curHall(),
    un = sortedBooths().filter((b) => !b.pos);
  if (!un.length) return;
  const bd = contentBounds(h.id);
  const left = bd ? bd.x0 : 0,
    rowW = Math.max(16, bd ? bd.x1 - bd.x0 : 0);
  let y = bd ? bd.y1 + 1 : 0,
    x = left,
    cur = null;
  for (const b of un) {
    const w = b.half ? 1 : 2 * spanOf(b);
    if (cur !== null && b.section !== cur) {
      y += 2;
      x = left;
    }
    if (x + w > left + rowW) {
      y += 2;
      x = left;
    }
    cur = b.section;
    b.pos = { hall: h.id, x, y, rot: 0 };
    x += w;
  }
  mapSel = null;
  save();
  renderMapItems();
  renderMapBottom();
  fitMap();
  toast(`부스 ${un.length}개를 구역별로 놓았어요`);
}
function mapTap(it) {
  if (Date.now() - lpAt < 900) return;
  if (!mapEdit) {
    if (UIP.mapFind && !UIP.mapRoute && (herePick || !hereRef())) {
      if (!it) return;
      const r = it.classList.contains("mb") ? { t: "b", id: it.dataset.bid } : it.dataset.mid ? { t: "m", id: it.dataset.mid } : null;
      if (!r) return;
      hereCfg()[LIB.current] = r;
      saveUIP();
      herePick = false;
      if (findTarget && findTarget.t === r.t && findTarget.id === r.id) findTarget = null;
      renderMapItems();
      renderMapBottom();
      toast("내 위치를 정했어요");
      const t = refObj(findTarget),
        hh = hereRef();
      if (t && hh && t.c.h === hh.c.h) requestAnimationFrame(() => fitTwo(hh.c, t.c));
      return;
    }
    if (UIP.mapFind && !UIP.mapRoute && it && it.dataset.mid) {
      setFindTarget({ t: "m", id: it.dataset.mid });
      return;
    }
    if (it && it.classList.contains("mb")) openSheet({ kind: "booth", id: it.dataset.bid });
    return;
  }
  if (it && it.classList.contains("mb")) mapSel = { t: "b", id: it.dataset.bid };
  else if (it && it.dataset.mid) mapSel = { t: "m", id: it.dataset.mid };
  else mapSel = null;
  renderMapItems();
  renderMapBottom();
}
function bindMap() {
  const vp = $("mapview");
  if (!vp) return;
  const ptrs = new Map();
  vp.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".zoomctl,.legend,.mapempty")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      vp.setPointerCapture(e.pointerId);
    } catch (_) {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const V = mv();
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()],
        r = vp.getBoundingClientRect();
      if (mapG && mapG.el) {
        mapG.el.classList.remove("dragging");
        renderMapItems();
      }
      mapG = {
        type: "pinch",
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        z0: V.z,
        tx0: V.tx,
        ty0: V.ty,
        m0: { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top },
      };
      return;
    }
    if (ptrs.size > 2) return;
    const it = e.target.closest(".rh,.mb,.mk");
    mapG = { type: "pan", id: e.pointerId, sx: e.clientX, sy: e.clientY, tx0: V.tx, ty0: V.ty, moved: false, it };
    if (mapEdit && it) {
      if (it.classList.contains("rh")) {
        const m = S.marks.find((x) => x.id === it.dataset.mid);
        if (m) Object.assign(mapG, { type: "resize", obj: m, w0: m.w, h0: m.h, el: it.parentElement });
      } else if (it.classList.contains("mb")) {
        const b = findBooth(it.dataset.bid);
        if (b && b.pos) Object.assign(mapG, { type: "move", kind: "b", obj: b, x0: b.pos.x, y0: b.pos.y, el: it });
      } else {
        const m = S.marks.find((x) => x.id === it.dataset.mid);
        if (m) Object.assign(mapG, { type: "move", kind: "m", obj: m, x0: m.x, y0: m.y, el: it });
      }
    }
  });
  vp.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!mapG) return;
    const V = mv(),
      h = curHall();
    if (mapG.type === "pinch") {
      if (ptrs.size < 2) return;
      const [a, b] = [...ptrs.values()],
        r = vp.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1,
        m = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
      const z = clampZ((mapG.z0 * d) / mapG.d0),
        cx = (mapG.m0.x - mapG.tx0) / mapG.z0,
        cy = (mapG.m0.y - mapG.ty0) / mapG.z0;
      V.z = z;
      V.tx = m.x - cx * z;
      V.ty = m.y - cy * z;
      mapActive();
      applyView();
      return;
    }
    if (e.pointerId !== mapG.id) return;
    const dx = e.clientX - mapG.sx,
      dy = e.clientY - mapG.sy;
    if (!mapG.moved) {
      if (Math.hypot(dx, dy) < 7) return;
      mapG.moved = true;
      if (mapG.el) mapG.el.classList.add("dragging");
    }
    if (mapG.type === "pan") {
      V.tx = mapG.tx0 + dx;
      V.ty = mapG.ty0 + dy;
      mapActive();
      applyView();
    } else if (mapG.type === "move") {
      const o = mapG.obj,
        f = mapG.kind === "b" ? fp(o) : { w: o.w, h: o.h },
        off = mapG.kind === "b" ? 2 : 0;
      const fr = curFrame();
      const nx = Math.round(mapG.x0 + dx / (CELL * V.z)),
        ny = Math.round(mapG.y0 + dy / (CELL * V.z));
      if (nx !== mapG.nx || ny !== mapG.ny) {
        mapG.nx = nx;
        mapG.ny = ny;
        mapG.el.style.left = (nx - fr.ox) * CELL + off + "px";
        mapG.el.style.top = (ny - fr.oy) * CELL + off + "px";
        if (mapG.kind === "b") previewPush(mapG);
      }
    } else if (mapG.type === "resize") {
      const o = mapG.obj;
      const nw = clamp(Math.round(mapG.w0 + dx / (CELL * V.z)), 1, 200),
        nh = clamp(Math.round(mapG.h0 + dy / (CELL * V.z)), 1, 200);
      if (nw !== mapG.nw || nh !== mapG.nh) {
        mapG.nw = nw;
        mapG.nh = nh;
        mapG.el.style.width = nw * CELL + "px";
        mapG.el.style.height = nh * CELL + "px";
      }
    }
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (!mapG) return;
    if (mapG.type === "pinch") {
      if (ptrs.size === 1) {
        const [[id, p]] = [...ptrs.entries()],
          V = mv();
        mapG = { type: "pan", id, sx: p.x, sy: p.y, tx0: V.tx, ty0: V.ty, moved: true };
      } else if (!ptrs.size) mapG = null;
      return;
    }
    if (e.pointerId !== mapG.id) return;
    const g = mapG;
    mapG = null;
    if (e.type === "pointercancel") {
      renderMapItems();
      return;
    }
    if (!g.moved) {
      mapTap(g.it);
      return;
    }
    if (g.type === "move") {
      if (g.nx != null) {
        if (g.kind === "b") {
          const plan = pushPlan(g.obj, g.nx, g.ny),
            undo = [{ b: g.obj, x: g.obj.pos.x, y: g.obj.pos.y }, ...plan.map((x) => ({ b: x.b, x: x.b.pos.x, y: x.b.pos.y }))];
          g.obj.pos.x = g.nx;
          g.obj.pos.y = g.ny;
          for (const x of plan) {
            x.b.pos.x = x.x;
            x.b.pos.y = x.y;
          }
          if (plan.length)
            setTimeout(
              () =>
                toastAct(`옆 부스 ${plan.length}개를 밀었어요`, "되돌리기", () => {
                  for (const u of undo)
                    if (u.b.pos) {
                      u.b.pos.x = u.x;
                      u.b.pos.y = u.y;
                    }
                  save();
                  renderMapItems();
                  renderMapBottom();
                }),
              0
            );
        } else {
          g.obj.x = g.nx;
          g.obj.y = g.ny;
        }
        save();
      }
      mapSel = { t: g.kind, id: g.obj.id };
      renderMapItems();
      renderMapBottom();
    } else if (g.type === "resize") {
      if (g.nw != null) {
        g.obj.w = g.nw;
        g.obj.h = g.nh;
        save();
      }
      renderMapItems();
    }
  };
  vp.addEventListener("pointerup", up);
  vp.addEventListener("pointercancel", up);
  vp.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      mapActive();
      const r = vp.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false }
  );
}
function renderHallForm() {
  const h = S.halls.find((x) => x.id === sh.id);
  if (!h) {
    closeSheet();
    return;
  }
  sheet.innerHTML = `
    <div class="sh-grab" id="grab"><div class="handle"></div><div class="sh-head sh-plain"><h3 style="flex:1">관 설정</h3></div></div>
    <div class="sh-body">
      <label class="field"><span>관 이름</span><input class="inp" id="hName" value="${esc(h.name)}" placeholder="예: 1관, A홀"></label>
      <p class="desc" style="font-size:13px;color:var(--muted);margin:0 0 14px;line-height:1.55">칸 하나가 반 부스(1자리) 크기예요. 한 부스는 2칸을 차지해요.<br>배치도 크기는 놓은 부스와 구조물에 맞춰 저절로 늘고 줄어요. 가장자리 밖으로 끌어 놓으면 그만큼 넓어져요.</p>
      <div class="btnrow">
${S.halls.length > 1 ? `<button class="btn danger" data-act="halldel">관 삭제</button>` : ""}
<button class="btn pre" data-act="hallsave" style="flex:2">저장</button>
      </div>
    </div>`;
  bindDrag();
}
