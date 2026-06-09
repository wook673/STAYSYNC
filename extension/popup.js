/**
 * 팝업 UI 로직
 *  - staySync JWT 확인 (확장은 staySync 세션이 있어야 연결 전송 가능)
 *  - 플랫폼별 로그인 상태 표시 + 연결 버튼
 */

// ⚙️ 배포 설정: platforms.js 의 IS_PROD 와 동일하게 맞추세요.
const IS_PROD = false
const STAYSYNC_WEB = IS_PROD ? "https://app.staysync.kr" : "http://localhost:3000";

const listEl = document.getElementById("platform-list");
const authWarn = document.getElementById("auth-warn");

/** staySync 웹앱 localStorage에서 JWT 가져오기 (확장↔웹앱 공유) */
async function getStaySyncJwt() {
  // staySync 웹앱 탭이 열려 있으면 거기서 토큰을 읽어온다.
  const tabs = await chrome.tabs.query({ url: STAYSYNC_WEB + "/*" });
  if (!tabs.length) return null;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () =>
        localStorage.getItem("staysync_token") ||
        localStorage.getItem("token") ||
        null,
    });
    return result || null;
  } catch {
    return null;
  }
}

function toast(msg, kind = "ok") {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.className = `toast ${kind}`;
  el.textContent = msg;
}

function render(status, jwt) {
  listEl.innerHTML = "";
  authWarn.classList.toggle("hidden", !!jwt);

  for (const [key, p] of Object.entries(status.platforms)) {
    const li = document.createElement("li");
    li.className = "item";

    const linkedLabel = p.lastConnectedAt
      ? `연결됨 · ${new Date(p.lastConnectedAt).toLocaleDateString("ko")}`
      : p.loggedIn
        ? "로그인 감지됨 — 연결 가능"
        : "플랫폼 로그인 필요";
    const statusClass = p.lastConnectedAt ? "ok" : p.loggedIn ? "" : "no";

    li.innerHTML = `
      <span class="dot" style="background:${p.color}"></span>
      <div class="meta">
        <div class="name">${p.label}${p.autoMaintain ? "" : " <small style='color:#9ca3af'>(만료시 재연결)</small>"}</div>
        <div class="status ${statusClass}">${linkedLabel}</div>
      </div>
    `;

    const btn = document.createElement("button");
    if (p.loggedIn) {
      btn.className = "btn-connect" + (p.lastConnectedAt ? " linked" : "");
      btn.textContent = p.lastConnectedAt ? "다시 연결" : "연결";
      btn.disabled = !jwt;
      btn.onclick = () => doConnect(key, jwt, btn);
    } else {
      btn.className = "btn-login";
      btn.textContent = "로그인 열기";
      btn.onclick = () => chrome.tabs.create({ url: p.loginUrl });
    }
    li.appendChild(btn);
    listEl.appendChild(li);
  }
}

async function doConnect(key, jwt, btn) {
  btn.disabled = true;
  btn.textContent = "연결 중...";
  const res = await chrome.runtime.sendMessage({
    type: "CONNECT_PLATFORM",
    platform: key,
    staySyncJwt: jwt,
  });
  if (res?.ok) {
    toast(`${key} 연결 완료! staySync에서 예약 동기화를 시작합니다.`, "ok");
  } else if (res?.needLogin) {
    toast(res.error, "err");
    chrome.tabs.create({ url: res.loginUrl });
  } else {
    toast(res?.error || "연결 실패", "err");
  }
  await refresh();
}

async function refresh() {
  const jwt = await getStaySyncJwt();
  const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  if (status?.ok) render(status, jwt);
}

refresh();
