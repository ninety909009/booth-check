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
/* ---------- 트윗 인포 읽기 ---------- */
/* 트위터 사진 주소 → 큰 사진 주소 (작은 미리보기 크기로 끌어와도 크게 보이게) */
function twimgBig(u) {
  const m = String(u || "").match(/^https?:\/\/pbs\.twimg\.com\/media\/([\w-]+)(?:\.(jpe?g|png|webp|gif))?(?::\w+)?(?:\?([^#]*))?$/i);
  if (!m) return u;
  const q = new URLSearchParams(m[3] || "");
  const fmt = q.get("format") || (m[2] ? m[2].toLowerCase().replace("jpeg", "jpg") : "jpg");
  return `https://pbs.twimg.com/media/${m[1]}?format=${fmt}&name=large`;
}
async function fetchJSON(url, ms) {
  if (!window.fetch || navigator.onLine === false) return null;
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ac && ac.abort(), ms || 6000);
  try {
    const r = await fetch(url, { signal: ac ? ac.signal : undefined, credentials: "omit", referrerPolicy: "no-referrer" });
    return r.ok ? await r.json() : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
/* X 임베드 위젯이 쓰는 글 번호 토큰 (공개 위젯과 같은 계산) */
function tweetToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}
/* 트윗 정보: ① X 임베드용 공개 데이터(syndication: 글·링크·사진) → ② oEmbed(글·작성자만, 링크는 t.co 짧은 주소)
   로그인 필요 없음. 브라우저에서 막히거나(CORS)·인터넷이 없거나·6초 넘으면 다음 방법, 둘 다 안 되면 null */
async function tweetInfo(handle, status) {
  const s = await fetchJSON(`https://cdn.syndication.twimg.com/tweet-result?id=${status}&token=${tweetToken(status)}&lang=ko`);
  if (s && typeof s === "object" && (s.text || s.user)) {
    const ents = (s.entities && s.entities.urls) || [];
    let text = String((s.note_tweet && s.note_tweet.text) || s.text || "");
    const labels = {};
    for (const e of ents)
      if (e && e.url && e.expanded_url) {
        text = text.split(e.url).join(e.expanded_url);
        labels[e.expanded_url] = e.display_url || "";
      }
    const media = ((s.entities && s.entities.media) || []).map((m) => m && m.url).filter(Boolean);
    for (const u of media) text = text.split(u).join("");
    const imgs = []
      .concat((s.mediaDetails || []).filter((m) => m && m.type === "photo").map((m) => m.media_url_https))
      .concat((s.photos || []).map((p) => p && p.url))
      .filter(Boolean)
      .map(twimgBig);
    const u = s.user || {};
    return {
      name: str(u.name || "")
        .trim()
        .slice(0, 30),
      handle: /^[A-Za-z0-9_]{1,15}$/.test(u.screen_name || "") ? u.screen_name : "",
      text,
      labels,
      images: [...new Set(imgs)].slice(0, 12),
      date: s.created_at ? new Date(s.created_at) : null,
    };
  }
  const url = `https://twitter.com/${handle}/status/${status}`;
  const o = await fetchJSON("https://publish.twitter.com/oembed?omit_script=1&lang=en&url=" + encodeURIComponent(url));
  if (!o || typeof o !== "object") return null;
  let text = "",
    date = null;
  const labels = {};
  try {
    const doc = new DOMParser().parseFromString(String(o.html || ""), "text/html");
    const p = doc.querySelector("blockquote p");
    if (p) {
      p.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
      p.querySelectorAll("a[href]").forEach((a) => {
        const h = a.getAttribute("href");
        if (/^https?:\/\/t\.co\//.test(h) && !/pic\.twitter\.com/.test(a.textContent)) {
          labels[h] = a.textContent;
          a.replaceWith(" " + h + " ");
        } else if (/pic\.twitter\.com/.test(a.textContent)) a.remove();
      });
      text = p.textContent;
    }
    const links = doc.querySelectorAll("blockquote > a");
    const last = links[links.length - 1];
    if (last && !isNaN(Date.parse(last.textContent))) date = new Date(Date.parse(last.textContent));
  } catch (e) {}
  const h = (String(o.author_url || "").match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})/i) || [])[1] || "";
  return {
    name: str(o.author_name || "")
      .trim()
      .slice(0, 30),
    handle: h,
    text,
    labels,
    images: [],
    date,
  };
}
/* 끌어다 놓은 것에서 주소 꺼내기: 사진(img src) 우선, 그다음 링크. 트윗 사진 페이지(…/photo/2)면 몇 번째 사진인지도 */
function dropUrls(dt) {
  const imgs = [],
    links = [];
  let photo = 0;
  const isImg = (u) => /^https?:\/\/pbs\.twimg\.com\/media\//i.test(u) || /\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(u);
  try {
    const html = dt.getData("text/html");
    if (html)
      new DOMParser()
        .parseFromString(html, "text/html")
        .querySelectorAll("img[src]")
        .forEach((i) => imgs.push(i.getAttribute("src")));
  } catch (e) {}
  const more = [];
  try {
    more.push(
      ...String(dt.getData("text/uri-list") || "")
        .split(/\r?\n/)
        .filter((l) => l && l[0] !== "#")
    );
    more.push(...String(dt.getData("text/plain") || "").split(/\s+/));
  } catch (e) {}
  for (const u of more.map((x) => normLink(x)).filter(Boolean)) {
    if (isImg(u)) imgs.push(u);
    else links.push(u);
    const pm = u.match(/\/status\/\d+\/photo\/(\d)/);
    if (pm) photo = +pm[1];
  }
  const ok = [
    ...new Set(
      imgs
        .map((u) => normLink(u))
        .filter((u) => u && isImg(u))
        .map(twimgBig)
    ),
  ];
  return { imgs: ok, links: [...new Set(links)], photo };
}
/* 폼 링크 종류: 윗치폼·TMM → 선입금, 구글폼·네이버폼 → 수요조사 (글 안의 '수요조사/선입금' 말이 있으면 그쪽이 우선) */
function formKind(url, label) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch (e) {
    return null;
  }
  const s = host + " " + String(label || "").toLowerCase();
  if (/witchform\./.test(s)) return "pre";
  if (/tmm/.test(s)) return "pre"; /* TMM: tmm.im/p/번호 */
  if (/forms\.gle|docs\.google\.com|form\.naver\.com/.test(s)) return "sv";
  return null;
}
const KW_SV = /수요\s*조사|수요\s*파악|수요\s*폼|수요\s*확인/g;
const KW_PRE = /선\s*입금|선입|예약\s*(?:판매|구매|폼)|통판|사전\s*(?:예약|구매)|결제\s*폼|입금\s*기간/g;
const RANGE_SEP = /^\s*(?:~|～|〜|∼|-|–|—|부터|에서)\s*~?\s*$/;
/* 한 줄에서 날짜(+시각) 찾기: 10/1, 10.1, 10-22, 10월 1일, 2026.10.01, (화), 23:59, 23시 59분, 오후 11시, 자정 */
function findDates(line) {
  const re = /(?:(\d{4})\s*[./년-]\s*)?(\d{1,2})\s*(?:[./-]|월\s*)\s*(\d{1,2})(?!\d)(?:\s*일)?/g;
  const out = [];
  let m;
  while ((m = re.exec(line))) {
    const before = line.slice(0, m.index);
    if (/[\d,.]$/.test(before)) continue;
    const mo = +m[2],
      d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    let end = m.index + m[0].length;
    let rest = line.slice(end);
    if (/^\s*(?:cm|mm|kg|g|%|원|개|부|장|매|x|×)/i.test(rest)) continue;
    const wd = rest.match(/^\s*\(\s*[월화수목금토일]\s*\)/);
    if (wd) {
      end += wd[0].length;
      rest = line.slice(end);
    }
    let time = "";
    const tm = rest.match(/^\s*(오전|오후|AM|PM)?\s*(\d{1,2})\s*(?::\s*(\d{2})|시(?:\s*(\d{1,2})\s*분|\s*(반))?)/i);
    const tw = rest.match(/^\s*(자정|정오)/);
    if (tm) {
      let h = +tm[2];
      const mi = tm[3] != null ? +tm[3] : tm[4] != null ? +tm[4] : tm[5] ? 30 : 0;
      if (/오후|PM/i.test(tm[1] || "") && h < 12) h += 12;
      if (/오전|AM/i.test(tm[1] || "") && h === 12) h = 0;
      if (h === 24 && mi === 0) time = "23:59";
      else if (h <= 23 && mi <= 59) time = String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0");
      if (time) end += tm[0].length;
    } else if (tw) {
      time = tw[1] === "자정" ? "23:59" : "12:00";
      end += tw[0].length;
    }
    out.push({ y: m[1] ? +m[1] : 0, mo, d, time, start: m.index, end });
  }
  return out;
}
function ymd(t, base, after) {
  let y = t.y || base.getFullYear();
  const mk = (yy) => new Date(yy, t.mo - 1, t.d);
  if (!t.y) {
    if (after && mk(y) < after) y++;
    else if (!after && mk(y) < new Date(base.getTime() - 90 * 864e5)) y++;
  }
  const dt = mk(y);
  if (dt.getMonth() !== t.mo - 1) return "";
  return `${y}-${String(t.mo).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
}
/* 트윗 글 → {sv:{from,to,time,link}, pre:{...}}. 줄마다 '수요조사/선입금' 말을 보고, 말이 없는 줄은 위쪽 제목을 따름.
   어림짐작이라 틀릴 수 있음 → 채운 뒤 확인 안내 */
function parseInfoText(text, labels, date) {
  const base = date instanceof Date && !isNaN(date) ? date : new Date();
  const out = {};
  const put = (k, f, v) => {
    if (!k || !v) return;
    out[k] = out[k] || {};
    if (!out[k][f]) out[k][f] = v;
  };
  const all = String(text || "");
  const hasSv = /수요\s*조사|수요\s*파악|수요\s*폼/.test(all),
    hasPre = /선\s*입금|선입|예약\s*(?:판매|구매)|통판/.test(all);
  const only = hasSv && !hasPre ? "sv" : hasPre && !hasSv ? "pre" : "";
  let cur = "";
  const pending = [],
    lp = {};
  for (const line of all.split(/\n+/)) {
    const kws = [];
    for (const [k, re] of [
      ["sv", KW_SV],
      ["pre", KW_PRE],
    ]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) kws.push({ k, at: m.index });
    }
    kws.sort((x, y) => x.at - y.at);
    const dates = findDates(line);
    const kindAt = (pos) => {
      const prev = kws.filter((x) => x.at <= pos);
      return prev.length ? prev[prev.length - 1].k : kws.length ? kws[0].k : "";
    };
    const lineKind = kws.length ? kindAt(dates.length ? dates[0].start : line.length) : "";
    if (kws.length) cur = lineKind;
    /* 날짜 */
    if (dates.length) {
      const k = lineKind || cur || only;
      let from = null,
        to = null;
      if (dates.length >= 2 && RANGE_SEP.test(line.slice(dates[0].end, dates[1].start))) {
        from = dates[0];
        to = dates[1];
      } else {
        const t = dates[0],
          pre = line.slice(Math.max(0, t.start - 8), t.start),
          post = line.slice(t.end, t.end + 6);
        if (/(?:~|～|〜|∼|마감)\s*$/.test(pre) || /^\s*(?:까지|마감)/.test(post) || /마감/.test(line)) to = t;
        else if (/^\s*(?:~|～|〜|∼|부터)/.test(post) || /시작|오픈/.test(line)) from = t;
      }
      const rec = { from: from ? ymd(from, base) : "", to: "", time: "" };
      if (to) {
        rec.to = ymd(to, base, rec.from ? new Date(rec.from + "T00:00") : null);
        rec.time = to.time;
      }
      if (rec.from || rec.to) {
        if (k) for (const f of ["from", "to", "time"]) put(k, f, rec[f]);
        else pending.push(rec);
      }
    }
    /* 폼 링크 */
    const urls = line.match(/https?:\/\/[^\s<>"')\]]+/g) || [];
    for (const u0 of urls) {
      const u = u0.replace(/[.,!?…]+$/, "");
      const fk = formKind(u, (labels || {})[u]);
      const formish = fk || /폼|form|신청|링크|주소/i.test(line);
      if (!formish || /(?:x|twitter)\.com|pbs\.twimg\.com/i.test(u)) continue;
      /* 윗치폼·TMM·구글폼 같은 알려진 폼 주소가 '링크' 말이 붙은 다른 주소(포스타입 등)보다 우선 */
      const k = lineKind || cur || fk || only,
        lk = normLink(u) || "",
        pr = fk ? 2 : 1;
      if (!k || !lk) continue;
      out[k] = out[k] || {};
      if (!out[k].link || pr > (lp[k] || 0)) {
        out[k].link = lk;
        lp[k] = pr;
      }
    }
  }
  /* 종류 말이 없던 기간: 폼이 한 종류뿐이면 그쪽 */
  const kinds = Object.keys(out);
  for (const rec of pending) {
    const k = kinds.length === 1 ? kinds[0] : "";
    if (k) for (const f of ["from", "to", "time"]) put(k, f, rec[f]);
  }
  return out;
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
