/* 부스 체크 — 공통 도구: 글자·숫자·링크·물품 계산·대화상자·시간
   index.html이 js/ 파일들을 정해진 순서로 불러와요. 파일끼리 함수·변수를 그대로 함께 써요(전역). */
"use strict";
/* ---------- helpers ---------- */
/* 깨진 이미지 표시 (data-bad 달린 img가 못 열리면 감싼 칸에 bad 클래스) */
document.addEventListener(
  "error",
  (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG" && t.hasAttribute("data-bad") && t.parentNode) t.parentNode.classList.add("bad");
  },
  true
);
let imeComposing = false;
document.addEventListener(
  "compositionstart",
  () => {
    imeComposing = true;
  },
  true
);
document.addEventListener(
  "compositionend",
  () => {
    imeComposing = false;
  },
  true
);
function imeBusy(e) {
  return !!(e && e.isComposing) || imeComposing;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function won(n) {
  return (n || 0).toLocaleString("ko-KR") + "원";
}
function secColor(sec) {
  const i = S.sections.indexOf(sec);
  return i < 0 ? "#80849F" : SEC_COLORS[i % SEC_COLORS.length];
}
function spanOf(b) {
  return b.half ? 1 : Math.max(1, Math.min(4, b.span || 1));
}
function boothCode(b) {
  const n = String(b.num || "").trim();
  if (b.half) return b.section + (n || "?") + "-" + b.half;
  const sp = spanOf(b);
  if (sp > 1 && /^\d+$/.test(n)) return b.section + n + "~" + String(parseInt(n, 10) + sp - 1).padStart(n.length, "0");
  return b.section + (n || "?");
}
/* 트위터(X) 주소 → {handle, status}. 글 주소면 status(글 번호)도. 아이디가 아닌 주소(검색 등)는 null */
const X_NOT_USER = new Set([
  "i",
  "home",
  "search",
  "explore",
  "intent",
  "hashtag",
  "share",
  "settings",
  "messages",
  "notifications",
  "compose",
  "login",
  "signup",
  "tos",
  "privacy",
]);
function tweetRef(v) {
  const m = String(v || "")
    .trim()
    .match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:\/status(?:es)?\/(\d{1,25}))?(?:[/?#].*)?$/i);
  if (!m || X_NOT_USER.has(m[1].toLowerCase())) return null;
  return { handle: m[1], status: m[2] || "" };
}
/* 트윗 작성자 닉네임: X의 공개 임베드 정보(oEmbed, 로그인 필요 없음).
   브라우저에서 막히거나(CORS)·인터넷이 없거나·6초 넘으면 null → 아무것도 안 바꿈 */
async function tweetAuthor(handle, status) {
  if (!window.fetch || navigator.onLine === false) return null;
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ac && ac.abort(), 6000);
  try {
    const url = `https://twitter.com/${handle}/status/${status}`;
    const r = await fetch("https://publish.twitter.com/oembed?omit_script=1&url=" + encodeURIComponent(url), {
      signal: ac ? ac.signal : undefined,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!r.ok) return null;
    const d = await r.json();
    const name = str((d && d.author_name) || "")
      .trim()
      .slice(0, 30);
    const h = (String((d && d.author_url) || "").match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})/i) || [])[1] || "";
    return name || h ? { name, handle: h } : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
function linkHost(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch (e) {
    return u;
  }
}
function siteLabel(u) {
  const h = linkHost(u);
  if (/(^|\.)(x|twitter)\.com$/.test(h)) return "X";
  if (/instagram\.com$/.test(h)) return "인스타";
  if (/bsky\.app$/.test(h)) return "블스";
  if (/pixiv\.net$/.test(h)) return "픽시브";
  if (/postype\.com$/.test(h)) return "포스타입";
  return h;
}
const ICON_LINK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';
function parseUrls(t) {
  return String(t || "")
    .split(/\s+/)
    .map((x) => normLink(x.replace(/[,，]+$/, "")))
    .filter(Boolean);
}
function imgThumbs(urls, cls, bid, aid) {
  const g = esc(JSON.stringify(urls));
  return urls
    .map(
      (u, k) =>
        `<button type="button" class="${cls || "aimg"}" data-act="viewUrl" data-u="${esc(u)}" data-gal="${g}" data-gi="${k}" data-bid="${bid || ""}" data-aid="${aid || ""}" aria-label="이미지 크게 보기"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-bad></button>`
    )
    .join("");
}
const VW = { list: [], k: 0, bid: "", aid: "" };
function showViewer() {
  const v = document.getElementById("imgv"),
    im = document.getElementById("imgvImg"),
    n = VW.list.length,
    u = VW.list[VW.k];
  im.style.display = "";
  im.onerror = () => {
    im.style.display = "none";
  };
  im.referrerPolicy = "no-referrer";
  im.src = u;
  v.classList.remove("zoom");
  document.getElementById("imgvOpen").href = u;
  document.getElementById("imgvCnt").textContent = n > 1 ? `${VW.k + 1} / ${n}` : "";
  document.getElementById("imgvWrite").hidden = !VW.bid;
  v.querySelectorAll(".vnav").forEach((x) => {
    x.hidden = n < 2;
  });
  v.classList.add("show");
}
function openViewer(list, k, ctx) {
  if (!list || !list.length) return;
  ctx = ctx || {};
  VW.list = list;
  VW.k = Math.max(0, Math.min(list.length - 1, k || 0));
  VW.bid = ctx.bid || "";
  VW.aid = ctx.aid || "";
  showViewer();
  if (ctx.write && VW.bid) startWrite();
  else document.getElementById("imgv").classList.remove("write");
}
function closeViewer() {
  const v = document.getElementById("imgv");
  if (!v.classList.contains("show")) return false;
  const wasWrite = v.classList.contains("write");
  v.classList.remove("show", "write", "zoom");
  if (document.activeElement && v.contains(document.activeElement)) document.activeElement.blur();
  if (wasWrite) {
    flush();
    if (sh && sh.kind === "booth") renderBoothItems();
    rerenderSoft();
  }
  if (!sh) clFlushPending();
  return true;
}
let vfType = null,
  vfMaybe = false;
function startWrite() {
  const b = findBooth(VW.bid);
  if (!b) return;
  const v = document.getElementById("imgv");
  v.classList.add("write");
  const a = b.artists.find((x) => x.id === VW.aid);
  if (!vfType) vfType = lastType;
  vfMaybe = lastMaybe;
  const f = document.getElementById("vForm");
  f.innerHTML = `
    <div class="vfh"><b>${esc(boothCode(b))} ${esc(a && a.nick ? a.nick : b.name || "")}</b><span id="vfSum"></span></div>
    <div class="vfrow"><input class="inp" id="vfName" placeholder="물품 이름" enterkeyhint="next" autocomplete="off"></div>
    <div class="vfrow"><input class="inp" id="vfPrice" placeholder="가격(원)" inputmode="numeric" enterkeyhint="done"><input class="inp" id="vfQty" placeholder="수량 1" inputmode="numeric" style="flex:none;width:76px" enterkeyhint="done"><button type="button" class="maytog" id="vfMaybe" aria-pressed="${vfMaybe}" style="height:44px">고민중</button></div>
    <div class="vfrow"><div class="pick" id="vfType">${[
      ["pre", "선입금"],
      ["on", "현장"],
      ["free", "무료"],
    ]
      .map(([t, l]) => `<button type="button" class="${t}" data-type="${t}" aria-pressed="${vfType === t}">${l}</button>`)
      .join("")}</div><button type="button" class="btn pre" id="vfAdd" style="padding:0 18px">추가</button></div>
    <div class="vflist" id="vfList"></div>`;
  const nm = document.getElementById("vfName"),
    pr = document.getElementById("vfPrice"),
    q = document.getElementById("vfQty");
  VW.edit = null;
  const add = () => {
    const name = nm.value.trim();
    if (!name) {
      nm.focus();
      toast("물품 이름을 적어 주세요");
      return;
    }
    const ed = VW.edit && b.items.find((x) => x.id === VW.edit);
    if (ed) {
      const want = Math.max(1, parseInt(q.value, 10) || 1),
        cap = vfType === "pre" ? 2 : 1;
      if (!lockedItem(ed))
        Object.assign(ed, { name: name.slice(0, 60), price: vfType === "free" ? 0 : parsePrice(pr.value), type: vfType });
      Object.assign(ed, { want, maybe: vfMaybe, st: Math.min(cap, ed.st) });
      if (ed.maybe) ed.must = false;
      save();
      renderTop();
      toast(`‘${ed.name}’을 고쳤어요`);
      vfEditEnd();
      return;
    }
    b.items.push({
      id: uid(),
      name: name.slice(0, 60),
      price: vfType === "free" ? 0 : parsePrice(pr.value),
      want: Math.max(1, parseInt(q.value, 10) || 1),
      type: vfType,
      st: 0,
      must: false,
      maybe: vfMaybe,
      note: "",
      cat: lastCat,
      sample: "",
      artist: VW.aid || soleArtist(b) || "",
    });
    save();
    renderTop();
    nm.value = "";
    pr.value = "";
    q.value = "";
    drawWriteList();
    nm.focus();
  };
  nm.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !imeBusy(e)) {
      e.preventDefault();
      if (pr.value.trim() || vfType === "free") add();
      else pr.focus();
    }
  });
  pr.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !imeBusy(e)) {
      e.preventDefault();
      add();
    }
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !imeBusy(e)) {
      e.preventDefault();
      add();
    }
  });
  document.getElementById("vfAdd").addEventListener("click", add);
  document.getElementById("vfMaybe").addEventListener("click", (e) => {
    vfMaybe = lastMaybe = !vfMaybe;
    e.currentTarget.setAttribute("aria-pressed", String(vfMaybe));
  });
  document.getElementById("vfType").addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    vfType = lastType = t.dataset.type;
    document.querySelectorAll("#vfType button").forEach((x) => x.setAttribute("aria-pressed", String(x === t)));
    pr.placeholder = vfType === "free" ? "무료" : "가격(원)";
  });
  document.getElementById("vfList").addEventListener("click", (e) => {
    const ev = e.target.closest("[data-vfedit]");
    if (ev) {
      const it = b.items.find((x) => x.id === ev.dataset.vfedit);
      if (!it) return;
      if (VW.edit === it.id) {
        vfEditEnd();
        return;
      }
      VW.edit = it.id;
      nm.value = it.name;
      pr.value = it.type === "free" ? "" : String(it.price || "");
      q.value = it.want > 1 ? String(it.want) : "";
      vfType = it.type;
      vfMaybe = !!it.maybe;
      document.querySelectorAll("#vfType button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.type === vfType)));
      document.getElementById("vfMaybe").setAttribute("aria-pressed", String(vfMaybe));
      pr.placeholder = vfType === "free" ? "무료" : "가격(원)";
      const lk = lockedItem(it);
      nm.disabled = lk;
      pr.disabled = lk;
      document.querySelectorAll("#vfType button").forEach((x) => {
        x.disabled = lk;
      });
      document.getElementById("vfAdd").textContent = "수정";
      document.getElementById("vForm").classList.add("editing");
      drawWriteList();
      (lk ? q : nm).focus();
      return;
    }
    const m = e.target.closest("[data-vfmay]");
    if (m) {
      const it = b.items.find((x) => x.id === m.dataset.vfmay);
      if (it) {
        it.maybe = !it.maybe;
        if (it.maybe) it.must = false;
        save();
        renderTop();
        drawWriteList();
      }
      return;
    }
    const d = e.target.closest("[data-vfdel]");
    if (!d) return;
    const it = b.items.find((x) => x.id === d.dataset.vfdel);
    if (!it) return;
    if (VW.edit === it.id) vfEditEnd();
    b.items = b.items.filter((x) => x !== it);
    save();
    renderTop();
    drawWriteList();
    toast(`‘${it.name}’을 지웠어요`);
  });
  drawWriteList();
  if (window.matchMedia("(pointer:fine)").matches) setTimeout(() => nm.focus(), 50);
}
function vfEditEnd() {
  VW.edit = null;
  const f = document.getElementById("vForm");
  if (!f) return;
  f.classList.remove("editing");
  ["vfName", "vfPrice", "vfQty"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = "";
      el.disabled = false;
    }
  });
  document.querySelectorAll("#vfType button").forEach((x) => {
    x.disabled = false;
  });
  const a = document.getElementById("vfAdd");
  if (a) a.textContent = "추가";
  drawWriteList();
  const n = document.getElementById("vfName");
  if (n) n.focus();
}
function drawWriteList() {
  const b = findBooth(VW.bid),
    el = document.getElementById("vfList");
  if (!b || !el) return;
  const mine = b.items.filter((i) => (VW.aid && b.artists.length > 1 ? i.artist === VW.aid : true));
  const sum = mine.reduce((n, i) => n + (i.maybe ? 0 : amt(mkLine(b, i, null))), 0);
  document.getElementById("vfSum").textContent = mine.length ? `${mine.length}개 · ${won(sum)}` : "";
  el.innerHTML = mine.length
    ? mine
        .slice()
        .reverse()
        .map(
          (i) =>
            `<div class="vfi${i.maybe ? " may" : ""}${VW.edit === i.id ? " on" : ""}"><button type="button" class="vfe" data-vfedit="${i.id}" aria-label="${esc(i.name)} 고치기"><span>${esc(i.name)}</span><small>${typeLabel(i)} · ${i.type === "free" ? "무료" : won(i.price)}${i.want > 1 ? " × " + i.want : ""}</small></button><button type="button" class="vfmay" data-vfmay="${i.id}" aria-pressed="${!!i.maybe}" aria-label="${esc(i.name)} 고민중 표시">고민</button>${lockedItem(i) ? "" : `<button type="button" data-vfdel="${i.id}" aria-label="${esc(i.name)} 지우기">×</button>`}</div>`
        )
        .join("")
    : `<div class="vfempty">이미지를 보면서 살 물품을 적고 ‘추가’를 누르세요. 이미지를 누르면 확대돼요.</div>`;
  if (mine.length)
    el.insertAdjacentHTML(
      "afterbegin",
      `<div class="vfhint">${VW.edit ? `고치는 중이에요. 다 고치면 ‘수정’, 그만두려면 <button type="button" class="vfcancel" data-vfedit="${VW.edit}">취소</button>` : "물품을 누르면 고칠 수 있어요"}</div>`
    );
}
function stepViewer(d) {
  const n = VW.list.length;
  if (n < 2) return;
  VW.k = (VW.k + d + n) % n;
  showViewer();
}
const NON_EVENT = ["현장 판매", "부스 철수", "현장 판매 시작", "현장 판매 마감"];
function boothEvents(b) {
  return (b.times || []).filter((x) => (x.label || x.text) && !NON_EVENT.includes(x.label));
}
const ICON_GIFT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="13" rx="1.5"/><path d="M3 12h18M12 8v13M12 8S10.5 3 7.5 4.5 9 8 12 8zM12 8s1.5-5 4.5-3.5S15 8 12 8z"/></svg>';
function evChip(b) {
  const n = boothEvents(b).length;
  return n ? `<span class="tag evt">${ICON_GIFT}이벤트 ${n}</span>` : "";
}
function frChip(b) {
  if (!b.isFriend) return "";
  return (b.friends.length ? b.friends : ["지인"]).map((f) => `<span class="tag fr">♥ ${esc(f)}</span>`).join("");
}
function seatLabel(b) {
  if (b.half) return "반 부스";
  const sp = spanOf(b);
  return sp > 1 ? sp + "부스" : "한 부스";
}
function seatsHTML(b) {
  if (b.half)
    return `<span class="seats" aria-label="반 부스"><em class="${b.half === 2 ? "off" : ""}"></em><em class="${b.half === 1 ? "off" : ""}"></em></span>`;
  const sp = spanOf(b);
  return `<span class="seats ${sp > 1 ? "s" + sp : ""}" aria-label="${seatLabel(b)}">${"<em></em>".repeat(2 * sp)}</span>`;
}
const TAG_COLORS = ["#7A5AF8", "#E0457B", "#0E9F8F", "#C77700", "#3D6BF0", "#4F8A0B", "#C2410C", "#0A8FCF"];
function tagColor(t) {
  let h = 0;
  for (const c of t) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}
