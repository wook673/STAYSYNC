/**
 * 플랫폼별 연결 설정 (클린룸 구현)
 *
 * 각 플랫폼은 공식 API가 없으므로, "사용자 본인이 로그인한 세션"의
 * 인증 토큰을 확장이 읽어 staySync 백엔드에 전달한다.
 *
 * tokenStrategy:
 *  - "cookie"      : chrome.cookies API로 도메인 쿠키에서 토큰 추출 (httpOnly 포함)
 *  - "localStorage": 콘텐츠 스크립트가 page localStorage에서 토큰 추출
 *
 * ⚠️ cookieNames / storageKeys 의 정확한 키 이름은 각 플랫폼이 비공개이므로,
 *    사용자 본인 세션의 네트워크/스토리지를 직접 확인해 확정해야 한다.
 *    (사용자가 자기 계정으로 로그인 → DevTools Application 탭에서 확인)
 *    아래 값은 일반적 추정치이며, 실제 키는 onboarding 시 자동 탐지 + 폴백한다.
 */
export const PLATFORMS = {
  "33m2": {
    label: "33m2",
    color: "#242424",
    origin: "https://web.33m2.co.kr",
    loginUrl: "https://web.33m2.co.kr/host",
    tokenStrategy: "cookie",
    // 추정 키 — 실제 확인 필요. 미일치 시 전체 쿠키를 백엔드로 보내 백엔드가 선별.
    cookieNames: ["accessToken", "access_token", "Authorization", "token", "_33m2_session"],
    autoMaintain: true, // 33m2는 토큰 자동 갱신 가능 (장기 유지)
  },
  enkostay: {
    label: "엔코스테이",
    color: "#f8e585",
    origin: "https://host.enko.kr",
    loginUrl: "https://host.enko.kr",
    tokenStrategy: "cookie",
    cookieNames: ["accessToken", "access_token", "Authorization", "token"],
    autoMaintain: false, // 만료 시 확장에서 재연결 필요
  },
  liveanywhere: {
    label: "리브애니웨어",
    color: "#1fadff",
    origin: "https://m.liveanywhere.me",
    loginUrl: "https://m.liveanywhere.me",
    tokenStrategy: "localStorage",
    storageKeys: ["accessToken", "access_token", "authToken", "token"],
    autoMaintain: false,
  },
  zaritalk: {
    label: "자리톡",
    color: "#5B8DEF",
    origin: "https://zaritalk.com",
    loginUrl: "https://zaritalk.com/my",
    tokenStrategy: "localStorage",
    storageKeys: ["accessToken", "access_token", "authToken", "token"],
    autoMaintain: true,
  },
  zigbang: {
    label: "직방",
    color: "#FF6F0F",
    origin: "https://www.zigbang.com",
    loginUrl: "https://www.zigbang.com/host/item",
    tokenStrategy: "localStorage",
    storageKeys: ["accessToken", "access_token", "authToken", "_zigbang_token", "token"],
    autoMaintain: false,
  },
};

// staySync 백엔드 base URL (개발: localhost:8000, 운영: api.staysync.kr)
export const STAYSYNC_API =
  (typeof self !== "undefined" && self.STAYSYNC_API_OVERRIDE) ||
  "http://localhost:8000";
