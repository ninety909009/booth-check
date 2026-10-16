/* 부스 체크 — 화면: 머리말·수령 방법·부스/체크/정보 탭
   index.html이 js/ 파일들을 정해진 순서로 불러와요. 파일끼리 함수·변수를 그대로 함께 써요(전역). */
"use strict";
/* ---------- header ---------- */
function ddayInfo() {
  return ddayOf(S.event.date);
}
function ddayOf(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return null;
  const [y, m, dd] = d.split("-").map(Number);
  const target = new Date(y, m - 1, dd),
    now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return { t: "D-DAY", c: "today" };
  if (diff > 0) return { t: "D-" + diff, c: "" };
  return { t: "D+" + -diff, c: "past" };
}
const PAY_LABEL = { cash: "현금", transfer: "계좌이체", card: "카드" };
const PAY_SHORT = { cash: "현금", transfer: "이체", card: "카드" };
function payEntry(i) {
  if (i.type === "free") return null;
  return {
    icon: "won",
    label: "결제 수단",
    hint: PAY_LABEL[i.pay] || "미정",
    items: () =>
      [
        ["", "미정"],
        ["cash", "현금"],
        ["transfer", "계좌이체"],
        ["card", "카드"],
      ].map(([v, l]) => ({
        label: l,
        on: (i.pay || "") === v,
        fn: () => {
          i.pay = v;
          changed(v ? `결제 수단: ${l}` : "결제 수단을 비웠어요");
        },
      })),
  };
}
function forNames() {
  const set = new Set(S.people.map((p) => p.nick).filter(Boolean));
  for (const b of S.booths) for (const i of b.items) if (i.forWho) set.add(i.forWho);
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}
async function editFor(b, i) {
  const names = forNames();
  const v = await promptBox(
    `‘${i.name || "이 물품"}’을 누가 부탁했나요?\n비우면 내 물품으로 돌아가요.${names.length ? "\n최근: " + names.slice(0, 6).join(", ") : ""}`,
    "예: 하늘",
    { value: i.forWho || "", yes: "저장", allowEmpty: true }
  );
  if (v === null) return;
  i.forWho = v.trim().slice(0, 30);
  changed(i.forWho ? `대리구매: ${i.forWho}` : "대리구매 표시를 뺐어요");
}
function payBreakdown(lines) {
  const m = { cash: 0, transfer: 0, card: 0, "": 0 };
  for (const i of lines) {
    if (i.maybe || i.type === "free" || isPaid(i)) continue;
    m[i.pay || ""] += amt(i);
  }
  return m;
}
function totals() {
  let pre = 0,
    preF = 0,
    on = 0,
    onF = 0,
    paid = 0,
    unpaid = 0,
    maybe = 0,
    maybeAmt = 0;
  for (const b of S.booths)
    for (const i of linesOf(b)) {
      if (i.maybe) {
        maybe++;
        maybeAmt += amt(i);
        continue;
      }
      if (i.type === "free") continue;
      if (i.type === "pre") {
        pre++;
        if (isFinal(i)) preF++;
      } else {
        on++;
        if (isFinal(i)) onF++;
      }
      if (isPaid(i)) paid += amt(i);
      else unpaid += amt(i);
    }
  return { pre, preF, on, onF, paid, unpaid, maybe, maybeAmt };
}
function sortedSch() {
  return S.event.schedule.slice().sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
}
function isEventToday() {
  const d = ddayInfo();
  return !!d && d.c === "today";
}
function nowHM() {
  const n = new Date();
  return String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0");
}
function schNow() {
  if (!isEventToday()) return { cur: null, nxt: null };
  const list = sortedSch().filter((x) => x.time),
    hm = nowHM();
  let cur = null,
    nxt = null;
  for (const x of list) {
    if (x.time <= hm) cur = x;
    else {
      nxt = x;
      break;
    }
  }
  return { cur, nxt };
}
function nowMin() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}
function hmMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function fmtLeft(m) {
  return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? " " + (m % 60) + "분" : ""}` : `${m}분`;
}
/* ---------- 수령 방법 (실시간 공유됨, 구독자는 읽기 전용) ---------- */
const RECV = [
  ["name4", "성함+번호 끝 4자리"],
  ["idcard", "신분증"],
  ["wfqr", "윗치폼 QR"],
  ["tmmqr", "TMM QR"],
  ["custom", "직접 작성"],
];
const RECV_SHORT = { name4: "성함+번호4", idcard: "신분증", wfqr: "윗치폼 QR", tmmqr: "TMM QR" };
function recvTargets(b) {
  const arts = b.artists.filter((a) => !a.hidden);
  return arts.length ? arts : b.artists.length ? [] : [null];
}
function recvLabels(o, memo, short) {
  return (o.recv || [])
    .map((k) =>
      k === "custom" ? String(memo || "").trim() || "직접 작성" : short ? RECV_SHORT[k] : (RECV.find((x) => x[0] === k) || ["", k])[1]
    )
    .filter(Boolean);
}
function recvText(b, short) {
  const tg = recvTargets(b),
    multi = tg.length > 1;
  return tg
    .map((a) => {
      const l = recvLabels(a || b, a ? a.memo : b.rmemo, short);
      return l.length ? (multi ? (a.nick || "작가") + ": " : "") + l.join(", ") : "";
    })
    .filter(Boolean)
    .join(" / ");
}
let RCV_OPEN = { bid: "", key: null };
/* 물품란 작가 닉네임 옆: 고른 수령 방법만 작게, ✎로 펼쳐서 고치기 */
function rcvHead(b, a, ro) {
  const o = a || b,
    key = a ? a.id : "_b",
    open = RCV_OPEN.bid === b.id && RCV_OPEN.key === key;
  const l = recvLabels(o, a ? a.memo : b.rmemo, true);
  const tags = l.length
    ? `<span class="rtags">${l.map((x) => `<i>${esc(x.length > 24 ? x.slice(0, 23) + "…" : x)}</i>`).join("")}</span>`
    : `<span class="rtags"></span>`;
  const btn = ro
    ? ""
    : `<button type="button" class="rcvbtn${l.length ? "" : " empty"}" data-rcvedit="${key}" aria-expanded="${open}" aria-label="수령 방법 고르기">${l.length ? "✎" : "+ 수령 방법"}</button>`;
  return tags + btn;
}
function rcvEditor(b, a) {
  const key = a ? a.id : "_b";
  if (!(RCV_OPEN.bid === b.id && RCV_OPEN.key === key)) return "";
  const o = a || b,
    rv = o.recv || [],
    memo = a ? a.memo : b.rmemo;
  return `<div class="rcved"><div class="rchips">${RECV.map(([k, l]) => `<button type="button" class="rchip" data-rcv="${k}" data-raid="${key}" aria-pressed="${rv.includes(k)}">${l}</button>`).join("")}</div>${rv.includes("custom") ? `<input class="inp rmemo" data-rmemo="${key}" value="${esc(memo || "")}" placeholder="수령 방법 직접 적기 (예: 트위터 닉네임 말하기)" maxlength="200">` : ""}</div>`;
}
function bindRecv(b) {
  const box = document.getElementById("bItems");
  if (!box) return;
  const tgt = (key) => (key === "_b" ? b : b.artists.find((a) => a.id === key));
  box.addEventListener("click", (e) => {
    const ed = e.target.closest("[data-rcvedit]");
    if (ed) {
      const k = ed.dataset.rcvedit,
        open = RCV_OPEN.bid === b.id && RCV_OPEN.key === k;
      RCV_OPEN = open ? { bid: "", key: null } : { bid: b.id, key: k };
      renderBoothItems();
      return;
    }
    const c = e.target.closest("[data-rcv]");
    if (!c || c.disabled) return;
    const o = tgt(c.dataset.raid);
    if (!o) return;
    const k = c.dataset.rcv,
      rv = new Set(o.recv || []);
    if (rv.has(k)) rv.delete(k);
    else rv.add(k);
    o.recv = RECV.map((x) => x[0]).filter((x) => rv.has(x));
    save();
    renderBoothItems();
    if (k === "custom" && rv.has(k)) {
      const i = box.querySelector(`[data-rmemo="${c.dataset.raid}"]`);
      if (i) i.focus();
    }
  });
  box.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.rmemo == null) return;
    const o = tgt(t.dataset.rmemo);
    if (!o) return;
    if (t.dataset.rmemo === "_b") o.rmemo = t.value.slice(0, 200);
    else o.memo = t.value.slice(0, 200);
    save();
    const h = t.closest(".agbox, .rbarbox");
    const tg = h && h.querySelector(".rtags");
    if (tg) {
      const a = t.dataset.rmemo === "_b" ? null : o;
      tg.outerHTML = rcvHead(b, a, false).replace(/<button[\s\S]*$/, "");
    }
  });
}
function rangeText(a, b) {
  return a && b ? `${a}~${b}` : a ? `${a}~` : b ? `~${b}` : "";
}
function normRange(v) {
  v = str(v || "").trim();
  if (!v) return { from: "", to: "" };
  const m = v.split(/\s*[~〜∼–—-]\s*/);
  if (m.length === 1) {
    const t = normTime(v);
    return t === null ? null : { from: "", to: t };
  }
  if (m.length !== 2) return null;
  const a = m[0] ? normTime(m[0]) : "",
    b = m[1] ? normTime(m[1]) : "";
  return a === null || b === null ? null : { from: a, to: b };
}
/* 시작~끝 구간의 지금 상태. 오늘이 아니면 null */
function spanState(from, to) {
  if (!isEventToday() || (!from && !to)) return null;
  const nm = nowMin(),
    f = from ? hmMin(from) : null,
    t = to ? hmMin(to) : null;
  if (f != null && nm < f) return { phase: "before", left: f - nm };
  if (t != null && nm > t) return { phase: "after" };
  return { phase: "during", left: t != null ? t - nm : null };
}
function pickupState(b) {
  if (!b.pickup && !b.pickupFrom) return null;
  const ls = linesOf(b),
    hasPre = ls.some((i) => i.type === "pre" && !i.maybe),
    pend = ls.some((i) => i.type === "pre" && !i.maybe && i.st < 2);
  if (hasPre && !pend) return { cls: "ok", text: "선입금 수령 완료", pend: false };
  const rt = rangeText(b.pickupFrom, b.pickup);
  if (!isEventToday()) return { cls: "", text: b.pickupFrom ? `수령 ${rt}` : `수령 마감 ${b.pickup}`, pend };
  const nm = nowMin();
  if (b.pickupFrom && nm < hmMin(b.pickupFrom)) {
    const w = hmMin(b.pickupFrom) - nm;
    return { cls: "", text: `수령 ${rt} · ${fmtLeft(w)} 후 시작`, left: b.pickup ? hmMin(b.pickup) - nm : null, wait: w, pend };
  }
  if (!b.pickup) return { cls: "", text: `수령 ${b.pickupFrom}부터 · 지금 가능`, pend };
  const left = hmMin(b.pickup) - nm;
  if (left < 0) return { cls: "late", text: `수령 마감 지남 (${b.pickup})`, left, pend };
  if (left <= 60) return { cls: "soon", text: `수령 마감 ${fmtLeft(left)} 전`, left, pend };
  return { cls: "", text: `수령 마감 ${b.pickup} · ${fmtLeft(left)} 남음`, left, pend };
}
function dlChip(b) {
  const ps = pickupState(b);
  return ps ? `<span class="dl ${ps.cls}">⏰ ${ps.text}</span>` : "";
}
function urgentBooths() {
  if (!isEventToday()) return [];
  return sortedBooths()
    .map((b) => ({ b, ps: pickupState(b) }))
    .filter((x) => x.ps && x.ps.pend && x.ps.left != null && x.ps.left <= 60 && x.ps.left >= -60)
    .sort((a, c) => a.ps.left - c.ps.left);
}
function renderTop() {
  document.body.classList.toggle("ro", isSub());
  const e = S.event,
    dd = ddayInfo(),
    t = totals();
  const sub = [e.date && e.date.replace(/-/g, ". "), e.time, e.place].filter(Boolean).join("\u2002·\u2002");
  document.getElementById("top").innerHTML = `
    <div class="top-row">
      <button class="evbtn" data-act="events" aria-label="행사 바꾸기"><span class="ev-name ${e.name ? "" : "unset"}" role="heading" aria-level="1">${e.name ? esc(e.name) : "행사 이름을 정해 주세요"}</span>${roleBadge(LIB.current)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>${LIB.list.length > 1 ? `<span class="np" style="font-family:var(--body)">${LIB.list.length}개</span>` : ""}</button>
      ${dd ? `<span class="dday ${dd.c}">${dd.t}</span>` : ""}
      <button class="gear" data-tab="info" aria-label="설정" aria-pressed="${view === "info"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>
    </div>
    ${sub ? `<div class="ev-sub">${esc(sub)}</div>` : ""}
    ${(() => {
      const { cur, nxt } = schNow();
      if (!cur && !nxt) return "";
      return `<div class="nowline">${cur ? `<div><span class="np now">지금</span><b>${cur.time}</b>${esc(cur.text)}</div>` : ""}${nxt ? `<div><span class="np">다음</span><b>${nxt.time}</b>${esc(nxt.text)}</div>` : ""}</div>`;
    })()}
    ${(() => {
      const u = urgentBooths();
      if (!u.length) return "";
      return u
        .slice(0, 2)
        .map(
          (x) =>
            `<button class="alertline ${x.ps.cls === "late" ? "late" : ""}" data-act="open" data-id="${x.b.id}"><span>⏰ ${esc(boothCode(x.b))} ${esc(x.b.name || "")} — ${x.ps.text}</span>${u.length > 2 ? `<small>+${u.length - 2}</small>` : ""}</button>`
        )
        .join("");
    })()}
    <div class="stats">
      <div class="stat"><div class="k"><i style="background:var(--pre)"></i>선입금<span class="kx"> 수령</span></div><div class="v">${t.preF}<small> / ${t.pre}</small></div></div>
      <div class="stat"><div class="k"><i style="background:var(--on)"></i>현장<span class="kx"> 구매</span></div><div class="v">${t.onF}<small> / ${t.on}</small></div></div>
      <div class="stat"><div class="k">남은<span class="kx"> 결제</span></div><div class="v">${won(t.unpaid)}${t.maybe ? `<span class="may">+ 고민중 ${t.maybe}개 ${won(t.maybeAmt)}</span>` : ""}</div></div>
    </div>`;
}

/* ---------- views ---------- */
let view = "booths",
  secFilter = "all",
  query = "",
  ckMode = "all",
  ckRemain = false,
  tagFilter = null,
  ckCat = null,
  ckDl = false,
  ckNoMaybe = false;
const main = document.getElementById("main");
const fab = document.getElementById("fab");

let lastTab = "booths";
function setView(v) {
  if (v !== "info") lastTab = v;
  view = v;
  main.classList.toggle("mapmode", v === "map");
  document.getElementById("app").classList.toggle("mapmode", v === "map");
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.tab === v || (v === "info" && t.dataset.tab === lastTab);
    t.setAttribute("aria-selected", String(t.dataset.tab === v));
    t.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll(".gear").forEach((t) => t.setAttribute("aria-pressed", String(v === "info")));
  fab.style.display = v === "booths" ? "" : "none";
  main.scrollTop = 0;
  renderView();
}
function renderView() {
  if (view === "booths") renderBooths();
  else if (view === "check") renderCheck();
  else if (view === "map") renderMap();
  else if (view === "evtab") renderEvTab();
  else if (view === "people") renderPeople();
  else renderInfo();
}
function rerenderSoft() {
  renderTop();
  if (view === "booths") renderBoothList();
  else if (view === "check") renderCheckList();
  else if (view === "map") {
    renderMapItems();
    renderMapBottom();
  } else if (
    view === "evtab" &&
    !(document.activeElement && main.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))
  )
    renderEvTab();
  else if (view === "people") renderPeople();
}

/* booths */
function renderBooths() {
  if (secFilter !== "all" && !S.sections.includes(secFilter)) secFilter = "all";
  main.innerHTML = `
    <div class="toolbar">
      <div class="searchrow">
      <label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
<input id="q" type="search" placeholder="부스 번호, 이름, 물품 검색" value="${esc(query)}" autocomplete="off" enterkeyhint="search"></label>
      <button class="tblbtn" data-act="bulkOpen" aria-label="표로 추가·수정"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/></svg>표</button>
      </div>
      <div class="chipwrap"><div class="chips" id="chips"></div>
      <div class="chips tagrow" id="tagChips"></div></div>
    </div>
    <div class="pad" id="boothList"></div>`;
  renderChips();
  renderBoothList();
}
function renderChips() {
  const el = document.getElementById("chips");
  if (!el) return;
  const cnt = {};
  for (const b of S.booths) cnt[b.section] = (cnt[b.section] || 0) + 1;
  el.innerHTML =
    `<button class="chip" data-act="sec" data-sec="all" aria-pressed="${secFilter === "all"}">전체 <span class="n">${S.booths.length}</span></button>` +
    S.sections
      .map(
        (s) =>
          `<button class="chip sec" style="--sc:${secColor(s)}" data-act="sec" data-sec="${esc(s)}" aria-pressed="${secFilter === s}"><span class="dot"></span>${esc(s)} <span class="n">${cnt[s] || 0}</span></button>`
      )
      .join("");
}
function friendCount() {
  return S.booths.filter((b) => b.isFriend).length;
}
function renderTagChips(id) {
  const el = document.getElementById(id || "tagChips");
  if (!el) return;
  const tags = allTags(),
    fc = friendCount();
  if (tagFilter === "__friend" ? !fc : tagFilter && !tags.some(([t]) => t === tagFilter)) tagFilter = null;
  el.style.display = tags.length || fc ? "" : "none";
  el.innerHTML =
    (fc
      ? `<button class="chip frc" data-act="tagf" data-tag="__friend" aria-pressed="${tagFilter === "__friend"}">♥ 지인 <span class="n">${fc}</span></button>`
      : "") +
    tags
      .map(
        ([t, n]) =>
          `<button class="chip tagc" style="${tagStyle(t)}" data-act="tagf" data-tag="${esc(t)}" aria-pressed="${tagFilter === t}">#${esc(t)} <span class="n">${n}</span></button>`
      )
      .join("");
}
function matchTag(b) {
  return !tagFilter || (tagFilter === "__friend" ? b.isFriend : b.tags.includes(tagFilter));
}
function matchQuery(b, q) {
  if (!q) return true;
  q = q.toLowerCase().replace(/\s+/g, "");
  const hay = (
    boothCode(b) +
    b.section +
    b.num +
    b.name +
    b.memo +
    (b.pmemo || "") +
    b.tags.join("") +
    (b.isFriend ? "지인" + b.friends.join("") : "") +
    b.artists.map((a) => a.nick).join("") +
    b.items.map((i) => i.name + i.note + (i.subs || []).map((x) => x.name).join("")).join("")
  )
    .toLowerCase()
    .replace(/\s+/g, "");
  return hay.includes(q);
}
function boothCard(b) {
  const st = boothStats(b);
  const pct = st.total ? Math.round((st.fin / st.total) * 100) : 0;
  const alldone = st.total > 0 && st.fin === st.total;
  const memo = (b.memo.trim() || String(b.pmemo || "").trim()).split("\n")[0];
  return `<button class="booth ${alldone ? "alldone" : ""} ${b.isFriend ? "friend" : ""}" data-act="open" data-id="${b.id}" style="--sc:${secColor(b.section)}">
    ${stamp(b)}
    <span class="bmain">
      <span class="bname ${b.name ? "" : "none"}">${b.name ? esc(b.name) : "이름 없는 부스"}</span>
      ${
        b.artists.some((a) => a.nick)
          ? `<span class="bartists">${b.artists
              .filter((a) => a.nick)
              .map((a) => esc(a.nick))
              .join(", ")}</span>`
          : ""
      }
      ${(() => {
        const pc = boothPeriods(b).every((x) => x.ps.cls === "ok" || x.ps.cls === "late") ? "" : periodChip(b);
        const m = frChip(b) + evChip(b) + dlChip(b) + pc;
        return m ? `<span class="bmeta">${m}</span>` : "";
      })()}
      ${(() => {
        const parts = [];
        if (st.pre) parts.push(`<span class="ty pre">선입금 ${st.pre}</span>`);
        if (st.on) parts.push(`<span class="ty on">현장 ${st.on}</span>`);
        if (st.free) parts.push(`<span class="ty free">무료 ${st.free}</span>`);
        if (st.must) parts.push(`<span class="ty must">★ ${st.must}</span>`);
        if (st.maybe) parts.push(`<span class="ty may">고민 ${st.maybe}</span>`);
        const tg = b.tags.length
          ? `<span class="btg">${b.tags
              .slice(0, 4)
              .map((t) => "#" + esc(t))
              .join(" ")}${b.tags.length > 4 ? " +" + (b.tags.length - 4) : ""}</span>`
          : "";
        return parts.length || tg ? `<span class="bsum">${parts.join("")}${tg}</span>` : "";
      })()}
      ${memo ? `<span class="bmemo">${esc(memo)}</span>` : ""}
    </span>
    <span class="bcount">${st.total ? `${st.fin}<small>/${st.total}</small>` : `<small>${st.maybe ? "고민중" : b.items.length ? "담은 것 0" : "물품 0"}</small>`}</span>
  </button>`;
}
function renderBoothList() {
  const el = document.getElementById("boothList");
  if (!el) return;
  renderChips();
  renderTagChips();
  if (!S.booths.length) {
    el.innerHTML = `<div class="empty"><strong>아직 등록한 부스가 없어요</strong>오른쪽 아래 ‘부스 추가’로 하나씩 넣거나,<br>표에 여러 부스를 한꺼번에 적을 수 있어요.<div style="margin-top:14px"><button class="btn pre" data-act="bulkOpen">표로 여러 부스 추가</button></div></div>`;
    return;
  }
  let list = sortedBooths().filter((b) => (secFilter === "all" || b.section === secFilter) && matchTag(b) && matchQuery(b, query));
  if (!list.length) {
    el.innerHTML = `<div class="empty"><strong>맞는 부스가 없어요</strong>검색어나 구역·태그 필터를 바꿔 보세요.</div>`;
    return;
  }
  const groups = [];
  for (const b of list) {
    const g = groups[groups.length - 1];
    if (g && g.sec === b.section) g.items.push(b);
    else groups.push({ sec: b.section, items: [b] });
  }
  el.innerHTML = groups
    .map(
      (g) => `<section class="group" style="--sc:${secColor(g.sec)}">
      <div class="ghead"><span class="gletter">${esc(g.sec)}</span><span class="gline"></span><span class="gcount">${g.items.length}개 부스</span></div>
      ${g.items.map(boothCard).join("")}
    </section>`
    )
    .join("");
}

