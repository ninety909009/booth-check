/* 부스 체크 — 공유 코드(백업)·아래에서 올라오는 시트(부스·물품 편집)·물품 여러 개 선택
   index.html이 js/ 파일들을 정해진 순서로 불러와요. 파일끼리 함수·변수를 그대로 함께 써요(전역). */
"use strict";
/* ---------- share code ---------- */
function b64urlFromBytes(bytes) {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function bytesFromB64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s),
    out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function pipe(bytes, Stream, fmt, max) {
  const st = new Blob([bytes]).stream().pipeThrough(new Stream(fmt));
  if (!max) return new Uint8Array(await new Response(st).arrayBuffer());
  const rd = st.getReader(),
    parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      try {
        rd.cancel();
      } catch (e) {}
      throw new Error("데이터가 너무 커서 열 수 없어요");
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const x of parts) {
    out.set(x, o);
    o += x.length;
  }
  return out;
}
const MAX_INFLATE = 30 * 1024 * 1024;
const SHARE_ALL = { items: true, status: true, people: true, memo: true };
function shareOpts() {
  const g = (id) => {
    const el = document.getElementById(id);
    return !!(el && el.checked);
  };
  const items = g("shItems");
  return { items, status: items && g("shSt"), people: g("shPeople"), memo: g("shMemo") };
}
function exportData(o) {
  o = o || {};
  const d = JSON.parse(JSON.stringify(S));
  for (const b of d.booths) {
    if (!o.items) b.items = [];
    else if (!o.status)
      b.items.forEach((i) => {
        i.st = 0;
      });
    if (!o.people) {
      b.isFriend = false;
      b.friends = [];
    }
    if (!o.memo) {
      b.memo = "";
      b.pmemo = "";
      b.tags = [];
      b.artists.forEach((a) => {
        a.hidden = false;
      });
    }
  }
  if (!o.people) d.people = [];
  return { app: "boothcheck", v: 1, d };
}
async function makeCode(o) {
  let bytes = new TextEncoder().encode(JSON.stringify(exportData(o)));
  if (typeof CompressionStream !== "undefined") {
    try {
      return "BC1z:" + b64urlFromBytes(await pipe(bytes, CompressionStream, "deflate-raw"));
    } catch (e) {}
  }
  return "BC1:" + b64urlFromBytes(bytes);
}
async function parseCode(raw) {
  raw = raw.trim();
  if (raw.startsWith("{")) return JSON.parse(raw);
  const m = raw.replace(/\s+/g, "").match(/^(BC1z?):([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error("형식이 맞지 않는 코드예요");
  let bytes = bytesFromB64url(m[2]);
  if (m[1] === "BC1z") {
    if (typeof DecompressionStream === "undefined") throw new Error("이 브라우저에서는 이 코드를 열 수 없어요");
    bytes = await pipe(bytes, DecompressionStream, "deflate-raw", MAX_INFLATE);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function doImport(raw) {
  if (!raw || !raw.trim()) {
    toast("코드를 먼저 붙여 넣어 주세요");
    return;
  }
  const live = parseLive(raw);
  if (live && !raw.trim().startsWith("{") && !/^BC1z?:/.test(raw.trim())) {
    if (!CL.on) {
      toast("이 화면에서는 실시간 공유 코드를 쓸 수 없어요");
      return;
    }
    if (live.key) await clJoinEdit(live.code, live.key);
    else await clSubscribe(live.code);
    const ci = document.getElementById("codeIn");
    if (ci) ci.value = "";
    return;
  }
  let obj;
  try {
    obj = await parseCode(raw);
  } catch (e) {
    toast(e.message && /[가-힣]/.test(e.message) ? e.message : "코드가 잘렸거나 잘못됐어요");
    return;
  }
  if (!obj || obj.app !== "boothcheck" || !obj.d) {
    toast("부스 체크용 코드가 아니에요");
    return;
  }
  const nb = Array.isArray(obj.d.booths) ? obj.d.booths.length : 0;
  const nm = str(obj.d.event && obj.d.event.name).slice(0, 100) || "이름 없는 행사";
  const choice = await choiceBox(`‘${nm}’ 코드예요. 부스 ${nb}개가 들어 있어요.\n어떻게 불러올까요?`, [
    { label: "새 행사로 추가", v: "new", cls: "pre" },
    { label: "지금 행사 덮어쓰기", v: "over", cls: "danger" },
  ]);
  if (!choice) return;
  if (choice === "new") {
    const id = addEvent(normalize(obj.d));
    switchEvent(id);
    toast(`‘${nm}’를 새 행사로 추가했어요`);
  } else {
    S = normalize(obj.d);
    flush();
    resetUI();
    renderTop();
    renderView();
    toast("지금 행사를 덮어썼어요");
  }
}
function makeText(o) {
  o = o || {};
  const includeSt = o.status;
  const e = S.event,
    L = [];
  if (e.name) L.push("■ " + e.name);
  const when = [e.date, e.time].filter(Boolean).join(" ");
  if (when) L.push("일시: " + when);
  if (e.place) L.push("장소: " + e.place);
  if (e.host) L.push("주최: " + twShow(e.host) + (twShow(e.host) !== e.host ? "  " + e.host : ""));
  if (e.info.trim()) L.push("", e.info.trim());
  const sch = sortedSch().filter((x) => x.time || x.text);
  if (sch.length) {
    L.push("", "[진행 시간표]");
    for (const x of sch) L.push(`${x.time || "--:--"} ${x.text}`);
  }
  {
    const xs = sortedExtras();
    if (xs.length) {
      L.push("", "[행사 이벤트]");
      for (const x of xs) {
        L.push(`- ${x.title || "이벤트"}${x.from || x.to ? "  " + rangeText(x.from, x.to) : ""}${x.place ? "  @" + x.place : ""}`);
        if (x.note.trim()) L.push("  " + x.note.trim().replace(/\n/g, " / "));
        for (const y of subsOf(x))
          L.push(
            `  · ${y.title || "하위 이벤트"}${y.from || y.to ? "  " + rangeText(y.from, y.to) : ""}${y.note.trim() ? "  (" + y.note.trim() + ")" : ""}`
          );
      }
    }
  }
  let cur = null;
  for (const b of sortedBooths()) {
    if (b.section !== cur) {
      cur = b.section;
      L.push("", `[${cur} 구역]`);
    }
    L.push(
      `${boothCode(b)} ${b.name || "(이름 없음)"} · ${seatLabel(b)}${o.memo && b.tags.length ? "  " + b.tags.map((t) => "#" + t).join(" ") : ""}`
    );
    if (o.items)
      for (const i of linesOf(b)) {
        const mark = includeSt ? (isFinal(i) ? "✅ " : i.type === "pre" && i.st === 1 ? "💸 " : "⬜ ") : "- ";
        L.push(
          `  ${mark}${i.must ? "★" : ""}[${typeLabel(i)}]${i.cat ? "[" + i.cat + "]" : ""} ${i.name} ${i.type === "free" ? "무료" : won(i.price)}${i.qty > 1 ? " ×" + i.qty : ""}${i.note ? " (" + i.note + ")" : ""}${i.forWho ? " (→ " + i.forWho + ")" : ""}${i.maybe ? " (고민중)" : ""}`
        );
      }
    for (const a of b.artists)
      L.push(
        `  작가: ${a.nick || "-"}${a.site ? " " + a.site : ""}${a.info ? "  인포: " + a.info : ""}${periodsOf(a)
          .map((p) => "  " + kindWord(p) + ": " + periodText(p) + (p.link ? " " + p.link : ""))
          .join("")}${(a.imgs || []).length ? "  인포 이미지: " + a.imgs.join(" ") : ""}`
      );
    if (o.people && b.isFriend) L.push("  지인: " + (b.friends.length ? b.friends.join(", ") : "♥"));
    {
      const r = recvText(b);
      if (r) L.push("  수령 방법: " + r);
    }
    if (b.openFrom || b.openTo) L.push("  부스 운영: " + rangeText(b.openFrom, b.openTo));
    if (b.pickupFrom) L.push("  선입금 수령: " + rangeText(b.pickupFrom, b.pickup));
    else if (b.pickup) L.push("  선입금 수령 마감: " + b.pickup);
    if (b.times.length)
      L.push(
        "  시간·이벤트: " +
          b.times
            .slice()
            .sort((x, y) => (x.time || x.end || "99").localeCompare(y.time || y.end || "99"))
            .map(
              (x) =>
                `${rangeText(x.time, x.end) ? rangeText(x.time, x.end) + " " : ""}${x.label}${x.text ? " " + x.text : ""}${x.note ? " (" + x.note + ")" : ""}`
            )
            .join(", ")
      );
    if (o.memo && b.memo.trim()) L.push("  메모: " + b.memo.trim().replace(/\n/g, " / "));
  }
  return L.join("\n").trim();
}

/* downloads capability (only inside the claude.ai viewer) */
let downloads = null;
/* outside the claude.ai viewer (e.g. GitHub Pages) a plain file download works */
const canBlobDl = !(window.claude && typeof window.claude.use === "function");
try {
  if (window.claude && typeof window.claude.use === "function") {
    window.claude
      .use("downloads")
      .then((d) => {
        downloads = d;
        const b = document.getElementById("dlBtn");
        if (b && d) b.style.display = "";
      })
      .catch(() => {});
  }
} catch (e) {}

/* ---------- sheet ---------- */
const sheet = document.getElementById("sheet"),
  scrim = document.getElementById("scrim");
let sh = null; // {kind:'booth'|'boothForm'|'item', id, iid, fromBooth}
let sheetOpenedAt = 0;
function openSheet(state) {
  sh = state;
  sheetOpenedAt = Date.now();
  renderSheet();
  requestAnimationFrame(() => {
    sheet.classList.add("show");
    scrim.classList.add("show");
  });
}
function closeSheet() {
  if (!sh) return;
  ISEL = null;
  sheet.classList.remove("show");
  scrim.classList.remove("show");
  if (document.activeElement && sheet.contains(document.activeElement)) document.activeElement.blur();
  sh = null;
  flush();
  rerenderSoft();
  clFlushPending();
}
async function tryClose() {
  if (sh && sh.kind === "bulk" && bulkHasData() && !(await confirmBox("표에 적은 내용이 사라져요. 닫을까요?", "닫기", true))) return;
  closeSheet();
}
scrim.addEventListener("click", () => {
  if (Date.now() - sheetOpenedAt > 400) tryClose();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sh && !document.getElementById("dlg").classList.contains("show")) tryClose();
});

function renderSheet() {
  if (!sh) return;
  sheet.classList.toggle("full", sh.kind === "bulk");
  if (sh.kind === "booth") renderBoothSheet();
  else if (sh.kind === "boothForm") renderBoothForm();
  else if (sh.kind === "item") renderItemForm();
  else if (sh.kind === "hall") renderHallForm();
  else if (sh.kind === "bulk") renderBulk();
  else if (sh.kind === "events") renderEvents();
  else if (sh.kind === "person") renderPersonForm();
  else if (sh.kind === "wf") renderWitch();
  const body = sheet.querySelector(".sh-body");
  if (body) body.scrollTop = 0;
}

function artOptions(b, sel) {
  return (
    `<option value="">공통</option>` +
    b.artists
      .map(
        (a, k) =>
          `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${esc(a.nick || (a.site ? siteLabel(a.site) : "작가 " + (k + 1)))}</option>`
      )
      .join("")
  );
}
function boothCountText(b) {
  const st = boothStats(b);
  return st.total ? `${st.fin}/${st.total} 완료` : b.items.length ? `${b.items.length}개` : "";
}
const IC = {
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
};
function spanChip(from, to) {
  const z = spanState(from, to);
  if (!z) return "";
  if (z.phase === "before") return `<span class="dl">${fmtLeft(z.left)} 후</span>`;
  if (z.phase === "after") return `<span class="dl ok">${from && to ? "끝남" : "지남"}</span>`;
  if (!from) return `<span class="dl ${z.left <= 30 ? "soon" : ""}">${fmtLeft(z.left)} 남음</span>`;
  return `<span class="dl soon">진행 중${z.left != null && z.left <= 60 ? " · " + fmtLeft(z.left) + " 남음" : ""}</span>`;
}
/* 부스 화면 정보 목록: 작가·기간·운영·수령·이벤트를 같은 모양의 줄로 */
function boothInfoList(b) {
  const rows = [],
    multi = b.artists.length > 1;
  const row = (icon, k, v, sub, right, cls) =>
    rows.push(
      `<div class="ir${cls ? " " + cls : ""}"><span class="ic">${icon}</span><span class="k">${k}</span><span class="v">${v}${sub ? `<small>${sub}</small>` : ""}</span>${right ? `<span class="rt">${right}</span>` : ""}</div>`
    );
  for (const a of b.artists) {
    const nk = esc(a.nick || (a.site ? siteLabel(a.site) : "작가")),
      handle = a.site ? esc(/^@/.test(twShow(a.site)) ? twShow(a.site) : siteLabel(a.site)) : "";
    const v = a.site ? `<a class="alink" href="${esc(a.site)}" target="_blank" rel="noopener noreferrer">${nk}</a>` : nk;
    const imgs = a.imgs || [];
    row(
      CI.user,
      "작가",
      v,
      handle,
      `${a.info ? `<a class="lk" href="${esc(a.info)}" target="_blank" rel="noopener noreferrer">인포 ↗</a>` : ""}${imgs.length ? `<button type="button" class="lk pri" data-act="infoWrite" data-bid="${b.id}" data-aid="${a.id}">보며 적기</button>` : ""}`,
      a.hidden ? "dim" : ""
    );
    if (imgs.length)
      rows.push(
        `<div class="ir thumbs"><span class="ic">${IC.img}</span><div class="athumbs">${imgThumbs(imgs, "athumb", b.id, a.id)}</div></div>`
      );
  }
  for (const x of boothPeriods(b))
    row(
      IC.cal,
      kindWord(x.p),
      esc(periodText(x.p)),
      multi && x.label ? esc(x.label) : "",
      `<span class="dl ${x.ps.cls}">${esc(stripKind(x.ps.text))}</span>${x.p.link ? `<a class="lk" href="${esc(x.p.link)}" target="_blank" rel="noopener noreferrer">폼 ↗</a>` : ""}`
    );
  if (b.openFrom || b.openTo) row(IC.clock, "운영", rangeText(b.openFrom, b.openTo), "", spanChip(b.openFrom, b.openTo));
  if (b.pickup || b.pickupFrom) {
    const ps = pickupState(b);
    let c = "";
    if (ps) {
      if (ps.cls === "ok") c = `<span class="dl ok">수령 완료</span>`;
      else if (ps.wait != null) c = `<span class="dl">${fmtLeft(ps.wait)} 후</span>`;
      else if (ps.cls === "late") c = `<span class="dl late">지남</span>`;
      else if (ps.left == null) c = isEventToday() ? `<span class="dl soon">수령 가능</span>` : "";
      else
        c = ps.cls === "soon" ? `<span class="dl soon">${fmtLeft(ps.left)} 전</span>` : `<span class="dl">${fmtLeft(ps.left)} 남음</span>`;
    }
    row(IC.box, "수령", b.pickupFrom ? rangeText(b.pickupFrom, b.pickup) : `${b.pickup} 마감`, "", c);
  }
  const ts = (b.times || []).slice().sort((x, y) => (x.time || x.end || "99").localeCompare(y.time || y.end || "99"));
  for (const x of ts) {
    const ev = !NON_EVENT.includes(x.label),
      rg = x.time && !x.end ? x.time : rangeText(x.time, x.end),
      chip = rg ? (x.end ? spanChip(x.time, x.end) : spanChip("", x.time)) : "";
    if (ev)
      row(
        ICON_GIFT,
        "이벤트",
        esc(x.text || x.label || "이벤트"),
        [x.text ? x.label : "", rg, x.note].filter(Boolean).map(esc).join(" · "),
        chip,
        "ev"
      );
    else row(IC.clock, esc(x.label || "시간"), rg || "--:--", "", chip);
  }
  return rows.length ? `<div class="binfo2">${rows.join("")}</div>` : "";
}
function renderBoothSheet() {
  const b = findBooth(sh.id);
  if (!b) {
    closeSheet();
    return;
  }
  const curArt = lastArt.bid === b.id && b.artists.some((a) => a.id === lastArt.aid) ? lastArt.aid : "";
  const hl = b.pos && S.halls.find((h) => h.id === b.pos.hall);
  sheet.innerHTML = `
    <div class="sh-grab" id="grab"><div class="handle"></div>
      <div class="sh-head">
${stamp(b)}
<div class="sh-title"><h3>${b.name ? esc(b.name) : "이름 없는 부스"}</h3>
  ${frChip(b) || b.tags.length ? `<div class="bmeta">${frChip(b)}${b.tags.map(tagChip).join("")}</div>` : ""}</div>
<div class="shbtns"><button class="ibtn2" data-act="${hl ? "showOnMap" : "placeOnMap"}" aria-label="${hl ? `배치도에서 위치 보기 (${esc(hl.name)})` : "배치도에 놓기"}" title="${hl ? `배치도에서 위치 보기 (${esc(hl.name)})` : "배치도에 놓기"}">${CI.pin}</button><button class="ibtn2" data-act="editBooth" aria-label="부스 편집" title="부스 편집">${CI.edit}</button></div>
      </div>
    </div>
    <div class="sh-body">
      <div class="bstrip" id="bSums"></div>
      ${boothInfoList(b)}
      <div class="addhead"><h4>구매 리스트</h4><span id="bCount" class="hc"></span><button class="btn ghost sm" data-act="wfOpen">윗치폼</button><button class="ibtn2 sm" data-act="bMore" id="iselBtn" aria-label="더 보기">${CI.more}</button></div>
      <div class="itembox" id="bItems"></div>
      <div id="iselBar"></div>
      <button type="button" class="qadd" data-act="toggleAdd" id="qAdd" ${UIP.addOpen ? "hidden" : ""}>${CI.plus}<span>물품 추가 (이름, 가격)</span></button>
      <div class="addbox" id="addBox" ${UIP.addOpen ? "" : "hidden"}>
<div class="addboxh"><b>물품 추가</b><button type="button" class="btn ghost sm" data-act="toggleAdd">닫기</button></div>
${b.artists.length > 1 ? `<select class="inp" id="nArt" aria-label="작가" style="margin-bottom:8px">${artOptions(b, curArt)}</select>` : ""}
<div class="addtop">
  <select class="inp" id="nCat" aria-label="상품 종류">${catOptions(lastCat)}</select>
  <input class="inp" id="nName" placeholder="물품 이름" enterkeyhint="next">
</div>
<div class="rowp">
  <input class="inp" id="nPrice" placeholder="가격(원)" inputmode="numeric" enterkeyhint="done">
  <input class="inp qty" id="nQty" value="" placeholder="수량 1" inputmode="numeric" aria-label="수량" style="flex:none;width:84px">
  <button type="button" class="maytog" id="nMaybe" aria-pressed="${lastMaybe}">고민중</button>
</div>
<div class="rowx">
  <div class="pick" id="nType">
    <button class="pre" data-type="pre" aria-pressed="${lastType === "pre"}">선입금</button>
    <button class="on" data-type="on" aria-pressed="${lastType === "on"}">현장</button>
    <button class="free" data-type="free" aria-pressed="${lastType === "free"}">무료</button>
  </div>
  <button class="btn pre" id="nAdd" style="padding:0 16px">추가</button>
</div>
      </div>
      ${
        lockedBooth(b)
          ? `${b.memo.trim() ? `<div class="memocard"><span>부스 메모 (원본)</span><div class="romemo">${esc(b.memo)}</div></div>` : ""}
      <label class="memocard"><span>내 메모</span><textarea id="bPMemo" placeholder="나만 보는 메모" rows="2">${esc(b.pmemo || "")}</textarea></label>`
          : `<label class="memocard"><span>부스 메모</span><textarea id="bMemo" placeholder="위치 힌트, 줄 서는 방향 등" rows="2">${esc(b.memo)}</textarea></label>`
      }
    </div>`;
  renderBoothItems();
  const memo = document.getElementById("bMemo");
  if (memo)
    memo.addEventListener("input", () => {
      b.memo = memo.value;
      save();
    });
  const pmemo = document.getElementById("bPMemo");
  if (pmemo)
    pmemo.addEventListener("input", () => {
      b.pmemo = pmemo.value;
      save();
    });
  bindRecv(b);
  document.getElementById("bItems").addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.amemo == null) return;
    const a = b.artists.find((x) => x.id === t.dataset.amemo);
    if (a) {
      a.memo = t.value.slice(0, 200);
      save();
    }
  });
  document.getElementById("nType").addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    lastType = t.dataset.type;
    document.querySelectorAll("#nType button").forEach((x) => x.setAttribute("aria-pressed", String(x === t)));
    document.getElementById("nPrice").placeholder = lastType === "free" ? "무료 (비워 두기)" : "가격(원)";
  });
  const nArt = document.getElementById("nArt");
  if (nArt)
    nArt.addEventListener("change", () => {
      lastArt = { bid: b.id, aid: nArt.value };
    });
  const add = () => {
    const nm = document.getElementById("nName"),
      pr = document.getElementById("nPrice"),
      q = document.getElementById("nQty");
    const name = nm.value.trim();
    if (!name) {
      nm.focus();
      toast("물품 이름을 적어 주세요");
      return;
    }
    const want = Math.max(1, parseInt(q.value, 10) || 1);
    b.items.push({
      id: uid(),
      name: name.slice(0, 60),
      price: lastType === "free" ? 0 : parsePrice(pr.value),
      want,
      type: lastType,
      st: 0,
      must: false,
      maybe: lastMaybe,
      note: "",
      cat: lastCat,
      sample: "",
      artist: soleArtist(b) || (nArt ? nArt.value : ""),
    });
    save();
    nm.value = "";
    pr.value = "";
    q.value = "";
    renderBoothItems();
    renderTop();
    nm.focus();
  };
  document.getElementById("nAdd").addEventListener("click", add);
  bindCatSelect(
    document.getElementById("nCat"),
    () => lastCat,
    (v) => {
      lastCat = v;
    }
  );
  document.getElementById("nMaybe").addEventListener("click", (e) => {
    lastMaybe = !lastMaybe;
    e.currentTarget.setAttribute("aria-pressed", String(lastMaybe));
  });
  document.getElementById("nName").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !imeBusy(e)) {
      e.preventDefault();
      document.getElementById("nPrice").focus();
    }
  });
  document.getElementById("nPrice").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !imeBusy(e)) {
      e.preventDefault();
      add();
    }
  });
  bindDrag();
}
let lastType = "on",
  lastCat = "",
  lastMaybe = false,
  lastArt = { bid: "", aid: "" };
