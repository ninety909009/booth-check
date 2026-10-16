/* 부스 체크 — 길게 누르기 메뉴·끌어서 옮기기·윗치폼 붙여넣기·행사/지인 탭·표로 한꺼번에 추가
   index.html이 js/ 파일들을 정해진 순서로 불러와요. 파일끼리 함수·변수를 그대로 함께 써요(전역). */
"use strict";
/* ---------- context menu (right-click / long-press) ---------- */
let ctxAt = 0,
  lpAt = 0,
  ctxSwallowT = 0,
  ctxOpenedAt = 0;
const ctxEl = document.getElementById("ctx");
const CTX_SEL =
  ".item[data-iid], .crow[data-iid], .agrp[data-aid], .mk[data-mid], .mb[data-bid], .gift, .pcard, .booth[data-id], .chead[data-id], .erow[data-id], .alertline[data-id], .mini[data-act=open]";
function goMap(b) {
  closeSheet();
  mapHall = b.pos.hall;
  mapSel = mapEdit ? { t: "b", id: b.id } : null;
  if (view !== "map") setView("map");
  else renderMap();
  requestAnimationFrame(() => centerOn(b));
}
function placeMap(b) {
  closeSheet();
  mapEdit = true;
  if (view !== "map") setView("map");
  else renderMap();
  requestAnimationFrame(() => {
    placeBooth(b);
    centerOn(b);
    toast("부스를 놓았어요. 끌어서 자리를 맞추세요.");
  });
}
function changed(msg) {
  save();
  if (sh && sh.kind === "booth") renderBoothItems();
  rerenderSoft();
  if (msg) toast(msg);
}
function flagChips(i) {
  return {
    chips: [
      {
        label: "★ 꼭 사기",
        cls: "must",
        on: () => i.must,
        fn: () => {
          i.must = !i.must;
          if (i.must) i.maybe = false;
          changed();
        },
      },
      {
        label: "고민중",
        cls: "may",
        on: () => i.maybe,
        fn: () => {
          i.maybe = !i.maybe;
          if (i.maybe) i.must = false;
          changed();
        },
      },
    ],
  };
}
function typeEntry(i) {
  return {
    icon: "tag",
    label: "판매 형태",
    hint: typeLabel(i),
    items: () =>
      [
        ["pre", "선입금"],
        ["on", "현장 구매"],
        ["free", "무료 배포"],
      ].map(([t, l]) => ({
        label: l,
        on: i.type === t,
        fn: () => {
          if (i.type === t) return;
          i.type = t;
          if (t !== "pre") {
            if (i.st > 1) i.st = 1;
            (i.subs || []).forEach((x) => {
              if (x.st > 1) x.st = 1;
            });
          }
          changed(`판매 형태: ${l}`);
        },
      })),
  };
}
function artistEntry(b, i) {
  if (b.artists.length < 2) return null;
  const ids = new Set(b.artists.map((a) => a.id)),
    cur = ids.has(i.artist) ? i.artist : "";
  const nameOf = (a, k) => a.nick || (a.id ? "작가 " + k : "공통");
  const all = [{ id: "", nick: "공통" }, ...b.artists];
  return {
    icon: "user",
    label: "작가",
    hint: nameOf(
      all.find((a) => a.id === cur) || all[0],
      all.findIndex((a) => a.id === cur)
    ),
    items: () =>
      all.map((a, k) => ({
        label: nameOf(a, k),
        on: a.id === cur,
        fn: () => {
          if (a.id === cur) return;
          i.artist = a.id;
          changed(`‘${i.name}’ → ${nameOf(a, k)}`);
        },
      })),
  };
}
async function editNote(b, i, x) {
  const o = x || i;
  const v = await promptBox(`‘${x ? i.name + " · " + x.name : i.name}’ 메모`, "예: 수량 제한, 받을 때 물어볼 것", {
    value: o.note || "",
    yes: "저장",
    allowEmpty: true,
  });
  if (v === null) return;
  o.note = v.slice(0, 120);
  changed(v ? "메모를 저장했어요" : "메모를 지웠어요");
}
async function addSubs(b, i) {
  const v = await promptBox(`‘${i.name}’의 하위 물품 이름을 적어 주세요.\n여러 개는 쉼표로 나눠요.`, "예: 하늘, 바다", {
    yes: "추가",
  });
  if (!v) return;
  const names = splitList(v).filter(Boolean);
  if (!names.length) return;
  if (!i.subs) i.subs = [];
  const fresh = names.map((n) => ({ id: uid(), name: n.slice(0, 40), price: null, want: 0, st: 0, note: "" }));
  if (!i.subs.length && i.want > 0) {
    fresh[0].want = i.want;
    fresh[0].st = i.st;
    i.want = 0;
    i.st = 0;
  }
  i.subs.push(...fresh);
  changed(`하위 물품 ${fresh.length}개를 추가했어요`);
}
function josaRo(w) {
  const c = (w || "").charCodeAt(w.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return "로";
  const j = c % 28;
  return j === 0 || j === 8 ? "로" : "으로";
}
function itemMenu(b, i, el) {
  const max = i.type === "pre" ? 2 : 1,
    L = mkLine(b, i, null);
  const next = stLabel({ type: i.type, st: i.st >= max ? 0 : i.st + 1 }).split(" · ")[0];
  const inSheet = !!(sh && sh.kind === "booth" && sh.id === b.id);
  return [
    {
      title: i.name || "물품",
      sub: `${boothCode(b)} · ${typeLabel(i)} · ${i.type === "free" ? "무료" : won(i.price)} · ${stLabel(L)}`,
    },
    {
      icon: "check",
      label: `${next}${josaRo(next)} 표시`,
      primary: 1,
      fn: () => {
        const ck = el.querySelector(".ck");
        if (ck) cycle(b.id, i.id, "", ck);
      },
    },
    i.want
      ? {
          step: {
            n: () => i.want,
            label: (n) => `수량 ${n}개`,
            fn: (d) => {
              i.want = Math.max(1, i.want + d);
              changed();
            },
          },
        }
      : null,
    i.type === "free"
      ? i.want
        ? {
            icon: "eyeoff",
            label: "안 받기",
            fn: () => {
              i.want = 0;
              i.st = 0;
              changed(`‘${i.name}’은 안 받기로 했어요`);
            },
          }
        : {
            icon: "check",
            label: "받기로 바꾸기",
            fn: () => {
              i.want = 1;
              i.st = 0;
              changed(`‘${i.name}’을 받기로 했어요`);
            },
          }
      : null,
    { sep: 1 },
    { icon: "memo", label: "메모", hint: i.note ? "있음" : "", fn: () => editNote(b, i, null) },
    flagChips(i),
    payEntry(i),
    { icon: "user", label: "대리구매", hint: i.forWho || "", fn: () => editFor(b, i) },
    typeEntry(i),
    artistEntry(b, i),
    { icon: "edit", label: "물품 수정", fn: () => openSheet({ kind: "item", id: b.id, iid: i.id }) },
    inSheet ? null : { icon: "open", label: "이 부스 열기", fn: () => openSheet({ kind: "booth", id: b.id }) },
    { sep: 1 },
    {
      icon: "trash",
      label: "삭제",
      danger: 1,
      fn: async () => {
        if (await confirmBox(`‘${i.name || "이 물품"}’을 구매 리스트에서 지울까요?`, "삭제", true)) {
          b.items = b.items.filter((y) => y !== i);
          renderTop();
          changed("삭제했어요");
        }
      },
    },
  ];
}
function catMenu(b, i, x) {
  if (x)
    return [
      { title: `${i.name} · ${x.name}`, sub: `${boothCode(b)} · ${i.type === "free" ? "무료" : won(subPrice(i, x))}` },
      {
        step: {
          n: () => x.want,
          label: (n) => (n ? `구매 리스트 ${n}개` : "담지 않음"),
          fn: (d) => {
            x.want = Math.max(0, x.want + d);
            if (!x.want) x.st = 0;
            changed();
          },
        },
      },
      { sep: 1 },
      { icon: "memo", label: "메모", hint: x.note ? "있음" : "", fn: () => editNote(b, i, x) },
      {
        icon: "text",
        label: "이름 바꾸기",
        fn: async () => {
          const v = await promptBox("하위 물품 이름을 적어 주세요.", "", { value: x.name, yes: "저장" });
          if (v) {
            x.name = v.slice(0, 40);
            changed();
          }
        },
      },
      i.type !== "free"
        ? {
            icon: "won",
            label: "가격 바꾸기",
            hint: x.price == null ? "위 가격과 같음" : won(x.price),
            fn: async () => {
              const v = await promptBox(
                `‘${x.name}’ 가격을 적어 주세요.\n비우면 위 물품 가격(${won(i.price)})과 같아져요.`,
                String(i.price),
                { value: x.price == null ? "" : x.price, numeric: true, yes: "저장", allowEmpty: true }
              );
              if (v === null) return;
              const pr = v === "" ? null : parsePrice(v);
              x.price = pr === i.price ? null : pr;
              changed();
            },
          }
        : null,
      { sep: 1 },
      {
        icon: "trash",
        label: "하위 물품 삭제",
        danger: 1,
        fn: async () => {
          if (await confirmBox(`‘${x.name}’ 하위 물품을 지울까요?`, "삭제", true)) {
            i.subs = i.subs.filter((y) => y !== x);
            changed();
          }
        },
      },
    ];
  const subs = (i.subs || []).length;
  return [
    { title: i.name || "물품", sub: `${boothCode(b)} · ${typeLabel(i)} · ${i.type === "free" ? "무료" : won(i.price)}` },
    subs
      ? null
      : {
          step: {
            n: () => i.want,
            label: (n) => (n ? `구매 리스트 ${n}개` : "담지 않음"),
            fn: (d) => {
              i.want = Math.max(0, i.want + d);
              if (!i.want) i.st = 0;
              changed();
            },
          },
        },
    subs ? null : { sep: 1 },
    { icon: "memo", label: "메모", hint: i.note ? "있음" : "", fn: () => editNote(b, i, null) },
    { icon: "plus", label: "하위 물품 추가", fn: () => addSubs(b, i) },
    flagChips(i),
    typeEntry(i),
    artistEntry(b, i),
    { icon: "edit", label: "물품 수정", fn: () => openSheet({ kind: "item", id: b.id, iid: i.id }) },
    { sep: 1 },
    {
      icon: "trash",
      label: "물품 삭제",
      danger: 1,
      fn: async () => {
        if (await confirmBox(`‘${i.name || "이 물품"}’을 구매 리스트에서 지울까요?`, "삭제", true)) {
          b.items = b.items.filter((y) => y !== i);
          renderTop();
          changed("삭제했어요");
        }
      },
    },
  ];
}
function boothMenu(b, onMap) {
  const hl = b.pos && S.halls.find((h) => h.id === b.pos.hall),
    st = boothStats(b);
  return [
    { title: `${boothCode(b)} ${b.name || "이름 없는 부스"}`, sub: `구매 ${st.fin}/${st.total} 완료` },
    { icon: "open", label: "부스 열기", fn: () => openSheet({ kind: "booth", id: b.id }) },
    { icon: "edit", label: "부스 편집", fn: () => openSheet({ kind: "boothForm", id: b.id }) },
    onMap && view === "map"
      ? null
      : {
          icon: "pin",
          label: hl ? "배치도에서 보기" : "배치도에 놓기",
          hint: hl ? hl.name : "",
          fn: () => (hl ? goMap(b) : placeMap(b)),
        },
    onMap && mapEdit && !b.half
      ? {
          icon: "rotate",
          label: "회전",
          fn: () => {
            b.pos.rot = b.pos.rot ? 0 : 1;
            save();
            renderMapItems();
          },
        }
      : null,
    onMap && mapEdit
      ? {
          icon: "out",
          label: "배치도에서 빼기",
          fn: () => {
            b.pos = null;
            mapSel = null;
            save();
            renderMapItems();
            renderMapBottom();
          },
        }
      : null,
    b.items.some((i) => i.type !== "free")
      ? {
          icon: "won",
          label: "결제 수단 한꺼번에",
          hint: (() => {
            const ps = [...new Set(b.items.filter((i) => i.type !== "free").map((i) => i.pay || ""))];
            return ps.length === 1 ? PAY_LABEL[ps[0]] || "미정" : "섞여 있음";
          })(),
          items: () =>
            [
              ["", "미정"],
              ["cash", "현금"],
              ["transfer", "계좌이체"],
              ["card", "카드"],
            ].map(([v, l]) => ({
              label: l,
              fn: () => {
                for (const i of b.items) if (i.type !== "free") i.pay = v;
                changed(`${boothCode(b)} 물품 결제 수단: ${l}`);
              },
            })),
        }
      : null,
    {
      chips: [
        {
          label: "♥ 지인 부스",
          cls: "fr",
          on: () => b.isFriend,
          fn: () => {
            b.isFriend = !b.isFriend;
            if (!b.isFriend) b.friends = [];
            changed(b.isFriend ? "지인 부스로 표시했어요" : "지인 표시를 뺐어요");
          },
        },
      ],
    },
    { sep: 1 },
    {
      icon: "trash",
      label: "부스 삭제",
      danger: 1,
      fn: async () => {
        if (!(await confirmBox(`${boothCode(b)} ${b.name || ""} 부스와 물품 ${b.items.length}개를 지울까요?`, "삭제", true))) return;
        if (sh && sh.id === b.id) closeSheet();
        S.booths = S.booths.filter((x) => x !== b);
        renderTop();
        changed("삭제했어요");
      },
    },
  ];
}
function artistMenu(b, aid) {
  const a = b.artists.find((x) => x.id === aid);
  if (!a) return null;
  const n = b.items.filter((i) => i.artist === a.id).length;
  return [
    { title: a.nick || "작가", sub: `${boothCode(b)} · 물품 ${n}개` },
    {
      icon: a.hidden ? "eye" : "eyeoff",
      label: a.hidden ? "작가 보이기" : "작가 숨기기",
      fn: () => {
        a.hidden = !a.hidden;
        changed(a.hidden ? `${a.nick || "작가"}의 물품을 숨겼어요` : "");
      },
    },
    a.site ? { icon: "link", label: "사이트 열기", hint: siteLabel(a.site), fn: () => window.open(a.site, "_blank", "noopener") } : null,
    a.info ? { icon: "link", label: "인포 열기", fn: () => window.open(a.info, "_blank", "noopener") } : null,
    (a.imgs || []).length
      ? {
          icon: "eye",
          label: "인포 이미지 보기",
          hint: a.imgs.length + "장",
          fn: () => openViewer(a.imgs, 0, { bid: b.id, aid: a.id }),
        }
      : null,
    a.preLink ? { icon: "link", label: `${kindWord(a)} 폼 열기`, fn: () => window.open(a.preLink, "_blank", "noopener") } : null,
    (a.imgs || []).length
      ? { icon: "memo", label: "인포 보며 물품 적기", fn: () => openViewer(a.imgs, 0, { bid: b.id, aid: a.id, write: true }) }
      : null,
    { sep: 1 },
    { icon: "edit", label: "작가 정보 편집", fn: () => openSheet({ kind: "boothForm", id: b.id }) },
  ];
}
function ctxFor(el) {
  return lockMenu(el, ctxFor0(el));
}
function ctxFor0(el) {
  if (el.matches(".item[data-iid]")) {
    const b = findBooth(el.dataset.bid),
      i = b && b.items.find((x) => x.id === el.dataset.iid);
    return i ? itemMenu(b, i, el) : null;
  }
  if (el.matches(".crow[data-iid]")) {
    const b = findBooth(el.dataset.bid),
      i = b && b.items.find((x) => x.id === el.dataset.iid);
    if (!i) return null;
    const x = el.dataset.sid ? (i.subs || []).find((y) => y.id === el.dataset.sid) : null;
    return catMenu(b, i, x);
  }
  if (el.matches(".agrp[data-aid]")) {
    const b = findBooth(el.dataset.bid);
    return b ? artistMenu(b, el.dataset.aid) : null;
  }
  if (el.matches(".mk[data-mid]")) {
    const m = S.marks.find((x) => x.id === el.dataset.mid);
    if (!m || !mapEdit) return null;
    return [
      { title: m.label || "구조물", sub: "배치도 구조물" },
      {
        icon: "text",
        label: "이름 바꾸기",
        fn: async () => {
          const v = await promptBox("구조물 이름을 적어 주세요.", "예: 입구", { value: m.label, yes: "저장", allowEmpty: true });
          if (v === null) return;
          m.label = v;
          save();
          renderMapItems();
          renderMapBottom();
        },
      },
      { sep: 1 },
      {
        icon: "trash",
        label: "구조물 삭제",
        danger: 1,
        fn: async () => {
          if (await confirmBox(`‘${m.label || "구조물"}’을 지울까요?`, "삭제", true)) {
            S.marks = S.marks.filter((x) => x !== m);
            mapSel = null;
            save();
            renderMapItems();
            renderMapBottom();
          }
        },
      },
    ];
  }
  if (el.matches(".mb[data-bid]")) {
    const b = findBooth(el.dataset.bid);
    return b ? boothMenu(b, true) : null;
  }
  if (el.matches(".gift")) {
    const ck = el.querySelector("[data-gid]");
    const p = ck && S.people.find((x) => x.id === ck.dataset.pid),
      g = p && p.gifts.find((x) => x.id === ck.dataset.gid);
    if (!g) return null;
    return [
      { title: g.name, sub: `♥ ${p.nick} 에게` },
      {
        icon: "check",
        label: g.done ? "안 챙긴 걸로" : "챙김",
        primary: !g.done,
        fn: () => {
          g.done = !g.done;
          save();
          renderPeople();
        },
      },
      { sep: 1 },
      {
        icon: "trash",
        label: "삭제",
        danger: 1,
        fn: () => {
          p.gifts = p.gifts.filter((x) => x !== g);
          save();
          renderPeople();
        },
      },
    ];
  }
  if (el.matches(".pcard")) {
    const pb = el.querySelector("[data-pid]");
    const p = pb && S.people.find((x) => x.id === pb.dataset.pid);
    if (!p) return null;
    const b = p.boothId && findBooth(p.boothId);
    return [
      { title: "♥ " + (p.nick || "지인"), sub: `챙길 것 ${p.gifts.filter((g) => g.done).length}/${p.gifts.length}` },
      {
        icon: "check",
        label: p.met ? "아직 못 만났어요" : "만남 완료",
        primary: !p.met,
        fn: () => {
          p.met = !p.met;
          save();
          renderPeople();
        },
      },
      { icon: "edit", label: "지인 편집", fn: () => openSheet({ kind: "person", id: p.id }) },
      b ? { icon: "open", label: "부스 열기", hint: boothCode(b), fn: () => openSheet({ kind: "booth", id: b.id }) } : null,
      { sep: 1 },
      {
        icon: "trash",
        label: "지인 삭제",
        danger: 1,
        fn: async () => {
          if (await confirmBox(`‘${p.nick}’ 지인을 목록에서 지울까요?`, "삭제", true)) {
            S.people = S.people.filter((x) => x !== p);
            save();
            renderPeople();
          }
        },
      },
    ];
  }
  const b = el.dataset.id && findBooth(el.dataset.id);
  return b ? boothMenu(b, false) : null;
}
const CI = (() => {
  const sv = (d) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  return {
    memo: sv('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
    link: sv('<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    plus: sv('<path d="M12 5v14M5 12h14"/>'),
    edit: sv('<path d="M4 6h10M4 12h6M4 18h8"/><path d="M15 18l5-5-2-2-5 5v2h2z"/>'),
    trash: sv('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    pin: sv('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
    open: sv('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>'),
    rotate: sv('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
    eye: sv('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeoff: sv(
      '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'
    ),
    user: sv('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'),
    tag: sv('<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1.5"/>'),
    check: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    out: sv('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'),
    text: sv('<path d="M5 7V5h14v2M12 5v14M9 19h6"/>'),
    won: sv('<path d="M4 7l3 10 3-8h4l3 8 3-10M3 11h18"/>'),
    more: sv('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
    heart: sv('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'),
    back: sv('<path d="M15 5l-7 7 7 7"/>'),
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M9 5l7 7-7 7"/></svg>',
  };
})();
let ctxStack = [],
  ctxPos = { x: 0, y: 0 };
const ctxVal = (v) => (typeof v === "function" ? v() : v);
function ctxRender(list) {
  list = list.filter(Boolean);
  ctxEl._list = list;
  ctxEl.innerHTML =
    (ctxStack.length ? `<button type="button" class="mi cback" data-cback>${CI.back}<span class="ml">뒤로</span></button>` : "") +
    list
      .map((it, k) => {
        if (it.sep) return "<hr>";
        if (it.title) return `<div class="cxh"><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(ctxVal(it.sub))}</small>` : ""}</div>`;
        if (it.chips)
          return `<div class="cchips">${it.chips
            .filter(Boolean)
            .map(
              (c, j) =>
                `<button type="button" class="cchip ${c.cls || ""} ${ctxVal(c.on) ? "on" : ""}" data-cc="${k}:${j}" aria-pressed="${!!ctxVal(c.on)}">${esc(c.label)}</button>`
            )
            .join("")}</div>`;
        if (it.step)
          return `<div class="cstep"><button type="button" data-cs="${k}" data-d="-1" aria-label="하나 빼기">−</button><span>${esc(it.step.label(it.step.n()))}</span><button type="button" data-cs="${k}" data-d="1" aria-label="하나 더">+</button></div>`;
        return `<button type="button" role="menuitem" class="mi ${it.danger ? "danger" : ""} ${it.primary ? "primary" : ""}" data-ck="${k}">${it.icon ? CI[it.icon] || "" : ""}<span class="ml">${esc(it.label)}</span>${it.hint ? `<span class="hint">${esc(ctxVal(it.hint))}</span>` : ""}${it.items ? CI.chev : ctxVal(it.on) ? '<span class="on">✓</span>' : ""}</button>`;
      })
      .join("")
      .replace(/^(<hr>)+|(<hr>)+$/g, "")
      .replace(/(<hr>){2,}/g, "<hr>");
}
function ctxPlace() {
  const w = ctxEl.offsetWidth,
    h = ctxEl.offsetHeight,
    { x, y } = ctxPos;
  ctxEl.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + "px";
  ctxEl.style.top = (y + h > innerHeight - 8 ? Math.max(8, Math.min(y - h, innerHeight - h - 8)) : y) + "px";
}
function openCtx(x, y, list) {
  ctxStack = [];
  ctxPos = { x, y };
  ctxRender(list);
  ctxEl.classList.add("show");
  ctxOpenedAt = Date.now();
  ctxPlace();
  ctxEl.onclick = (e) => {
    if (e.target.closest("[data-cback]")) {
      ctxRender(ctxStack.pop());
      ctxPlace();
      return;
    }
    const cc = e.target.closest("[data-cc]");
    if (cc) {
      const [k, j] = cc.dataset.cc.split(":").map(Number);
      const c = ctxEl._list[k].chips.filter(Boolean)[j];
      c.fn();
      ctxRender(ctxEl._list);
      return;
    }
    const cs = e.target.closest("[data-cs]");
    if (cs) {
      ctxEl._list[+cs.dataset.cs].step.fn(+cs.dataset.d);
      ctxRender(ctxEl._list);
      return;
    }
    const bt = e.target.closest("[data-ck]");
    if (!bt) return;
    const it = ctxEl._list[+bt.dataset.ck];
    if (!it) return;
    if (it.items) {
      ctxStack.push(ctxEl._list);
      ctxRender([{ title: it.label }, ...it.items()]);
      ctxPlace();
      return;
    }
    closeCtx();
    if (it.fn) it.fn();
  };
}

function closeCtx() {
  if (!ctxEl.classList.contains("show")) return false;
  ctxEl.classList.remove("show");
  ctxEl.innerHTML = "";
  ctxStack = [];
  return true;
}
document.addEventListener("contextmenu", (e) => {
  if (e.target.closest("#ctx")) {
    e.preventDefault();
    return;
  }
  if (e.target.closest("input,textarea,select,a[href]")) return;
  const el = e.target.closest(CTX_SEL);
  if (!el) return;
  e.preventDefault();
  if (Date.now() - lpAt < 1200) return;
  const m = ctxFor(el);
  if (!m) return;
  ctxAt = Date.now();
  openCtx(e.clientX, e.clientY, m);
});
let lpT = null,
  lpP = null;
function lpCancel() {
  clearTimeout(lpT);
  lpT = null;
}
document.addEventListener(
  "pointerdown",
  (e) => {
    if (ctxEl.classList.contains("show") && !e.target.closest("#ctx")) {
      closeCtx();
      ctxSwallowT = Date.now();
    }
    if (e.pointerType === "mouse") return;
    if (lpT) {
      lpCancel();
      return;
    }
    if (e.target.closest("input,textarea,select,a[href],[data-grip],#ctx")) return;
    const el = e.target.closest(CTX_SEL);
    if (!el) return;
    lpP = { x: e.clientX, y: e.clientY };
    lpT = setTimeout(() => {
      lpT = null;
      const m = ctxFor(el);
      if (!m) return;
      lpAt = ctxAt = Date.now();
      if (navigator.vibrate)
        try {
          navigator.vibrate(10);
        } catch (_) {}
      openCtx(lpP.x, lpP.y, m);
    }, 500);
  },
  true
);
document.addEventListener(
  "pointermove",
  (e) => {
    if (lpT && lpP && Math.hypot(e.clientX - lpP.x, e.clientY - lpP.y) > 10) lpCancel();
  },
  { passive: true }
);
document.addEventListener("pointerup", lpCancel, { passive: true });
document.addEventListener("pointercancel", lpCancel, { passive: true });
document.addEventListener(
  "click",
  (e) => {
    if (e.target.closest("#ctx")) return;
    if (Date.now() - lpAt < 900 || Date.now() - ctxSwallowT < 400) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  true
);
document.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Escape" && closeCtx()) {
      e.stopPropagation();
    }
  },
  true
);
document.addEventListener(
  "scroll",
  (e) => {
    if (!ctxEl.contains(e.target) && Date.now() - ctxOpenedAt > 250) closeCtx();
  },
  true
);
window.addEventListener("resize", closeCtx);

/* ---------- drag items between artists ---------- */
let dnd = null;
document.addEventListener("pointerdown", (e) => {
  const g = e.target.closest("[data-grip]");
  if (!g || (e.pointerType === "mouse" && e.button !== 0)) return;
  const row = g.closest(".item"),
    box = document.getElementById("bItems");
  if (!row || !box) return;
  e.preventDefault();
  lpCancel();
  const r = row.getBoundingClientRect();
  const ghost = row.cloneNode(true);
  ghost.classList.add("dragghost");
  ghost.style.width = r.width + "px";
  ghost.style.left = r.left + "px";
  ghost.style.top = r.top + "px";
  document.body.appendChild(ghost);
  row.classList.add("dragsrc");
  box.classList.add("dnd");
  dnd = {
    id: e.pointerId,
    row,
    ghost,
    dy: e.clientY - r.top,
    x: e.clientX,
    y: e.clientY,
    bid: row.dataset.bid,
    iid: row.dataset.iid,
    target: null,
  };
  try {
    g.setPointerCapture(e.pointerId);
  } catch (_) {}
  const body = sheet.querySelector(".sh-body");
  dnd.timer = setInterval(() => {
    if (!dnd || !body) return;
    const br = body.getBoundingClientRect();
    if (dnd.y < br.top + 60) body.scrollTop -= 10;
    else if (dnd.y > br.bottom - 60) body.scrollTop += 10;
    dndHit();
  }, 16);
});
function dndHit() {
  if (!dnd) return;
  const el = document.elementFromPoint(dnd.x, dnd.y);
  const tb = el && el.closest("#bItems .agbox");
  if (tb !== dnd.target) {
    if (dnd.target) dnd.target.classList.remove("dropon");
    dnd.target = tb;
    if (tb) tb.classList.add("dropon");
  }
}
document.addEventListener("pointermove", (e) => {
  if (!dnd || e.pointerId !== dnd.id) return;
  dnd.x = e.clientX;
  dnd.y = e.clientY;
  dnd.ghost.style.top = e.clientY - dnd.dy + "px";
  dndHit();
});
function dndEnd(e) {
  if (!dnd || e.pointerId !== dnd.id) return;
  const d = dnd;
  dnd = null;
  clearInterval(d.timer);
  d.ghost.remove();
  d.row.classList.remove("dragsrc");
  const box = document.getElementById("bItems");
  if (box) box.classList.remove("dnd");
  if (d.target) d.target.classList.remove("dropon");
  if (e.type !== "pointerup" || !d.target) return;
  const b = findBooth(d.bid),
    i = b && b.items.find((x) => x.id === d.iid);
  if (!i) return;
  const aid = d.target.dataset.aid,
    ids = new Set(b.artists.map((a) => a.id)),
    cur = ids.has(i.artist) ? i.artist : "";
  if (aid === cur) return;
  i.artist = aid;
  const a = b.artists.find((x) => x.id === aid);
  changed(`‘${i.name}’ → ${aid ? a.nick || "작가" : "공통"}`);
}
document.addEventListener("pointerup", dndEnd);
document.addEventListener("pointercancel", dndEnd);

/* ---------- witchform paste ---------- */
const WF_ST = "준비\\s*중|일시\\s*품절|품절|매진|sold\\s*out|마감";
const WF_ST_END = new RegExp("[\\s_\\-–·:]*[(\\[【]?\\s*(" + WF_ST + ")\\s*[)\\]】]?\\s*$", "i");
const WF_ST_START = new RegExp("^[(\\[【]\\s*(" + WF_ST + ")\\s*[)\\]】]\\s*", "i");
function wfStatus(name) {
  let n = String(name || "").trim(),
    st = "";
  for (let g = 0; g < 3; g++) {
    const m = n.match(WF_ST_END) || n.match(WF_ST_START);
    if (!m) break;
    st = st || m[1];
    n = n.replace(m[0], "").trim();
  }
  return { name: n, st: /준비/.test(st) ? "prep" : st ? "sold" : "" };
}
function wfUnit(u) {
  u = String(u || "").trim();
  return u && !/^1\s*개$/.test(u) ? u : "";
}
function parseWitch(text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/ /g, " ").trim())
    .filter(Boolean);
  const out = [];
  let pend = null;
  const add = (rawName, price, unitRaw, extraRaw) => {
    const ns = wfStatus(String(rawName).replace(/^(?:\d+\s*[.)]\s*)+/, "")),
      us = wfStatus(unitRaw),
      es = wfStatus(extraRaw);
    const name = ns.name;
    if (!name) return;
    const st = ns.st || us.st || es.st;
    out.push({
      name,
      price: parsePrice(price),
      unit: wfUnit(us.name),
      extra: es.name,
      qty: 0,
      on: false,
      sold: st === "sold",
      prep: st === "prep",
    });
  };
  for (const ln of lines) {
    const q = ln.match(/^[-−–]\s*(\d+)?\s*\+$/);
    if (q) {
      pend = null;
      if (out.length && q[1] != null) {
        const r = out[out.length - 1];
        r.qty = Math.max(0, +q[1]);
        r.on = r.qty > 0;
      }
      continue;
    }
    // 이름 (3,000원/1개)
    let m = ln.match(/^(.+?)\s*[(（]\s*([\d,]+)\s*원\s*(?:\/\s*([^)）]*))?[)）]\s*(.*)$/);
    if (m) {
      add(m[1], m[2], m[3], m[4]);
      pend = null;
      continue;
    }
    // 3,000원 / 1개  (앞 줄이 이름)
    m = ln.match(/^(?:가격\s*[:：]?\s*)?([\d,]+)\s*원\s*(?:\/\s*(.*))?$/);
    if (m) {
      if (pend) {
        add(pend, m[1], m[2], "");
        pend = null;
      }
      continue;
    }
    // 이름 3,000원 / 1개
    m = ln.match(/^(.*?\S)\s+([\d,]+)\s*원\s*(?:\/\s*(.*))?$/);
    if (m && /[^\d\s.,)]/.test(m[1])) {
      add(m[1], m[2], m[3], "");
      pend = null;
      continue;
    }
    if (/^(?:수량|선택|옵션|합계|총\s*(?:금액|합계)?|금액|[-+−–]|\d+\s*개?|남은\s*수량.*|재고.*)$/.test(ln)) continue;
    pend = ln;
  }
  return out;
}
function commonPrefix(names) {
  if (names.length < 2) return "";
  const words = names.map((n) => n.split(/\s+/)),
    w = words[0][0];
  return w && words.every((ws) => ws[0] === w && ws.length > 1) ? w : "";
}
function renderWitch() {
  const b = findBooth(sh.id);
  if (!b) {
    closeSheet();
    return;
  }
  sh.type = sh.type || "pre";
  if (sh.cat == null) sh.cat = lastCat;
  if (sh.art == null) sh.art = "";
  sheet.innerHTML = `
    <div class="sh-grab" id="grab"><div class="handle"></div>
      <div class="sh-head sh-plain"><button class="back" data-act="backBooth">${ICON_BACK}${esc(boothCode(b))}</button><h3 style="flex:1">윗치폼 붙여넣기</h3></div></div>
    <div class="sh-body">
      <p class="bulkhint">윗치폼 상품 목록을 <b>통째로 복사해 붙여 넣으세요.</b> 이름·가격은 알아서 읽어요. <b>살 물품만 체크</b>하면 구매 리스트에 들어가요.</p>
      <textarea class="inp" id="wfIn" style="min-height:130px" placeholder="복스알래 씰스티커 01&#10;3,000원 / 1개&#10;복스알래 씰스티커 02&#10;3,000원 / 1개">${esc(sh.text || "")}</textarea>
      <div class="wfopts">
<div class="pick" id="wfType">
  <button class="pre" data-type="pre" aria-pressed="${sh.type === "pre"}">선입금</button>
  <button class="on" data-type="on" aria-pressed="${sh.type === "on"}">현장</button>
  <button class="free" data-type="free" aria-pressed="${sh.type === "free"}">무료</button>
</div>
<div class="grid2" style="margin:0">
  <select class="inp" id="wfCat" aria-label="상품 종류">${catOptions(sh.cat)}</select>
  ${b.artists.length > 1 ? `<select class="inp" id="wfArt" aria-label="작가">${artOptions(b, sh.art)}</select>` : "<span></span>"}
</div>
<label class="checkline" id="wfStripRow" style="margin:0"></label>
<label class="checkline" id="wfGroupRow" style="margin:0"></label>
      </div>
      <div class="itembox" id="wfList"></div>
      <div class="bulkfoot"><div class="sum" id="wfSum"></div><button class="btn pre" id="wfAdd" data-act="wfAdd" disabled>추가하기</button></div>
    </div>`;
  const inp = document.getElementById("wfIn");
  inp.addEventListener("input", () => {
    sh.text = inp.value;
    wfParse();
  });
  document.getElementById("wfType").addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    sh.type = t.dataset.type;
    document.querySelectorAll("#wfType button").forEach((x) => x.setAttribute("aria-pressed", String(x === t)));
    wfDraw();
  });
  bindCatSelect(
    document.getElementById("wfCat"),
    () => sh.cat || "",
    (v) => {
      sh.cat = v;
    }
  );
  const wa = document.getElementById("wfArt");
  if (wa)
    wa.addEventListener("change", () => {
      sh.art = wa.value;
    });
  document.getElementById("wfList").addEventListener("change", (e) => {
    const t = e.target,
      k = +t.dataset.wk;
    if (isNaN(k)) return;
    const r = sh.rows[k];
    if (t.type === "checkbox") {
      r.on = t.checked;
      if (r.on && !r.qty) r.qty = 1;
    } else {
      r.qty = Math.max(0, parseInt(t.value, 10) || 0);
      r.on = r.qty > 0;
    }
    wfDraw();
  });
  document.getElementById("wfStripRow").addEventListener("change", (e) => {
    if (e.target.id === "wfStrip") {
      sh.strip = e.target.checked;
      wfDraw();
    }
  });
  document.getElementById("wfGroupRow").addEventListener("change", (e) => {
    if (e.target.id === "wfGroup") {
      sh.group = e.target.checked;
      wfDraw();
    }
  });
  if (sh.text) wfParse();
  else wfDraw();
  bindDrag();
  setTimeout(() => {
    if (!sh.text && window.matchMedia("(pointer:fine)").matches) inp.focus();
  }, 250);
}
function wfParse() {
  const prev = new Map((sh.rows || []).map((r) => [r.name, r]));
  sh.rows = parseWitch(sh.text).map((r) => {
    const o = prev.get(r.name);
    return o ? { ...r, on: o.on, qty: o.qty } : r;
  });
  sh.prefix = commonPrefix(sh.rows.map((r) => r.name));
  if (sh.strip == null) sh.strip = false;
  wfDraw();
}
function wfName(r) {
  return sh.strip && sh.prefix && r.name.startsWith(sh.prefix + " ") ? r.name.slice(sh.prefix.length + 1) : r.name;
}
function wfKey(n) {
  const w = n.split(/\s+/);
  return w.length > 1 ? w.slice(0, -1).join(" ") : null;
}
function wfPlan(group) {
  group = false;
  const rows = sh.rows || [];
  if (!group) return rows.map((r, k) => ({ k }));
  const groups = new Map();
  rows.forEach((r, k) => {
    const key = wfKey(wfName(r));
    if (key) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(k);
    }
  });
  const out = [],
    used = new Set();
  rows.forEach((r, k) => {
    if (used.has(k)) return;
    const key = wfKey(wfName(r)),
      g = key && groups.get(key);
    if (g && g.length > 1) {
      g.forEach((x) => used.add(x));
      out.push({ group: key, ks: g });
    } else out.push({ k });
  });
  return out;
}
function wfDraw() {
  const list = document.getElementById("wfList"),
    sum = document.getElementById("wfSum"),
    btn = document.getElementById("wfAdd"),
    sr = document.getElementById("wfStripRow"),
    gr = document.getElementById("wfGroupRow");
  if (!list) return;
  const rows = sh.rows || [];
  sr.innerHTML = sh.prefix ? `<input type="checkbox" id="wfStrip" ${sh.strip ? "checked" : ""}> 이름 앞의 ‘${esc(sh.prefix)}’ 빼기` : "";
  const canGroup = wfPlan(true).some((x) => x.group);
  if (sh.group == null && canGroup) sh.group = true;
  gr.innerHTML = canGroup
    ? `<input type="checkbox" id="wfGroup" ${sh.group ? "checked" : ""}> 이름이 같은 물품을 하위 물품으로 묶기 (예: 아크릴 키링 → 하늘, 바다)`
    : "";
  const plan = wfPlan(sh.group && canGroup);
  const rowHTML = (k, sub) => {
    const r = rows[k],
      nm = sub ? wfName(r).split(/\s+/).pop() : wfName(r);
    return `<div class="wfrow ${sub ? "wsub" : ""} ${r.on ? "" : "off"}"><input type="checkbox" data-wk="${k}" ${r.on ? "checked" : ""} aria-label="살 물품으로 고르기"><span class="wn">${esc(nm)}${r.sold ? ' <small style="display:inline;color:var(--danger)">품절</small>' : ""}${r.prep ? ' <small style="display:inline;color:var(--star)">준비 중</small>' : ""}${r.unit || r.extra ? `<small>${esc([r.unit ? r.unit + " 단위" : "", r.extra].filter(Boolean).join(" · "))}</small>` : ""}</span><span class="wp">${sh.type === "free" ? "무료" : won(r.price)}</span><input class="inp" data-wk="${k}" value="${r.qty || ""}" placeholder="0" inputmode="numeric" aria-label="수량"></div>`;
  };
  const allOn = rows.length && rows.every((r) => r.on || r.sold);
  list.innerHTML = rows.length
    ? `<div class="wfgrp" style="border-top:0"><span style="flex:1">${rows.length}개 읽음</span><button class="btn ghost sm" data-act="wfAll" data-on="${allOn ? 0 : 1}">${allOn ? "전체 해제" : "전체 선택"}</button></div>` +
      plan
        .map((x) =>
          x.group
            ? `<div class="wfgrp">${esc(x.group)} <small>하위 ${x.ks.length}개</small></div>` + x.ks.map((k) => rowHTML(k, true)).join("")
            : rowHTML(x.k, false)
        )
        .join("")
    : `<div class="empty" style="padding:20px">${sh.text ? "물품 줄을 찾지 못했어요. ‘이름 (3,000원/1개)’ 또는 ‘이름’ 다음 줄에 ‘3,000원 / 1개’ 모양인지 확인해 주세요." : "붙여 넣으면 여기에 미리 보기가 나와요."}</div>`;
  const on = rows.filter((r) => r.on),
    nItems = plan.filter((x) => (x.group ? x.ks.some((k) => rows[k].on) : rows[x.k].on)).length;
  const total = on.reduce((n, r) => n + (sh.type === "free" ? 0 : r.price * r.qty), 0),
    picked = on.reduce((n, r) => n + r.qty, 0);
  sum.innerHTML = rows.length
    ? nItems
      ? `<b>${nItems}개</b> 추가${sh.type !== "free" ? ` · ${won(total)}` : ""}`
      : "살 물품을 체크하거나 수량을 적어 주세요"
    : "";
  btn.disabled = !nItems;
  btn.textContent = nItems ? `${nItems}개 추가하기` : "추가하기";
}

try {
  if (window.indexedDB) indexedDB.deleteDatabase("boothcheck-img");
} catch (e) {}

/* ---------- events tab ---------- */
function renderEvTab() {
  const sch = sortedSch(),
    { cur } = schNow(),
    today = isEventToday(),
    nm = nowMin();
  const booths = sortedBooths();
  const bt = [];
  for (const b of booths) {
    if (b.openFrom || b.openTo) bt.push({ b, x: { label: "부스 운영", time: b.openFrom, end: b.openTo }, open: true });
    for (const x of b.times) bt.push({ b, x });
  }
  bt.sort((p, q) => (p.x.time || p.x.end || "99").localeCompare(q.x.time || q.x.end || "99"));
  const pkKey = (b) => b.pickup || b.pickupFrom;
  const pickups = booths.filter(pkKey).sort((a, c) => pkKey(a).localeCompare(pkKey(c)));
  const periods = [];
  for (const b of booths) {
    for (const x of boothPeriods(b)) periods.push({ b, p: x.p, ps: x.ps, label: x.label || "작가" });
  }
  const nowD = new Date();
  for (const x of periods) {
    const e = periodEnd(x.p);
    x.ended = !!(e && e < nowD);
  }
  periods.sort((x, y) => x.ended - y.ended || (periodEnd(x.p) || new Date(8.64e15)) - (periodEnd(y.p) || new Date(8.64e15)));
  const free = booths.map((b) => ({ b, items: linesOf(b).filter((i) => i.type === "free") })).filter((x) => x.items.length);
  const code = (b) => `<span class="mini" style="--sc:${secColor(b.section)}">${esc(boothCode(b))}</span>`;
  const left = (t, e) => {
    const z = e ? spanState(t, e) : spanState("", t);
    if (!z) return "";
    if (z.phase === "after") return `<span class="dl ok">${e ? "끝남" : "지남"}</span>`;
    if (z.phase === "before") return `<span class="dl">${fmtLeft(z.left)} 후</span>`;
    return e && t
      ? `<span class="dl soon">진행 중</span>`
      : `<span class="dl ${z.left <= 30 ? "soon" : ""}">${fmtLeft(z.left)} 남음</span>`;
  };
  const et = (t, e) => `<b class="et">${t || (e ? "~" + e : "--:--")}${t && e ? `<small>~${e}</small>` : ""}</b>`;
  main.innerHTML = `<div class="pad evgrid">
    ${infoCardEvent()}
    ${infoCardSch()}
    ${infoCardExtra()}
    ${
      bt.length
        ? `<section class="card"><h2>부스 시간·이벤트</h2>
      ${bt.map(({ b, x, open }) => `<button class="erow${open ? " eopen" : ""}" data-act="open" data-id="${b.id}">${et(x.time, x.end)}${code(b)}<span class="el">${esc(x.label || "시간")}${x.text ? `<span class="etx">${esc(x.text)}</span>` : ""}<small>${esc([b.name, x.note].filter(Boolean).join(" · "))}</small></span>${left(x.time, x.end)}</button>`).join("")}</section>`
        : ""
    }
    ${pickups.length ? `<section class="card"><h2>${pickups.some((b) => b.pickupFrom) ? "선입금 수령" : "선입금 수령 마감"}</h2>${pickups.map((b) => `<button class="erow" data-act="open" data-id="${b.id}">${et(b.pickupFrom, b.pickup)}${code(b)}<span class="el">${esc(b.name || "이름 없는 부스")}</span>${left(b.pickupFrom, b.pickup)}</button>`).join("")}</section>` : ""}
    ${periods.length ? `<section class="card"><h2>${periods.some((x) => x.p.kind === "survey") ? (periods.some((x) => x.p.kind !== "survey") ? "선입금·수요조사 기간" : "수요조사 기간") : "선입금 기간"}</h2>${periods.map((x) => `<div class="erowl${x.ended ? " ended" : ""}"><button class="erow" data-act="open" data-id="${x.b.id}"><b class="et" style="width:auto;font-size:13px">${esc(periodText(x.p))}</b>${code(x.b)}<span class="el">${esc(x.label)}<small>${x.p.kind === "survey" ? "수요조사 · " : ""}${esc(x.b.name || "")}</small></span><span class="dl ${x.ps.cls}">${esc(stripKind(x.ps.text))}</span></button>${x.p.link ? `<a class="plink" href="${esc(x.p.link)}" target="_blank" rel="noopener noreferrer" aria-label="${kindWord(x.p)} 폼 열기">폼 ↗</a>` : ""}</div>`).join("")}</section>` : ""}
    ${
      free.length
        ? `<section class="card"><h2>전프레·무료 배포</h2>
      ${free
        .map(
          ({ b, items }) =>
            `<div class="cgroup"><button class="chead" data-act="open" data-id="${b.id}">${code(b)}<span class="nm">${esc(b.name || "이름 없는 부스")}</span><span class="cnt">${items.filter(isFinal).length}/${items.length}</span></button>${items.map((L) => itemRow(b, L)).join("")}</div>`
        )
        .join("")}</section>`
        : ""
    }
    ${!bt.length && !pickups.length && !periods.length && !free.length ? `<p class="evhint">부스 편집에서 부스 시간·선입금/수요조사 기간을 적거나 ‘무료’ 물품을 넣으면 여기에 시간순으로 모여요.</p>` : ""}
  </div>`;
  renderSchList();
  masonry(main.querySelector(".evgrid"));
}

/* ---------- people tab ---------- */
function personCard(p) {
  const b = p.boothId && findBooth(p.boothId);
  const done = p.gifts.filter((g) => g.done).length;
  return `<div class="pcard ${p.met ? "met" : ""}">
    <div class="phead">
      <button class="pmet" data-act="pmet" data-pid="${p.id}" aria-pressed="${p.met}" aria-label="만남 체크">${ICON_CHECK}</button>
      <button class="pmain" data-act="pedit" data-pid="${p.id}"><span class="pn">♥ ${esc(p.nick || "이름 없음")}</span>${p.memo ? `<span class="pm">${esc(p.memo.split("\n")[0])}</span>` : `<span class="pm">눌러서 메모·부스 연결</span>`}</button>
      ${b ? `<button class="mini" style="--sc:${secColor(b.section)};border:0" data-act="open" data-id="${b.id}">${esc(boothCode(b))}</button>` : ""}
    </div>
    <div class="gifts">
      ${p.gifts.map((g) => `<div class="gift ${g.done ? "done" : ""}"><button class="gck" data-act="gtoggle" data-pid="${p.id}" data-gid="${g.id}" aria-pressed="${g.done}" aria-label="챙김 체크">${ICON_CHECK}</button><span class="gn">${esc(g.name)}</span><button class="gx" data-act="gdel" data-pid="${p.id}" data-gid="${g.id}" aria-label="지우기">×</button></div>`).join("")}
      <div class="gadd"><input class="inp sm" data-gnew="${p.id}" placeholder="줄 선물·챙길 것 추가" enterkeyhint="done"><button class="btn ghost sm" data-act="gadd" data-pid="${p.id}">추가</button></div>
      ${p.gifts.length ? `<div class="gcount">${done}/${p.gifts.length} 챙김</div>` : ""}
    </div>
  </div>`;
}
function renderPeople() {
  const ppl = S.people;
  const metN = ppl.filter((p) => p.met).length,
    gT = ppl.reduce((n, p) => n + p.gifts.length, 0),
    gD = ppl.reduce((n, p) => n + p.gifts.filter((g) => g.done).length, 0);
  const known = new Set(ppl.map((p) => p.nick));
  const sug = [];
  for (const b of sortedBooths())
    if (b.isFriend) for (const f of b.friends) if (!known.has(f) && !sug.some((x) => x.nick === f)) sug.push({ nick: f, b });
  const proxy = new Map();
  for (const b of sortedBooths())
    for (const L of linesOf(b))
      if (L.forWho) {
        if (!proxy.has(L.forWho)) proxy.set(L.forWho, []);
        proxy.get(L.forWho).push({ b, L });
      }
  const proxyHTML = proxy.size
    ? [...proxy.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], "ko"))
        .map(([nm, list]) => {
          const sum = list.reduce((n, { L }) => n + (L.maybe ? 0 : amt(L)), 0),
            paid = list.reduce((n, { L }) => n + (!L.maybe && isPaid(L) ? amt(L) : 0), 0);
          const fin = list.filter(({ L }) => !L.maybe && isFinal(L)).length,
            all = list.filter(({ L }) => !L.maybe).length;
          return `<div class="card proxy"><div class="pxh"><b>→ ${esc(nm)}</b><span class="pxs">${fin}/${all} 챙김 · 받을 돈 <b>${won(sum)}</b>${paid && paid < sum ? ` <small>(낸 돈 ${won(paid)})</small>` : ""}</span></div>
      ${list.map(({ b, L }) => `<div class="pxb"><button class="mini" style="--sc:${secColor(b.section)};border:0" data-act="open" data-id="${b.id}">${esc(boothCode(b))}</button>${itemRow(b, L, { art: false })}</div>`).join("")}</div>`;
        })
        .join("")
    : "";
  main.innerHTML = `<div class="pad pplgrid">
    ${proxy.size ? `<h3 class="pxtitle mfull">대리구매</h3>${proxyHTML}<h3 class="pxtitle mfull">지인</h3>` : ""}
    <div class="pplhead"><div class="pplsum">지인 <b>${ppl.length}</b>명&ensp;·&ensp;만남 <b>${metN}/${ppl.length}</b>&ensp;·&ensp;챙길 것 <b>${gD}/${gT}</b></div><button class="btn pre sm" data-act="padd">+ 지인 추가</button></div>
    ${sug.length ? `<div class="card pplhead" style="display:block"><h2>부스에 적어 둔 지인</h2><p class="desc">누르면 지인 목록에 추가되고 그 부스와 연결돼요.</p><div class="tagsug" style="margin:0">${sug.map((x) => `<button class="tg" style="--tc:#5C4300;--tb:#FFE98A" data-act="psug" data-nick="${esc(x.nick)}" data-bid="${x.b.id}">♥ ${esc(x.nick)} · ${esc(boothCode(x.b))}</button>`).join("")}</div></div>` : ""}
    ${ppl.length ? ppl.map(personCard).join("") : `<div class="empty"><strong>아직 지인이 없어요</strong>‘+ 지인 추가’로 만날 사람과 챙길 선물을 적어 보세요.</div>`}
  </div>`;
}
function renderPersonForm() {
  const p = sh.id ? S.people.find((x) => x.id === sh.id) : null;
  const d = sh.draft || (sh.draft = p ? { nick: p.nick, memo: p.memo, boothId: p.boothId } : { nick: "", memo: "", boothId: "" });
  sheet.innerHTML = `
    <div class="sh-grab" id="grab"><div class="handle"></div><div class="sh-head sh-plain"><h3 style="flex:1">${p ? "지인 편집" : "지인 추가"}</h3></div></div>
    <div class="sh-body">
      <label class="field"><span>닉네임</span><input class="inp" id="pNick" value="${esc(d.nick)}" placeholder="예: 하늘"></label>
      <label class="field"><span>연결할 부스 (선택)</span><select class="inp" id="pBooth"><option value="">부스 없음 (따로 만나요)</option>${sortedBooths()
        .map((b) => `<option value="${b.id}" ${b.id === d.boothId ? "selected" : ""}>${esc(boothCode(b))} ${esc(b.name || "")}</option>`)
        .join("")}</select></label>
      <label class="field"><span>메모</span><textarea class="inp" id="pMemo" placeholder="만날 시간·장소, 받을 것 등">${esc(d.memo)}</textarea></label>
      <div class="btnrow">${p ? `<button class="btn danger" data-act="pdel">삭제</button>` : ""}<button class="btn pre" data-act="psave" style="flex:2">${p ? "저장" : "추가하기"}</button></div>
    </div>`;
  bindDrag();
  if (!p)
    setTimeout(() => {
      const n = document.getElementById("pNick");
      if (n && window.matchMedia("(pointer:fine)").matches) n.focus();
    }, 250);
}

/* ---------- bulk add / edit (spreadsheet) ---------- */
const BULK_COLS = ["sec", "num", "name", "tags", "memo", "pickup", "friend", "arts", "tw"];
function twSite(v) {
  v = String(v || "").trim();
  if (!v) return "";
  if (/^@?[A-Za-z0-9_]{1,15}$/.test(v)) return "https://x.com/" + v.replace(/^@/, "");
  return normSite(v);
}
function twShow(u) {
  if (!u) return "";
  const m = String(u).match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/i);
  return m ? "@" + m[1] : u;
}
function splitList(v) {
  return String(v || "")
    .split(/[,，、]/)
    .map((x) => x.trim());
}
function parseArtists(arts, tw) {
  const a = splitList(arts),
    t = splitList(tw),
    n = Math.max(arts.trim() ? a.length : 0, tw.trim() ? t.length : 0),
    out = [];
  for (let k = 0; k < n; k++) {
    const nick = (a[k] || "").slice(0, 30),
      site = twSite(t[k] || "");
    if (site === null) return null;
    if (nick || site) out.push({ nick, site });
  }
  return out;
}
function artistsKey(list) {
  return list.map((x) => (x.nick || "") + "|" + (x.site || "")).join(";");
}
function rebuildArtists(b, list, merge) {
  const used = new Set(),
    next = [];
  for (const x of list) {
    const ex = b.artists.find((a) => !used.has(a.id) && ((x.nick && a.nick === x.nick) || (!x.nick && x.site && a.site === x.site)));
    if (ex) {
      used.add(ex.id);
      next.push(Object.assign(ex, { nick: x.nick || ex.nick, site: x.site || (merge ? ex.site : "") }));
    } else next.push({ id: uid(), nick: x.nick, site: x.site, info: "", memo: "", preFrom: "", preTo: "", preToTime: "" });
  }
  b.artists = merge ? b.artists.concat(next.filter((x) => !b.artists.includes(x))) : next;
  pinSoleArtist(b);
}
function mergePairsText(arts1, tw1, arts2, tw2) {
  const a = parseArtists(arts1, tw1) || [],
    b2 = parseArtists(arts2, tw2) || [];
  for (const x of b2) {
    const ex = a.find((y) => (x.nick && y.nick === x.nick) || (!x.nick && x.site && y.site === x.site));
    if (ex) {
      if (x.site) ex.site = x.site;
    } else a.push(x);
  }
  return { arts: a.map((x) => x.nick).join(", "), tw: a.some((x) => x.site) ? a.map((x) => twShow(x.site)).join(", ") : "" };
}
const FRIEND_MARKS = ["지인", "o", "O", "y", "Y", "v", "V", "✓", "✔", "♥", "♡", "예", "ㅇ"];
function parseFriend(v) {
  v = String(v || "").trim();
  if (!v) return { isFriend: false, friends: [] };
  if (FRIEND_MARKS.includes(v)) return { isFriend: true, friends: [] };
  return {
    isFriend: true,
    friends: [
      ...new Set(
        v
          .split(/[,，、]/)
          .map((x) => x.trim().slice(0, 30))
          .filter(Boolean)
      ),
    ],
  };
}
function blankRow() {
  return { id: null, sec: "", num: "", name: "", tags: "", memo: "", pickup: "", friend: "", arts: "", tw: "" };
}
function rowFromBooth(b) {
  return {
    id: b.id,
    sec: b.section,
    num: boothCode(b).slice(b.section.length),
    name: b.name,
    tags: b.tags.join(", "),
    memo: b.memo.replace(/\n/g, " "),
    pickup: rangeText(b.pickupFrom, b.pickup),
    friend: b.isFriend ? (b.friends.length ? b.friends.join(", ") : "지인") : "",
    arts: b.artists.map((a) => a.nick).join(", "),
    tw: b.artists.some((a) => a.site) ? b.artists.map((a) => twShow(a.site)).join(", ") : "",
  };
}
function bulkHasData() {
  return !!(
    (sh && sh.rows && sh.rows.some((r) => !r.id && BULK_COLS.some((c) => c !== "sec" && String(r[c]).trim()))) ||
    (sh && sh.rows && bulkParse().some((r) => r.st === "upd"))
  );
}
function splitTags(v) {
  return [
    ...new Set(
      String(v || "")
        .split(/[,#，、]+/)
        .map(cleanTag)
        .filter(Boolean)
    ),
  ].slice(0, 12);
}
function openBulk() {
  const first = secFilter !== "all" ? secFilter : S.sections[0] || "A";
  const rows = Array.from({ length: 12 }, blankRow);
  rows[0].sec = first;
  openSheet({ kind: "bulk", rows, loaded: false });
}
function bulkLoadExisting() {
  if (!sh || sh.kind !== "bulk" || sh.loaded) return;
  const have = new Set(sh.rows.filter((r) => r.id).map((r) => r.id));
  const parsed = bulkParse(),
    mergeInto = new Map(),
    folded = new Set();
  for (const r of parsed)
    if (r.st === "merge") {
      mergeInto.set(r.target.id, sh.rows[r.i]);
      folded.add(r.i);
    }
  const ex = sortedBooths()
    .filter((b) => !have.has(b.id))
    .map((b) => {
      const row = rowFromBooth(b),
        t = mergeInto.get(b.id);
      if (t) {
        if (t.name.trim()) row.name = t.name.trim();
        if (t.pickup.trim()) row.pickup = t.pickup.trim();
        if (t.friend.trim()) row.friend = t.friend.trim();
        if (t.arts.trim() || t.tw.trim()) {
          const m = mergePairsText(row.arts, row.tw, t.arts, t.tw);
          row.arts = m.arts;
          row.tw = m.tw;
        }
        if (t.memo.trim()) row.memo = row.memo ? row.memo + " " + t.memo.trim() : t.memo.trim();
        if (t.tags.trim()) row.tags = [...new Set([...splitTags(row.tags), ...splitTags(t.tags)])].join(", ");
      }
      return row;
    });
  const typed = sh.rows
    .map((r, i) => {
      if (!r.id && !parsed[i].empty && !r.sec.trim() && parsed[i].inherit && !/^[A-Za-z가-힣]/.test(r.num.trim()))
        r.sec = parsed[i].inherit;
      return r;
    })
    .filter((r, i) => !r.id && !folded.has(i) && BULK_COLS.some((c) => String(r[c]).trim()));
  sh.rows = [...ex, ...typed];
  const nextSec = typed.length ? "" : ex.length ? ex[ex.length - 1].sec : "";
  const blanks = Array.from({ length: 6 }, blankRow);
  if (nextSec) blanks[0].sec = nextSec;
  sh.rows.push(...blanks);
  sh.loaded = true;
  renderBulk();
  toast(`기존 부스 ${ex.length}개를 불러왔어요`);
}
function bulkRowHTML(r, i) {
  const cell = (c, cls, ph, mode) =>
    `<td class="${cls}"><input class="bc" data-r="${i}" data-c="${c}" value="${esc(r[c])}" placeholder="${ph}" ${mode || ""} autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="next"></td>`;
  return (
    `<tr data-r="${i}"><td class="rn" id="bst${i}"><span class="rnum">${i + 1}</span></td>` +
    cell("sec", "w-sec", "구역", 'maxlength="6" autocapitalize="characters"') +
    cell("num", "w-num", "12 / 12-1", 'maxlength="10"') +
    cell("name", "w-name", "부스 이름", "") +
    cell("tags", "w-tags", "굿즈, 신간", "") +
    cell("memo", "w-memo", "메모", "") +
    cell("pickup", "w-time", "12:00~14:00", 'maxlength="13"') +
    cell("friend", "w-name", "닉네임 또는 o", "") +
    cell("arts", "w-name", "하늘, 바다", "") +
    cell("tw", "w-name", "@sky, @sea", 'autocapitalize="off" spellcheck="false"') +
    `</tr>`
  );
}
function renderBulk() {
  const hasBooths = S.booths.length > 0;
  sheet.innerHTML = `
    <div class="sh-grab" id="grab"><div class="handle"></div>
      <div class="sh-head sh-plain"><h3 style="flex:1">표로 부스 추가·수정</h3>
${hasBooths ? `<button class="btn ghost sm" data-act="bulkLoad" ${sh.loaded ? "disabled" : ""}>${sh.loaded ? "불러옴" : `기존 ${S.booths.length}개 불러오기`}</button>` : ""}<button class="shx" type="button" data-act="sheetClose" aria-label="닫기">×</button></div>
    </div>
    <div class="sh-body">
      <details class="bulkhelp" id="bulkHelp" ${UIP.bulkHelp !== false ? "open" : ""}><summary>입력 방법</summary>
      <p class="bulkhint">한 줄에 부스 하나. 구역을 비우면 <b>윗줄 구역</b>을 따라가요. 번호에 <b>12-1</b>은 반 부스, <b>12~13</b>은 2부스(최대 4부스), <b>A12</b>는 구역까지 한 번에. 태그는 쉼표로 나눠요.<br>
      이미 있는 번호를 적으면 그 부스에 <b>채운 칸만 덧붙여</b> 고쳐요. ‘기존 불러오기’를 누르면 지금 부스를 표에서 바로 고칠 수 있어요. 표에서는 부스를 지우지 않아요.<br>
      시트에서 <b>구역 / 번호 / 이름 / 태그 / 메모 / 수령 시간 / 지인 닉네임 / 작가 / 트위터 아이디</b> 순서로 복사해 붙여 넣어도 돼요. 지인 칸에 닉네임 대신 o를 적어도 지인으로 표시돼요.<br>
      지인·작가·트위터 아이디는 여러 명이면 <b>쉼표</b>로 나눠요. 작가와 트위터 아이디는 <b>같은 순서</b>로 짝지어져요 (예: 작가 <b>하늘, 바다</b> / 트위터 <b>@sky, @sea</b>).</p></details>
      <div class="bulkwrap" id="bulkWrap">
<table class="bulk"><thead><tr><th class="rn">확인</th><th>구역</th><th>번호</th><th>부스 이름</th><th>태그</th><th>메모</th><th>수령 시간</th><th>지인 닉네임</th><th>작가</th><th>트위터 아이디</th></tr></thead>
<tbody id="bulkBody">${sh.rows.map(bulkRowHTML).join("")}</tbody></table>
      </div>
      <div class="bulkfoot">
<div class="sum" id="bulkSum"></div>
<button class="btn ghost sm" data-act="bulkMore">+ 줄 5개</button>
<button class="btn pre" data-act="bulkSave" id="bulkSave">저장</button>
      </div>
    </div>`;
  const help = document.getElementById("bulkHelp");
  if (help)
    help.addEventListener("toggle", () => {
      UIP.bulkHelp = help.open;
      saveUIP();
    });
  const body = document.getElementById("bulkBody");
  body.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.classList.contains("bc")) return;
    const r = +t.dataset.r;
    sh.rows[r][t.dataset.c] = t.value;
    if (r >= sh.rows.length - 2 && t.value.trim()) bulkAppend(3);
    bulkCheck();
  });
  body.addEventListener("keydown", (e) => {
    const t = e.target;
    if (!t.classList.contains("bc") || imeBusy(e)) return;
    if (e.key === "Enter") {
      e.preventDefault();
      bulkFocus(+t.dataset.r + (e.shiftKey ? -1 : 1), t.dataset.c);
    } else if (e.key === "ArrowDown" && !e.altKey) {
      e.preventDefault();
      bulkFocus(+t.dataset.r + 1, t.dataset.c);
    } else if (e.key === "ArrowUp" && !e.altKey) {
      e.preventDefault();
      bulkFocus(+t.dataset.r - 1, t.dataset.c);
    }
  });
  body.addEventListener("paste", (e) => {
    const t = e.target;
    if (!t.classList.contains("bc")) return;
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!text || !/[\t\n]/.test(text.replace(/\r?\n$/, ""))) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").replace(/\n+$/, "").split("\n");
    const r0 = +t.dataset.r,
      c0 = BULK_COLS.indexOf(t.dataset.c);
    while (sh.rows.length < r0 + lines.length + 2) sh.rows.push(blankRow());
    lines.forEach((ln, k) => {
      ln.split("\t").forEach((v, j) => {
        const c = BULK_COLS[c0 + j];
        if (c) sh.rows[r0 + k][c] = v.trim();
      });
    });
    body.innerHTML = sh.rows.map(bulkRowHTML).join("");
    bulkCheck();
    toast(`${lines.length}줄을 붙여 넣었어요`);
  });
  bulkCheck();
  bindDrag();
}
function bulkAppend(n) {
  const body = document.getElementById("bulkBody");
  if (!body) return;
  const start = sh.rows.length;
  for (let k = 0; k < n; k++) sh.rows.push(blankRow());
  body.insertAdjacentHTML(
    "beforeend",
    sh.rows
      .slice(start)
      .map((r, k) => bulkRowHTML(r, start + k))
      .join("")
  );
}
function bulkFocus(r, c) {
  if (r < 0) return;
  if (r >= sh.rows.length) bulkAppend(Math.max(3, r - sh.rows.length + 1));
  const el = document.querySelector(`#bulkBody .bc[data-r="${r}"][data-c="${c}"]`);
  if (el) {
    el.focus();
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}
function bulkParse() {
  let inherit = "";
  const seen = new Map(),
    out = [];
  const loadedIds = new Set(sh.rows.filter((r) => r.id).map((r) => r.id));
  sh.rows.forEach((r, i) => {
    const empty = !BULK_COLS.some((c) => c !== "sec" && String(r[c]).trim());
    let sec = r.sec.trim(),
      raw = r.num.trim().replace(/\s+/g, "");
    const pre = raw.match(/^([A-Za-z가-힣]+)-?(\d.*)$/);
    if (pre && !sec) {
      sec = pre[1];
      raw = pre[2];
    }
    const eff = sec || inherit;
    if (sec) inherit = sec;
    const res = { i, empty, inherit: eff, sec: eff, id: r.id };
    if (empty) {
      out.push(res);
      return;
    }
    let num = raw,
      half = 0,
      span = 1;
    const hm = raw.match(/^(.+?)-([12])$/);
    if (hm) {
      num = hm[1];
      half = +hm[2];
    }
    const rg = raw.match(/^(\d+)~(\d+)$/);
    if (rg) {
      const a1 = parseInt(rg[1], 10),
        a2 = parseInt(rg[2], 10);
      if (a2 > a1 && a2 - a1 <= 3) {
        num = rg[1];
        span = a2 - a1 + 1;
      } else {
        res.st = "err";
        res.msg = "번호?";
        out.push(res);
        return;
      }
    }
    num = num.replace(/-$/, "");
    if (!eff) {
      res.st = "err";
      res.msg = "구역?";
      out.push(res);
      return;
    }
    if (!num) {
      res.st = "err";
      res.msg = "번호?";
      out.push(res);
      return;
    }
    const prg = normRange(r.pickup);
    if (prg === null || (prg.from && prg.to && prg.from > prg.to)) {
      res.st = "err";
      res.msg = "시간?";
      out.push(res);
      return;
    }
    const pk = prg.to,
      pkf = prg.from;
    const arts = parseArtists(r.arts || "", r.tw || "");
    if (arts === null) {
      res.st = "err";
      res.msg = "트위터?";
      out.push(res);
      return;
    }
    res.num = num;
    res.half = half;
    res.span = span;
    res.pickup = pk;
    res.pickupFrom = pkf;
    res.fr = parseFriend(r.friend);
    res.arts = arts;
    res.code = boothCode({ section: eff, num, half, span });
    res.newSec = !S.sections.includes(eff);
    const key = eff + "|" + num + "|" + half;
    if (seen.has(key)) {
      res.st = "warn";
      res.msg = "중복";
      out.push(res);
      return;
    }
    const other = S.booths.find((b) => b.section === eff && b.num === num && (b.half || 0) === half && b.id !== r.id);
    if (r.id) {
      const b = findBooth(r.id);
      if (!b) {
        res.st = "err";
        res.msg = "지워짐";
        out.push(res);
        return;
      }
      if (other) {
        res.st = "warn";
        res.msg = "번호 겹침";
        out.push(res);
        return;
      }
      seen.set(key, i);
      const same =
        b.section === eff &&
        b.num === num &&
        (b.half || 0) === half &&
        spanOf(b) === span &&
        b.name === r.name.trim() &&
        b.tags.join("|") === splitTags(r.tags).join("|") &&
        b.memo.replace(/\n/g, " ") === r.memo &&
        (b.pickup || "") === pk &&
        (b.pickupFrom || "") === pkf &&
        !!b.isFriend === res.fr.isFriend &&
        b.friends.join("|") === res.fr.friends.join("|") &&
        artistsKey(b.artists) === artistsKey(res.arts);
      res.st = same ? "same" : "upd";
      res.target = b;
    } else if (other) {
      if (loadedIds.has(other.id)) {
        res.st = "warn";
        res.msg = "중복";
        out.push(res);
        return;
      }
      seen.set(key, i);
      res.st = "merge";
      res.target = other;
    } else {
      seen.set(key, i);
      res.st = "ok";
    }
    out.push(res);
  });
  return out;
}
function bulkCheck() {
  const list = bulkParse();
  let add = 0,
    upd = 0,
    warn = 0,
    err = 0;
  const newSecs = new Set();
  for (const r of list) {
    const cell = document.getElementById("bst" + r.i);
    const secInp = document.querySelector(`#bulkBody .bc[data-r="${r.i}"][data-c="sec"]`);
    if (secInp && secInp !== document.activeElement) secInp.placeholder = !sh.rows[r.i].sec.trim() && r.inherit ? r.inherit : "구역";
    if (!cell) continue;
    if (r.empty) {
      cell.innerHTML = `<span class="rnum">${r.i + 1}</span>`;
      continue;
    }
    const col = r.newSec ? "#80849F" : secColor(r.sec);
    if (r.st === "ok") {
      add++;
      if (r.newSec) newSecs.add(r.sec);
      cell.innerHTML = `<span class="mini" style="--sc:${col}">${esc(r.code)}</span>`;
    } else if (r.st === "upd" || r.st === "merge") {
      upd++;
      if (r.newSec) newSecs.add(r.sec);
      cell.innerHTML = `<span class="mini upd" style="--sc:${col}" title="고칠 부스">${esc(r.code)}</span>`;
    } else if (r.st === "same") {
      cell.innerHTML = `<span class="bst same">${esc(r.code)}</span>`;
    } else {
      r.st === "warn" ? warn++ : err++;
      cell.innerHTML = `<span class="bst ${r.st}">${r.msg}</span>`;
    }
  }
  const sum = document.getElementById("bulkSum"),
    btn = document.getElementById("bulkSave");
  const parts = [];
  if (add) parts.push(`새로 추가 <b>${add}개</b>`);
  if (upd) parts.push(`고칠 부스 <b>${upd}개</b>`);
  if (sum)
    sum.innerHTML =
      (parts.length ? parts.join(", ") : "아직 바뀐 내용이 없어요") +
      (warn ? `<br>겹치는 줄 ${warn}개는 건너뛰어요` : "") +
      (err ? `<br>왼쪽 빨간 표시를 확인할 줄 ${err}개` : "") +
      (newSecs.size ? `<br>새 구역(${[...newSecs].map(esc).join(", ")})도 함께 만들어져요` : "");
  if (btn) {
    btn.disabled = !(add || upd);
    btn.textContent = add && upd ? `추가 ${add} · 수정 ${upd} 저장` : add ? `${add}개 추가하기` : upd ? `${upd}개 고치기` : "저장";
  }
}
function bulkSave() {
  const list = bulkParse().filter((r) => r.st === "ok" || r.st === "upd" || r.st === "merge");
  if (!list.length) return;
  let add = 0,
    upd = 0;
  for (const r of list) {
    if (!S.sections.includes(r.sec)) S.sections.push(r.sec);
    const row = sh.rows[r.i],
      tags = splitTags(row.tags);
    if (r.st === "ok") {
      S.booths.push({
        id: uid(),
        section: r.sec,
        num: r.num,
        half: r.half,
        span: r.span,
        size: r.half ? 1 : 2 * r.span,
        name: row.name.trim(),
        artists: r.arts.map((x) => ({
          id: uid(),
          nick: x.nick,
          site: x.site,
          info: "",
          memo: "",
          preFrom: "",
          preTo: "",
          preToTime: "",
        })),
        pickup: r.pickup,
        pickupFrom: r.pickupFrom,
        openFrom: "",
        openTo: "",
        times: [],
        isFriend: r.fr.isFriend,
        friends: r.fr.friends,
        preFrom: "",
        preTo: "",
        preToTime: "",
        memo: row.memo.trim(),
        tags,
        pos: null,
        items: [],
      });
      add++;
    } else if (r.st === "upd") {
      const b = r.target,
        wasFull = !b.half;
      const memoChanged = b.memo.replace(/\n/g, " ") !== row.memo;
      Object.assign(b, {
        section: r.sec,
        num: r.num,
        half: r.half,
        span: r.span,
        size: r.half ? 1 : 2 * r.span,
        name: row.name.trim(),
        pickup: r.pickup,
        pickupFrom: r.pickupFrom,
        isFriend: r.fr.isFriend,
        friends: r.fr.friends,
        tags,
      });
      if (memoChanged) b.memo = row.memo.trim();
      if (b.pos && wasFull !== !b.half) b.pos.rot = 0;
      if (artistsKey(b.artists) !== artistsKey(r.arts)) rebuildArtists(b, r.arts, false);
      upd++;
    } else {
      const b = r.target;
      if (row.name.trim()) b.name = row.name.trim();
      if (r.pickup || r.pickupFrom) {
        b.pickup = r.pickup;
        b.pickupFrom = r.pickupFrom;
      }
      if (r.fr.isFriend) {
        b.isFriend = true;
        b.friends = [...new Set([...b.friends, ...r.fr.friends])];
      }
      if (r.arts.length) rebuildArtists(b, r.arts, true);
      if (row.memo.trim()) b.memo = b.memo.trim() ? b.memo.trim() + "\n" + row.memo.trim() : row.memo.trim();
      if (tags.length) b.tags = [...new Set([...b.tags, ...tags])].slice(0, 12);
      upd++;
    }
  }
  save();
  sh.rows = null;
  closeSheet();
  if (view === "booths") renderBooths();
  else if (view === "map") renderMap();
  toast([add ? `${add}개 추가` : "", upd ? `${upd}개 수정` : ""].filter(Boolean).join(", ") + "했어요");
}