/* item row (shared) */
const ICON_GRIP =
  '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
function artHidden(b, i) {
  const a = b.artists.find((x) => x.id === i.artist);
  return !!(a && a.hidden);
}
function itemRow(b, x, o) {
  o = o || {};
  const L = x && x.i ? x : mkLine(b, x, null),
    want = L.o.want || 0,
    on = want > 0;
  const cls = L.type + (on ? (isFinal(L) ? " fin" : L.type === "pre" && L.st === 1 ? " half" : "") : " off") + (L.maybe ? " maybe" : "");
  const an = o.art !== false && b.artists.length > 1 ? (b.artists.find((a) => a.id === L.artist) || {}).nick || "" : "";
  return `<div class="item ${cls}" data-bid="${b.id}" data-iid="${L.iid}" data-sid="">
    ${o.grip ? `<span class="grip" data-grip aria-label="끌어서 작가 옮기기">${ICON_GRIP}</span>` : ""}
    <button class="ck" data-act="cycle" aria-label="${on ? `${esc(L.name)} 상태 바꾸기, 지금 ${stLabel(L)}` : `${esc(L.name)} 구매 리스트에 담기`}"><span>${ICON_CHECK}${ICON_PAY}</span></button>
    <button class="ibody" data-act="editItem" data-id="${b.id}">
      <div class="iname">${L.must ? '<span class="star">★ </span>' : ""}${esc(L.name || "이름 없는 물품")}</div>
      <div class="isub">${L.maybe ? `<span class="imay">고민중</span>` : ""}<span class="ist">${on ? `${typeLabel(L)} · ${o.step ? stLabel(L).split(" · ")[0] : stLabel(L)}` : L.type === "free" ? "무료 · 안 받기" : typeLabel(L)}</span>${L.cat ? `<span class="icat">${esc(L.cat)}</span>` : ""}${an ? `<span class="iart">${esc(an)}</span>` : ""}${L.pay && L.type !== "free" ? `<span class="ipay ${L.pay}">${PAY_SHORT[L.pay]}</span>` : ""}${L.forWho ? `<span class="ifor">→ ${esc(L.forWho)}</span>` : ""}${L.note ? `<span class="inote">${esc(L.note)}</span>` : ""}</div>
    </button>
    <div class="iprice">${L.type === "free" ? "무료" : won(on ? amt(L) : L.price)}${on && want > 1 && !o.step ? `<small>${L.type === "free" ? "" : won(L.price) + " "}× ${want}</small>` : ""}</div>
    ${o.step && on ? stepHTML(want) : ""}
  </div>`;
}
function stepHTML(n) {
  return n > 0
    ? `<div class="step"><button type="button" data-act="want" data-d="-1" aria-label="하나 빼기">−</button><b>${n}</b><button type="button" data-act="want" data-d="1" aria-label="하나 더 담기">+</button></div>`
    : `<div class="step zero"><button type="button" data-act="want" data-d="1" aria-label="구매 리스트에 담기">+</button></div>`;
}
function catRow(b, i, grip) {
  const subs = i.subs || [],
    tot = subs.length ? subs.reduce((n, x) => n + x.want, 0) : i.want;
  let h = `<div class="crow ${i.type} ${tot > 0 ? "in" : ""} ${i.maybe ? "maybe" : ""}" data-bid="${b.id}" data-iid="${i.id}" data-sid="">
    ${grip ? `<span class="grip" data-grip aria-label="끌어서 작가 옮기기">${ICON_GRIP}</span>` : ""}
    <button class="cbody" data-act="editItem" data-id="${b.id}">
      <div class="cname">${i.must ? '<span class="star">★ </span>' : ""}${esc(i.name || "이름 없는 물품")}</div>
      <div class="isub">${i.maybe ? `<span class="imay">고민중</span>` : ""}${i.cat ? `<span class="icat" style="${tagStyle(i.cat)}">${esc(i.cat)}</span>` : ""}<span class="ctype">${typeLabel(i)}</span>${i.note ? `<span class="inote">${esc(i.note)}</span>` : ""}</div>
    </button>
    <div class="cside"><span class="cprice">${i.type === "free" ? "무료" : won(i.price)}</span></div>
    ${subs.length ? (tot ? `<span class="subcnt">담음 ${tot}</span>` : "") : stepHTML(i.want)}
  </div>`;
  for (const x of subs)
    h += `<div class="crow sub ${i.type} ${x.want > 0 ? "in" : ""}" data-bid="${b.id}" data-iid="${i.id}" data-sid="${x.id}">
    <button class="cbody" data-act="editItem" data-id="${b.id}"><div class="cname">${esc(x.name)}</div>${x.note ? `<div class="isub"><span class="inote">${esc(x.note)}</span></div>` : ""}</button>
    ${x.price != null && x.price !== i.price && i.type !== "free" ? `<span class="cprice">${won(x.price)}</span>` : ""}
    ${stepHTML(x.want)}
  </div>`;
  return h;
}

