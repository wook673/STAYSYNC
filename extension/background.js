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
  return false;
});

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
