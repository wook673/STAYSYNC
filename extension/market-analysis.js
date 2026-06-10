/**
 * staySync — 33m2 시장 분석 모듈
 *
 * 기능: 특정 위치 반경 내 33m2 매물의 향후 N일간 예약률을 분석합니다.
 *
 * ⚠️ TODO: M33_ENDPOINTS 의 URL은 추정값입니다.
 *    web.33m2.co.kr에서 F12 → Network(Fetch/XHR) 탭으로 실제 주소를 확인해 교체하세요.
 *    (docs/33m2-내부api-캡처가이드.md 참고)
 */

// ─── 33m2 내부 API 엔드포인트 ─────────────────────────────────────────────────
// ⚠️ 아래는 추정값 — Network 탭에서 캡처 후 확정 필요
const M33_BASE = "https://web.33m2.co.kr";

const M33_ENDPOINTS = {
  // 지도 기반 매물 검색 (lat/lng/radius → 매물 목록)
  // 확인 방법: 33m2 지도 검색 화면에서 이동/확대할 때 뜨는 XHR
  mapSearch: `${M33_BASE}/api/v1/rooms/search`,         // 추정 A
  mapSearch2: `${M33_BASE}/api/rooms`,                  // 추정 B (fallback)
  mapSearch3: `${M33_BASE}/api/host/contract`,          // 추정 C — 계약 목록

  // 매물별 가용성/예약 캘린더 (roomId → blocked 날짜 목록)
  // 확인 방법: 특정 매물 상세 페이지 진입 시 뜨는 XHR
  calendar: (roomId) => `${M33_BASE}/api/v1/rooms/${roomId}/calendar`,   // 추정 A
  calendar2: (roomId) => `${M33_BASE}/api/rooms/${roomId}/availability`, // 추정 B
};