/* checklist */
function renderCheck() {
  main.innerHTML = `
    <div class="toolbar">
      <div class="seg" id="seg">
<button data-act="mode" data-mode="all" aria-pressed="${ckMode === "all"}">전체</button>
<button class="pre" data-act="mode" data-mode="pre" aria-pressed="${ckMode === "pre"}">선입금</button>
<button class="on" data-act="mode" data-mode="on" aria-pressed="${ckMode === "on"}">현장</button>
<button class="free" data-act="mode" data-mode="free" aria-pressed="${ckMode === "free"}">무료</button>
      </div>
      <button class="ckfold" data-act="ckfold" aria-expanded="${!!UIP.ckBar}" aria-controls="ckOpts"><span class="lbl">보기 옵션<span class="badge" id="ckBadge" hidden></span></span><span class="mm" id="moneyMini"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
      <div id="ckOpts" ${UIP.ckBar ? "" : "hidden"}>
      <div class="row2">
<div class="toggles"><button class="toggle" data-act="remain" aria-pressed="${ckRemain}"><span class="sw"></span>남은 것만</button>
<button class="toggle" data-act="dlsort" aria-pressed="${ckDl}"><span class="sw"></span>수령 시간 빠른 순</button>
<button class="toggle" data-act="nomaybe" aria-pressed="${ckNoMaybe}"><span class="sw"></span>고민중 숨기기</button></div>
<div class="money" id="money"></div>
      </div>
      <div class="chips tagrow" id="catChips"></div>
      </div>
    </div>
    <div class="pad" id="checkList"></div>`;
  renderCheckList();
}
function itemMatch(i) {
  return (ckMode === "all" || i.type === ckMode) && (!ckCat || (ckCat === "__none" ? !i.cat : i.cat === ckCat));
}
function renderCatChips() {
  const el = document.getElementById("catChips");
  if (!el) return;
  const cnt = new Map();
  let none = 0;
  for (const b of S.booths)
    for (const i of linesOf(b)) {
      if (ckMode !== "all" && i.type !== ckMode) continue;
      if (i.cat) cnt.set(i.cat, (cnt.get(i.cat) || 0) + 1);
      else none++;
    }
  const list = S.cats.filter((c) => cnt.has(c)).concat([...cnt.keys()].filter((c) => !S.cats.includes(c)));
  if (ckCat && ckCat !== "__none" && !cnt.has(ckCat)) ckCat = null;
  el.style.display = list.length ? "" : "none";
  el.innerHTML =
    list
      .map(
        (c) =>
          `<button class="chip tagc" style="${tagStyle(c)}" data-act="ckcat" data-cat="${esc(c)}" aria-pressed="${ckCat === c}">${esc(c)} <span class="n">${cnt.get(c)}</span></button>`
      )
      .join("") +
    (none && list.length
      ? `<button class="chip" data-act="ckcat" data-cat="__none" aria-pressed="${ckCat === "__none"}">종류 없음 <span class="n">${none}</span></button>`
      : "");
}
function renderCheckList() {
  const el = document.getElementById("checkList");
  if (!el) return;
  renderCatChips();
  let paid = 0,
    unpaid = 0,
    maybeAmt = 0;
  const blocks = [];
  let order = sortedBooths();
  if (ckDl)
    order = order
      .map((b, k) => ({ b, k }))
      .sort((a, c) => {
        const pk = (b) => (b.pickup ? hmMin(b.pickup) : b.pickupFrom ? hmMin(b.pickupFrom) : 9999),
          x = pk(a.b),
          y = pk(c.b);
        return x - y || a.k - c.k;
      })
      .map((x) => x.b);
  for (const b of order) {
    let items = linesOf(b).filter(itemMatch);
    for (const i of items) {
      if (i.maybe) {
        maybeAmt += amt(i);
        continue;
      }
      if (isPaid(i)) paid += amt(i);
      else unpaid += amt(i);
    }
    if (ckRemain) items = items.filter((i) => !isFinal(i));
    if (ckNoMaybe) items = items.filter((i) => !i.maybe);
    const hidN = items.filter((i) => artHidden(b, i)).length;
    items = items.filter((i) => !artHidden(b, i));
    if (!items.length) continue;
    items = items.slice().sort((a, c) => c.must - a.must || a.maybe - c.maybe || (a.type === c.type ? 0 : a.type === "pre" ? -1 : 1));
    const fin = items.filter((i) => !i.maybe && isFinal(i)).length,
      cntAll = items.filter((i) => !i.maybe).length;
    blocks.push(`<div class="cgroup">
      <button class="chead" data-act="open" data-id="${b.id}"><span class="mini" style="--sc:${secColor(b.section)}">${esc(boothCode(b))}</span><span class="nm">${b.isFriend ? '<span style="color:#C99A00">♥ </span>' : ""}${b.name ? esc(b.name) : "이름 없는 부스"}</span>${dlChip(b)}<span class="cnt">${cntAll ? `${fin}/${cntAll}` : "고민중"}</span></button>
      ${(() => {
        const r = recvText(b, true);
        return r ? `<div class="crcv"><span>수령</span>${esc(r)}</div>` : "";
      })()}
      ${items.map((L) => itemRow(b, L)).join("")}${hidN ? `<div class="hidnote">숨긴 작가 물품 ${hidN}개</div>` : ""}
    </div>`);
  }
  const m = document.getElementById("money");
  const pb = payBreakdown(S.booths.flatMap((b) => linesOf(b).filter(itemMatch)));
  const pbt = [
    ["cash", "현금"],
    ["transfer", "이체"],
    ["card", "카드"],
    ["", "미정"],
  ].filter(([k]) => pb[k] > 0);
  if (m)
    m.innerHTML = `결제 완료 <b>${won(paid)}</b><br>남은 결제 <b>${won(unpaid)}</b>${maybeAmt ? `<br>고민중 <b>${won(maybeAmt)}</b>` : ""}${pbt.length && (pbt.length > 1 || pbt[0][0]) ? `<div class="paybd">${pbt.map(([k, l]) => `<span class="${k || "none"}">${l} <b>${won(pb[k])}</b></span>`).join("")}</div>` : ""}`;
  ckFoldInfo(unpaid);
  if (!blocks.length) {
    const anyItems = S.booths.some((b) => b.items.length);
    el.innerHTML = anyItems
      ? `<div class="empty"><strong>${ckRemain ? "남은 물품이 없어요" : "이 분류에 물품이 없어요"}</strong>${ckRemain ? "다 챙겼어요. 수고했어요!" : "위에서 다른 분류를 골라 보세요."}</div>`
      : `<div class="empty"><strong>체크할 물품이 없어요</strong>부스 탭에서 부스를 열고 살 물품을 추가하면 여기에 모여요.</div>`;
    return;
  }
  /* 다시 그려도 보던 부스가 같은 자리에 있게 (화면 밖 카드는 높이가 어림값이라 그냥 두면 위치가 밀림) */
  const top0 = main.getBoundingClientRect().top;
  const anc = [...el.querySelectorAll(".cgroup")].find((g) => g.getBoundingClientRect().bottom > top0);
  const ancId = anc && anc.querySelector(".chead").dataset.id,
    ancY = anc && anc.getBoundingClientRect().top;
  el.innerHTML = blocks.join("");
  masonry(el);
  const h = ancId && el.querySelector(`.chead[data-id="${ancId}"]`);
  if (h) {
    /* 위쪽 카드가 다음 화면에서 실제 높이로 바뀌므로 두 번 더 맞춤 */
    const g = h.closest(".cgroup"),
      fix = () => {
        if (g.isConnected) main.scrollTop += g.getBoundingClientRect().top - ancY;
      };
    fix();
    requestAnimationFrame(() => {
      fix();
      requestAnimationFrame(fix);
    });
  }
}
/* 카드 쌓기: 넓은 화면에서 카드를 가장 짧은 열에 차례로 넣어 빈칸 없이 채움 */
const MAS_MIN = 380,
  MAS_GAP = 12;
