/**
 * 예약 DOM 추출 콘텐츠 스크립트 (공식 API가 없는 플랫폼의 핵심 경로)
 *
 * 원리: 33m2 등은 공개 API가 없다. 하지만 사용자가 로그인한 예약/캘린더
 * 화면에는 예약 정보가 이미 렌더되어 있다. 이 스크립트가 같은 출처(same-origin)
 * ·인증된 상태에서 그 DOM을 읽어 구조화한 뒤 staySync 백엔드로 보낸다.
 * → 내부 엔드포인트를 몰라도, API가 아예 없어도 작동한다.
 *
 * ⚠️ DOM 선택자(SELECTORS)는 각 플랫폼 화면 구조에 맞게 확정해야 한다.
 *    (사용자 본인 예약 화면에서 F12로 요소 구조 확인 → 아래 채우기)
 *    아래는 33m2 예시 골격이며, 실제 클래스/구조로 교체 필요.
 */
(function () {
  // ⚙️ 배포 설정: platforms.js 의 IS_PROD/DEV_API 와 동일하게 맞추세요.
  const IS_PROD = true;
  const STAYSYNC_API = IS_PROD ? "https://backend-production-f927.up.railway.app" : "http://localhost:8000";
  const host = location.hostname;

  // 플랫폼 식별
  const PLATFORM =
    host.includes("33m2") ? "33m2" :
    host.includes("enko") ? "enkostay" :
    host.includes("liveanywhere") ? "liveanywhere" :
    host.includes("zaritalk") ? "zaritalk" :
    host.includes("zigbang") ? "zigbang" : null;
  if (!PLATFORM) return;

  // 플랫폼별 DOM 선택자 (⚠️ 실제 화면 구조로 확정 필요)
  const SELECTORS = {
    "33m2": {
      // 예: 예약 카드 리스트. 실제 클래스명은 화면에서 확인해 교체.
      row: '[data-reservation-id], .reservation-item, .booking-row',
      idAttr: "data-reservation-id",
      guest: '.guest-name, .reservation-guest',
      checkin: '[data-checkin], .checkin-date',
      checkout: '[data-checkout], .checkout-date',
    },
    enkostay: { row: ".reservation-item", idAttr: "data-id", guest: ".guest", checkin: ".checkin", checkout: ".checkout" },
    liveanywhere: { row: ".booking", idAttr: "data-id", guest: ".guest", checkin: ".start", checkout: ".end" },
    zaritalk: { row: ".reservation", idAttr: "data-id", guest: ".name", checkin: ".start", checkout: ".end" },
    zigbang: { row: ".reservation-item, [data-reservation-id]", idAttr: "data-reservation-id", guest: ".guest-name", checkin: ".checkin", checkout: ".checkout" },
  };

  function txt(el, sel) {
    const n = el.querySelector(sel);
    return n ? n.textContent.trim() : "";
  }
  // 다양한 한국 날짜 표기 → YYYY-MM-DD
  const DATE_RE = /(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/g;
  function normOne(y, m, d) {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  function normDate(s) {
    const m = DATE_RE.exec(s);
    DATE_RE.lastIndex = 0;
    return m ? normOne(m[1], m[2], m[3]) : s;
  }
  function findDates(text) {
    const out = [];
    let m;
    DATE_RE.lastIndex = 0;
    while ((m = DATE_RE.exec(text))) out.push(normOne(m[1], m[2], m[3]));
    return out;
  }

  // ① 선택자 기반 추출
  function scrapeBySelectors() {
    const cfg = SELECTORS[PLATFORM];
    const rows = document.querySelectorAll(cfg.row);
    const bookings = [];
    rows.forEach((el, i) => {
      const id = el.getAttribute(cfg.idAttr) || `row-${i}`;
      const start = normDate(txt(el, cfg.checkin));
      const end = normDate(txt(el, cfg.checkout));
      if (!/^\d{4}-/.test(start) || !/^\d{4}-/.test(end)) return;
      bookings.push({ external_id: String(id), summary: txt(el, cfg.guest) || "예약",
        start_date: start, end_date: end, status: "confirmed" });
    });
    return bookings;
  }

  // ② 휴리스틱 추출: "날짜 2개 이상을 가진 가장 작은 컨테이너"를 예약 행으로 간주
  function scrapeHeuristic() {
    const candidates = [];
    const all = document.querySelectorAll("li, tr, article, div, section");
    all.forEach((el) => {
      // 자식 중 같은 패턴이 또 있으면(상위 컨테이너) 건너뜀 → 가장 안쪽 행만
      const t = el.innerText || "";
      if (t.length > 400) return;
      const dates = findDates(t);
      if (dates.length < 2) return;
      // 더 안쪽에 날짜2개 가진 자식이 있으면 스킵
      const innerHas = Array.from(el.children).some(
        (c) => findDates(c.innerText || "").length >= 2 && (c.innerText || "").length <= 400
      );
      if (innerHas) return;
      candidates.push({ el, dates, text: t });
    });
    const bookings = [];
    candidates.forEach((c, i) => {
      const sorted = [...new Set(c.dates)].sort();
      const start = sorted[0], end = sorted[sorted.length - 1];
      if (start === end) return;
      // 이름 추정: 날짜를 제외한 가장 짧은 의미있는 텍스트 라인
      const nameLine = (c.text.split("\n").map((s) => s.trim())
        .filter((s) => s && !DATE_RE.test(s) && s.length <= 20)[0]) || "예약";
      DATE_RE.lastIndex = 0;
      bookings.push({ external_id: `h-${i}-${start}`, summary: nameLine,
        start_date: start, end_date: end, status: "confirmed" });
    });
    return bookings;
  }

  // "주소" 라벨 뒤의 도로명/지번 주소를 추출 (다음 라벨/날짜 전까지)
  function extractAddr(seg) {
    const i = seg.indexOf("주소");
    if (i < 0) return "";
    let a = seg.slice(i + 2);
    // 다음 필드 라벨이나 날짜가 나오면 거기서 자름
    a = a.split(/입주|퇴실|임차인|계약|상태|영업|연락처|채팅|전화|관리비|보증금|20\d{2}[.\-/]/)[0];
    return a.replace(/\s+/g, " ").trim();
  }

  // ③ 33m2 전용 — 라벨 기반 텍스트 파서 (Next.js 서버렌더, 클라 API 없음)
  //    계약 상세(/host/contract/{id}) + 목록 화면 모두 대응
  function scrape33m2() {
    const fullText = (document.body.innerText || "").replace(/\s+/g, " ");
    const out = [];

    // (a) 계약 상세 페이지: 입주일/퇴실일/임차인 이름 라벨
    const cm = location.pathname.match(/\/contract\/(\d+)/);
    if (cm) {
      const after = (label, n = 40) => {
        const i = fullText.indexOf(label);
        return i < 0 ? "" : fullText.slice(i + label.length, i + label.length + n);
      };
      const start = normDate(after("입주일"));
      const end = normDate(after("퇴실일"));
      if (/^\d{4}-/.test(start) && /^\d{4}-/.test(end)) {
        let guest = "예약";
        const gi = fullText.indexOf("임차인 이름");
        if (gi >= 0) guest = (fullText.slice(gi + 6, gi + 40).split("연락처")[0] || "").trim() || "예약";
        // 방(매물): "방 정보 [방이름] 도로명/주소 [주소]"
        let room = "33m2 미지정", addr = "";
        const ri = fullText.indexOf("방 정보");
        if (ri >= 0) {
          const seg = fullText.slice(ri + 5, ri + 120);
          room = (seg.split(/도로명|주소|지번/)[0] || "").trim() || room;
          addr = extractAddr(seg);
        }
        const status = /결제완료|계약완료|확정|입주/.test(fullText) ? "confirmed" : "confirmed";
        out.push({ external_id: cm[1], summary: guest, room_label: room, room_addr: addr,
          start_date: start, end_date: end, status });
      }
    }

    // (b) 목록 화면(/host/contract): "날짜(요일) ~ 날짜(요일)" 쌍을 모두 찾고
    //     각 쌍의 직전 "임차인 [이름]"과 연결. 한 임차인이 여러 예약을 가질 수 있음.
    const rangeRe = /(20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2})\([월화수목금토일]\)\s*~\s*(20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2})\([월화수목금토일]\)/g;
    const seen = new Set();
    let m;
    while ((m = rangeRe.exec(fullText))) {
      const start = normDate(m[1]);
      const end = normDate(m[2]);
      if (!/^\d{4}-/.test(start) || !/^\d{4}-/.test(end)) continue;
      const before = fullText.slice(0, m.index);
      // 게스트: 직전 "임차인 [이름]"
      const gi = before.lastIndexOf("임차인 ");
      let guest = "예약";
      if (gi >= 0) guest = (before.slice(gi + 4, gi + 24).split(/채팅|전화|결제|주소|영업/)[0] || "").trim() || "예약";
      // 방(매물): 직전 "입주•퇴실 일정 [방이름] 주소 [주소텍스트]"
      // ⚠️ 이 앵커가 앞에 전혀 없는 날짜쌍은 예약 행이 아니라 페이지 상단의
      //    조회기간 필터/헤더가 잘못 잡힌 가짜 매치 → 건너뛴다.
      const ri = before.lastIndexOf("입주•퇴실 일정");
      if (ri < 0) continue;
      let room = "33m2 미지정", addr = "";
      const seg = before.slice(ri + 8, ri + 120);
      room = (seg.split("주소")[0] || "").trim() || room;
      addr = extractAddr(seg);
      // 같은 매물의 다른 계약이라도 주소가 같으면 하나로 관리되도록 그룹 키는 주소 우선
      const id = `33m2-${addr || room}-${start}-${end}-${guest}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ external_id: id, summary: guest, room_label: room, room_addr: addr,
        start_date: start, end_date: end, status: "confirmed" });
    }
    return out;
  }

  // ── 33m2 전체 페이지 자동 순회 (URL 안 바뀌는 클라이언트 페이지네이션 대응) ──
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 페이지네이션의 "번호 버튼"만 수집 → {번호: 요소}
  // ⚠️ 상태필터 카운트 배지("퇴실점검 1")의 "1"과 구분하려고, 숫자 버튼이 3개 이상
  //    모여있는 묶음(1·2·3·4·5)만 페이지네이션으로 인정한다.
  function getPageButtons() {
    const map = {};
    const digitEls = Array.from(document.querySelectorAll("a,button,li,span,div"))
      .filter((el) => el.offsetParent && el.children.length === 0 && /^\d{1,2}$/.test((el.textContent || "").trim()));
    for (const el of digitEls) {
      let anc = el.parentElement;
      let cluster = [];
      for (let i = 0; i < 3 && anc; i++) {
        cluster = Array.from(anc.querySelectorAll("a,button,li,span,div"))
          .filter((e) => e.children.length === 0 && e.offsetParent && /^\d{1,2}$/.test((e.textContent || "").trim()));
        if (cluster.length >= 3) break;
        anc = anc.parentElement;
      }
      if (cluster.length >= 3) map[(el.textContent || "").trim()] = el;
    }
    return map;
  }

  // 페이지네이션이 렌더될 때까지 끈기 있게 재스캔 (클릭 직후 렌더 지연 대응)
  async function getPageButtonsStable(retries = 8) {
    for (let i = 0; i < retries; i++) {
      const m = getPageButtons();
      if (Object.keys(m).length >= 2) return m;
      await sleep(250);
    }
    return getPageButtons();
  }

  async function scrape33m2AllPages() {
    const all = new Map();
    const collect = () => { for (const b of scrape33m2()) all.set(b.external_id, b); };

    // 항상 1페이지부터 시작 (이전 네비게이션 상태로 인한 부분수집 방지)
    const firstBtn = (await getPageButtonsStable())["1"];
    if (firstBtn) { firstBtn.click(); await sleep(1200); }

    collect(); // 1페이지
    let page = 1;
    let stagnant = 0;
    for (let guard = 0; guard < 40; guard++) {
      const map = await getPageButtonsStable();  // 렌더 완료까지 기다린 뒤 재스캔
      const next = map[String(page + 1)];        // 다음 번호 버튼
      if (!next) break;                          // 더 큰 페이지 번호 없음 = 마지막
      const before = all.size;
      next.click();
      await sleep(1500);
      collect();
      page += 1;
      if (all.size === before) { stagnant += 1; if (stagnant >= 2) break; }
      else stagnant = 0;
    }
    // (1페이지 복귀 클릭은 제거 — 상태 탭의 카운트 숫자를 잘못 누를 위험이 있고,
    //  데이터는 이미 위에서 모두 수집 완료되었으므로 화면 위치는 중요하지 않다.)

    const list = [...all.values()];
    const addrs = new Set(list.map((b) => b.room_addr || `(주소없음)${b.room_label}`));
    console.info(
      `[staySync] 33m2 전체 페이지 순회 (${page}페이지) — ${list.length}건 / 매물(주소기준) ${addrs.size}곳`,
      [...addrs]
    );
    return list;
  }

  function scrape() {
    if (PLATFORM === "33m2") {
      const b33 = scrape33m2();
      if (b33.length) { console.info(`[staySync] 33m2 라벨 파서로 ${b33.length}건 추출`); return b33; }
    }
    let b = scrapeBySelectors();
    if (b.length) { console.info(`[staySync] 선택자로 ${b.length}건 추출`); return b; }
    b = scrapeHeuristic();
    if (b.length) console.info(`[staySync] 휴리스틱으로 ${b.length}건 추출`);
    return b;
  }

  // 🔎 진단 도구: 콘솔에서 window.__staySyncDiagnose() 실행 → 무엇이 감지되는지 확인
  window.__staySyncDiagnose = function () {
    const bySel = scrapeBySelectors();
    const byHeu = scrapeHeuristic();
    const byPlat = PLATFORM === "33m2" ? scrape33m2() : [];
    console.group(`[staySync 진단] 플랫폼=${PLATFORM}`);
    if (byPlat.length) console.log("플랫폼 전용 파서:", byPlat.length, "건", byPlat);
    console.log("선택자 기반 추출:", bySel.length, "건", bySel.slice(0, 3));
    console.log("휴리스틱 추출:", byHeu.length, "건", byHeu.slice(0, 5));
    console.log("페이지 전체 날짜 매칭 수:", findDates(document.body.innerText || "").length);
    console.log("→ 둘 다 0건이면: 예약 목록 화면이 맞는지 확인하거나, 위 샘플을 개발자에게 전달하세요.");
    console.groupEnd();
    return { bySelectors: bySel, byHeuristic: byHeu };
  };

  async function sync() {
    const bookings = scrape();
    if (!bookings.length) {
      console.warn("[staySync] 예약을 찾지 못했습니다. 예약 목록/캘린더 화면인지 확인하거나, 콘솔에서 window.__staySyncDiagnose() 를 실행해 무엇이 감지되는지 보세요.");
      return;
    }
    // ⚠️ 콘텐츠 스크립트에서 직접 fetch하면 페이지 출처(web.33m2.co.kr) 기준 CORS에 막힘.
    //    → 백그라운드 서비스워커를 거쳐 호출(host_permissions로 CORS 면제) + JWT도 SW가 처리.
    try {
      const data = await chrome.runtime.sendMessage({
        type: "SYNC_BOOKINGS", platform: PLATFORM, bookings,
      });
      console.info(`[staySync] ${PLATFORM} 동기화:`, data);
      if (data && data.ok === false) console.warn("[staySync] 동기화 실패:", data.error);
    } catch (e) {
      console.error("[staySync] 동기화 전송 실패", e);
    }
  }

  // background / 팝업에서 "지금 동기화" 수동 트리거
  chrome.runtime.onMessage.addListener((msg, _s, send) => {
    if (msg?.type === "SCRAPE_NOW" && (!msg.platform || msg.platform === PLATFORM)) {
      sync().then(() => send({ ok: true })).catch((e) => send({ ok: false, error: String(e) }));
      return true;
    }
  });
  // 콘솔에서 수동 실행: window.__staySyncSync()
  window.__staySyncSync = () => sync();

  // ── 자동 동기화 스케줄러 ─────────────────────────────────────────
  // 33m2는 Next.js SPA라 "앱 내 이동" 시 콘텐츠 스크립트가 재실행되지 않는다.
  // → ① 초기 여러 번 재시도(늦게 로드되는 데이터 대비) ② URL 변경 감지 시 재스크랩.
  let lastSig = "";       // 마지막으로 보낸 예약 시그니처(중복 전송 방지)
  let lastUrl = location.href;
  let busy = false;       // 자동 순회 중 재진입 방지 (페이지 클릭이 nav 감지를 또 트리거하므로)
  let lastFullAt = 0;     // 33m2 전체 순회 쿨다운 (페이지 클릭으로 인한 재순회 방지)

  async function pushBookings(bookings, reason) {
    if (!bookings.length) return;
    const sig = bookings.map((b) => b.external_id).sort().join("|");
    if (sig === lastSig) return;
    lastSig = sig;
    try {
      const data = await chrome.runtime.sendMessage({ type: "SYNC_BOOKINGS", platform: PLATFORM, bookings });
      console.info(`[staySync] ${PLATFORM} 동기화(${reason}) — ${bookings.length}건:`, data);
      if (data && data.ok === false) console.warn("[staySync] 동기화 실패:", data.error);
    } catch (e) {
      console.error("[staySync] 동기화 전송 실패", e);
    }
  }

  async function trySync(reason) {
    if (busy) return;
    busy = true;
    try {
      // 33m2: "전체" 탭 + 전 페이지를 자동 클릭 순회해 모든 예약을 수집 (방별)
      if (PLATFORM === "33m2") {
        if (Date.now() - lastFullAt < 30000) return; // 최근 30초 내 전체 순회했으면 스킵
        const bookings = await scrape33m2AllPages();
        lastFullAt = Date.now();
        await pushBookings(bookings, reason);
        return;
      }
      // 그 외 플랫폼: 현재 화면 DOM 스크랩
      await pushBookings(scrape(), reason);
    } finally {
      busy = false;
    }
  }

  // ① 초기 재시도 (데이터가 늦게 렌더되는 경우 대비)
  [1500, 3500, 6000, 9000].forEach((ms) => setTimeout(() => trySync("load+" + ms), ms));

  // ② SPA 화면 이동 감지 (content script는 isolated world라 location 폴링이 가장 확실)
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastSig = ""; // 화면 바뀌면 시그니처 초기화
      [900, 2500, 5000].forEach((ms) => setTimeout(() => trySync("nav+" + ms), ms));
    }
  }, 1200);
  window.addEventListener("popstate", () => {
    lastSig = "";
    [900, 2500].forEach((ms) => setTimeout(() => trySync("popstate+" + ms), ms));
  });
})();
