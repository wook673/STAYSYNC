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
  const IS_PROD = false;
  const STAYSYNC_API = IS_PROD ? "https://api.staysync.kr" : "http://localhost:3000";
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

  function scrape() {
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
    console.group(`[staySync 진단] 플랫폼=${PLATFORM}`);
    console.log("선택자 기반 추출:", bySel.length, "건", bySel.slice(0, 3));
    console.log("휴리스틱 추출:", byHeu.length, "건", byHeu.slice(0, 5));
    console.log("페이지 전체 날짜 매칭 수:", findDates(document.body.innerText || "").length);
    console.log("→ 둘 다 0건이면: 예약 목록 화면이 맞는지 확인하거나, 위 샘플을 개발자에게 전달하세요.");
    console.groupEnd();
    return { bySelectors: bySel, byHeuristic: byHeu };
  };

  async function getStaySyncJwt() {
    // 확장 background에 위임 (staySync 탭의 토큰을 읽음)
    return new Promise((res) => {
      chrome.runtime.sendMessage({ type: "GET_STAYSYNC_JWT" }, (r) => res(r?.jwt || null));
    });
  }

  async function sync() {
    const bookings = scrape();
    if (!bookings.length) {
      console.warn("[staySync] 예약을 찾지 못했습니다. 예약 목록/캘린더 화면인지 확인하거나, 콘솔에서 window.__staySyncDiagnose() 를 실행해 무엇이 감지되는지 보세요.");
      return;
    }
    const jwt = await getStaySyncJwt();
    if (!jwt) {
      console.warn("[staySync] staySync 로그인이 필요합니다.");
      return;
    }
    try {
      const res = await fetch(`${STAYSYNC_API}/api/extension/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ platform: PLATFORM, bookings }),
      });
      const data = await res.json();
      console.info(`[staySync] ${PLATFORM} 동기화:`, data);
      chrome.runtime.sendMessage({ type: "SYNC_RESULT", platform: PLATFORM, data });
    } catch (e) {
      console.error("[staySync] 동기화 실패", e);
    }
  }

  // background에서 "지금 동기화" 명령 수신
  chrome.runtime.onMessage.addListener((msg, _s, send) => {
    if (msg?.type === "SCRAPE_NOW" && msg.platform === PLATFORM) {
      sync().then(() => send({ ok: true })).catch((e) => send({ ok: false, error: String(e) }));
      return true;
    }
  });

  // 페이지 로드 시 자동 1회 시도 (예약 화면일 때만 데이터가 잡힘)
  setTimeout(sync, 2500);
})();