function masonry(el) {
  if (!el) return;
  const cols = [...el.children].filter((c) => c.classList.contains("mcol"));
  let cards = [];
  if (cols.length)
    cards = [...el.querySelectorAll(":scope > .mcol > *")]
      .sort((a, b) => +a.dataset.mi - +b.dataset.mi)
      .concat([...el.children].filter((c) => !c.classList.contains("mcol")));
  else cards = [...el.children];
  const full = cards.filter((c) => c.classList.contains("empty") || c.classList.contains("evhint") || c.classList.contains("mfull"));
  const items = cards.filter((c) => !full.includes(c));
  items.forEach((c, i) => {
    c.dataset.mi = i;
  });
  const w = el.clientWidth - (parseFloat(getComputedStyle(el).paddingLeft) || 0) - (parseFloat(getComputedStyle(el).paddingRight) || 0);
  const n = window.innerWidth >= 900 ? Math.max(1, Math.floor((w + MAS_GAP) / (MAS_MIN + MAS_GAP))) : 1;
  el.innerHTML = "";
  if (n < 2 || items.length < 2) {
    el.classList.remove("mas");
    for (const c of [...items, ...full]) el.appendChild(c);
    return;
  }
  el.classList.add("mas");
  const colEls = Array.from({ length: n }, () => {
    const d = document.createElement("div");
    d.className = "mcol";
    el.appendChild(d);
    return d;
  });
  const hs = new Array(n).fill(0);
  for (const c of items) {
    let k = 0;
    for (let j = 1; j < n; j++) if (hs[j] < hs[k] - 1) k = j;
    colEls[k].appendChild(c);
    hs[k] += c.offsetHeight + MAS_GAP;
  }
  for (const c of full) {
    c.style.flexBasis = "100%";
    el.appendChild(c);
  }
}
let masT = null;
window.addEventListener("resize", () => {
  clearTimeout(masT);
  masT = setTimeout(() => {
    if (view === "check") masonry(document.getElementById("checkList"));
    else if (view === "evtab") masonry(main.querySelector(".evgrid"));
  }, 150);
});