// ─── 유틸: Haversine 거리 (m) ───────────────────────────────────────────────
export function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── 유틸: 주소 → 좌표 (OpenStreetMap Nominatim — 무료, API 키 불필요) ───────
export async function geocode(address) {
  const q = encodeURIComponent(address.includes("대한민국") ? address : address + " 대한민국");
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&accept-language=ko`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "staySync-market-analyzer/1.0",
        Accept: "application/json",
      },
    });
    const data = await res.json();
    if (!data.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      display: data[0].display_name,
    };
  } catch (e) {
    console.error("[staySync] 지오코딩 실패:", e);
    return null;
  }
}

// ─── 유틸: 브라우저 GPS 위치 가져오기 ─────────────────────────────────────
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("이 브라우저는 위치 정보를 지원하지 않습니다."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error("위치 정보를 가져올 수 없습니다: " + err.message)),
      { timeout: 8000 }
    );
  });
}

// ─── 예약률 계산 ──────────────────────────────────────────────────────────────
// calendarData: 플랫폼 API가 반환한 날짜 가용성 정보 (구조는 실제 API에 따라 다름)
export function calcOccupancy(calendarData, days = 60) {
  if (!calendarData) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + days);

  // TODO: 실제 33m2 응답 구조에 맞게 아래 파싱 로직 수정
  // 가능한 구조 A: { "blocked": ["2025-07-01", "2025-07-02", ...] }
  // 가능한 구조 B: { "dates": [{ "date": "2025-07-01", "status": "booked" }, ...] }
  // 가능한 구조 C: { "reservations": [{ "check_in": "...", "check_out": "..." }, ...] }

  let blockedCount = 0;

  // 구조 A: blocked 날짜 배열
  const blockedArr =
    calendarData.blocked ||
    calendarData.unavailable ||
    calendarData.booked_dates ||
    calendarData.blockedDates ||
    null;

  if (Array.isArray(blockedArr)) {
    blockedCount = blockedArr.filter((d) => {
      const date = new Date(d);
      return !isNaN(date) && date >= today && date < endDate;
    }).length;
    return Math.round((blockedCount / days) * 100);
  }

  // 구조 B: dates 배열 with status
  const datesArr = calendarData.dates || calendarData.calendar || null;
  if (Array.isArray(datesArr)) {
    blockedCount = datesArr.filter((item) => {
      const d = item.date || item.day;
      const status = (item.status || item.type || "").toLowerCase();
      const date = new Date(d);
      const isBooked = ["booked", "reserved", "blocked", "unavailable"].some((s) =>
        status.includes(s)
      );
      return !isNaN(date) && date >= today && date < endDate && isBooked;
    }).length;
    return Math.round((blockedCount / days) * 100);
  }

  // 구조 C: reservations 배열 with check_in/check_out
  const reservations =
    calendarData.reservations || calendarData.bookings || calendarData.contracts || null;
  if (Array.isArray(reservations)) {
    const blockedSet = new Set();
    for (const r of reservations) {
      const start = new Date(r.check_in || r.checkin || r.start_date || r.from);
      const end = new Date(r.check_out || r.checkout || r.end_date || r.to);
      if (isNaN(start) || isNaN(end)) continue;
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        if (d >= today && d < endDate) blockedSet.add(d.toISOString().slice(0, 10));
      }
    }
    return Math.round((blockedSet.size / days) * 100);
  }

  return null;
}

// ─── 33m2 지도 검색 (실제 API 호출) ─────────────────────────────────────────
async function searchM33Real(lat, lng, radiusM) {
  const delta = radiusM / 111000;
  const commonParams = {
    lat,
    lng,
    radius: radiusM,
    sw_lat: lat - delta,
    sw_lng: lng - delta,
    ne_lat: lat + delta,
    ne_lng: lng + delta,
    page: 1,
    per_page: 50,
    limit: 50,
  };

  // 여러 추정 엔드포인트를 순서대로 시도
  const endpoints = [M33_ENDPOINTS.mapSearch, M33_ENDPOINTS.mapSearch2];
  for (const ep of endpoints) {
    try {
      const params = new URLSearchParams(
        Object.entries(commonParams).map(([k, v]) => [k, String(v)])
      );
      const res = await fetch(`${ep}?${params}`, {
        credentials: "include", // 33m2 로그인 쿠키 자동 포함
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const rooms =
        data.rooms || data.items || data.results || data.data || data.contracts || [];
      if (rooms.length > 0) {
        console.info(`[staySync] 33m2 API 히트: ${ep}, ${rooms.length}개 매물`);
        return rooms;
      }
    } catch (e) {
      console.warn(`[staySync] ${ep} 실패:`, e.message);
    }
  }
  return null; // 모든 엔드포인트 실패 → null (mock으로 폴백)
}

// ─── 33m2 캘린더 조회 (실제 API 호출) ────────────────────────────────────────
async function getCalendarReal(roomId, days = 60) {
  const today = new Date().toISOString().split("T")[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  const end = endDate.toISOString().split("T")[0];

  const endpoints = [M33_ENDPOINTS.calendar(roomId), M33_ENDPOINTS.calendar2(roomId)];
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${ep}?from=${today}&to=${end}&start=${today}&end=${end}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      return data;
    } catch {
      // 다음 엔드포인트 시도
    }
  }
  return null;
}

// ─── Mock 데이터 (실제 API 확인 전 UI 테스트용) ──────────────────────────────
const MOCK_NAMES = [
  "한강뷰 스튜디오",
  "합정 감성 원룸",
  "홍대 코지룸",
  "마포 모던 하우스",
  "연남동 아늑한 방",
  "신촌 게스트하우스",
  "이대 넓은 원룸",
  "망원 빈티지 스튜디오",
  "상수 레트로룸",
  "홍대입구 편리한 방",
  "합정역 도보 3분",
  "서교동 루프탑 있는 집",
];

function generateMockListings(lat, lng, radiusM) {
  return MOCK_NAMES.map((name, i) => {
    const angle = (i / MOCK_NAMES.length) * 2 * Math.PI;
    const dist = (100 + Math.random() * (radiusM - 100));
    const latOff = ((dist * Math.cos(angle)) / 111000) * (0.7 + Math.random() * 0.6);
    const lngOff = ((dist * Math.sin(angle)) / 111000) * (0.7 + Math.random() * 0.6);
    const occupancy = Math.floor(40 + Math.random() * 55); // 40~95%
    return {
      id: `mock-${i}`,
      name,
      lat: lat + latOff,
      lng: lng + lngOff,
      price: Math.floor(40000 + Math.random() * 120000),
      occupancy,
      reviewCount: Math.floor(Math.random() * 120),
      distance: Math.round(haversineM(lat, lng, lat + latOff, lng + lngOff)),
      isMock: true,
    };
  });
}

// ─── 메인: 시장 분석 실행 ─────────────────────────────────────────────────────
/**
 * @param {object} options
 * @param {number} options.lat         중심 위도
 * @param {number} options.lng         중심 경도
 * @param {number} options.radiusM     반경 (미터). 기본 500
 * @param {number} options.threshold   예약률 임계값 (%). 기본 70
 * @param {number} options.days        분석 기간 (일). 기본 60
 * @param {function} options.onProgress 진행 상황 콜백 (message: string)
 * @returns {Promise<{listings: Array, isMock: boolean}>}
 */
export async function analyzeMarket({
  lat,
  lng,
  radiusM = 500,
  threshold = 70,
  days = 60,
  onProgress = () => {},
}) {
  // 1) 33m2 매물 검색
  onProgress("33m2 매물 검색 중...");
  let rooms = await searchM33Real(lat, lng, radiusM);
  let isMock = false;

  if (!rooms) {
    // 실제 API 실패 → mock으로 폴백
    onProgress("⚠️ API 엔드포인트 미확정 — 샘플 데이터로 미리보기 표시");
    rooms = generateMockListings(lat, lng, radiusM);
    isMock = true;
  }

  // 2) 반경 내 필터링 (API가 정확히 안 잘랐을 경우 클라이언트 보정)
  const inRadius = rooms
    .map((r) => {
      const rLat = r.lat ?? r.latitude ?? r.location?.lat ?? r.coords?.lat;
      const rLng = r.lng ?? r.longitude ?? r.location?.lng ?? r.coords?.lng;
      const dist =
        rLat && rLng ? Math.round(haversineM(lat, lng, rLat, rLng)) : null;
      return { ...r, _lat: rLat, _lng: rLng, distance: dist };
    })
    .filter((r) => r.distance === null || r.distance <= radiusM);

  onProgress(`반경 ${radiusM}m 내 ${inRadius.length}개 매물 발견`);

  // 3) 각 매물 캘린더 조회 + 예약률 계산
  const results = [];
  for (let i = 0; i < inRadius.length; i++) {
    const r = inRadius[i];
    onProgress(
      `예약률 계산 중... (${i + 1}/${inRadius.length}): ${r.name || r.title || r.id}`
    );

    let occupancy = r.occupancy ?? null; // mock은 이미 occupancy 있음

    if (!isMock) {
      const roomId = r.id || r.room_id || r.roomId;
      if (roomId) {
        const cal = await getCalendarReal(roomId, days);
        occupancy = calcOccupancy(cal, days);
      }
    }

    if (occupancy === null) continue;

    const price =
      r.price ?? r.price_per_night ?? r.pricePerNight ?? r.amount ?? null;
    const name =
      r.name ?? r.title ?? r.room_name ?? r.roomName ?? `매물 #${r.id}`;

    results.push({
      id: r.id,
      name,
      lat: r._lat,
      lng: r._lng,
      distance: r.distance,
      occupancy,
      price,
      reviewCount: r.reviewCount ?? r.review_count ?? r.reviews ?? 0,
      url: r.url ?? (r.id ? `${M33_BASE}/rooms/${r.id}` : null),
      isMock,
    });
  }

  // 4) 임계값 이상만 필터 + 예약률 내림차순 정렬
  const filtered = results
    .filter((r) => r.occupancy >= threshold)
    .sort((a, b) => b.occupancy - a.occupancy);

  onProgress("완료");
  return { listings: filtered, total: results.length, isMock };
}
