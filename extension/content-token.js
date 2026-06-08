/**
 * 콘텐츠 스크립트 — localStorage 기반 플랫폼(리브애니웨어·자리톡)용
 *
 * 페이지의 localStorage에서 토큰 후보를 스냅샷으로 떠서
 * 백그라운드 워커로 보고한다. (page context의 localStorage는
 * 콘텐츠 스크립트에서 직접 접근 가능)
 *
 * 비밀번호나 입력값은 절대 수집하지 않는다 — 오직 이미 발급된 세션 토큰만.
 */
(function () {
  function snapshot() {
    const tokens = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        // 토큰처럼 보이는 키만 (token/auth/jwt/session 포함)
        if (/token|auth|jwt|session|access/i.test(k)) {
          tokens[k] = v;
        }
      }
    } catch (e) {
      /* localStorage 접근 불가 무시 */
    }
    return tokens;
  }

  function report() {
    const tokens = snapshot();
    if (Object.keys(tokens).length) {
      chrome.runtime.sendMessage({ type: "PAGE_TOKENS", tokens });
    }
  }

  // 최초 + 주기적 보고 (로그인 직후 토큰이 늦게 들어오는 경우 대비)
  report();
  let n = 0;
  const t = setInterval(() => {
    report();
    if (++n > 10) clearInterval(t);
  }, 3000);
})();