function tagStyle(t) {
  const c = tagColor(t);
  return `--tc:${c};--tb:${c}22`;
}
function tagChip(t) {
  return `<span class="tg" style="${tagStyle(t)}">#${esc(t)}</span>`;
}
function allTags() {
  const m = new Map();
  for (const b of S.booths) for (const t of b.tags) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
}
function sortedBooths(list) {
  return (list || S.booths).slice().sort((a, b) => {
    const sa = S.sections.indexOf(a.section),
      sb = S.sections.indexOf(b.section);
    if (sa !== sb) return (sa < 0 ? 999 : sa) - (sb < 0 ? 999 : sb);
    const na = parseInt(a.num, 10),
      nb = parseInt(b.num, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    const c = a.num.localeCompare(b.num, "ko");
    if (c) return c;
    return (a.half || 0) - (b.half || 0);
  });
}
function amt(i) {
  if (i.type === "free") return 0;
  return i.price * i.qty;
}
function normSub(x, type) {
  return {
    id: sid(x.id) || uid(),
    name: str(x.name || "")
      .trim()
      .slice(0, 40),
    price: x.price === null || x.price === undefined || x.price === "" ? null : Math.max(0, Math.round(num(x.price) || 0)),
    want: Math.max(0, Math.round(num(x.want) || 0)),
    st: Math.max(0, Math.min(type === "pre" ? 2 : 1, Math.round(num(x.st) || 0))),
    note: str(x.note || "").slice(0, 120),
  };
}
function subPrice(i, x) {
  return x.price == null ? i.price : x.price;
}
function mkLine(b, i, x) {
  const o = x || i;
  return {
    b,
    i,
    s: x,
    o,
    iid: i.id,
    sid: x ? x.id : "",
    name: x ? `${i.name} · ${x.name}` : i.name,
    price: x ? subPrice(i, x) : i.price,
    qty: o.want,
    type: i.type,
    must: i.must,
    maybe: i.maybe,
    cat: i.cat,
    artist: i.artist,
    sample: i.sample,
    note: x ? x.note || "" : i.note,
    pay: i.pay || "",
    forWho: i.forWho || "",
    get st() {
      return o.st;
    },
    set st(v) {
      o.st = v;
    },
  };
}
function linesOf(b) {
  const out = [];
  for (const i of b.items) {
    if (i.subs && i.subs.length) {
      for (const x of i.subs) if (x.want > 0) out.push(mkLine(b, i, x));
    } else if (i.want > 0) out.push(mkLine(b, i, null));
  }
  return out;
}
function findLine(b, iid, sid) {
  const i = b.items.find((x) => x.id === iid);
  if (!i) return null;
  if (sid) {
    const x = (i.subs || []).find((y) => y.id === sid);
    return x ? mkLine(b, i, x) : null;
  }
  return mkLine(b, i, null);
}
function typeOrder(x) {
  return x.type === "pre" ? 0 : x.type === "on" ? 1 : 2;
}
function typeLabel(i) {
  return i.type === "pre" ? "선입금" : i.type === "free" ? "무료" : "현장";
}
function md(d) {
  const p = d.split("-");
  return `${+p[1]}/${+p[2]}`;
}
/* 작가 한 명이 선입금(pre*)과 수요조사(sv*)를 따로·동시에 가질 수 있음 */
function periodOf(o) {
  return o && (o.preFrom || o.preTo || o.preLink)
    ? { from: o.preFrom, to: o.preTo, time: o.preToTime, link: o.preLink || "", kind: "" }
    : null;
}
function surveyOf(o) {
  return o && (o.svFrom || o.svTo || o.svLink)
    ? { from: o.svFrom, to: o.svTo, time: o.svToTime, link: o.svLink || "", kind: "survey" }
    : null;
}
function periodsOf(o) {
  return [surveyOf(o), periodOf(o)].filter(Boolean);
}
function kindWord(p) {
  return p && p.kind === "survey" ? "수요조사" : "선입금";
}
function stripKind(t) {
  return String(t).replace(/^(선입금|수요조사) /, "");
}
function periodText(p) {
  if (!p.from && !p.to) return "기간 미정";
  return `${p.from ? md(p.from) : ""} ~ ${p.to ? md(p.to) : ""}${p.to && p.time ? " " + p.time : ""}`.trim();
}
function periodEnd(p) {
  return p.to ? new Date(p.to + "T" + (p.time || "23:59")) : null;
}
function periodState(p, paid) {
  if (!p) return null;
  const w = kindWord(p);
  if (paid && p.kind !== "survey") return { cls: "ok", text: "입금 완료" };
  if (!p.from && !p.to) return { cls: "", text: `${w} 폼 있음` };
  const now = new Date();
  if (p.from && now < new Date(p.from + "T00:00")) return { cls: "", text: `${w} ${md(p.from)} 시작` };
  const e = periodEnd(p);
  if (e) {
    const ms = e - now;
    if (ms < 0) return { cls: "late", text: `${w} 마감됨` };
    const days = Math.floor(ms / 86400000);
    return {
      cls: days <= 2 ? "soon" : "",
      text: days >= 1 ? `${w} 마감 D-${days}` : `${w} 오늘 마감${p.time ? " " + p.time : ""}`,
    };
  }
  return { cls: "", text: `${w} 진행 중` };
}
function soleArtist(b) {
  return b.artists.length === 1 ? b.artists[0].id : "";
}
function pinSoleArtist(b) {
  const a = soleArtist(b);
  if (a) for (const i of b.items) i.artist = a;
}
function artistPaid(b, a) {
  const pre = linesOf(b).filter((i) => i.type === "pre" && !i.maybe && i.artist === a.id);
  return pre.length > 0 && pre.every((i) => i.st >= 1);
}
function boothPeriods(b) {
  const out = [];
  for (const a of b.artists)
    for (const ap of periodsOf(a)) out.push({ label: a.nick || "작가", a, p: ap, ps: periodState(ap, artistPaid(b, a)) });
  return out;
}
function periodRank(x) {
  const c = x.ps.cls;
  return c === "soon" ? 0 : c === "" ? 1 : c === "late" ? 2 : 3;
}
function periodChip(b) {
  const list = boothPeriods(b);
  if (!list.length) return "";
  const top = list.slice().sort((x, y) => periodRank(x) - periodRank(y) || (periodEnd(x.p) || 8.64e15) - (periodEnd(y.p) || 8.64e15))[0];
  return `<span class="dl ${top.ps.cls}">${top.label ? esc(top.label) + " " : ""}${esc(top.ps.text)}${list.length > 1 ? ` +${list.length - 1}` : ""}</span>`;
}
function boothPrePaid(b) {
  const pre = linesOf(b).filter((i) => i.type === "pre" && !i.maybe);
  return pre.length > 0 && pre.every((i) => i.st >= 1);
}
function isFinal(i) {
  return i.type === "pre" ? i.st >= 2 : i.st >= 1;
}
function isPaid(i) {
  return i.st >= 1;
}
function stLabel(i) {
  if (i.type === "pre") return ["입금 전", "입금 완료 · 수령 전", "수령 완료"][i.st];
  if (i.type === "free") return ["받기 전", "받음"][i.st];
  return ["구매 전", "구매 완료"][i.st];
}
function findBooth(id) {
  return S.booths.find((b) => b.id === id);
}
function boothStats(b) {
  let pre = 0,
    on = 0,
    free = 0,
    fin = 0,
    preAmt = 0,
    onAmt = 0,
    must = 0,
    maybe = 0,
    maybeAmt = 0;
  for (const i of linesOf(b)) {
    if (i.maybe) {
      maybe++;
      maybeAmt += amt(i);
      continue;
    }
    if (i.type === "free") {
      free++;
      if (isFinal(i)) fin++;
      if (i.must && !isFinal(i)) must++;
      continue;
    }
    if (i.type === "pre") {
      pre++;
      preAmt += amt(i);
    } else {
      on++;
      onAmt += amt(i);
    }
    if (isFinal(i)) fin++;
    if (i.must && !isFinal(i)) must++;
  }
  return { pre, on, free, fin, total: pre + on + free, preAmt, onAmt, must, maybe, maybeAmt };
}
function stamp(b, cls) {
  const code = boothCode(b);
  return `<span class="stamp ${code.length > 4 ? "wide" : ""} ${cls || ""}" style="--sc:${secColor(b.section)}"><b>${esc(code)}</b>${seatsHTML(b)}</span>`;
}
let toastT;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.pointerEvents = "";
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2200);
}
function confirmBox(msg, yesLabel, danger) {
  return new Promise((res) => {
    const d = document.getElementById("dlg"),
      y = document.getElementById("dlgYes"),
      n = document.getElementById("dlgNo");
    document.getElementById("dlgMsg").textContent = msg;
    document.getElementById("dlgIn").style.display = "none";
    y.textContent = yesLabel || "확인";
    y.className = "btn " + (danger ? "danger" : "");
    d.classList.add("show");
    const done = (v) => {
      d.classList.remove("show");
      y.onclick = n.onclick = d.onclick = null;
      res(v);
    };
    y.onclick = () => done(true);
    n.onclick = () => done(false);
    d.onclick = (e) => {
      if (e.target === d) done(false);
    };
  });
}
function choiceBox(msg, opts) {
  return new Promise((res) => {
    const d = document.getElementById("dlg"),
      row = d.querySelector(".btnrow");
    const keep = row.innerHTML;
    document.getElementById("dlgMsg").textContent = msg;
    document.getElementById("dlgIn").style.display = "none";
    row.style.flexDirection = "column";
    row.innerHTML =
      opts.map((o, k) => `<button class="btn ${o.cls || ""}" data-ch="${k}">${esc(o.label)}</button>`).join("") +
      `<button class="btn ghost" data-ch="-1">취소</button>`;
    d.classList.add("show");
    const done = (v) => {
      d.classList.remove("show");
      row.innerHTML = keep;
      row.style.flexDirection = "";
      row.onclick = d.onclick = null;
      res(v);
    };
    row.onclick = (e) => {
      const b = e.target.closest("[data-ch]");
      if (!b) return;
      const k = +b.dataset.ch;
      done(k < 0 ? null : opts[k].v);
    };
    d.onclick = (e) => {
      if (e.target === d) done(null);
    };
  });
}
let promptBusy = false;
function promptBox(msg, ph, o) {
  o = o || {};
  promptBusy = true;
  return new Promise((res) => {
    const d = document.getElementById("dlg"),
      y = document.getElementById("dlgYes"),
      n = document.getElementById("dlgNo"),
      inp = document.getElementById("dlgIn");
    document.getElementById("dlgMsg").textContent = msg;
    inp.style.display = "";
    inp.value = o.value != null ? String(o.value) : "";
    inp.placeholder = ph || "";
    inp.inputMode = o.numeric ? "numeric" : "text";
    y.textContent = o.yes || "추가";
    y.className = "btn pre";
    d.classList.add("show");
    setTimeout(() => {
      inp.focus();
      inp.select();
    }, 30);
    const val = () => (o.allowEmpty ? inp.value.trim() : inp.value.trim() || null);
    const done = (v) => {
      promptBusy = false;
      d.classList.remove("show");
      inp.style.display = "none";
      y.onclick = n.onclick = d.onclick = inp.onkeydown = null;
      res(v);
    };
    y.onclick = () => done(val());
    n.onclick = () => done(null);
    inp.onkeydown = (e) => {
      if (e.key === "Enter" && !imeBusy(e)) {
        e.preventDefault();
        done(val());
      }
    };
    d.onclick = (e) => {
      if (e.target === d) done(null);
    };
  });
}
function catOptions(cur) {
  const list = S.cats.slice();
  if (cur && !list.includes(cur)) list.push(cur);
  return (
    `<option value="">종류 없음</option>` +
    list.map((c) => `<option value="${esc(c)}" ${c === cur ? "selected" : ""}>${esc(c)}</option>`).join("") +
    `<option value="__new">+ 새 종류 추가…</option>`
  );
}
function bindCatSelect(sel, get, set) {
  sel.addEventListener("change", async () => {
    if (sel.value !== "__new") {
      set(sel.value);
      return;
    }
    const name = await promptBox("새 상품 종류 이름을 적어 주세요.\n이 행사의 종류 목록에 추가돼요.", "예: 키링, 굿즈 세트");
    const c = name ? name.slice(0, 20) : null;
    if (c) {
      if (!S.cats.includes(c)) S.cats.push(c);
      save();
      set(c);
    }
    sel.innerHTML = catOptions(get());
  });
}
async function copyText(text, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    toast("복사했어요");
    return;
  } catch (e) {}
  if (fallbackEl) {
    fallbackEl.focus();
    fallbackEl.select();
    try {
      if (document.execCommand("copy")) {
        toast("복사했어요");
        return;
      }
    } catch (e) {}
    toast("선택된 글을 길게 눌러 복사하세요");
  }
}