function parsePrice(v) {
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}
/* ---------- 물품 여러 개 골라서 한꺼번에 바꾸기·지우기 ---------- */
let ISEL = null; // {bid, ids:Set}
function iselItems(b) {
  return ISEL ? b.items.filter((i) => ISEL.ids.has(i.id)) : [];
}
function iselDraw(b) {
  const box = document.getElementById("bItems"),
    bar = document.getElementById("iselBar"),
    btn = document.getElementById("iselBtn");
  if (btn) {
    btn.innerHTML = ISEL ? "완료" : CI.more;
    btn.dataset.act = ISEL ? "iselOn" : "bMore";
    btn.classList.toggle("on", !!ISEL);
    btn.setAttribute("aria-label", ISEL ? "고르기 끝내기" : "더 보기");
  }
  if (!box || !bar) return;
  box.classList.toggle("selecting", !!ISEL);
  if (!ISEL) {
    bar.innerHTML = "";
    return;
  }
  for (const ids of [...ISEL.ids]) if (!b.items.some((i) => i.id === ids)) ISEL.ids.delete(ids);
  box.querySelectorAll(".item[data-iid]").forEach((r) => {
    if (!r.querySelector(".iselck")) r.insertAdjacentHTML("afterbegin", '<span class="iselck" aria-hidden="true"></span>');
    const on = ISEL.ids.has(r.dataset.iid);
    r.classList.toggle("picked", on);
    r.setAttribute("aria-selected", String(on));
  });
  const n = ISEL.ids.size,
    all = b.items.length && n === b.items.length;
  bar.innerHTML = `<div class="iselbar"><button type="button" class="btn ghost sm" data-act="iselAll">${all ? "모두 해제" : "모두 고르기"}</button><span class="iseln"><b>${n}</b>개 골랐어요</span><button type="button" class="btn ghost sm" data-act="iselEdit" ${n ? "" : "disabled"}>바꾸기</button><button type="button" class="btn danger sm" data-act="iselDel" ${n ? "" : "disabled"}>삭제</button></div>`;
}
function iselMenu(b) {
  const its = iselItems(b),
    n = its.length,
    open = its.filter((i) => !lockedItem(i)),
    paid = its.filter((i) => i.type !== "free"),
    free = its.filter((i) => i.type === "free");
  const done = (msg) => changed(msg);
  const all = [{ id: "", nick: "공통" }, ...b.artists];
  return [
    {
      title: `물품 ${n}개 한꺼번에 바꾸기`,
      sub: open.length < n ? `공유받은 물품 ${n - open.length}개는 판매 형태·종류·작가를 바꿀 수 없어요` : "",
    },
    open.length
      ? {
          icon: "tag",
          label: "판매 형태",
          items: () =>
            [
              ["pre", "선입금"],
              ["on", "현장 구매"],
              ["free", "무료 배포"],
            ].map(([t, l]) => ({
              label: l,
              on: open.every((i) => i.type === t),
              fn: () => {
                open.forEach((i) => {
                  i.type = t;
                  if (t !== "pre") {
                    if (i.st > 1) i.st = 1;
                    (i.subs || []).forEach((x) => {
                      if (x.st > 1) x.st = 1;
                    });
                  }
                  if (t === "free") i.pay = "";
                });
                done(`${open.length}개를 ${l}${josaRo(l)} 바꿨어요`);
              },
            })),
        }
      : null,
    open.length
      ? {
          icon: "tag",
          label: "상품 종류",
          items: () =>
            ["", ...S.cats].map((c) => ({
              label: c || "종류 없음",
              on: open.every((i) => (i.cat || "") === c),
              fn: () => {
                open.forEach((i) => {
                  i.cat = c;
                });
                done(`${open.length}개의 종류를 ‘${c || "종류 없음"}’${josaRo(c || "종류 없음")} 바꿨어요`);
              },
            })),
        }
      : null,
    paid.length
      ? {
          icon: "won",
          label: "결제 수단",
          items: () =>
            [
              ["", "미정"],
              ["cash", "현금"],
              ["transfer", "계좌이체"],
              ["card", "카드"],
            ].map(([v, l]) => ({
              label: l,
              on: paid.every((i) => (i.pay || "") === v),
              fn: () => {
                paid.forEach((i) => {
                  i.pay = v;
                });
                done(`${paid.length}개의 결제 수단: ${l}`);
              },
            })),
        }
      : null,
    b.artists.length > 1 && open.length
      ? {
          icon: "user",
          label: "작가",
          items: () =>
            all.map((a) => ({
              label: a.nick || "작가",
              on: open.every((i) => (i.artist || "") === a.id),
              fn: () => {
                open.forEach((i) => {
                  i.artist = a.id;
                });
                done(`${open.length}개 → ${a.nick || "작가"}`);
              },
            })),
        }
      : null,
    {
      chips: [
        {
          label: "★ 꼭 사기",
          cls: "must",
          on: () => its.every((i) => i.must),
          fn: () => {
            const v = !its.every((i) => i.must);
            its.forEach((i) => {
              i.must = v;
              if (v) i.maybe = false;
            });
            changed();
          },
        },
        {
          label: "고민중",
          cls: "may",
          on: () => its.every((i) => i.maybe),
          fn: () => {
            const v = !its.every((i) => i.maybe);
            its.forEach((i) => {
              i.maybe = v;
              if (v) i.must = false;
            });
            changed();
          },
        },
      ],
    },
    {
      icon: "user",
      label: "대리구매",
      hint: its.every((i) => (i.forWho || "") === (its[0].forWho || "")) ? its[0].forWho || "" : "여러 명",
      fn: async () => {
        const v = await promptBox(`물품 ${n}개를 부탁한 사람을 적어 주세요.\n비우면 내 물품이 돼요.`, "닉네임", {
          value: its.every((i) => i.forWho === its[0].forWho) ? its[0].forWho || "" : "",
          yes: "저장",
          allowEmpty: true,
        });
        if (v === null) return;
        its.forEach((i) => {
          i.forWho = String(v).trim().slice(0, 30);
        });
        done(v.trim() ? `${n}개 → ${v.trim()}` : `${n}개를 내 물품으로 바꿨어요`);
      },
    },
    free.length
      ? free.some((i) => i.want)
        ? {
            icon: "eyeoff",
            label: `무료 배포 ${free.length}개 안 받기`,
            fn: () => {
              free.forEach((i) => {
                i.want = 0;
                i.st = 0;
              });
              done(`무료 배포 ${free.length}개를 안 받기로 했어요`);
            },
          }
        : {
            icon: "check",
            label: `무료 배포 ${free.length}개 받기`,
            fn: () => {
              free.forEach((i) => {
                i.want = Math.max(1, i.want);
                i.st = 0;
              });
              done(`무료 배포 ${free.length}개를 받기로 했어요`);
            },
          }
      : null,
  ];
}
document.addEventListener(
  "click",
  (e) => {
    if (!ISEL || !sh || sh.kind !== "booth") return;
    const row = e.target.closest("#bItems .item[data-iid]");
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    const id = row.dataset.iid;
    if (ISEL.ids.has(id)) ISEL.ids.delete(id);
    else ISEL.ids.add(id);
    const b = findBooth(sh.id);
    if (b) iselDraw(b);
  },
  true
);
function renderBoothItems() {
  const b = findBooth(sh && sh.id);
  if (!b) return;
  const st = boothStats(b),
    box = document.getElementById("bItems");
  if (!box) return;
  const multi = b.artists.length > 1,
    ro = isSub() && lockedBooth(b);
  if (RCV_OPEN.bid && RCV_OPEN.bid !== b.id) RCV_OPEN = { bid: "", key: null };
  const rows = (list) => list.map((i) => itemRow(b, i, { grip: multi, art: false })).join("");
  let html = "";
  if (b.artists.length) {
    const ids = new Set(b.artists.map((a) => a.id));
    if (multi) {
      const common = b.items.filter((i) => !ids.has(i.artist));
      html += `<div class="agbox ${common.length ? "" : "ec"}" data-aid=""><div class="agrp" data-aid="" data-bid="${b.id}"><span class="an">공통</span></div>${common.length ? rows(common) : `<div class="aempty">여기에 놓으면 공통 물품이 돼요</div>`}</div>`;
    }
    b.artists.forEach((a, k) => {
      const its = b.items.filter((i) => i.artist === a.id),
        nm = esc(a.nick || "작가 " + (k + 1));
      if (a.hidden) {
        html += `<div class="agbox" data-aid="${a.id}"><div class="agrp hid" data-aid="${a.id}" data-bid="${b.id}"><span class="an">${nm}</span><span class="hidn">숨김 · 물품 ${its.length}개</span><button class="btn ghost sm" data-act="artShow" data-aid="${a.id}">보이기</button></div></div>`;
        return;
      }
      /* 선입금·수요조사 둘 다 있으면 둘 다 표시 (둘 다면 이름을 붙여 구분) */
      const aps = periodsOf(a)
        .map((ap) => ({ ap, ps: periodState(ap, artistPaid(b, a)) }))
        .filter((x) => x.ps.cls !== "late");
      const apChips = aps
        .map(
          ({ ap, ps }) =>
            `<span class="dl ${ps.cls}" title="${esc(kindWord(ap) + " " + periodText(ap))}">${esc(ap.kind === "survey" || periodsOf(a).length > 1 ? ps.text : stripKind(ps.text))}</span>`
        )
        .join("");
      html +=
        `<div class="agbox" data-aid="${a.id}"><div class="agrp" data-aid="${a.id}" data-bid="${b.id}"><span class="an">${nm}</span>${apChips}${rcvHead(b, a, ro)}</div>${ro ? "" : rcvEditor(b, a)}` +
        (its.length ? rows(its) : `<div class="aempty">이 작가로 지정한 물품이 없어요</div>`) +
        `</div>`;
    });
  } else {
    const has = (b.recv || []).length;
    html =
      (has || !ro
        ? `<div class="rbarbox"><div class="agrp rbar"><span class="an">수령</span>${rcvHead(b, null, ro)}</div>${ro ? "" : rcvEditor(b, null)}</div>`
        : "") + rows(b.items);
  }
  const anyImg = b.artists.some((a) => (a.imgs || []).length);
  if (ISEL && ISEL.bid !== b.id) ISEL = null;
  box.innerHTML =
    b.items.length || b.artists.length
      ? html
      : html +
        `<div class="empty">살 물품을 아래에서 추가하거나<br>${anyImg ? "인포 이미지를 보면서 적어 보세요." : "‘윗치폼’으로 한꺼번에 넣어 보세요."}</div>`;
  {
    const L = linesOf(b).filter((i) => !i.maybe),
      cnt = (t) => {
        const ls = L.filter((i) => i.type === t);
        return ls.length ? `${ls.filter(isFinal).length}/${ls.length}` : "";
      };
    const bpb = payBreakdown(linesOf(b)),
      unpaid = bpb.cash + bpb.transfer + bpb.card + bpb[""];
    const cols = [`<div class="sm"><small>남은 결제</small><b>${won(unpaid)}</b></div>`];
    if (cnt("pre")) cols.push(`<div class="sp"><small>선입금</small><b>${cnt("pre")}</b></div>`);
    if (cnt("on")) cols.push(`<div class="so"><small>현장</small><b>${cnt("on")}</b></div>`);
    if (cnt("free")) cols.push(`<div class="sf"><small>무료</small><b>${cnt("free")}</b></div>`);
    const bpt = [
      ["cash", "현금"],
      ["transfer", "이체"],
      ["card", "카드"],
    ].filter(([k]) => bpb[k] > 0);
    const notes = [];
    if (st.maybe) notes.push(`고민중 ${st.maybe}개 ${won(st.maybeAmt)}은 합계에서 빠져 있어요`);
    if (bpt.length) notes.push(bpt.map(([k, l]) => `${l} ${won(bpb[k])}`).join(" · ") + (bpb[""] ? ` · 미정 ${won(bpb[""])}` : ""));
    const el = document.getElementById("bSums");
    el.innerHTML =
      L.length || st.maybe
        ? `<div class="bstripg" style="grid-template-columns:1.35fr ${"1fr ".repeat(cols.length - 1)}">${cols.join("")}</div>${notes.length ? `<p class="bstripn">${notes.join("<br>")}</p>` : ""}`
        : "";
  }
  iselDraw(b);
  document.getElementById("bCount").textContent = boothCountText(b);
}

