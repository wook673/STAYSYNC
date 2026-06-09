# 33m2(및 타 플랫폼) 내부 API 캡처 가이드

## 왜 필요한가 (Hostier 분석으로 확정된 사실)

Hostier 확장을 역분석한 결과:
- **확장은 "로그인 토큰 수집·유지"만** 한다. 예약 읽기/날짜 차단 코드는 확장에 **없다.**
- **예약 읽기 + 날짜 차단은 모두 백엔드가** 그 토큰으로 **플랫폼 내부 API를 직접 호출**해 수행한다.

따라서 staySync도 동일하게 하려면, 각 플랫폼의 **내부 API 엔드포인트(읽기·차단)** 를 알아야 한다.
이건 Hostier를 봐도(서버 간 통신이라) 안 보이므로, **본인이 그 플랫폼에서 직접 동작하며** 캡처해야 한다.

---

## 캡처 절차 (web.33m2.co.kr 기준)

### 준비
1. Chrome에서 **web.33m2.co.kr** 에 본인 호스트 계정으로 로그인
2. **F12 → Network 탭** 열기 → 🚫(Clear)로 비우고 **Preserve log** 체크
3. 필터에 `Fetch/XHR` 선택 (JS 요청만 보기)

### A. "예약 읽기" 엔드포인트 캡처
1. **예약 목록 / 캘린더 화면**으로 이동 (또는 새로고침)
2. Network에 뜨는 XHR 중 **예약 데이터(JSON)를 반환하는 요청** 찾기
   - 응답(Response)에 체크인/체크아웃 날짜·게스트가 들어있는 것
3. 그 요청의 다음을 기록:
   - **Request URL** (예: `https://web.33m2.co.kr/api/...`)
   - **Method** (GET/POST)
   - **Request Headers** 중 인증 방식 (`Authorization: Bearer ...` 인지, 쿠키 자동전송인지)
   - **Response** 구조 (어떤 키에 날짜/게스트가 있는지)

### B. "날짜 차단" 엔드포인트 캡처 ★ (핵심)
1. 캘린더에서 **특정 날짜를 수동으로 막기**(차단/판매중지) 한 번 실행
2. 그 순간 Network에 뜨는 **POST/PUT 요청** 찾기
3. 다음 기록:
   - **Request URL / Method**
   - **Request Payload** (어떤 형식으로 날짜·방ID를 보내는지)
   - **인증 헤더**

### 저장
- Network 빈 곳 우클릭 → **Save all as HAR** → `.har` 파일 전달
- ⚠️ HAR엔 토큰이 들어가니 **Authorization/Cookie 값은 가려서** 주셔도 됩니다.
  URL·Method·Payload 구조만 있으면 됩니다.

---

## 캡처 후 반영 위치 (staySync)

| 캡처 항목 | 반영 파일 |
|-----------|-----------|
| 예약 읽기 URL/Method/인증 | `backend/app/services/extension_sync.py` → `PLATFORM_ENDPOINTS` |
| 예약 응답 구조 | 같은 파일 → `normalize_reservations()` |
| 날짜 차단 URL/Method/Payload | 같은 파일 → `BLOCK_ENDPOINTS` + `block_dates_via_token()` |
| 로그인 쿠키 이름 | `extension/platforms.js` → `cookieNames` |

확정 후 `block_dates_via_token()`의 `ENABLE_REAL_WRITE`를 켜면 교차 차단이 실제 동작합니다.

---

## 플랫폼별 동일 절차
- **자리톡**: zaritalk.com 예약 화면
- **직방**: www.zigbang.com/host 예약 화면
- **엔코스테이**: host.enko.kr
- **리브애니웨어**: m.liveanywhere.me

각 플랫폼에서 A·B를 반복해 캡처하면 됩니다.

---

## ⚠️ 매우 중요 — 차단(쓰기)의 법적 리스크
- **읽기**보다 **쓰기(자동 차단)** 가 약관 위반 리스크가 훨씬 큽니다.
- 33m2·직방 약관은 자동화 접근·조작을 제한할 수 있습니다.
- staySync 코드는 안전을 위해 **`ENABLE_REAL_WRITE = False`(DRY-RUN)** 로 기본 비활성화돼 있습니다.
- **공식 제휴(서면 동의) 또는 법무 검토 전에는 실쓰기를 켜지 마세요.**
- 대안: iCal 상호구독으로 "지연 차단"을 먼저 적용(쓰기 자동화 없이 각 플랫폼이 서로의 캘린더를 가져가게).