/* info */
function cardHead(title, key) {
  const on = infoEdit.has(key);
  return `<div class="chd"><h2>${title}</h2><button class="btn ${on ? "pre" : "ghost"} sm" data-act="iedit" data-k="${key}">${on ? "완료" : "편집"}</button></div>`;
}
const ICON_UP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
function infoCardEvent() {
  const e = S.event;
  if (!infoEdit.has("event")) {
    const rows = [
      ["이름", e.name],
      ["날짜", e.date ? e.date.replace(/-/g, ". ") + (ddayInfo() ? "  (" + ddayInfo().t + ")" : "") : ""],
      ["시간", e.time],
      ["장소", e.place],
      ["주최", e.host],
      ["안내", e.info],
    ].filter((r) => r[1] && String(r[1]).trim());
    const hostV = () => {
      const u = normSite(e.host);
      return u
        ? `<a class="hostlink" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${ICON_LINK}<span>${esc(/^@/.test(twShow(u)) ? twShow(u) : siteLabel(u))}</span></a>`
        : esc(e.host);
    };
    return `<div class="card">${cardHead("행사 정보", "event")}${rows.length ? rows.map((r) => `<div class="ivrow"><span class="k">${r[0]}</span><span class="v">${r[0] === "주최" ? hostV() : esc(r[1])}</span></div>`).join("") : `<p class="ivempty">아직 적지 않았어요. ‘편집’을 눌러 이름, 날짜, 장소를 적어 보세요.</p>`}</div>`;
  }
  return `<div class="card">${cardHead("행사 정보", "event")}
      <p class="desc">입력하면 바로 저장돼요. 날짜를 넣으면 위에 D-day가 떠요.</p>
      <label class="field"><span>행사 이름</span><input class="inp" data-ev="name" value="${esc(e.name)}" placeholder="예: 가을 동인 행사"></label>
      <div class="grid2">
<label class="field"><span>날짜</span><input class="inp" type="date" data-ev="date" value="${esc(e.date)}"></label>
<label class="field"><span>시간</span><input class="inp" data-ev="time" value="${esc(e.time)}" placeholder="11:00 ~ 17:00"></label>
      </div>
      <label class="field"><span>장소</span><input class="inp" data-ev="place" value="${esc(e.place)}" placeholder="예: OO전시장 2홀"></label>
      <label class="field"><span>주최 트위터(X)</span><input class="inp" data-ev="host" value="${esc(e.host ? (/^@/.test(twShow(e.host)) ? twShow(e.host) : e.host) : "")}" placeholder="@아이디 또는 https://x.com/아이디" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <label class="field" style="margin-bottom:0"><span>안내 메모</span><textarea class="inp" data-ev="info" placeholder="입장 방법, 굿즈 수령 위치 같은 공지">${esc(e.info)}</textarea></label>
    </div>`;
}
function infoCardSch() {
  if (!infoEdit.has("sch")) {
    const list = sortedSch(),
      today = isEventToday(),
      { cur } = schNow();
    return `<div class="card">${cardHead("진행 시간표", "sch")}${list.length ? list.map((x) => `<div class="erow ${today && cur && x.id === cur.id ? "now" : today && x.time && x.time < nowHM() ? "past" : ""}"><b class="et">${x.time || "--:--"}</b><span class="el">${esc(x.text)}</span></div>`).join("") : `<p class="ivempty">아직 일정이 없어요. ‘편집’을 눌러 09:00 부스 입장처럼 적어 보세요.</p>`}</div>`;
  }
  return `<div class="card">${cardHead("진행 시간표", "sch")}
      <p class="desc">시간 순으로 자동 정렬돼요. 행사 당일에는 지금 일정과 다음 일정이 맨 위에 떠요.</p>
      <div id="schList"></div>
      <div class="schadd">
<input class="inp stime" id="newTime" placeholder="09:00" inputmode="numeric" maxlength="5" aria-label="시간 (24시간제)" enterkeyhint="next">
<input class="inp" id="newSch" placeholder="예: 부스 입장" enterkeyhint="done">
<button class="btn" data-act="schadd">추가</button>
      </div>
    </div>`;
}
function exFilled(x) {
  return !!(x.title || x.note.trim() || x.from || x.to || x.place || (x.subs || []).some(subFilled));
}
function subFilled(y) {
  return !!(y.title || y.note.trim() || y.from || y.to);
}
function subsOf(x, all) {
  return (x.subs || []).filter((y) => all || subFilled(y));
}
function sortedExtras(all) {
  return (S.event.extras || [])
    .filter((x) => all || exFilled(x))
    .slice()
    .sort((a, b) => (a.from || a.to || "99").localeCompare(b.from || b.to || "99"));
}
function exFind(xid, sub) {
  const x = (S.event.extras || []).find((y) => y.id === xid);
  return x && sub ? (x.subs || []).find((y) => y.id === sub) : x;
}
function exChip(x) {
  const z = spanState(x.from, x.to);
  if (!z) return "";
  if (z.phase === "after") return `<span class="dl ok">끝남</span>`;
  if (z.phase === "before") return `<span class="dl">${fmtLeft(z.left)} 후</span>`;
  return x.from ? `<span class="dl soon">진행 중</span>` : `<span class="dl ${z.left <= 30 ? "soon" : ""}">${fmtLeft(z.left)} 남음</span>`;
}
function infoCardExtra() {
  const xs = sortedExtras();
  if (!infoEdit.has("ext")) {
    const order = xs.filter((x) => !x.done).concat(xs.filter((x) => x.done));
    const subRow = (
      x,
      y
    ) => `<div class="exsub${y.done ? " done" : ""}"><button type="button" class="exck sm" data-act="exdone" data-xid="${x.id}" data-sub="${y.id}" aria-pressed="${y.done}" aria-label="참여 완료 표시">${y.done ? "✓" : ""}</button>
      <div class="exb"><div class="ext"><b>${esc(y.title || "하위 이벤트")}</b>${y.done ? "" : exChip(y)}${y.from || y.to ? `<span class="exsm">${rangeText(y.from, y.to)}</span>` : ""}</div>${y.note.trim() ? `<div class="exn">${esc(y.note.trim())}</div>` : ""}</div></div>`;
    return `<div class="card">${cardHead("행사 이벤트", "ext")}${
      order.length
        ? order
            .map((x) => {
              const ss = subsOf(x),
                nd = ss.filter((y) => y.done).length;
              return `<div class="exrow${x.done ? " done" : ""}">
<button type="button" class="exck" data-act="exdone" data-xid="${x.id}" aria-pressed="${x.done}" aria-label="참여 완료 표시">${x.done ? "✓" : ""}</button>
<div class="exb"><div class="ext"><b>${esc(x.title || "이벤트")}</b>${ss.length ? `<span class="excnt">${nd}/${ss.length}</span>` : ""}${x.done ? `<span class="dl ok">참여함</span>` : exChip(x)}</div>
  ${x.from || x.to || x.place ? `<div class="exm">${x.from || x.to ? `<span>${rangeText(x.from, x.to)}</span>` : ""}${x.place ? `<span>${esc(x.place)}</span>` : ""}</div>` : ""}
  ${x.note.trim() ? `<div class="exn">${esc(x.note.trim())}</div>` : ""}
  ${
    ss.length
      ? `<div class="exsubs">${ss
          .filter((y) => !y.done)
          .concat(ss.filter((y) => y.done))
          .map((y) => subRow(x, y))
          .join("")}</div>`
      : ""
  }</div></div>`;
            })
            .join("")
        : `<p class="ivempty">스탬프 랠리, 추첨, 입장 특전, 포토존처럼 행사에서 따로 하는 이벤트를 적어 두세요. ‘편집’을 눌러 추가해요.</p>`
    }</div>`;
  }
  const xsAll = sortedExtras(true);
  const tin = (x, y, k, ph) =>
    `<input class="inp stime" data-ex="${k}" data-xid="${x.id}"${y ? ` data-sub="${y.id}"` : ""} value="${esc((y || x)[k])}" placeholder="${ph}" inputmode="numeric" maxlength="5" aria-label="${ph}">`;
  return `<div class="card">${cardHead("행사 이벤트", "ext")}
      <p class="desc">입력하면 바로 저장돼요. 시간은 시작이나 끝 하나만 적어도 돼요. 동그라미 참여 체크는 나만 보여요.</p>
      <div id="exList">${xsAll
        .map(
          (x) => `<div class="exed">
<div class="timerow"><input class="inp" data-ex="title" data-xid="${x.id}" value="${esc(x.title)}" placeholder="이벤트 이름 (예: 스탬프 랠리)" maxlength="80"><button type="button" class="iconbtn danger" data-act="exdel" data-xid="${x.id}" aria-label="이벤트 지우기">${ICON_TRASH}</button></div>
<div class="timerow trng"><span class="tname">시간</span>${tin(x, null, "from", "시작")}<i class="tsep">~</i>${tin(x, null, "to", "끝")}</div>
<input class="inp" data-ex="place" data-xid="${x.id}" value="${esc(x.place)}" placeholder="장소 (예: 2홀 입구)" maxlength="80" style="margin-bottom:8px">
<textarea class="inp" data-ex="note" data-xid="${x.id}" placeholder="내용·참여 조건 (예: 3만원 이상 구매 시 스탬프 1개)" maxlength="1000" style="min-height:64px;margin-bottom:8px">${esc(x.note)}</textarea>
<div class="exsubed">${(x.subs || [])
            .map(
              (y) => `<div class="exsubrow">
  <div class="timerow"><input class="inp" data-ex="title" data-xid="${x.id}" data-sub="${y.id}" value="${esc(y.title)}" placeholder="하위 이벤트 (예: 1관 스탬프)" maxlength="80"><button type="button" class="iconbtn danger" data-act="exdel" data-xid="${x.id}" data-sub="${y.id}" aria-label="하위 이벤트 지우기">${ICON_TRASH}</button></div>
  <div class="timerow trng"><span class="tname">시간</span>${tin(x, y, "from", "시작")}<i class="tsep">~</i>${tin(x, y, "to", "끝")}</div>
  <input class="inp" data-ex="note" data-xid="${x.id}" data-sub="${y.id}" value="${esc(y.note)}" placeholder="메모 (선택)" maxlength="300">
</div>`
            )
            .join("")}
  <button type="button" class="btn ghost sm" data-act="exsubadd" data-xid="${x.id}">+ 하위 이벤트</button></div>
      </div>`
        )
        .join("")}</div>
      <button type="button" class="btn ghost block" data-act="exadd" style="height:42px;margin-top:4px">+ 이벤트 추가</button>
    </div>`;
}
function infoCardSec() {
  const cnt = {};
  for (const b of S.booths) cnt[b.section] = (cnt[b.section] || 0) + 1;
  if (!infoEdit.has("sec")) {
    return `<div class="card">${cardHead("구역", "sec")}${S.sections.length ? `<div class="vchips">${S.sections.map((s) => `<span class="vchip" style="--sc:${secColor(s)}">${esc(s)} <small>${cnt[s] || 0}개</small></span>`).join("")}</div>` : `<p class="ivempty">구역이 없어요. ‘편집’을 눌러 추가하세요.</p>`}</div>`;
  }
  return `<div class="card">${cardHead("구역", "sec")}
      <p class="desc">순서대로 정렬되고 색이 정해져요. 이름을 바꾸면 그 구역 부스도 함께 바뀌어요.</p>
      <div id="secList">${S.sections
        .map(
          (s, idx) => `
<div class="secrow" style="--sc:${secColor(s)}">
  <span class="sw2">${esc(s.slice(0, 2))}</span>
  <input class="inp" data-act="secname" data-old="${esc(s)}" value="${esc(s)}" maxlength="6" aria-label="구역 이름">
  <span class="cnt">${cnt[s] || 0}개</span>
  <button class="iconbtn" data-act="secup" data-i="${idx}" aria-label="위로" ${idx === 0 ? "disabled style='opacity:.35'" : ""}>${ICON_UP}</button>
  <button class="iconbtn danger" data-act="secdel" data-sec="${esc(s)}" aria-label="구역 삭제">${ICON_TRASH}</button>
</div>`
        )
        .join("")}</div>
      <div class="secrow" style="margin-top:12px;margin-bottom:0">
<input class="inp" id="newSec" placeholder="새 구역 (예: E)" maxlength="6">
<button class="btn" data-act="secadd">추가</button>
      </div>
    </div>`;
}
function infoCardTag() {
  const tags = allTags();
  if (!infoEdit.has("tag")) {
    return `<div class="card">${cardHead("부스 태그", "tag")}${tags.length ? `<p class="desc">누르면 그 태그가 달린 부스만 모아 봐요.</p><div class="vchips">${tags.map(([t, n]) => `<button type="button" class="vchip cat tagj" data-act="tagjump" data-tag="${esc(t)}">#${esc(t)} <small>${n}개</small></button>`).join("")}</div>` : `<p class="ivempty">아직 태그가 없어요. 부스 편집에서 태그를 달면 여기서 한꺼번에 이름을 바꾸거나 지울 수 있어요.</p>`}</div>`;
  }
  return `<div class="card">${cardHead("부스 태그", "tag")}
      <p class="desc">이름을 바꾸면 그 태그가 달린 부스 전체에 바로 반영돼요. 이미 있는 태그 이름으로 바꾸면 두 태그가 하나로 합쳐져요.</p>
      ${
        tags.length
          ? tags
              .map(
                ([t, n]) => `<div class="secrow">
  <span class="sw2" style="background:var(--muted);font-family:var(--body);font-size:15px;font-weight:700">#</span>
  <input class="inp" data-act="tagname" data-old="${esc(t)}" value="${esc(t)}" maxlength="20" aria-label="태그 이름">
  <span class="cnt">${n}개</span>
  <button class="iconbtn danger" data-act="tagdel" data-tag="${esc(t)}" aria-label="태그 지우기">${ICON_TRASH}</button>
</div>`
              )
              .join("")
          : `<p class="ivempty">아직 태그가 없어요.</p>`
      }
    </div>`;
}
function infoCardCat() {
  const n = (c) => {
    let k = 0;
    for (const b of S.booths) for (const i of b.items) if (i.cat === c) k++;
    return k;
  };
  if (!infoEdit.has("cat")) {
    return `<div class="card">${cardHead("상품 종류", "cat")}${S.cats.length ? `<div class="vchips">${S.cats.map((c) => `<span class="vchip cat" style="${tagStyle(c)}">${esc(c)} <small>${n(c)}개</small></span>`).join("")}</div>` : `<p class="ivempty">종류가 없어요. ‘편집’을 눌러 추가하세요.</p>`}</div>`;
  }
  return `<div class="card">${cardHead("상품 종류", "cat")}
      <p class="desc">물품을 추가할 때 고르는 드롭다운 목록이에요. 행사마다 따로 저장돼요. 이름을 바꾸면 그 종류로 고른 물품도 함께 바뀌어요.</p>
      <div>${S.cats
        .map(
          (c, idx) => `<div class="secrow" style="${tagStyle(c)}">
  <span class="sw2" style="background:var(--tc);font-family:var(--body);font-size:13px;font-weight:700">${esc(c.slice(0, 2))}</span>
  <input class="inp" data-act="catname" data-old="${esc(c)}" value="${esc(c)}" aria-label="종류 이름">
  <span class="cnt">${n(c)}개</span>
  <button class="iconbtn" data-act="catup" data-i="${idx}" aria-label="위로" ${idx === 0 ? "disabled style='opacity:.35'" : ""}>${ICON_UP}</button>
  <button class="iconbtn danger" data-act="catdel" data-cat="${esc(c)}" aria-label="종류 삭제">${ICON_TRASH}</button>
</div>`
        )
        .join("")}</div>
      <div class="secrow" style="margin-top:12px;margin-bottom:0">
<input class="inp" id="newCat" placeholder="새 종류 (예: 키링)">
<button class="btn" data-act="catadd">추가</button>
      </div>
    </div>`;
}
function sgroup(title, body) {
  return body && body.trim() ? `<section class="sgroup"><h3 class="sgh">${title}</h3>${body}</section>` : "";
}
function renderInfo() {
  const e = S.event;
  main.innerHTML = `<div class="pad setpage">
    <header class="sethead"><h1>설정</h1><p>공유·구역·상품 종류는 지금 보고 있는 <b>${esc(e.name || "이름 없는 행사")}</b>에만 적용돼요.</p></header>
    ${rescueCard()}
    ${sgroup("계정", clCards())}
    ${sgroup(
      "이 행사 공유",
      `${clLiveCard()}
    <div class="card">
      <h2>${CL.on ? "공유 코드로 한 번 보내기" : "공유 코드"}</h2>
      <p class="desc">지금 내용을 코드 하나로 묶어요. 받은 사람이 ‘불러오기’에 붙여 넣으면 같은 부스 목록이 생겨요. 행사·부스 정보는 항상 담기고, 아래에서 고른 것만 더 담겨요.</p>
      <div class="shareopts" id="shareOpts">
<label class="checkline"><input type="checkbox" id="shItems"><span>구매 리스트<small>담은 물품과 수량, 꼭 사기·고민중 표시</small></span></label>
<label class="checkline sub"><input type="checkbox" id="shSt" disabled><span>구매 체크 상태도<small>입금·수령·구매 완료 체크</small></span></label>
<label class="checkline"><input type="checkbox" id="shPeople"><span>지인<small>지인 탭, 부스의 지인 표시</small></span></label>
<label class="checkline"><input type="checkbox" id="shMemo"><span>내 메모·태그<small>부스 메모, 태그</small></span></label>
      </div>
      <div class="btnrow"><button class="btn pre" data-act="mkcode">공유 코드 만들기</button><button class="btn ghost" data-act="mktext">글로 만들기</button></div>
      <div id="codeOut"></div>
      <div id="textOut"></div>
    </div>`
    )}
    ${sgroup(
      "불러오기·백업",
      `<div class="card">
      <h2>코드 불러오기</h2>
      <p class="desc">받은 공유 코드를 붙여 넣으세요.${CL.on ? " BCL-로 시작하면 구독, BCE-로 시작하면 공동 편집으로 추가돼요." : ""}</p>
      <textarea class="inp out" id="codeIn" placeholder="${CL.on ? "BC1:…, BCL-…, BCE-… 로 시작하는 코드" : "BC1:… 로 시작하는 코드"}"></textarea>
      <div class="btnrow" style="margin-top:10px"><button class="btn" data-act="import">불러오기</button></div>
    </div>
    <div class="card">
      <h2>백업 파일</h2>
      <p class="desc">이 행사의 모든 내용(체크·메모 포함)을 파일 하나로 저장하거나, 저장해 둔 파일을 열어요.</p>
      <div class="btnrow"><button class="btn ghost" id="dlBtn" data-act="download" style="display:none">백업 파일 저장</button>
<label class="btn ghost" style="position:relative">백업 파일 열기<input type="file" id="fileIn" accept=".json,.txt,application/json,text/plain" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div>
    </div>`
    )}
    ${sgroup("이 행사 설정", infoCardSec() + infoCardCat() + infoCardTag())}
    ${sgroup("앱 설치", pwaCard())}
    ${sgroup(
      "행사 관리",
      `<div class="card">
      <div class="mgrow"><div><b>행사 목록</b><small>다른 행사로 바꾸거나 새 행사를 만들어요. 맨 위 행사 이름을 눌러도 돼요.</small></div><button class="btn ghost sm" data-act="events">열기</button></div>
      <div class="mgrow"><div><b>이 행사 지우기</b><small>부스·물품·체크 기록이 모두 사라지고 되돌릴 수 없어요.</small></div><button class="btn danger sm" data-act="reset">지우기</button></div>
    </div>`
    )}
  </div>`;
  if (downloads || canBlobDl) document.getElementById("dlBtn").style.display = "";
  const shI = document.getElementById("shItems"),
    shS = document.getElementById("shSt");
  if (shI && shS)
    shI.addEventListener("change", () => {
      shS.disabled = !shI.checked;
      if (!shI.checked) shS.checked = false;
    });
  document.getElementById("fileIn").addEventListener("change", async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    try {
      const txt = await f.text();
      await doImport(txt);
    } catch (e) {
      toast("파일을 읽지 못했어요");
    }
    ev.target.value = "";
  });
}

function renderSchList() {
  const el = document.getElementById("schList");
  if (!el) return;
  const list = sortedSch();
  if (!list.length) {
    el.innerHTML = `<p class="desc" style="margin:0">아직 일정이 없어요. 아래에 시간과 내용을 넣어 추가하세요.</p>`;
    return;
  }
  const today = isEventToday(),
    hm = nowHM(),
    { cur } = schNow();
  el.innerHTML = list
    .map((x) => {
      const cls = !today || !x.time ? "" : cur && x.id === cur.id ? "now" : x.time < hm ? "past" : "";
      return `<div class="schrow ${cls}">
      <input class="inp stime" inputmode="numeric" maxlength="5" data-sch="time" data-sid="${x.id}" value="${esc(x.time)}" aria-label="시간">
      <input class="inp stext" data-sch="text" data-sid="${x.id}" value="${esc(x.text)}" aria-label="일정 내용">
      <button class="iconbtn danger" data-act="schdel" data-sid="${x.id}" aria-label="일정 삭제">${ICON_TRASH}</button>
    </div>`;
    })
    .join("");
}
setInterval(() => {
  renderTop();
  const el = document.getElementById("schList");
  if (el && !el.contains(document.activeElement)) renderSchList();
}, 60000);