function renderBoothForm() {
  const isNew = !sh.id;
  const b = isNew
    ? {
        section: secFilter !== "all" ? secFilter : S.sections[0] || "",
        num: "",
        half: 0,
        span: 1,
        name: "",
        artists: [],
        pickup: "",
        pickupFrom: "",
        openFrom: "",
        openTo: "",
        times: [],
        isFriend: false,
        friends: [],
        preFrom: "",
        preTo: "",
        preToTime: "",
        memo: "",
        tags: tagFilter ? [tagFilter] : [],
      }
    : findBooth(sh.id);
  if (!b) {
    closeSheet();
    return;
  }
  const draft =
    sh.draft ||
    (sh.draft = {
      section: b.section,
      num: b.num,
      half: b.half || 0,
      span: spanOf(b),
      name: b.name,
      artists: (b.artists || []).map((a) => ({
        ...a,
        recv: [...(a.recv || [])],
        imgs: [...(a.imgs || [])],
        _pre: !!periodOf(a) || !surveyOf(a),
        _sv: !!surveyOf(a),
      })),
      pickup: b.pickup || "",
      pickupFrom: b.pickupFrom || "",
      openFrom: b.openFrom || "",
      openTo: b.openTo || "",
      times: (b.times || []).map((x) => ({ end: "", ...x })),
      isFriend: !!b.isFriend,
      friendsText: (b.friends || []).join(", "),
      preFrom: b.preFrom || "",
      preTo: b.preTo || "",
      preToTime: b.preToTime || "",
      memo: b.memo,
      tags: [...(b.tags || [])],
    });
  sheet.innerHTML = `
    <div class="sh-grab" id="grab"><div class="handle"></div>
      <div class="sh-head sh-plain">
${isNew ? "" : `<button class="back" data-act="backBooth">${ICON_BACK}부스로</button>`}
<h3 style="flex:1">${isNew ? "부스 추가" : "부스 편집"}</h3>${isNew ? `<button class="btn ghost sm" data-act="bulkOpen">표로 여러 개</button>` : ""}
      </div>
    </div>
    <div class="sh-body">
      <div class="field"><span>구역</span>
<div class="pick" id="fSec">${S.sections.length ? S.sections.map((s) => `<button class="sec" style="--sc:${secColor(s)}" data-sec="${esc(s)}" aria-pressed="${draft.section === s}">${esc(s)}</button>`).join("") : `<span style="color:var(--muted);font-size:14px">오른쪽 위 설정(톱니바퀴)에서 구역을 먼저 만들어 주세요.</span>`}</div></div>
      <label class="field"><span>부스 번호</span><input class="inp" id="fNum" value="${esc(draft.num)}" placeholder="예: 12  (12-1은 반 부스, 12~13은 2부스)" maxlength="10"></label>
      <div class="field"><span>부스 형태</span>
<div class="pick" id="fSize">
  <button class="seatpick" data-half="1" data-span="1" aria-pressed="${draft.half === 1}"><i><em></em><em class="off"></em></i>반 -1</button>
  <button class="seatpick" data-half="2" data-span="1" aria-pressed="${draft.half === 2}"><i><em class="off"></em><em></em></i>반 -2</button>
  ${[1, 2, 3, 4].map((n) => `<button class="seatpick" data-half="0" data-span="${n}" aria-pressed="${draft.half === 0 && (draft.span || 1) === n}"><i>${"<em></em>".repeat(Math.min(2 * n, 4))}</i>${n === 1 ? "한 부스" : n + "부스"}</button>`).join("")}
</div></div>
      <div class="field"><span>미리보기</span><div id="fPrev"></div></div>
      <label class="field"><span>부스 이름</span><input class="inp" id="fName" value="${esc(draft.name)}" placeholder="서클명 또는 작가명"></label>
      <div class="field"><span>지인 부스</span>
<div class="frline"><button type="button" class="frtog" id="fFrTog" aria-pressed="${draft.isFriend}">♥ 지인</button><input class="inp" id="fFr" value="${esc(draft.friendsText || "")}" placeholder="닉네임 (여러 명은 쉼표로: 하늘, 바다)"></div></div>
      <div class="field"><span>부스 시간·이벤트</span>
<div id="fHours">
  <div class="timerow trng"><span class="tname" style="color:var(--on)">부스 운영</span><input class="inp stime" id="fOpenF" data-hf="openFrom" value="${esc(draft.openFrom)}" placeholder="11:00" inputmode="numeric" maxlength="5" aria-label="부스 운영 시작"><i class="tsep">~</i><input class="inp stime" id="fOpenT" data-hf="openTo" value="${esc(draft.openTo)}" placeholder="17:00" inputmode="numeric" maxlength="5" aria-label="부스 운영 끝"></div>
  <div class="timerow trng"><span class="tname" style="color:var(--pre)">선입금 수령</span><input class="inp stime" id="fPickF" data-hf="pickupFrom" value="${esc(draft.pickupFrom)}" placeholder="11:00" inputmode="numeric" maxlength="5" aria-label="선입금 수령 시작"><i class="tsep">~</i><input class="inp stime" id="fPick" data-hf="pickup" value="${esc(draft.pickup)}" placeholder="14:00" inputmode="numeric" maxlength="5" aria-label="선입금 수령 마감"></div>
  <p class="fhint">시작이나 끝 하나만 적어도 돼요.</p>
</div>
<div id="fTimes"></div>
<div class="tagsug" id="fTimeSug"></div></div>
      <div class="field"><span>작가 (닉네임·사이트·인포)</span>
<div id="fArtists"></div>
<button type="button" class="btn ghost block" id="fArtAdd" style="height:42px">+ 작가 추가</button></div>
      <div class="field"><span>태그</span>
<div class="tagedit" id="fTags"></div>
<div class="tagsug" id="fTagSug"></div></div>
      <label class="field"><span>메모</span><textarea class="inp" id="fMemo" placeholder="자유 메모">${esc(draft.memo)}</textarea></label>
      <div class="btnrow" style="margin-top:6px">
${isNew ? "" : `<button class="btn danger" data-act="delBooth">삭제</button>`}
<button class="btn pre" data-act="saveBooth" style="flex:2">${isNew ? "추가하기" : "저장"}</button>
      </div>
    </div>`;
  const prev = () => {
    document.getElementById("fPrev").innerHTML =
      `<div style="display:flex">${stamp({ section: draft.section, num: draft.num, half: draft.half, span: draft.span })}</div>`;
  };
  prev();
  document.getElementById("fSec").addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    draft.section = t.dataset.sec;
    document.querySelectorAll("#fSec button").forEach((x) => x.setAttribute("aria-pressed", String(x === t)));
    prev();
  });
  document.getElementById("fSize").addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    draft.half = +t.dataset.half;
    draft.span = +t.dataset.span || 1;
    syncHalf();
  });
  const syncHalf = () => {
    document
      .querySelectorAll("#fSize button")
      .forEach((x) =>
        x.setAttribute(
          "aria-pressed",
          String(+x.dataset.half === draft.half && (draft.half ? true : +x.dataset.span === (draft.span || 1)))
        )
      );
    prev();
  };
  document.getElementById("fNum").addEventListener("input", (e) => {
    const v = e.target.value.trim(),
      m = v.match(/^(.+?)\s*-\s*([12])$/),
      rg = v.match(/^(\d+)\s*~\s*(\d+)$/);
    if (m) {
      draft.num = m[1];
      draft.half = +m[2];
      draft.span = 1;
    } else if (rg && +rg[2] > +rg[1] && +rg[2] - +rg[1] <= 3) {
      draft.num = rg[1];
      draft.half = 0;
      draft.span = +rg[2] - +rg[1] + 1;
    } else {
      draft.num = v.replace(/[-~]$/, "");
    }
    syncHalf();
  });
  document.getElementById("fNum").addEventListener("blur", (e) => {
    e.target.value = draft.num;
  });
  const tagBox = document.getElementById("fTags"),
    tagSug = document.getElementById("fTagSug");
  const drawTags = () => {
    const pending = tagBox.querySelector("input") ? tagBox.querySelector("input").value : "";
    tagBox.innerHTML =
      draft.tags
        .map(
          (t) =>
            `<span class="tg" style="${tagStyle(t)}">#${esc(t)}<button class="x" type="button" data-tgrm="${esc(t)}" aria-label="${esc(t)} 태그 빼기">×</button></span>`
        )
        .join("") +
      `<input id="fTagIn" placeholder="${draft.tags.length ? "태그 더 넣기" : "태그 적고 엔터 (예: 굿즈, 신간)"}" enterkeyhint="done" value="${esc(pending)}">`;
    const sug = allTags()
      .map(([t]) => t)
      .filter((t) => !draft.tags.includes(t))
      .slice(0, 12);
    tagSug.innerHTML = sug.length
      ? `<span class="lbl">자주 쓴 태그</span>` +
        sug.map((t) => `<button type="button" class="tg" style="${tagStyle(t)}" data-tgadd="${esc(t)}">+ ${esc(t)}</button>`).join("")
      : "";
    const inp = document.getElementById("fTagIn");
    inp.addEventListener("keydown", (ev) => {
      if (imeBusy(ev)) return;
      if (ev.key === "Enter" || ev.key === ",") {
        ev.preventDefault();
        addTag(inp.value, true);
      } else if (ev.key === "Backspace" && !inp.value && draft.tags.length) {
        draft.tags.pop();
        drawTags();
        document.getElementById("fTagIn").focus();
      }
    });
    inp.addEventListener("input", () => {
      if (inp.value.includes(",")) {
        const parts = inp.value.split(",");
        inp.value = "";
        parts.forEach((x) => addTag(x, false));
        drawTags();
        document.getElementById("fTagIn").focus();
      }
    });
  };
  const addTag = (raw, refocus) => {
    const t = cleanTag(raw);
    const inp = document.getElementById("fTagIn");
    if (inp) inp.value = "";
    if (t && !draft.tags.includes(t)) {
      if (draft.tags.length >= 12) {
        toast("태그는 12개까지 달 수 있어요");
      } else draft.tags.push(t);
    }
    if (refocus !== false) {
      drawTags();
      const i = document.getElementById("fTagIn");
      if (i) i.focus();
    }
  };
  sh.flushTag = () => {
    const i = document.getElementById("fTagIn");
    if (i && i.value.trim()) addTag(i.value, false);
  };
  tagBox.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-tgrm]");
    if (rm) {
      draft.tags = draft.tags.filter((t) => t !== rm.dataset.tgrm);
      drawTags();
      return;
    }
    const i = document.getElementById("fTagIn");
    if (i && e.target === tagBox) i.focus();
  });
  tagSug.addEventListener("click", (e) => {
    const a = e.target.closest("[data-tgadd]");
    if (a) (addTag(a.dataset.tgadd, false), drawTags());
  });
  drawTags();
  document.getElementById("fName").addEventListener("input", (e) => {
    draft.name = e.target.value;
  });
  const fArt = document.getElementById("fArtists");
  const drawArtists = () => {
    fArt.innerHTML = draft.artists
      .map(
        (a, k) => `<div class="artedit">
      <input class="inp full" data-ak="${k}" data-af="nick" value="${esc(a.nick)}" placeholder="닉네임">
      <button type="button" class="iconbtn danger" data-akdel="${k}" aria-label="작가 지우기">${ICON_TRASH}</button>
      <input class="inp wide" data-ak="${k}" data-af="site" value="${esc(a.site)}" placeholder="사이트 (트위터 주소 또는 @아이디)" autocapitalize="off" spellcheck="false">
      <input class="inp wide" data-ak="${k}" data-af="info" value="${esc(a.info)}" placeholder="이 작가의 인포 링크 (선택)" autocapitalize="off" spellcheck="false">
      <div class="wide" style="font-size:12px;font-weight:700;color:var(--muted);margin-top:2px">수령 방법 (여러 개 가능)</div>
      <div class="wide rchips">${RECV.map(([rk, rl]) => `<button type="button" class="rchip" data-rk="${k}" data-rv="${rk}" aria-pressed="${(a.recv || []).includes(rk)}">${rl}</button>`).join("")}</div>
      ${(a.recv || []).includes("custom") ? `<input class="inp wide" data-ak="${k}" data-af="memo" value="${esc(a.memo || "")}" placeholder="수령 방법 직접 적기" maxlength="200">` : ""}
      <div class="wide" style="font-size:12px;font-weight:700;color:var(--muted);margin-top:2px">인포 이미지 링크 (붙여 넣고 엔터, 여러 개 가능)</div>
      <div class="imged wide">${(a.imgs || []).map((u, j) => `<span class="imgchip"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-bad><button type="button" data-akimgdel="${k}:${j}" aria-label="이미지 빼기">×</button></span>`).join("")}<input data-ak="${k}" data-af="imgIn" value="${esc(a.imgIn || "")}" placeholder="https://… 이미지 주소" autocapitalize="off" spellcheck="false" enterkeyhint="done"></div>
      <div class="wide kindrow"><span>진행하는 것 (둘 다 가능)</span><div class="pick kindpick">${[
        ["sv", "수요조사"],
        ["pre", "선입금"],
      ]
        .map(([v, l]) => `<button type="button" data-kk="${k}" data-kind="${v}" aria-pressed="${!!a["_" + v]}">${l}</button>`)
        .join("")}</div></div>
      ${[
        ["sv", "수요조사"],
        ["pre", "선입금"],
      ]
        .filter(([v]) => a["_" + v])
        .map(
          ([
            v,
            w,
          ]) => `<div class="wide" style="font-size:12px;font-weight:700;color:var(--muted);margin-top:2px">${w} 기간 (시작일 · 마감일 · 마감 시각) · 폼 링크</div>
      <div class="perrow wide"><input class="inp" type="date" data-ak="${k}" data-af="${v}From" value="${esc(a[v + "From"] || "")}" aria-label="${w} 시작일"><input class="inp" type="date" data-ak="${k}" data-af="${v}To" value="${esc(a[v + "To"] || "")}" aria-label="${w} 마감일"><input class="inp stime" data-ak="${k}" data-af="${v}ToTime" value="${esc(a[v + "ToTime"] || "")}" placeholder="23:59" inputmode="numeric" maxlength="5" aria-label="${w} 마감 시각"></div>
      <input class="inp wide" data-ak="${k}" data-af="${v}Link" value="${esc(a[v + "Link"] || "")}" placeholder="${w} 폼 링크 (위치폼·구글폼 등, 선택)" aria-label="${w} 폼 링크" autocapitalize="off" spellcheck="false">`
        )
        .join("")}
    </div>`
      )
      .join("");
  };
  /* 인포 링크가 트위터 글이면: 비어 있는 '사이트'는 @아이디로, 비어 있는 '닉네임'은 X에서 받아서 채움 (이미 적은 값은 안 건드림) */
  const autoX = (k) => {
    const a = draft.artists[k],
      ref = a && tweetRef(a.info);
    if (!ref) return;
    const key = ref.handle + "/" + ref.status;
    if (a._xKey === key) return;
    a._xKey = key;
    const setField = (f, v) => {
      a[f] = v;
      const el = fArt.querySelector(`[data-ak="${k}"][data-af="${f}"]`);
      if (el) el.value = v;
    };
    if (!String(a.site || "").trim()) {
      setField("site", "@" + ref.handle);
      a._xSite = a.site;
      toast(`트위터 링크에서 사이트를 @${ref.handle}로 채웠어요`);
    }
    if (!ref.status || String(a.nick || "").trim()) return;
    tweetAuthor(ref.handle, ref.status).then((r) => {
      if (!r || draft.artists[k] !== a || a._xKey !== key) return;
      if (r.handle && a._xSite && a.site === a._xSite && r.handle.toLowerCase() !== ref.handle.toLowerCase())
        setField("site", "@" + r.handle);
      if (r.name && !String(a.nick || "").trim()) {
        setField("nick", r.name);
        toast(`닉네임을 ‘${r.name}’(으)로 채웠어요`);
      }
    });
  };
  let autoXT = null;
  fArt.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.ak == null) return;
    draft.artists[+t.dataset.ak][t.dataset.af] = t.value;
    if (t.dataset.af === "info") {
      clearTimeout(autoXT);
      autoXT = setTimeout(() => autoX(+t.dataset.ak), 400);
    }
  });
  const addImgs = (k, text) => {
    const a = draft.artists[k];
    const urls = parseUrls(text);
    if (!urls.length) {
      if (String(text || "").trim()) toast("https://로 시작하는 이미지 주소를 넣어 주세요");
      return false;
    }
    a.imgs = [...new Set([...(a.imgs || []), ...urls])].slice(0, 12);
    a.imgIn = "";
    drawArtists();
    const n = fArt.querySelector(`[data-ak="${k}"][data-af="imgIn"]`);
    if (n) n.focus();
    return true;
  };
  fArt.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t.dataset.af !== "imgIn" || imeBusy(e)) return;
    if (e.key === "Enter") {
      e.preventDefault();
      addImgs(+t.dataset.ak, t.value);
    }
  });
  fArt.addEventListener("paste", (e) => {
    const t = e.target;
    if (t.dataset.af !== "imgIn") return;
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (parseUrls(text).length) {
      e.preventDefault();
      addImgs(+t.dataset.ak, t.value + " " + text);
    }
  });
  fArt.addEventListener("click", (e) => {
    const rc = e.target.closest("[data-rk]");
    if (rc) {
      const a = draft.artists[+rc.dataset.rk],
        rv = new Set(a.recv || []),
        k = rc.dataset.rv;
      if (rv.has(k)) rv.delete(k);
      else rv.add(k);
      a.recv = RECV.map((x) => x[0]).filter((x) => rv.has(x));
      drawArtists();
      if (k === "custom" && rv.has(k)) {
        const i = fArt.querySelector(`[data-ak="${rc.dataset.rk}"][data-af="memo"]`);
        if (i) i.focus();
      }
      return;
    }
    const kb = e.target.closest("[data-kind]");
    if (kb && !kb.disabled) {
      const da = draft.artists[+kb.dataset.kk],
        f = "_" + kb.dataset.kind;
      da[f] = !da[f];
      drawArtists();
      return;
    }
    const di = e.target.closest("[data-akimgdel]");
    if (di) {
      const [k, j] = di.dataset.akimgdel.split(":").map(Number);
      draft.artists[k].imgs.splice(j, 1);
      drawArtists();
      return;
    }
    const d = e.target.closest("[data-akdel]");
    if (d) {
      draft.artists.splice(+d.dataset.akdel, 1);
      drawArtists();
    }
  });
  document.getElementById("fArtAdd").addEventListener("click", () => {
    draft.artists.push({
      id: uid(),
      nick: "",
      site: "",
      info: "",
      memo: "",
      recv: [],
      preFrom: "",
      preTo: "",
      preToTime: "",
      imgs: [],
      _pre: true,
      _sv: false,
    });
    drawArtists();
    const ins = fArt.querySelectorAll('[data-af="nick"]');
    if (ins.length) ins[ins.length - 1].focus();
  });
  drawArtists();
  const frTog = document.getElementById("fFrTog"),
    frIn = document.getElementById("fFr");
  frTog.addEventListener("click", () => {
    draft.isFriend = !draft.isFriend;
    frTog.setAttribute("aria-pressed", String(draft.isFriend));
    if (draft.isFriend) frIn.focus();
  });
  frIn.addEventListener("input", () => {
    draft.friendsText = frIn.value;
    if (frIn.value.trim() && !draft.isFriend) {
      draft.isFriend = true;
      frTog.setAttribute("aria-pressed", "true");
    }
  });

  const fHours = document.getElementById("fHours");
  fHours.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.hf) draft[t.dataset.hf] = t.value;
  });
  fHours.addEventListener("focusout", (e) => {
    const t = e.target;
    if (!t.dataset.hf) return;
    const v = normTime(t.value);
    if (v) {
      t.value = v;
      draft[t.dataset.hf] = v;
    }
  });
  const TIME_PRESETS = ["구매 특전", "추첨", "사인회", "현장 판매", "부스 철수"];
  const fTimes = document.getElementById("fTimes"),
    fTimeSug = document.getElementById("fTimeSug");
  const drawTimes = () => {
    fTimes.innerHTML = draft.times
      .map((x, k) => {
        const ev = !NON_EVENT.includes(x.label);
        return `<div class="evedit${ev ? " isev" : ""}">
      <div class="timerow"><input class="inp tlab" data-tk="${k}" data-tf="label" value="${esc(x.label)}" placeholder="종류 (구매 특전·추첨 등)" aria-label="종류"><button type="button" class="iconbtn danger" data-tkdel="${k}" aria-label="지우기">${ICON_TRASH}</button></div>
      ${ev ? `<input class="inp" data-tk="${k}" data-tf="text" value="${esc(x.text || "")}" placeholder="내용 (예: 2만원 이상 구매 시 엽서)" maxlength="120">` : ""}
      <div class="timerow trng"><span class="tname">시간${ev ? " (선택)" : ""}</span><input class="inp stime" data-tk="${k}" data-tf="time" value="${esc(x.time)}" placeholder="시작" inputmode="numeric" maxlength="5" aria-label="시작 시간"><i class="tsep">~</i><input class="inp stime" data-tk="${k}" data-tf="end" value="${esc(x.end || "")}" placeholder="끝" inputmode="numeric" maxlength="5" aria-label="끝 시간"></div>
      ${ev ? `<input class="inp" data-tk="${k}" data-tf="note" value="${esc(x.note || "")}" placeholder="조건·메모 (선택, 예: 1인 1회)" maxlength="200">` : ""}
    </div>`;
      })
      .join("");
    fTimeSug.innerHTML =
      `<span class="lbl">더하기</span>` +
      TIME_PRESETS.filter((p) => !NON_EVENT.includes(p) || !draft.times.some((x) => x.label === p))
        .map(
          (p) => `<button type="button" class="tg" style="--tc:var(--pre);--tb:var(--pre-soft)" data-tadd="${esc(p)}">+ ${esc(p)}</button>`
        )
        .join("") +
      `<button type="button" class="tg" style="--tc:var(--muted);--tb:var(--paper)" data-tadd="">+ 직접 입력</button>`;
  };
  fTimes.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.tk == null) return;
    draft.times[+t.dataset.tk][t.dataset.tf] = t.value;
  });
  fTimes.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.tf !== "label") return;
    const blk = t.closest(".evedit");
    if (blk && blk.classList.contains("isev") === NON_EVENT.includes(t.value.trim())) drawTimes();
  });
  fTimes.addEventListener("focusout", (e) => {
    const t = e.target;
    if (t.dataset.tf === "time" || t.dataset.tf === "end") {
      const v = normTime(t.value);
      if (v) {
        t.value = v;
        draft.times[+t.dataset.tk][t.dataset.tf] = v;
      }
    }
  });
  fTimes.addEventListener("click", (e) => {
    const d = e.target.closest("[data-tkdel]");
    if (d) {
      draft.times.splice(+d.dataset.tkdel, 1);
      drawTimes();
    }
  });
  fTimeSug.addEventListener("click", (e) => {
    const a = e.target.closest("[data-tadd]");
    if (!a) return;
    draft.times.push({ label: a.dataset.tadd, time: "", end: "", text: "", note: "" });
    drawTimes();
    const ins = fTimes.querySelectorAll(
      !a.dataset.tadd ? '[data-tf="label"]' : NON_EVENT.includes(a.dataset.tadd) ? '[data-tf="time"]' : '[data-tf="text"]'
    );
    if (ins.length) ins[ins.length - 1].focus();
  });
  drawTimes();
  document.getElementById("fMemo").addEventListener("input", (e) => {
    draft.memo = e.target.value;
  });
  if (!isNew && lockedBooth(b)) lockBoothForm();
  bindDrag();
  if (isNew)
    setTimeout(() => {
      const n = document.getElementById("fNum");
      if (n && window.matchMedia("(pointer:fine)").matches) n.focus();
    }, 280);
}

