/* 부스 체크 — 클릭 처리·설치(PWA)·되살리기·시작
   index.html이 js/ 파일들을 정해진 순서로 불러와요. 파일끼리 함수·변수를 그대로 함께 써요(전역). */
"use strict";
/* ---------- global click delegation ---------- */
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act],[data-tab]");
  if (!t) return;
  if (t.dataset.tab) {
    if (sh) closeSheet();
    setView(t.classList.contains("gear") && view === "info" ? lastTab || "booths" : t.dataset.tab);
    return;
  }
  const act = t.dataset.act;
  const row = t.closest(".item,.crow");
  switch (act) {
    case "tagf": {
      tagFilter = tagFilter === t.dataset.tag ? null : t.dataset.tag;
      if (view === "map") {
        renderTagChips("mapTags");
        renderMapItems();
      } else {
        renderBoothList();
        main.scrollTop = 0;
      }
      break;
    }
    case "bulkOpen":
      openBulk();
      break;
    case "clLogin":
      clLogin();
      break;
    case "clLogout":
      clLogout();
      break;
    case "clSync":
      clResync();
      break;
    case "clShare":
      clStartShare();
      break;
    case "clStop":
      clStopShare();
      break;
    case "clUnsub":
      clUnsub();
      break;
    case "clLeave":
      clLeave();
      break;
    case "clCopy":
      clCopy(t.dataset.v);
      break;
    case "clEdOpen":
      clEdLoad();
      break;
    case "clEdNew":
      clEdNewKey();
      break;
    case "clEdDel":
      clEdRemove(t.dataset.uid);
      break;
    case "viewUrl": {
      const u = t.dataset.u;
      if (!u) return;
      if (t.classList.contains("bad")) {
        window.open(u, "_blank", "noopener");
        return;
      }
      let gal = [u];
      try {
        if (t.dataset.gal) gal = JSON.parse(t.dataset.gal);
      } catch (_) {}
      openViewer(gal, +t.dataset.gi || 0, { bid: t.dataset.bid, aid: t.dataset.aid });
      break;
    }
    case "infoWrite": {
      const b = findBooth(t.dataset.bid),
        a = b && b.artists.find((x) => x.id === t.dataset.aid);
      if (!a || !(a.imgs || []).length) return;
      openViewer(a.imgs, 0, { bid: b.id, aid: a.id, write: true });
      break;
    }
    case "iedit": {
      const k = t.dataset.k;
      if (infoEdit.has(k)) infoEdit.delete(k);
      else infoEdit.add(k);
      renderView();
      break;
    }
    case "ckfold": {
      UIP.ckBar = !UIP.ckBar;
      saveUIP();
      t.setAttribute("aria-expanded", String(UIP.ckBar));
      const o = document.getElementById("ckOpts");
      if (o) o.hidden = !UIP.ckBar;
      ckFoldInfo();
      break;
    }
    case "wfOpen":
      openSheet({ kind: "wf", id: sh.id, text: "" });
      break;
    case "rescue":
      doRescue(t.dataset.k);
      break;
    case "iselOn": {
      const b = findBooth(sh && sh.id);
      if (!b) return;
      ISEL = ISEL ? null : { bid: b.id, ids: new Set() };
      renderBoothItems();
      if (ISEL) toast("고칠 물품을 누르세요");
      break;
    }
    case "iselAll": {
      const b = findBooth(sh && sh.id);
      if (!b || !ISEL) return;
      ISEL.ids = ISEL.ids.size === b.items.length ? new Set() : new Set(b.items.map((i) => i.id));
      iselDraw(b);
      break;
    }
    case "iselEdit": {
      const b = findBooth(sh && sh.id);
      if (!b || !ISEL || !ISEL.ids.size) return;
      const r = t.getBoundingClientRect();
      openCtx(r.left, r.top, iselMenu(b));
      break;
    }
    case "iselDel": {
      const b = findBooth(sh && sh.id);
      if (!b || !ISEL || !ISEL.ids.size) return;
      const its = iselItems(b),
        ok = its.filter((i) => !lockedItem(i)),
        skip = its.length - ok.length;
      if (!ok.length) {
        toast("공유받은 물품은 지울 수 없어요. ‘바꾸기’에서 안 받기로 바꿀 수 있어요");
        return;
      }
      if (!(await confirmBox(`물품 ${ok.length}개를 지울까요?${skip ? `\n공유받은 물품 ${skip}개는 빼고 지워요.` : ""}`, "삭제", true)))
        return;
      const del = new Set(ok.map((i) => i.id));
      b.items = b.items.filter((i) => !del.has(i.id));
      ok.forEach((i) => ISEL.ids.delete(i.id));
      changed(`물품 ${ok.length}개를 지웠어요`);
      break;
    }
    case "wfAll": {
      const v = t.dataset.on === "1";
      for (const r of sh.rows || []) {
        if (v && r.sold) continue;
        r.on = v;
        r.qty = v ? r.qty || 1 : 0;
      }
      wfDraw();
      break;
    }
    case "wfAdd": {
      const b = findBooth(sh.id);
      if (!b) return;
      const rows = sh.rows || [],
        plan = wfPlan(sh.group && wfPlan(true).some((x) => x.group));
      const base = {
        type: sh.type,
        st: 0,
        must: false,
        maybe: false,
        cat: sh.cat || "",
        sample: "",
        artist: soleArtist(b) || sh.art || "",
      };
      const noteOf = (r) => [r.unit ? r.unit + " 단위" : "", r.prep ? "준비 중" : "", r.extra].filter(Boolean).join(" · ").slice(0, 80);
      let n = 0;
      for (const x of plan) {
        if (x.group) {
          const ks = x.ks.filter((k) => rows[k].on);
          if (!ks.length) continue;
          const p0 = sh.type === "free" ? 0 : rows[ks[0]].price;
          b.items.push({
            ...base,
            id: uid(),
            name: x.group.slice(0, 60),
            price: p0,
            want: 0,
            note: noteOf(rows[ks[0]]).replace(/ · ?품절.*$/, ""),
            subs: ks.map((k) => {
              const r = rows[k];
              return {
                id: uid(),
                name: wfName(r).split(/\s+/).pop().slice(0, 40),
                price: sh.type === "free" || r.price === p0 ? null : r.price,
                want: r.qty || 0,
                st: 0,
                note: r.extra || "",
              };
            }),
          });
          n++;
        } else {
          const r = rows[x.k];
          if (!r.on) continue;
          b.items.push({
            ...base,
            id: uid(),
            name: wfName(r).slice(0, 60),
            price: sh.type === "free" ? 0 : r.price,
            want: Math.max(1, r.qty || 1),
            note: noteOf(r),
          });
          n++;
        }
      }
      if (!n) return;
      save();
      renderTop();
      sh = { kind: "booth", id: b.id };
      renderSheet();
      toast(`물품 ${n}개를 추가했어요`);
      break;
    }
    case "padd":
      openSheet({ kind: "person", id: null });
      break;
    case "pedit":
      openSheet({ kind: "person", id: t.dataset.pid });
      break;
    case "psave": {
      const nick = document.getElementById("pNick").value.trim();
      if (!nick) {
        toast("닉네임을 적어 주세요");
        document.getElementById("pNick").focus();
        return;
      }
      const f = {
        nick: nick.slice(0, 30),
        memo: document.getElementById("pMemo").value.slice(0, 500),
        boothId: document.getElementById("pBooth").value,
      };
      if (sh.id) {
        Object.assign(
          S.people.find((x) => x.id === sh.id),
          f
        );
      } else S.people.push({ id: uid(), ...f, met: false, gifts: [] });
      save();
      closeSheet();
      if (view === "people") renderPeople();
      toast("저장했어요");
      break;
    }
    case "pdel": {
      const p = S.people.find((x) => x.id === sh.id);
      if (!p) return;
      if (await confirmBox(`‘${p.nick}’ 지인을 목록에서 지울까요?`, "삭제", true)) {
        S.people = S.people.filter((x) => x !== p);
        save();
        closeSheet();
        if (view === "people") renderPeople();
      }
      break;
    }
    case "psug": {
      S.people.push({ id: uid(), nick: t.dataset.nick, memo: "", boothId: t.dataset.bid, met: false, gifts: [] });
      save();
      renderPeople();
      toast(`‘${t.dataset.nick}’를 추가했어요`);
      break;
    }
    case "pmet": {
      const p = S.people.find((x) => x.id === t.dataset.pid);
      if (p) {
        p.met = !p.met;
        save();
        renderPeople();
      }
      break;
    }
    case "gtoggle": {
      const p = S.people.find((x) => x.id === t.dataset.pid),
        g = p && p.gifts.find((x) => x.id === t.dataset.gid);
      if (g) {
        g.done = !g.done;
        save();
        renderPeople();
      }
      break;
    }
    case "gdel": {
      const p = S.people.find((x) => x.id === t.dataset.pid);
      if (p) {
        p.gifts = p.gifts.filter((x) => x.id !== t.dataset.gid);
        save();
        renderPeople();
      }
      break;
    }
    case "gadd": {
      const pid = t.dataset.pid,
        inp = document.querySelector(`[data-gnew="${pid}"]`),
        v = inp ? inp.value.trim() : "";
      if (!v) {
        if (inp) inp.focus();
        return;
      }
      const p = S.people.find((x) => x.id === pid);
      if (!p) return;
      p.gifts.push({ id: uid(), name: v.slice(0, 60), done: false });
      save();
      renderPeople();
      const n = document.querySelector(`[data-gnew="${pid}"]`);
      if (n) n.focus();
      break;
    }
    case "bMore": {
      const b = findBooth(sh && sh.id);
      if (!b) return;
      const r = t.getBoundingClientRect();
      openCtx(r.right, r.bottom, [
        {
          icon: "check",
          label: "여러 개 골라서 바꾸기·지우기",
          fn: () => {
            ISEL = { bid: b.id, ids: new Set() };
            renderBoothItems();
            toast("고칠 물품을 누르세요");
          },
        },
        {
          icon: "plus",
          label: UIP.addOpen ? "물품 추가 칸 닫기" : "물품 추가 칸 열기",
          fn: () => {
            const q = document.getElementById("qAdd");
            if (q) q.click();
          },
        },
        { icon: "edit", label: "부스 편집", fn: () => openSheet({ kind: "boothForm", id: b.id }) },
      ]);
      break;
    }
    case "addFor": {
      /* 작가 묶음의 ＋ 물품: 그 작가로 물품 추가 칸을 엶 */
      const b = sh && findBooth(sh.id);
      if (!b) break;
      sh.addArt = t.dataset.aid || "";
      lastArt = { bid: b.id, aid: sh.addArt };
      if (!UIP.addOpen) {
        UIP.addOpen = true;
        saveUIP();
      }
      const box = document.getElementById("addBox");
      if (!box) break;
      box.hidden = false;
      placeAddBox(b);
      const n = document.getElementById("nName");
      if (n) n.focus({ preventScroll: true });
      box.scrollIntoView({ block: "nearest", behavior: "smooth" });
      break;
    }
    case "toggleAdd": {
      UIP.addOpen = !UIP.addOpen;
      saveUIP();
      const box = document.getElementById("addBox");
      if (box) box.hidden = !UIP.addOpen;
      const qa = document.getElementById("qAdd"),
        tb = sh && sh.kind === "booth" ? findBooth(sh.id) : null;
      if (qa) qa.hidden = UIP.addOpen || !!(tb && tb.artists.length > 1);
      if (tb) placeAddBox(tb);
      if (UIP.addOpen) {
        const n = document.getElementById("nName");
        if (n) {
          n.focus({ preventScroll: true });
          box.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
      break;
    }
    case "events":
      openSheet({ kind: "events" });
      break;
    case "evswitch": {
      const id = t.dataset.eid;
      closeSheet();
      switchEvent(id);
      const ev = LIB.list.find((x) => x.id === id);
      toast(`‘${(ev && ev.name) || "이름 없는 행사"}’로 바꿨어요`);
      break;
    }
    case "evcreate": {
      const nm = document.getElementById("evNew").value.trim(),
        copy = document.getElementById("evCopy").checked;
      const st = defaultState();
      st.event.name = nm;
      if (copy) {
        st.sections = [...S.sections];
        st.cats = [...S.cats];
      }
      const id = addEvent(st);
      closeSheet();
      switchEvent(id);
      infoEdit.add("event");
      setView("evtab");
      toast("새 행사를 만들었어요. 날짜와 장소를 적어 보세요.");
      break;
    }
    case "evdel": {
      const id = t.dataset.eid,
        ev = LIB.list.find((x) => x.id === id);
      if (!ev) return;
      if (
        !(await confirmBox(
          `‘${ev.name || "이름 없는 행사"}’를 지울까요?\n부스 ${ev.count || 0}개와 체크 기록이 모두 사라지고 되돌릴 수 없어요.${clDelNote(id)}`,
          "삭제",
          true
        ))
      )
        return;
      clDeleted(id);
      setBase(id, null);
      delete lastJs[id];
      LIB.list = LIB.list.filter((x) => x.id !== id);
      lsDel(EV_PREFIX + id);
      delete memEvents[id];
      if (!LIB.list.length) {
        const nid = uid(),
          st = defaultState();
        memEvents[nid] = st;
        lsSet(EV_PREFIX + nid, JSON.stringify(st));
        LIB.list.push({ id: nid, ...evMeta(st) });
      }
      if (id === LIB.current) {
        LIB.current = LIB.list[0].id;
        S = loadEvent(LIB.current);
        resetUI();
        saveIndex();
        clListenPub();
        renderTop();
        setView(view);
      } else saveIndex();
      if (sh && sh.kind === "events") renderEvents();
      toast("행사를 지웠어요");
      break;
    }
    case "bulkLoad":
      bulkLoadExisting();
      break;
    case "sheetClose":
      tryClose();
      break;
    case "bulkMore":
      bulkAppend(5);
      bulkCheck();
      break;
    case "bulkSave":
      bulkSave();
      break;
    case "mapedit":
      mapEdit = !mapEdit;
      mapSel = null;
      renderMap();
      break;
    case "mfind":
      UIP.mapFind = !UIP.mapFind;
      if (UIP.mapFind) {
        UIP.mapRoute = false;
        herePick = !hereRef();
      } else {
        herePick = false;
        findTarget = null;
      }
      saveUIP();
      mv().init = false;
      renderMap();
      if (UIP.mapFind && herePick) toast("지금 가장 가까운 부스를 눌러 주세요");
      break;
    case "fpick":
      herePick = !herePick;
      renderMapItems();
      renderMapBottom();
      break;
    case "ftgt": {
      const here = hereRef();
      if (t.dataset.t === "lbl") {
        if (!here) return;
        const m = nearestMark(t.dataset.l, here);
        if (m) setFindTarget({ t: "m", id: m.id });
      } else if (t.dataset.t === "b") setFindTarget({ t: "b", id: t.dataset.id });
      else {
        findTarget = null;
        renderMapItems();
        renderMapBottom();
      }
      break;
    }
    case "mroute":
      UIP.mapRoute = !UIP.mapRoute;
      if (UIP.mapRoute) UIP.mapFind = false;
      saveUIP();
      mv().init = false;
      renderMap();
      if (UIP.mapRoute && mapRouteData && !mapRouteData.stops.length && !mapRouteData.unplaced.length)
        toast("남은 물품이 있는 부스가 없어요");
      break;
    case "rfold":
      UIP.routeFold = !UIP.routeFold;
      saveUIP();
      renderMapBottom();
      requestAnimationFrame(() => applyView());
      break;
    case "rauto": {
      delete routeCfg().manual[LIB.current];
      saveUIP();
      renderMapItems();
      renderMapBottom();
      toast("자동 순서로 되돌렸어요");
      break;
    }
    case "rswap": {
      const o = routeCfg().order,
        k = +t.dataset.k;
      if (k > 0 && k < 3) {
        [o[k - 1], o[k]] = [o[k], o[k - 1]];
        saveUIP();
        renderMapItems();
        renderMapBottom();
      }
      break;
    }
    case "rgo": {
      const b = findBooth(t.dataset.id);
      if (!b || !b.pos) return;
      if (b.pos.hall !== mapHall) {
        mapHall = b.pos.hall;
        renderMap();
        requestAnimationFrame(() => centerOn(b));
      } else centerOn(b);
      break;
    }
    case "hall":
      if (mapHall !== t.dataset.hid) {
        mapHall = t.dataset.hid;
        mapSel = null;
        renderMap();
      }
      break;
    case "halladd": {
      const h = { id: uid(), name: S.halls.length + 1 + "관", w: 36, h: 24 };
      S.halls.push(h);
      mapHall = h.id;
      mapSel = null;
      save();
      renderMap();
      toast(`${h.name}을 만들었어요`);
      break;
    }
    case "hallset":
      openSheet({ kind: "hall", id: curHall().id });
      break;
    case "hallsave": {
      const h = S.halls.find((x) => x.id === sh.id);
      if (!h) return;
      const nm = $("hName").value.trim();
      if (nm) h.name = nm;
      save();
      closeSheet();
      renderMap();
      toast("저장했어요");
      break;
    }
    case "halldel": {
      const h = S.halls.find((x) => x.id === sh.id);
      if (!h) return;
      if (await confirmBox(`${h.name}을 지울까요?\n구조물은 지워지고, 이 관의 부스는 ‘안 놓은 부스’로 돌아가요.`, "삭제", true)) {
        S.halls = S.halls.filter((x) => x !== h);
        S.marks = S.marks.filter((m) => m.hall !== h.id);
        S.booths.forEach((b) => {
          if (b.pos && b.pos.hall === h.id) b.pos = null;
        });
        delete mapViews[h.id];
        mapHall = S.halls[0].id;
        mapSel = null;
        save();
        closeSheet();
        renderMap();
      }
      break;
    }
    case "zin": {
      const z = vpSize();
      zoomAt(z.w / 2, z.h / 2, 1.3);
      break;
    }
    case "zout": {
      const z = vpSize();
      zoomAt(z.w / 2, z.h / 2, 1 / 1.3);
      break;
    }
    case "zfit":
      fitMap();
      break;
    case "mplace": {
      const b = findBooth(t.dataset.id);
      if (b) placeBooth(b);
      break;
    }
    case "mauto":
      autoLayout();
      break;
    case "madd": {
      const h = curHall(),
        c = viewCenterCell(),
        w = 4,
        hh = 2;
      const occ = occupied(h.id);
      for (const k of S.marks)
        if (k.hall === h.id) for (let i = 0; i < k.w; i++) for (let j = 0; j < k.h; j++) occ.add(k.x + i + "," + (k.y + j));
      const sp = freeSpot(h, w, hh, c.x - 1, c.y, occ);
      const m = { id: uid(), hall: h.id, x: sp.x, y: sp.y, w, h: hh, label: "새 구조물", color: MARK_COLORS[0] };
      S.marks.push(m);
      mapSel = { t: "m", id: m.id };
      save();
      renderMapItems();
      renderMapBottom();
      setTimeout(() => {
        const i = $("mkLabel");
        if (i) {
          i.focus();
          i.select();
        }
      }, 50);
      break;
    }
    case "mrot": {
      const b = findBooth(mapSel && mapSel.id);
      if (!b || !b.pos) return;
      b.pos.rot = b.pos.rot ? 0 : 1;
      save();
      renderMapItems();
      break;
    }
    case "munplace": {
      const b = findBooth(mapSel && mapSel.id);
      if (b) {
        b.pos = null;
        mapSel = null;
        save();
        renderMapItems();
        renderMapBottom();
      }
      break;
    }
    case "mcolor": {
      const m = S.marks.find((x) => x.id === (mapSel && mapSel.id));
      if (m) {
        m.color = t.dataset.c;
        save();
        renderMapItems();
        renderMapBottom();
      }
      break;
    }
    case "mdel": {
      const m = S.marks.find((x) => x.id === (mapSel && mapSel.id));
      if (!m) return;
      if (await confirmBox(`‘${m.label || "구조물"}’을 지울까요?`, "삭제", true)) {
        S.marks = S.marks.filter((x) => x !== m);
        mapSel = null;
        save();
        renderMapItems();
        renderMapBottom();
      }
      break;
    }
    case "showOnMap": {
      const b = findBooth(sh && sh.id);
      if (b && b.pos) goMap(b);
      break;
    }
    case "placeOnMap": {
      const b = findBooth(sh && sh.id);
      if (b && lockedBooth(b)) {
        toast("원본 배치도에 아직 놓이지 않은 부스예요");
        break;
      }
      if (b) placeMap(b);
      break;
    }
    case "artShow": {
      const b = findBooth(sh && sh.id),
        a = b && b.artists.find((x) => x.id === t.dataset.aid);
      if (a) {
        a.hidden = false;
        save();
        renderBoothItems();
        rerenderSoft();
      }
      break;
    }
    case "sec":
      secFilter = t.dataset.sec;
      renderBoothList();
      main.scrollTop = 0;
      break;
    case "open":
      openSheet({ kind: "booth", id: t.dataset.id });
      break;
    case "cycle":
      cycle(row.dataset.bid, row.dataset.iid, row.dataset.sid || "", t);
      break;
    case "want": {
      const b = findBooth(row.dataset.bid),
        i = b && b.items.find((x) => x.id === row.dataset.iid);
      if (!i) return;
      const x = row.dataset.sid ? (i.subs || []).find((y) => y.id === row.dataset.sid) : null,
        o = x || i;
      if (row.dataset.sid && !x) return;
      o.want = Math.max(0, (o.want || 0) + +t.dataset.d);
      if (!o.want) o.st = 0;
      if (navigator.vibrate)
        try {
          navigator.vibrate(6);
        } catch (_) {}
      save();
      renderTop();
      const body = sheet.querySelector(".sh-body"),
        y0 = row.getBoundingClientRect().top,
        iid = row.dataset.iid,
        sid = row.dataset.sid || "";
      renderBoothItems();
      const nr = sheet.querySelector(`.item[data-iid="${iid}"]`);
      if (nr && body) body.scrollTop += nr.getBoundingClientRect().top - y0;
      break;
    }
    case "editItem":
      openSheet({ kind: "item", id: row.dataset.bid, iid: row.dataset.iid });
      break;
    case "editBooth":
      sh = { kind: "boothForm", id: sh.id };
      renderSheet();
      break;
    case "backBooth": {
      sh = { kind: "booth", id: sh.id };
      renderSheet();
      break;
    }
    case "saveBooth": {
      const d = sh.draft;
      if (!d.section) {
        toast("구역을 골라 주세요");
        return;
      }
      if (!d.num) {
        toast("부스 번호를 적어 주세요");
        document.getElementById("fNum").focus();
        return;
      }
      if (sh.flushTag) sh.flushTag();
      let b;
      const isNewB = !sh.id;
      const hv = {};
      for (const [k, id, nm] of [
        ["openFrom", "fOpenF", "부스 운영 시작"],
        ["openTo", "fOpenT", "부스 운영 끝"],
        ["pickupFrom", "fPickF", "선입금 수령 시작"],
        ["pickup", "fPick", "선입금 수령 마감"],
      ]) {
        const v = String(d[k] || "").trim() ? normTime(d[k]) : "";
        if (v === null) {
          toast(`${nm} 시간을 14:00처럼 적어 주세요`);
          document.getElementById(id).focus();
          return;
        }
        hv[k] = v;
      }
      if (hv.openFrom && hv.openTo && hv.openFrom > hv.openTo) {
        toast("부스 운영 시작이 끝보다 늦어요");
        document.getElementById("fOpenF").focus();
        return;
      }
      if (hv.pickupFrom && hv.pickup && hv.pickupFrom > hv.pickup) {
        toast("선입금 수령 시작이 마감보다 늦어요");
        document.getElementById("fPickF").focus();
        return;
      }
      const pk = hv.pickup;
      const times = [];
      for (const x of d.times) {
        const lb = (x.label || "").trim(),
          tm = (x.time || "").trim() ? normTime(x.time) : "",
          te = (x.end || "").trim() ? normTime(x.end) : "";
        if (tm === null || te === null) {
          toast(`‘${lb || "시간"}’의 시간을 13:00처럼 적어 주세요`);
          return;
        }
        if (tm && te && tm > te) {
          toast(`‘${lb || "시간"}’ 시작이 끝보다 늦어요`);
          return;
        }
        const tx = String(x.text || "")
            .trim()
            .slice(0, 120),
          nt = String(x.note || "")
            .trim()
            .slice(0, 200);
        if (lb || tm || te || tx) times.push({ label: lb, time: tm, end: te, text: tx, note: nt });
      }
      const artists = [];
      for (const a of d.artists) {
        const nick = (a.nick || "").trim(),
          site = normSite(a.site),
          info = normLink(a.info);
        if (site === null) {
          toast(`‘${nick || "작가"}’ 사이트 주소를 확인해 주세요 (https:// 또는 @아이디)`);
          return;
        }
        if (info === null) {
          toast(`‘${nick || "작가"}’ 인포 링크를 https://로 시작하게 적어 주세요`);
          return;
        }
        const amemo = (a.memo || "").trim().slice(0, 200),
          arecv = normRecv(a.recv, "");
        /* 선입금(pre)·수요조사(sv) 기간: 켠 것만 저장 */
        const per = (p, w) => {
          const none = { from: "", to: "", time: "", link: "" };
          if (p === "pre" ? a._pre === false : !a._sv) return none;
          const from = validDate(a[p + "From"]),
            to = validDate(a[p + "To"]),
            time = (a[p + "ToTime"] || "").trim() ? normTime(a[p + "ToTime"]) : "";
          if (time === null) {
            toast(`‘${nick || "작가"}’ ${w} 마감 시각을 23:59처럼 적어 주세요`);
            return null;
          }
          if (from && to && from > to) {
            toast(`‘${nick || "작가"}’ ${w} 시작일이 마감일보다 늦어요`);
            return null;
          }
          const link = (a[p + "Link"] || "").trim() ? normLink(a[p + "Link"]) : "";
          if (link === null) {
            toast(`‘${nick || "작가"}’ ${w} 폼 링크를 https://로 시작하게 적어 주세요`);
            return null;
          }
          return { from, to, time, link };
        };
        const pp = per("pre", "선입금"),
          sv = per("sv", "수요조사");
        if (!pp || !sv) return;
        const imgs = [...new Set([...(a.imgs || []), ...parseUrls(a.imgIn)])].slice(0, 12);
        if (nick || site || info || amemo || arecv.length || pp.from || pp.to || pp.link || sv.from || sv.to || sv.link || imgs.length)
          artists.push({
            id: a.id || uid(),
            nick,
            site,
            info,
            memo: amemo,
            recv: arecv,
            preFrom: pp.from,
            preTo: pp.to,
            preToTime: pp.time,
            preLink: pp.link,
            svFrom: sv.from,
            svTo: sv.to,
            svToTime: sv.time,
            svLink: sv.link,
            hidden: !!a.hidden,
            imgs,
          });
      }
      const fields = {
        section: d.section,
        num: d.num,
        half: d.half,
        span: d.half ? 1 : d.span || 1,
        size: d.half ? 1 : 2 * (d.span || 1),
        name: d.name.trim(),
        artists,
        pickup: pk,
        pickupFrom: hv.pickupFrom,
        openFrom: hv.openFrom,
        openTo: hv.openTo,
        times,
        isFriend: !!(d.isFriend || (d.friendsText || "").trim()),
        friends: [
          ...new Set(
            (d.friendsText || "")
              .split(/[,，、]/)
              .map((x) => x.trim().slice(0, 30))
              .filter(Boolean)
          ),
        ],
        memo: d.memo,
        tags: [...d.tags],
      };
      if (sh.id && !findBooth(sh.id)) {
        toast("다른 곳에서 지워진 부스예요");
        closeSheet();
        return;
      }
      if (sh.id) {
        b = findBooth(sh.id);
        const wasFull = !b.half;
        Object.assign(b, fields);
        pinSoleArtist(b);
        if (b.pos && (wasFull !== !b.half || b.half)) b.pos.rot = 0;
      } else {
        b = { id: uid(), ...fields, pos: null, items: [] };
        S.booths.push(b);
      }
      const same = S.booths.filter((x) => x !== b && x.section === b.section && x.num === b.num);
      const dup = same.find((x) => (x.half || 0) === (b.half || 0)) || (b.half ? same.find((x) => !x.half) : same.find((x) => x.half));
      save();
      renderTop();
      if (view === "booths") renderBoothList();
      sh = { kind: "booth", id: b.id };
      renderSheet();
      toast(dup ? `${boothCode(dup)} 부스와 번호가 겹쳐요. 한 번 확인해 주세요.` : isNewB ? "부스를 추가했어요" : "저장했어요");
      break;
    }
    case "delBooth": {
      const b = findBooth(sh.id);
      if (await confirmBox(`${boothCode(b)} ${b.name || ""} 부스와 물품 ${b.items.length}개를 지울까요?`, "삭제", true)) {
        S.booths = S.booths.filter((x) => x !== b);
        save();
        closeSheet();
        toast("삭제했어요");
      }
      break;
    }
    case "saveItem": {
      sh.keepInputs();
      const d = sh.draft;
      if (!d.name.trim()) {
        toast("물품 이름을 적어 주세요");
        return;
      }
      const b = findBooth(sh.id);
      const it = b && b.items.find((i) => i.id === sh.iid);
      if (!it) {
        toast("다른 곳에서 지워진 물품이에요");
        closeSheet();
        return;
      }
      const price = d.type === "free" ? 0 : d.price,
        cap = d.type === "pre" ? 2 : 1,
        want = Math.max(1, +d.want || 1);
      Object.assign(it, {
        name: d.name.trim(),
        price,
        want,
        type: d.type,
        st: want ? Math.min(cap, it.st) : 0,
        must: !!d.must,
        maybe: !!d.maybe,
        note: (d.note || "").trim(),
        cat: d.cat || "",
        artist: soleArtist(b) || d.artist || "",
        pay: d.type === "free" ? "" : ["cash", "transfer", "card"].includes(d.pay) ? d.pay : "",
        forWho: String(d.forWho || "")
          .trim()
          .slice(0, 30),
      });
      save();
      renderTop();
      sh = { kind: "booth", id: b.id };
      renderSheet();
      toast("저장했어요");
      break;
    }
    case "delItem": {
      const b = findBooth(sh.id);
      if (await confirmBox(`‘${sh.draft.name || "이 물품"}’을 지울까요?`, "삭제", true)) {
        b.items = b.items.filter((i) => i.id !== sh.iid);
        save();
        renderTop();
        sh = { kind: "booth", id: b.id };
        renderSheet();
      }
      break;
    }
    case "ckcat":
      ckCat = ckCat === t.dataset.cat ? null : t.dataset.cat;
      renderCheckList();
      break;
    case "catadd": {
      const inp = document.getElementById("newCat");
      const v = inp.value.trim().slice(0, 20);
      if (!v) {
        inp.focus();
        return;
      }
      if (S.cats.includes(v)) {
        toast("이미 있는 종류예요");
        return;
      }
      S.cats.push(v);
      save();
      renderInfo();
      toast(`‘${v}’ 종류를 추가했어요`);
      break;
    }
    case "catup": {
      const i = +t.dataset.i;
      if (i <= 0) return;
      [S.cats[i - 1], S.cats[i]] = [S.cats[i], S.cats[i - 1]];
      save();
      renderInfo();
      break;
    }
    case "tagjump": {
      tagFilter = t.dataset.tag;
      secFilter = "all";
      query = "";
      setView("booths");
      break;
    }
    case "tagdel": {
      const tg = t.dataset.tag,
        n = S.booths.filter((b) => b.tags.includes(tg)).length;
      if (
        await confirmBox(`‘#${tg}’ 태그를 지울까요?\n이 태그가 달린 부스 ${n}개에서 모두 빠져요. 부스는 지워지지 않아요.`, "삭제", true)
      ) {
        for (const b of S.booths) b.tags = b.tags.filter((x) => x !== tg);
        if (tagFilter === tg) tagFilter = null;
        save();
        renderInfo();
        toast(`‘#${tg}’ 태그를 지웠어요`);
      }
      break;
    }
    case "catdel": {
      const c = t.dataset.cat;
      let n = 0;
      for (const b of S.booths) for (const i of b.items) if (i.cat === c) n++;
      if (
        await confirmBox(
          n ? `‘${c}’ 종류를 지울까요?\n이 종류로 고른 물품 ${n}개는 ‘종류 없음’이 돼요.` : `‘${c}’ 종류를 지울까요?`,
          "삭제",
          true
        )
      ) {
        S.cats = S.cats.filter((x) => x !== c);
        for (const b of S.booths) for (const i of b.items) if (i.cat === c) i.cat = "";
        if (lastCat === c) lastCat = "";
        if (ckCat === c) ckCat = null;
        save();
        renderInfo();
      }
      break;
    }
    case "mode":
      ckMode = t.dataset.mode;
      document.querySelectorAll("#seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === t)));
      renderCheckList();
      break;
    case "nomaybe":
      ckNoMaybe = !ckNoMaybe;
      t.setAttribute("aria-pressed", String(ckNoMaybe));
      renderCheckList();
      break;
    case "dlsort":
      ckDl = !ckDl;
      t.setAttribute("aria-pressed", String(ckDl));
      renderCheckList();
      break;
    case "remain":
      ckRemain = !ckRemain;
      t.setAttribute("aria-pressed", String(ckRemain));
      renderCheckList();
      break;
    case "schadd": {
      const ti = document.getElementById("newTime"),
        tx = document.getElementById("newSch");
      const tm = normTime(ti.value);
      if (!tm) {
        toast("시간을 09:00처럼 24시간제로 적어 주세요");
        ti.focus();
        return;
      }
      if (!tx.value.trim()) {
        toast("일정 내용을 적어 주세요");
        tx.focus();
        return;
      }
      S.event.schedule.push({ id: uid(), time: tm, text: tx.value.trim() });
      save();
      tx.value = "";
      ti.value = "";
      renderSchList();
      renderTop();
      ti.focus();
      break;
    }
    case "exadd": {
      if (!S.event.extras) S.event.extras = [];
      if (S.event.extras.length >= 100) {
        toast("이벤트는 100개까지 적을 수 있어요");
        return;
      }
      const nx = { id: uid(), title: "", from: "", to: "", place: "", note: "", done: false, subs: [] };
      S.event.extras.push(nx);
      save();
      renderView();
      const i = document.querySelector(`[data-ex="title"][data-xid="${nx.id}"]`);
      if (i) i.focus();
      break;
    }
    case "exsubadd": {
      const x = exFind(t.dataset.xid);
      if (!x) return;
      if (!x.subs) x.subs = [];
      if (x.subs.length >= 50) {
        toast("하위 이벤트는 50개까지 적을 수 있어요");
        return;
      }
      const ny = { id: uid(), title: "", from: "", to: "", note: "", done: false };
      x.subs.push(ny);
      save();
      renderView();
      const i = document.querySelector(`[data-ex="title"][data-sub="${ny.id}"]`);
      if (i) i.focus();
      break;
    }
    case "exdel": {
      const x = exFind(t.dataset.xid);
      if (!x) return;
      const sub = t.dataset.sub,
        y = sub ? exFind(t.dataset.xid, sub) : null;
      if (sub && !y) return;
      const o = y || x,
        filled = y ? subFilled(y) : exFilled(x);
      if (
        filled &&
        !(await confirmBox(
          `‘${o.title || (y ? "하위 이벤트" : "이벤트")}’를 지울까요?${!y && (x.subs || []).length ? "\n하위 이벤트도 같이 지워져요." : ""}`,
          "삭제",
          true
        ))
      )
        return;
      if (y) x.subs = x.subs.filter((z) => z !== y);
      else S.event.extras = S.event.extras.filter((z) => z !== x);
      save();
      renderView();
      break;
    }
    case "exdone": {
      const o = exFind(t.dataset.xid, t.dataset.sub);
      if (!o) return;
      o.done = !o.done;
      save();
      renderView();
      break;
    }
    case "schdel": {
      const x = S.event.schedule.find((y) => y.id === t.dataset.sid);
      if (!x) return;
      if (await confirmBox(`${x.time} ${x.text} 일정을 지울까요?`, "삭제", true)) {
        S.event.schedule = S.event.schedule.filter((y) => y !== x);
        save();
        renderSchList();
        renderTop();
      }
      break;
    }
    case "secadd": {
      const inp = document.getElementById("newSec");
      const v = inp.value.trim();
      if (!v) {
        inp.focus();
        return;
      }
      if (S.sections.includes(v)) {
        toast("이미 있는 구역이에요");
        return;
      }
      S.sections.push(v);
      save();
      renderInfo();
      toast(`${v} 구역을 추가했어요`);
      break;
    }
    case "secup": {
      const i = +t.dataset.i;
      if (i <= 0) return;
      [S.sections[i - 1], S.sections[i]] = [S.sections[i], S.sections[i - 1]];
      save();
      renderInfo();
      break;
    }
    case "secdel": {
      const s = t.dataset.sec;
      const n = S.booths.filter((b) => b.section === s).length;
      if (n) {
        toast(`${s} 구역에 부스 ${n}개가 있어요. 부스를 먼저 옮기거나 지워 주세요.`);
        return;
      }
      if (await confirmBox(`${s} 구역을 지울까요?`, "삭제", true)) {
        S.sections = S.sections.filter((x) => x !== s);
        save();
        renderInfo();
      }
      break;
    }
    case "mkcode": {
      const code = await makeCode(shareOpts());
      const out = document.getElementById("codeOut");
      out.innerHTML = `<textarea class="inp out" id="codeTxt" readonly style="margin-top:12px">${esc(code)}</textarea>
<div class="btnrow" style="margin-top:8px"><button class="btn" data-act="copycode">코드 복사</button></div>
<p class="desc" style="margin:8px 0 0">${code.length.toLocaleString()}자 · 메신저 글자 수 제한에 걸리면 백업 파일로 보내세요.</p>`;
      copyText(code, document.getElementById("codeTxt"));
      break;
    }
    case "copycode": {
      const el = document.getElementById("codeTxt");
      copyText(el.value, el);
      break;
    }
    case "import":
      await doImport(document.getElementById("codeIn").value);
      break;
    case "mktext": {
      const txt = makeText(shareOpts());
      if (!txt) {
        toast("공유할 내용이 아직 없어요");
        return;
      }
      document.getElementById("textOut").innerHTML =
        `<textarea class="inp out" id="textTxt" readonly style="margin-top:12px;min-height:180px;font-family:var(--body);font-size:14px;word-break:keep-all">${esc(txt)}</textarea>
<div class="btnrow" style="margin-top:8px"><button class="btn" data-act="copytext">글 복사</button></div>`;
      break;
    }
    case "copytext": {
      const el = document.getElementById("textTxt");
      copyText(el.value, el);
      break;
    }
    case "download": {
      if (!downloads && !canBlobDl) return;
      const name = (S.event.name || "부스체크").replace(/[\\/:*?"<>|]/g, "").slice(0, 40) + "-백업.json";
      if (!downloads) {
        try {
          const url = URL.createObjectURL(new Blob([JSON.stringify(exportData(SHARE_ALL), null, 1)], { type: "application/json" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          toast("백업 파일을 저장했어요");
        } catch (err) {
          toast("파일을 저장하지 못했어요");
        }
        break;
      }
      try {
        await downloads.save({ filename: name, data: JSON.stringify(exportData(SHARE_ALL), null, 1) });
        toast("백업 파일을 저장했어요");
      } catch (err) {
        if (err && err.code !== "declined") toast("파일을 저장하지 못했어요");
      }
      break;
    }
    case "reset": {
      const nm = S.event.name || "이름 없는 행사";
      if (
        !(await confirmBox(
          `‘${nm}’를 지울까요?\n부스, 물품, 체크 기록이 모두 사라지고 되돌릴 수 없어요.${clDelNote(LIB.current)}`,
          "삭제",
          true
        ))
      )
        break;
      const id = LIB.current;
      clDeleted(id);
      setBase(id, null);
      delete lastJs[id];
      clearTimeout(saveT);
      saveT = null;
      LIB.list = LIB.list.filter((x) => x.id !== id);
      lsDel(EV_PREFIX + id);
      delete memEvents[id];
      if (!LIB.list.length) {
        const nid = uid(),
          st = defaultState();
        st.sections = [...S.sections];
        st.cats = [...S.cats];
        memEvents[nid] = st;
        lsSet(EV_PREFIX + nid, JSON.stringify(st));
        LIB.list.push({ id: nid, ...evMeta(st) });
      }
      LIB.current = LIB.list[0].id;
      saveIndex();
      S = loadEvent(LIB.current);
      resetUI();
      clListenPub();
      renderTop();
      renderView();
      toast("행사를 지웠어요");
      break;
    }
  }
});

/* inputs (search, event info, section rename) */
let qT;
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "q") {
    clearTimeout(qT);
    qT = setTimeout(() => {
      query = t.value.trim();
      renderBoothList();
    }, 120);
  } else if (t.dataset.ev) {
    if (t.dataset.ev !== "host") {
      S.event[t.dataset.ev] = t.value;
      save();
      renderTop();
    }
  } else if (t.dataset.ex && t.dataset.ex !== "from" && t.dataset.ex !== "to") {
    const o = exFind(t.dataset.xid, t.dataset.sub);
    if (o) {
      o[t.dataset.ex] = t.value.slice(0, t.dataset.ex === "note" ? (t.dataset.sub ? 300 : 1000) : 80);
      save();
    }
  } else if (t.dataset.sch === "text") {
    const x = S.event.schedule.find((y) => y.id === t.dataset.sid);
    if (x) {
      x.text = t.value;
      save();
      renderTop();
    }
  }
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.ev === "host") {
    const v = t.value.trim(),
      u = v ? normSite(v) : "";
    if (u === null) {
      toast("주최 계정은 @아이디나 https:// 주소로 적어 주세요");
      t.value = S.event.host ? (/^@/.test(twShow(S.event.host)) ? twShow(S.event.host) : S.event.host) : "";
      return;
    }
    S.event.host = u;
    save();
    t.value = u ? (/^@/.test(twShow(u)) ? twShow(u) : u) : "";
    return;
  }
  if (t.dataset.ex === "from" || t.dataset.ex === "to") {
    const x = exFind(t.dataset.xid, t.dataset.sub);
    if (!x) return;
    const k = t.dataset.ex,
      v = t.value.trim();
    {
      const tm = v ? normTime(v) : "";
      if (tm === null) {
        toast("시간을 14:00처럼 적어 주세요");
        t.value = x[k];
        return;
      }
      x[k] = tm;
      t.value = tm;
    }
    if (x.from && x.to && x.from > x.to) toast("시작이 끝보다 늦어요. 한 번 확인해 주세요");
    save();
    return;
  }
  if (t.dataset.sch === "time") {
    const x = S.event.schedule.find((y) => y.id === t.dataset.sid);
    if (x) {
      const tm = normTime(t.value);
      if (!tm) {
        toast("시간을 09:00처럼 24시간제로 적어 주세요");
        t.value = x.time;
        return;
      }
      x.time = tm;
      save();
      renderSchList();
      renderTop();
    }
    return;
  }
  if (t.dataset.act === "tagname") {
    const old = t.dataset.old,
      v = cleanTag(t.value);
    if (!v || v === old) {
      t.value = old;
      return;
    }
    const exists = S.booths.some((b) => b.tags.includes(v));
    const go = () => {
      for (const b of S.booths) if (b.tags.includes(old)) b.tags = [...new Set(b.tags.map((x) => (x === old ? v : x)))];
      if (tagFilter === old) tagFilter = v;
      save();
      renderInfo();
      toast(exists ? `#${old} → #${v} 로 합쳤어요` : `#${old} → #${v}`);
    };
    if (exists)
      confirmBox(`‘#${v}’ 태그가 이미 있어요.\n‘#${old}’를 ‘#${v}’로 합칠까요?`, "합치기").then((ok) => {
        if (ok) go();
        else t.value = old;
      });
    else go();
    return;
  }
  if (t.dataset.act === "catname") {
    const old = t.dataset.old,
      v = t.value.trim().slice(0, 20);
    if (!v || v === old) {
      t.value = old;
      return;
    }
    if (S.cats.includes(v)) {
      toast("이미 있는 종류 이름이에요");
      t.value = old;
      return;
    }
    S.cats = S.cats.map((c) => (c === old ? v : c));
    for (const b of S.booths) for (const i of b.items) if (i.cat === old) i.cat = v;
    if (lastCat === old) lastCat = v;
    if (ckCat === old) ckCat = v;
    save();
    renderInfo();
    toast(`${old} → ${v}`);
    return;
  }
  if (t.dataset.act === "secname") {
    const old = t.dataset.old,
      v = t.value.trim();
    if (!v || v === old) {
      t.value = old;
      return;
    }
    if (S.sections.includes(v)) {
      toast("이미 있는 구역 이름이에요");
      t.value = old;
      return;
    }
    S.sections = S.sections.map((s) => (s === old ? v : s));
    S.booths.forEach((b) => {
      if (b.section === old) b.section = v;
    });
    if (secFilter === old) secFilter = v;
    save();
    renderTop();
    renderInfo();
    toast(`${old} → ${v}`);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !imeBusy(e) && e.target.id === "newTime") {
    e.preventDefault();
    const tm = normTime(e.target.value);
    if (tm) e.target.value = tm;
    document.getElementById("newSch").focus();
    return;
  }
  if (e.key === "Enter" && !imeBusy(e) && e.target.id === "newSch") {
    e.preventDefault();
    document.querySelector('[data-act="schadd"]').click();
    return;
  }
  if (e.key === "Enter" && !imeBusy(e) && e.target.dataset && e.target.dataset.gnew) {
    e.preventDefault();
    const b = document.querySelector(`[data-act="gadd"][data-pid="${e.target.dataset.gnew}"]`);
    if (b) b.click();
    return;
  }
  if (e.key === "Enter" && !imeBusy(e) && e.target.id === "newCat") {
    e.preventDefault();
    document.querySelector('[data-act="catadd"]').click();
    return;
  }
  if (e.key === "Enter" && !imeBusy(e) && e.target.id === "newSec") {
    e.preventDefault();
    document.querySelector('[data-act="secadd"]').click();
  }
});

fab.addEventListener("click", () => {
  if (!S.sections.length) {
    toast("구역을 먼저 만들어 주세요");
    setView("info");
    return;
  }
  openSheet({ kind: "boothForm", id: null });
});

(() => {
  const v = document.getElementById("imgv");
  let x0 = null,
    moved = 0;
  v.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".vform")) {
      x0 = e.clientX;
      moved = 0;
    }
  });
  v.addEventListener("pointerup", (e) => {
    if (x0 != null) moved = e.clientX - x0;
    x0 = null;
  });
  v.addEventListener("click", (e) => {
    if (e.target.closest(".vform") || e.target.id === "imgvOpen") return;
    if (e.target.closest("[data-vx]")) {
      closeViewer();
      return;
    }
    if (e.target.closest("[data-vw]")) {
      startWrite();
      return;
    }
    const nv = e.target.closest("[data-vd]");
    if (nv) {
      stepViewer(+nv.dataset.vd);
      return;
    }
    if (Math.abs(moved) > 40 && VW.list.length > 1 && !v.classList.contains("zoom")) {
      stepViewer(moved < 0 ? 1 : -1);
      moved = 0;
      return;
    }
    if (e.target.id === "imgvImg") {
      v.classList.toggle("zoom");
      return;
    }
    if (!v.classList.contains("write")) closeViewer();
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (!v.classList.contains("show")) return;
      if (e.key === "Escape") {
        closeViewer();
        e.stopPropagation();
        return;
      }
      if (e.target.closest && e.target.closest(".vform")) return;
      if (e.key === "ArrowRight") {
        stepViewer(1);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        stepViewer(-1);
        e.preventDefault();
      }
    },
    true
  );
})();

