/**
 * staySync 연결 도우미 — 백그라운드 서비스 워커 (MV3)
 *
 * 동작:
 *  1) 팝업에서 "연결" 요청 수신
 *  2) 해당 플랫폼의 "사용자 본인 세션" 토큰 획득
 *     - cookie 전략: chrome.cookies API로 도메인 쿠키 수집 (httpOnly 포함)
 *     - localStorage 전략: 콘텐츠 스크립트(content-token.js)가 보낸 값 사용
 *  3) staySync 백엔드 /api/extension/connect 로 전달
 *
 * 보안 원칙:
 *  - 비밀번호를 다루지 않는다. 오직 "이미 로그인된 세션"의 토큰만 읽는다.
 *  - 토큰은 staySync 백엔드(사용자 본인 계정)로만 전송한다.
 */
import { PLATFORMS, STAYSYNC_API } from "./platforms.js";

// 콘텐츠 스크립트가 보고한 localStorage 토큰 임시 저장 (origin -> {key:value})
const pageTokenCache = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PAGE_TOKENS") {
    // content-token.js 가 보낸 localStorage 스냅샷
    if (sender.origin) pageTokenCache.set(sender.origin, msg.tokens || {});
    sendResponse?.({ ok: true });
    return false;
  }

  if (msg?.type === "CONNECT_PLATFORM") {
    connectPlatform(msg.platform, msg.staySyncJwt)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true; // async
  }

  if (msg?.type === "GET_STAYSYNC_JWT") {
    // 콘텐츠 스크립트(예약 DOM 파서)가 staySync JWT를 요청
    readStaySyncJwt()
      .then((jwt) => sendResponse({ jwt }))
      .catch(() => sendResponse({ jwt: null }));
    return true;
  }

  if (msg?.type === "GET_STATUS") {
    getStatus()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg?.type === "SYNC_BOOKINGS") {
    // 콘텐츠 스크립트가 긁은 예약을 백엔드로 전송 (SW에서 호출 → CORS 면제)
    syncBookings(msg.platform, msg.bookings)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg?.type === "SCRAPE_33M2_PAYLOAD") {
    // MAIN world에서 __next_f(서버렌더 데이터 원본)를 읽어 전체 계약을 파싱
    scrape33m2Payload(sender.tab?.id)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  return false;
});

// 33m2 계약 텍스트(__next_f 또는 SSR HTML)에서 계약 추출
function parse33m2Contracts(text) {
  const re = /"startDate":"(\d{4}-\d{2}-\d{2})","endDate":"(\d{4}-\d{2}-\d{2})","rid":(\d+),"roomName":"((?:[^"\\]|\\.)*)"/g;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const start = m[1], end = m[2], rid = m[3];
    let room = m[4];
    try { room = JSON.parse('"' + room + '"'); } catch (e) {}
    let guest = "예약";
    const after = text.slice(m.index, m.index + 800);
    const ns = after.indexOf('"startDate"', 12);
    const seg = ns > 0 ? after.slice(0, ns) : after;
    const gm = seg.match(/"(tenantName|userName|guestName|customerName|tenant_name)":"((?:[^"\\]|\\.)*)"/);
    if (gm) { try { guest = JSON.parse('"' + gm[2] + '"'); } catch (e) { guest = gm[2]; } }
    out.push({ external_id: `33m2-${rid}-${start}-${end}`, summary: guest,
      room_label: room || "33m2 미지정", start_date: start, end_date: end, status: "confirmed" });
  }
  return out;
}

