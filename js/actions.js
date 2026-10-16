/* 부스 체크 — 행사 여러 개 관리·체크 상태 바꾸기
   index.html이 js/ 파일들을 정해진 순서로 불러와요. 파일끼리 함수·변수를 그대로 함께 써요(전역). */
"use strict";
/* ---------- events (multiple) ---------- */
function renderEvents() {
  flush();
  const list = LIB.list
    .slice()
    .sort((a, b) => (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99") || (b.updated || 0) - (a.updated || 0));
  sheet.innerHTML = `
    <div class="sh-grab" id="grab"><div class="handle"></div><div class="sh-head sh-plain"><h3 style="flex:1">행사 목록</h3></div></div>
    <div class="sh-body">
      ${list
        .map((ev) => {
          const cur = ev.id === LIB.current,
            dd = ddayOf(ev.date);
          return `<div class="evrow ${cur ? "cur" : ""}">
  <button class="evmain" data-act="evswitch" data-eid="${ev.id}"><span class="evn">${esc(ev.name || "이름 없는 행사")}${roleBadge(ev.id)}</span><span class="evs">${ev.date ? esc(ev.date.replace(/-/g, ". ")) : "날짜 미정"}  |  부스 ${ev.count || 0}개${cur ? "  |  지금 보는 중" : ""}</span></button>
  ${dd ? `<span class="dday sm ${dd.c}">${dd.t}</span>` : ""}
  <button class="iconbtn danger" data-act="evdel" data-eid="${ev.id}" aria-label="행사 삭제">${ICON_TRASH}</button>
</div>`;
        })
        .join("")}
      <div class="card" style="margin-top:14px;margin-bottom:0">
<h2>새 행사 만들기</h2>
<p class="desc">행사마다 부스, 배치도, 상품 종류, 체크 상태가 따로 저장돼요.</p>
<label class="field"><span>행사 이름</span><input class="inp" id="evNew" placeholder="예: 겨울 동인 행사"></label>
<label class="checkline"><input type="checkbox" id="evCopy" checked> 지금 행사의 구역과 상품 종류를 그대로 쓰기</label>
<button class="btn pre block" data-act="evcreate">새 행사 만들기</button>
      </div>
    </div>`;
  bindDrag();
}
function resetUI() {
  secFilter = "all";
  query = "";
  tagFilter = null;
  ckCat = null;
  mapHall = null;
  mapSel = null;
  mapEdit = false;
  lastCat = "";
  for (const k of Object.keys(mapViews)) delete mapViews[k];
  for (const k of Object.keys(mapFrames)) delete mapFrames[k];
}
function switchEvent(id) {
  if (id === LIB.current) {
    return;
  }
  flush();
  LIB.current = id;
  saveIndex();
  S = loadEvent(id);
  resetUI();
  clListenPub();
  renderTop();
  setView(view);
  clFlushPending();
}
function addEvent(st) {
  const id = uid();
  memEvents[id] = st;
  lastJs[id] = JSON.stringify(st);
  lsSet(EV_PREFIX + id, lastJs[id]);
  LIB.list.push({ id, ...evMeta(st), mod: Date.now() });
  saveIndex();
  clChanged(id);
  return id;
}

/* drag to close */
function bindDrag() {
  const grab = document.getElementById("grab");
  if (!grab) return;
  let y0 = null,
    dy = 0;
  grab.addEventListener(
    "touchstart",
    (e) => {
      if (e.target.closest("button,input,textarea")) return;
      y0 = e.touches[0].clientY;
      dy = 0;
      sheet.classList.add("dragging");
    },
    { passive: true }
  );
  grab.addEventListener(
    "touchmove",
    (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      sheet.style.transform = `translateY(${dy}px)`;
    },
    { passive: true }
  );
  const end = () => {
    if (y0 === null) return;
    sheet.classList.remove("dragging");
    sheet.style.transform = "";
    if (dy > 90) tryClose();
    y0 = null;
    dy = 0;
  };
  grab.addEventListener("touchend", end);
  grab.addEventListener("touchcancel", end);
}

/* ---------- cycle status ---------- */
function cycle(bid, iid, sid, btn) {
  const b = findBooth(bid);
  const i = b && findLine(b, iid, sid);
  if (!i) return;
  if (!i.o.want) {
    i.o.want = 1;
    i.o.st = 0;
    save();
    renderTop();
    if (navigator.vibrate)
      try {
        navigator.vibrate(8);
      } catch (_) {}
    if (sh && sh.kind === "booth") renderBoothItems();
    else rerenderSoft();
    return;
  }
  const max = i.type === "pre" ? 2 : 1;
  i.st = i.st >= max ? 0 : i.st + 1;
  if (i.maybe && i.st > 0) {
    i.i.maybe = false;
    save();
    renderTop();
    if (sh && sh.kind === "booth") renderBoothItems();
    else if (view === "check") renderCheckList();
    else rerenderSoft();
    toast("사기로 했으니 고민중 표시를 뺐어요");
    return;
  }
  save();
  if (navigator.vibrate)
    try {
      navigator.vibrate(8);
    } catch (e) {}
  const row = btn.closest(".item");
  if (row) {
    row.classList.toggle("fin", isFinal(i));
    row.classList.toggle("half", i.type === "pre" && i.st === 1);
    const s = row.querySelector(".ist");
    if (s) s.textContent = `${typeLabel(i)} · ${stLabel(i)}`;
    btn.setAttribute("aria-label", `${i.name} 상태 바꾸기, 지금 ${stLabel(i)}`);
    btn.classList.add("bump");
    setTimeout(() => btn.classList.remove("bump"), 160);
  }
  renderTop();
  if (sh && sh.kind === "booth") {
    const c = document.getElementById("bCount");
    if (c) c.textContent = boothCountText(b);
    setTimeout(() => {
      if (sh && sh.kind === "booth" && sh.id === b.id) renderBoothItems();
    }, 170);
  }
  if (view === "people" && !sh)
    setTimeout(() => {
      if (view === "people" && !sh) renderPeople();
    }, 170);
  if (view === "check" && !sh) {
    const grp = row && row.closest(".cgroup");
    if (grp) {
      const all = grp.querySelectorAll(".item:not(.maybe)").length,
        fin = grp.querySelectorAll(".item.fin:not(.maybe)").length;
      const c = grp.querySelector(".cnt");
      if (c) c.textContent = `${fin}/${all}`;
    }
    updateMoney();
  }
}
function updateMoney() {
  const m = document.getElementById("money");
  if (!m) return;
  let paid = 0,
    unpaid = 0,
    maybeAmt = 0;
  for (const b of S.booths)
    for (const i of linesOf(b)) {
      if (!itemMatch(i)) continue;
      if (i.maybe) {
        maybeAmt += amt(i);
        continue;
      }
      if (isPaid(i)) paid += amt(i);
      else unpaid += amt(i);
    }
  m.innerHTML = `결제 완료 <b>${won(paid)}</b><br>남은 결제 <b>${won(unpaid)}</b>${maybeAmt ? `<br>고민중 <b>${won(maybeAmt)}</b>` : ""}`;
  ckFoldInfo(unpaid);
}
let ckUnpaid = 0;
function ckFoldInfo(unpaid) {
  if (unpaid != null) ckUnpaid = unpaid;
  const n = (ckRemain ? 1 : 0) + (ckDl ? 1 : 0) + (ckNoMaybe ? 1 : 0) + (ckCat ? 1 : 0);
  const bd = document.getElementById("ckBadge");
  if (bd) {
    bd.hidden = !n;
    bd.textContent = n;
  }
  const mm = document.getElementById("moneyMini");
  if (mm) mm.innerHTML = UIP.ckBar ? "" : `남은 결제 <b>${won(ckUnpaid)}</b>`;
}