/* 모바일: 아래로 스크롤하면 헤더를 접음 */
(() => {
  const mq = window.matchMedia("(max-width:559px)");
  let mini = false;
  main.addEventListener(
    "scroll",
    () => {
      if (!mq.matches) {
        if (mini) {
          mini = false;
          document.getElementById("top").classList.remove("mini");
          fab.classList.remove("shrunk");
        }
        return;
      }
      const y = main.scrollTop,
        want = mini ? y > 8 : y > 70;
      fab.classList.toggle("shrunk", want);
      if (want !== mini) {
        mini = want;
        document.getElementById("top").classList.toggle("mini", mini);
      }
    },
    { passive: true }
  );
})();
/* ---------- 오프라인 설치 (PWA) ---------- */
const PWA = { prompt: null, sw: false, ok: false };
function isStandalone() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
}
function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
/* ---------- 되살리기: 이 기기에 남아 있는 예전 사본 ---------- */
function stSize(st) {
  return st ? st.booths.length + st.booths.reduce((n, b) => n + b.items.length, 0) : 0;
}
function rescueCands() {
  const id = LIB.current,
    cur = stSize(S),
    out = [];
  const tryFull = (key, label) => {
    try {
      const r = lsGet(key);
      if (!r) return;
      const st = normalize(JSON.parse(r));
      if (stSize(st) > cur * 2 + 1) out.push({ key, label, st, full: true, n: st.booths.length, m: stSize(st) - st.booths.length });
    } catch (e) {}
  };
  tryFull(RESCUE_PREFIX + id, "오류가 났을 때 따로 보관해 둔 원본");
  tryFull(SB_PREFIX + id, "마지막으로 계정과 동기화한 사본");
  const b = getBase(id);
  if (b && b.p && b.p.booths.length > S.booths.length * 2 + 1)
    out.push({ key: PB_PREFIX + id, label: "실시간 공유 원본 (부스·작가 정보만)", full: false, n: b.p.booths.length, m: 0 });
  return out;
}
function rescueCard() {
  if (isSub()) return "";
  const c = rescueCands();
  if (!c.length) return "";
  return sgroup(
    "되살리기",
    `<div class="card" id="rescueCard"><h2>사라진 내용 되살리기</h2>
    <p class="desc">이 기기에 지금보다 내용이 많은 예전 사본이 남아 있어요. 고르면 지금 행사에 다시 넣어요. 되살리기 전에 ‘백업 파일 저장’을 해 두면 더 안전해요.</p>
    ${c.map((x, k) => `<div class="mgrow"><div><b>${esc(x.label)}</b><small>부스 ${x.n}개${x.full ? ` · 물품 ${x.m}개` : ""}</small></div><button class="btn pre sm" data-act="rescue" data-k="${k}">되살리기</button></div>`).join("")}
  </div>`
  );
}
async function doRescue(k) {
  const x = rescueCands()[+k];
  if (!x) return;
  if (
    !(await confirmBox(
      x.full
        ? `‘${x.label}’으로 이 행사를 되돌릴까요?\n지금 화면의 내용은 이 사본으로 바뀌어요.`
        : `‘${x.label}’에서 빠진 부스·작가 정보를 다시 넣을까요?\n지금 있는 물품·체크는 그대로 둬요.`,
      "되살리기"
    ))
  )
    return;
  const id = LIB.current;
  BROKEN.delete(id);
  if (x.full) S = x.st;
  else {
    const b = getBase(id);
    applyShared(S, b.p, null, true);
  }
  memEvents[id] = S;
  lastJs[id] = "";
  flush();
  if (x.full && x.key === RESCUE_PREFIX + id) lsDel(x.key);
  renderTop();
  renderView();
  toast("되살렸어요");
}
function pwaCard() {
  if (IN_CLAUDE || location.protocol === "file:") return "";
  const st = isStandalone() ? `<p class="pwast ok">✓ 홈 화면 앱으로 실행 중이에요.</p>` : "";
  const off = PWA.ok
    ? `<p class="pwast ok">✓ 인터넷이 끊겨도 이 기기에 저장된 내용으로 열려요.</p>`
    : PWA.sw
      ? `<p class="pwast">오프라인 준비 중… 잠시 뒤 다시 확인해 주세요.</p>`
      : "";
  let how = "";
  if (!isStandalone()) {
    if (PWA.prompt) how = `<button class="btn pre block" data-act="pwaInstall">홈 화면에 설치</button>`;
    else if (isIOS())
      how = `<ol><li>사파리 아래쪽 <b>공유</b> 버튼(네모에 화살표)을 눌러요.</li><li><b>홈 화면에 추가</b>를 골라요.</li><li>홈 화면의 ‘부스 체크’ 아이콘으로 열면 앱처럼 써요.</li></ol>`;
    else how = `<ol><li>브라우저 메뉴(⋮)를 열어요.</li><li><b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러요.</li></ol>`;
  }
  return `<div class="card pwacard" id="pwaCard"><h2>홈 화면에 설치</h2><p class="desc">앱처럼 아이콘으로 열고, 행사장에서 인터넷이 잘 안 터져도 그대로 쓸 수 있어요. 로그인 동기화와 실시간 공유는 인터넷이 다시 연결되면 이어서 돼요.</p>${st}${off}${how}</div>`;
}
function pwaRefresh() {
  const c = document.getElementById("pwaCard");
  if (c && view === "info") c.outerHTML = pwaCard();
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  PWA.prompt = e;
  pwaRefresh();
});
window.addEventListener("appinstalled", () => {
  PWA.prompt = null;
  toast("홈 화면에 설치했어요");
  pwaRefresh();
});
window.addEventListener("offline", () => toast("인터넷이 끊겼어요. 이 기기에 저장된 내용으로 계속 쓸 수 있어요"));
window.addEventListener("online", () => toast("다시 연결됐어요"));
document.addEventListener("click", async (e) => {
  if (!e.target.closest('[data-act="pwaInstall"]') || !PWA.prompt) return;
  const pr = PWA.prompt;
  PWA.prompt = null;
  try {
    await pr.prompt();
    await pr.userChoice;
  } catch (err) {}
  pwaRefresh();
});
if (
  "serviceWorker" in navigator &&
  !IN_CLAUDE &&
  (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))
) {
  PWA.sw = true;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        PWA.ok = true;
        pwaRefresh();
      })
      .catch(() => {
        PWA.sw = false;
        pwaRefresh();
      });
  });
}
/* 테스트용: 주소에 ?bctest가 있을 때만 내부 함수를 밖으로 꺼내 둠 (tests/ 참고) */
if (/[?&]bctest\b/.test(location.search))
  window.__bcTest = {
    normalize,
    defaultState,
    merge3,
    m3deep,
    applyShared,
    shareProj,
    sanitizeProj,
    parseLive,
    parseWitch,
    boothPeriods,
    tweetRef,
    twimgBig,
    parseInfoText,
    dropUrls,
    tweetToken,
    parseCode,
    makeCode,
    exportData,
    normTime,
    normRange,
    normLink,
    normSite,
    periodState,
    boothCode,
    josaRo,
    parseFriend,
    splitTags,
    esc,
    nextStamp,
    flush,
    getS: () => S,
    setS: (v) => {
      S = v;
    },
  };
/* boot */
if (BROKEN.size) setTimeout(brokenToast, 800);
renderTop();
setView("booths");
clInit();