// 33m2: 전체 계약을 수집. ① 현재 탭의 __next_f + ② background가 본인 세션으로
//       1~N페이지를 직접 fetch (Hostier 방식 — 수동 페이지 이동 불필요).
async function scrape33m2Payload(tabId) {
  const all = new Map(); // external_id -> booking (중복 제거)

  // ① 현재 탭의 페이로드(가장 확실 — 현재 페이지)
  if (tabId) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId }, world: "MAIN",
        func: () => (self.__next_f || []).map((x) => (Array.isArray(x) ? x[1] : "")).join(""),
      });
      for (const b of parse33m2Contracts(result || "")) all.set(b.external_id, b);
    } catch (e) { /* 무시 */ }
  }

  // ② 전 페이지 직접 fetch (본인 33m2 쿠키 세션 사용)
  const base = "https://web.33m2.co.kr/host/contract";
  let pagesFetched = 0;
  for (let page = 1; page <= 20; page++) {
    let res;
    try {
      res = await fetch(`${base}?page=${page}`, {
        credentials: "include",
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
    } catch (e) { break; }
    if (!res.ok) break;
    const text = await res.text();
    const before = all.size;
    for (const b of parse33m2Contracts(text)) if (!all.has(b.external_id)) all.set(b.external_id, b);
    pagesFetched++;
    // 2페이지부터 새 계약이 없으면 마지막 페이지로 간주하고 종료
    if (page >= 2 && all.size === before) break;
  }

  const bookings = [...all.values()];
  if (!bookings.length) return { ok: true, count: 0, added: 0, pages: pagesFetched };
  const r = await syncBookings("33m2", bookings);
  return { ...r, count: bookings.length, pages: pagesFetched };
}

async function syncBookings(platform, bookings) {
  const jwt = await readStaySyncJwt();
  if (!jwt) return { ok: false, error: "staySync 로그인이 필요합니다 (localhost:3000 탭 열기)" };
  const res = await fetch(`${STAYSYNC_API}/api/extension/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ platform, bookings }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `백엔드 오류 ${res.status}: ${t.slice(0, 150)}` };
  }
  return await res.json().catch(() => ({ ok: true }));
}

async function connectPlatform(platformKey, staySyncJwt) {
  const cfg = PLATFORMS[platformKey];
  if (!cfg) return { ok: false, error: "알 수 없는 플랫폼: " + platformKey };

  // 1) 토큰 획득
  let tokenBundle = null;
  if (cfg.tokenStrategy === "cookie") {
    tokenBundle = await readCookies(cfg);
  } else if (cfg.tokenStrategy === "localStorage") {
    tokenBundle = await readPageTokens(cfg);
  }

  if (!tokenBundle || Object.keys(tokenBundle.values || {}).length === 0) {
    return {
      ok: false,
      needLogin: true,
      loginUrl: cfg.loginUrl,
      error: `${cfg.label}에 먼저 로그인해주세요. 로그인 후 다시 연결을 눌러주세요.`,
    };
  }

  // 2) 백엔드로 전달
  const res = await fetch(`${STAYSYNC_API}/api/extension/connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${staySyncJwt}`,
    },
    body: JSON.stringify({
      platform: platformKey,
      origin: cfg.origin,
      auto_maintain: !!cfg.autoMaintain,
      token_strategy: cfg.tokenStrategy,
      // 전체 후보를 보내고 백엔드가 선별 (정확한 키를 모를 때의 안전책)
      credentials: tokenBundle.values,
      preferred_keys: cfg.cookieNames || cfg.storageKeys || [],
      captured_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `백엔드 오류 ${res.status}: ${t.slice(0, 200)}` };
  }
  const data = await res.json().catch(() => ({}));

  // 로컬 상태 저장 (마지막 연결 시각)
  await chrome.storage.local.set({
    [`conn:${platformKey}`]: { at: Date.now(), autoMaintain: !!cfg.autoMaintain },
  });

  return { ok: true, platform: platformKey, server: data };
}

/** chrome.cookies API로 도메인 쿠키 수집 (httpOnly 포함) */
async function readCookies(cfg) {
  const url = cfg.origin + "/";
  const all = await chrome.cookies.getAll({ url });
  const values = {};
  for (const c of all) values[c.name] = c.value;
  return { source: "cookie", values };
}

/** 콘텐츠 스크립트가 캐시한 localStorage 토큰 사용 */
async function readPageTokens(cfg) {
  // 먼저 캐시 확인
  let cached = pageTokenCache.get(cfg.origin);
  if (!cached || Object.keys(cached).length === 0) {
    // 해당 플랫폼 탭이 열려 있으면 직접 스크립트 주입으로 재수집
    cached = await injectAndReadLocalStorage(cfg);
  }
  return { source: "localStorage", values: cached || {} };
}

async function injectAndReadLocalStorage(cfg) {
  const tabs = await chrome.tabs.query({ url: cfg.origin + "/*" });
  if (!tabs.length) return {};
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (keys) => {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!keys.length || keys.some((kk) => k.toLowerCase().includes(kk.toLowerCase()))) {
            out[k] = localStorage.getItem(k);
          }
        }
        return out;
      },
      args: [cfg.storageKeys || []],
    });
    return result || {};
  } catch (e) {
    return {};
  }
}

/** staySync 웹앱 탭의 localStorage에서 JWT를 읽어온다 (확장↔웹앱 브리지) */
async function readStaySyncJwt() {
  const candidates = [
    "https://frontend-production-a7a7.up.railway.app/*",
    "http://localhost:3000/*",
    "https://app.staysync.kr/*",
  ];
  for (const pat of candidates) {
    const tabs = await chrome.tabs.query({ url: pat });
    if (!tabs.length) continue;
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () =>
          localStorage.getItem("access_token") ||
          localStorage.getItem("staysync_token") ||
          localStorage.getItem("token") ||
          null,
      });
      if (result) return result;
    } catch {
      /* 무시 */
    }
  }
  return null;
}

async function getStatus() {
  const out = {};
  for (const key of Object.keys(PLATFORMS)) {
    const cfg = PLATFORMS[key];
    let loggedIn = false;
    if (cfg.tokenStrategy === "cookie") {
      const all = await chrome.cookies.getAll({ url: cfg.origin + "/" });
      loggedIn = all.length > 0;
    } else {
      const cached = pageTokenCache.get(cfg.origin);
      loggedIn = !!(cached && Object.keys(cached).length);
    }
    const saved = (await chrome.storage.local.get(`conn:${key}`))[`conn:${key}`];
    out[key] = {
      label: cfg.label,
      color: cfg.color,
      loginUrl: cfg.loginUrl,
      autoMaintain: !!cfg.autoMaintain,
      loggedIn,
      lastConnectedAt: saved?.at || null,
    };
  }
  return { ok: true, platforms: out };
}