function renderItemForm() {
  const b = findBooth(sh.id);
  const it = b && b.items.find((i) => i.id === sh.iid);
  if (!it) {
    sh = { kind: "booth", id: sh.id };
    renderSheet();
    return;
  }
  const d = sh.draft || (sh.draft = JSON.parse(JSON.stringify(it)));
  sheet.innerHTML = `
    <div class="sh-grab" id="grab"><div class="handle"></div>
      <div class="sh-head sh-plain">
<button class="back" data-act="backBooth">${ICON_BACK}${esc(boothCode(b))}</button>
<h3 style="flex:1">물품 수정</h3>
      </div>
    </div>
    <div class="sh-body">
      <label class="field"><span>물품 이름</span><input class="inp" id="iName" value="${esc(d.name)}"></label>
      <div class="grid2">
${d.type !== "free" ? `<label class="field"><span>가격(원)</span><input class="inp" id="iPrice" value="${d.price || ""}" inputmode="numeric"></label>` : `<div></div>`}
<label class="field"><span>수량</span><input class="inp" id="iWant" value="${d.want || 0}" inputmode="numeric"></label>
      </div>
      <label class="field"><span>상품 종류</span><select class="inp" id="iCat">${catOptions(d.cat || "")}</select></label>
      ${b.artists.length > 1 ? `<label class="field"><span>작가</span><select class="inp" id="iArt">${artOptions(b, d.artist || "")}</select></label>` : ""}
      <div class="field"><span>판매 형태</span>
<div class="pick" id="iType">
  <button class="pre" data-type="pre" aria-pressed="${d.type === "pre"}">선입금</button>
  <button class="on" data-type="on" aria-pressed="${d.type === "on"}">현장 구매</button>
  <button class="free" data-type="free" aria-pressed="${d.type === "free"}">무료 배포</button>
</div></div>
      <div class="field"><span>우선순위</span>
<div class="pick" id="iPri"><button data-pri="norm" aria-pressed="${!d.must && !d.maybe}">보통</button><button class="mustb" data-pri="must" aria-pressed="${!!d.must}">★ 꼭 사기</button><button class="may" data-pri="maybe" aria-pressed="${!!d.maybe}">고민중</button></div></div>
      ${
        d.type !== "free"
          ? `<div class="field"><span>결제 수단</span>
<div class="pick" id="iPay">${[
              ["", "미정"],
              ["cash", "현금"],
              ["transfer", "계좌이체"],
              ["card", "카드"],
            ]
              .map(([v, l]) => `<button type="button" data-pay="${v}" aria-pressed="${(d.pay || "") === v}">${l}</button>`)
              .join("")}</div></div>`
          : ""
      }
      <label class="field"><span>대리구매 (부탁한 사람)</span><input class="inp" id="iFor" value="${esc(d.forWho || "")}" placeholder="비우면 내 물품" list="forList" autocomplete="off"><datalist id="forList">${forNames()
        .map((n) => `<option value="${esc(n)}">`)
        .join("")}</datalist></label>
      <label class="field"><span>메모</span><input class="inp" id="iNote" value="${esc(d.note)}" placeholder="수량 제한, 특전 등"></label>
      <div class="btnrow" style="margin-top:6px">
<button class="btn danger" data-act="delItem">삭제</button>
<button class="btn pre" data-act="saveItem" style="flex:2">저장</button>
      </div>
    </div>`;
  const val = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : null;
  };
  const keepInputs = () => {
    d.name = val("iName");
    if (val("iPrice") !== null) d.price = parsePrice(val("iPrice"));
    d.want = Math.max(1, parseInt(val("iWant"), 10) || 1);
    d.note = val("iNote");
    if (val("iFor") !== null) d.forWho = val("iFor");
  };
  const iPay = document.getElementById("iPay");
  if (iPay)
    iPay.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      d.pay = t.dataset.pay;
      iPay.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === t)));
    });
  bindCatSelect(
    document.getElementById("iCat"),
    () => d.cat || "",
    (v) => {
      d.cat = v;
    }
  );
  const iArt = document.getElementById("iArt");
  if (iArt)
    iArt.addEventListener("change", () => {
      d.artist = iArt.value;
    });
  document.getElementById("iType").addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    keepInputs();
    d.type = t.dataset.type;
    renderItemForm();
  });
  document.getElementById("iPri").addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    d.must = t.dataset.pri === "must";
    d.maybe = t.dataset.pri === "maybe";
    document.querySelectorAll("#iPri button").forEach((x) => x.setAttribute("aria-pressed", String(x === t)));
  });
  sh.keepInputs = keepInputs;
  if (lockedItem(it)) lockItemForm();
  bindDrag();
}
