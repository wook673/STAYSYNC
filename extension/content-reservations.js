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
  const STAYSYNC_API = "http://localhost:8000";
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
  function normDate(s) {
    // "2026.06.10", "2026-06-10", "06/10" 등 → YYYY-MM-DD 보정
    const m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return s;
  }

  function scrape() {
    const cfg = SELECTORS[PLATFORM];
    const rows = document.querySelectorAll(cfg.row);
    const bookings = [];
    rows.forEach((el, i) => {
      const id = el.getAttribute(cfg.idAttr) || `row-${i}`;
      const start = normDate(txt(el, cfg.checkin));
      const end = normDate(txt(el, cfg.checkout));
      if (!start || !end) return;
      bookings.push({
        external_id: String(id),
        summary: txt(el, cfg.guest) || "예약",
        start_date: start,
        end_date: end,
        status: "confirmed",
      });
    });
    return bookings;
  }

  async function getStaySyncJwt() {
    // 확장 background에 위임 (staySync 탭의 토큰을 읽음)
    return new Promise((res) => {
      chrome.runtime.sendMessage({ type: "GET_STAYSYNC_JWT" }, (r) => res(r?.jwt || null));
    });
  }

  async function sync() {
    const bookings = scrape();
    if (!bookings.length) {
      console.debug("[staySync] 예약 DOM을 찾지 못했습니다. 예약 목록 화면인지 확인하세요.");
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
