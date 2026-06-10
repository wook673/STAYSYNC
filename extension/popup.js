/**
 * 팝업 UI 로직
 *  - staySync JWT 확인 (확장은 staySync 세션이 있어야 연결 전송 가능)
 *  - 플랫폼별 로그인 상태 표시 + 연결 버튼
 *  - 시장 분석 탭: 33m2 반경 내 예약률 높은 매물 검색
 */
import { analyzeMarket, geocode, getCurrentPosition } from "./market-analysis.js";

// ⚙️ 배포 설정: platforms.js 의 IS_PROD 와 동일하게 맞추세요.
const IS_PROD = false;
const STAYSYNC_WEB = IS_PROD ? "https://app.staysync.kr" : "http://localhost:3000";

// ── 탭 전환 ─────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove("hidden");
  });
});

// ── 플랫폼 연결 탭 ───────────────────────────────────────────────────────────
const listEl = document.getElementById("platform-list");
const authWarn = document.getElementById("auth-warn");

async function getStaySyncJwt() {
  const tabs = await chrome.tabs.query({ url: STAYSYNC_WEB + "/*" });
  if (!tabs.length) return null;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () =>
        localStorage.getItem("access_token") ||
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

// ── 시장 분석 탭 ─────────────────────────────────────────────────────────────
let currentCenter = null; // { lat, lng }
let currentListings = []; // 마지막 분석 결과

const addrInput   = document.getElementById("addr-input");
const addrDisplay = document.getElementById("addr-display");
const gpsBtn      = document.getElementById("gps-btn");
const analyzeBtn  = document.getElementById("analyze-btn");
const progressEl  = document.getElementById("analyze-progress");
const progressMsg = document.getElementById("progress-msg");
const resultsEl   = document.getElementById("analyze-results");
const summaryEl   = document.getElementById("results-summary");
const mapBtn      = document.getElementById("map-btn");
const mockWarn    = document.getElementById("mock-warn");
const resultList  = document.getElementById("result-list");
const noResults   = document.getElementById("no-results");

// GPS 버튼
gpsBtn.addEventListener("click", async () => {
  gpsBtn.textContent = "⏳";
  gpsBtn.disabled = true;
  try {
    const pos = await getCurrentPosition();
    currentCenter = pos;
    addrInput.value = "";
    addrDisplay.textContent = `📍 현재 위치 (${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)})`;
    addrDisplay.classList.remove("hidden");
  } catch (e) {
    toast(e.message, "err");
  } finally {
    gpsBtn.textContent = "📍";
    gpsBtn.disabled = false;
  }
});

// 분석하기 버튼
analyzeBtn.addEventListener("click", async () => {
  // 좌표 결정
  let center = currentCenter;

  const addrText = addrInput.value.trim();
  if (addrText) {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "주소 변환 중...";
    const geo = await geocode(addrText);
    if (!geo) {
      toast("주소를 찾을 수 없습니다. 더 구체적으로 입력해주세요.", "err");
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "🔍 분석하기";
      return;
    }
    center = { lat: geo.lat, lng: geo.lng };
    currentCenter = center;
    // 주소 표시 (너무 길면 자름)
    const disp = geo.display.length > 60 ? geo.display.slice(0, 60) + "…" : geo.display;
    addrDisplay.textContent = `📍 ${disp}`;
    addrDisplay.classList.remove("hidden");
  }

  if (!center) {
    toast("주소를 입력하거나 현재 위치를 사용하세요.", "err");
    return;
  }

  const radiusM    = parseInt(document.getElementById("radius-select").value, 10);
  const threshold  = parseInt(document.getElementById("threshold-select").value, 10);
  const days       = parseInt(document.getElementById("days-select").value, 10);

  // UI 상태: 진행 중
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "분석 중...";
  progressEl.classList.remove("hidden");
  resultsEl.classList.add("hidden");

  try {
    const { listings, total, isMock } = await analyzeMarket({
      lat: center.lat,
      lng: center.lng,
      radiusM,
      threshold,
      days,
      onProgress: (msg) => { progressMsg.textContent = msg; },
    });

    currentListings = listings;
    renderResults(listings, total, isMock, center, radiusM, threshold, days);
  } catch (e) {
    toast("분석 중 오류: " + e.message, "err");
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "🔍 분석하기";
    progressEl.classList.add("hidden");
  }
});

// 결과 렌더링
function renderResults(listings, total, isMock, center, radiusM, threshold, days) {
  resultsEl.classList.remove("hidden");
  resultList.innerHTML = "";

  const period = days === 30 ? "1개월" : days === 60 ? "2개월" : `${days}일`;
  summaryEl.textContent =
    listings.length > 0
      ? `반경 ${radiusM >= 1000 ? radiusM / 1000 + "km" : radiusM + "m"} 내 ${total}개 중 예약률 ${threshold}%+ : ${listings.length}개`
      : `조건을 만족하는 매물 없음 (총 ${total}개 분석)`;

  // mock 경고
  mockWarn.classList.toggle("hidden", !isMock);

  // 지도 버튼 (Google Maps)
  if (listings.length > 0) {
    mapBtn.classList.remove("hidden");
    mapBtn.onclick = () => {
      const q = listings
        .filter((l) => l.lat && l.lng)
        .slice(0, 10)
        .map((l) => `${l.lat},${l.lng}`)
        .join("|");
      const url = `https://www.google.com/maps/search/?api=1&query=${center.lat},${center.lng}`;
      chrome.tabs.create({ url });
    };
  } else {
    mapBtn.classList.add("hidden");
  }

  noResults.classList.toggle("hidden", listings.length > 0);

  for (const item of listings) {
    const li = document.createElement("li");
    li.className = "result-item";

    // 예약률에 따른 색상
    const pct = item.occupancy;
    const badgeClass = pct >= 90 ? "badge-high" : pct >= 70 ? "badge-med" : "badge-low";
    const barColor   = pct >= 90 ? "#22c55e" : pct >= 70 ? "#f59e0b" : "#6b7280";

    const distTxt = item.distance != null
      ? (item.distance >= 1000 ? (item.distance / 1000).toFixed(1) + "km" : item.distance + "m")
      : "";
    const priceTxt = item.price
      ? "₩" + item.price.toLocaleString("ko") + "/박"
      : "";
    const reviewTxt = item.reviewCount ? `⭐ ${item.reviewCount}` : "";

    li.innerHTML = `
      <div class="result-item-top">
        <div class="result-name">${item.name}</div>
        <div class="result-badge ${badgeClass}">${pct}%</div>
      </div>
      <div class="result-bar-wrap">
        <div class="result-bar" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <div class="result-meta">
        <span>${period} 예약률</span>
        ${distTxt ? `<span>${distTxt}</span>` : ""}
        ${priceTxt ? `<span>${priceTxt}</span>` : ""}
        ${reviewTxt ? `<span>${reviewTxt}</span>` : ""}
      </div>
    `;

    // 클릭 시 33m2 매물 페이지 열기
    if (item.url && !item.isMock) {
      li.style.cursor = "pointer";
      li.addEventListener("click", () => chrome.tabs.create({ url: item.url }));
    }

    resultList.appendChild(li);
  }
}
