# CLAUDE.md — staySync 프로젝트 컨텍스트

이 파일은 Claude Code가 프로젝트를 빠르게 이해하도록 돕는 컨텍스트 문서입니다.

## 프로젝트 개요

**staySync** — 한국 단기임대(숙박) 호스트를 위한 **멀티 플랫폼 예약 통합 관리 SaaS**.
여러 숙박 플랫폼(자리톡·위홈·에어비앤비·아고다·부킹닷컴·삼삼엠투 등)의 예약을
하나의 캘린더에서 통합 관리하고, **이중예약(더블부킹)을 자동 감지**하는 것이 핵심 가치.

경쟁사인 **Hostier(hostier.ai)** 를 벤치마킹해 만든 독립 구현체.

> ⚠️ **중요 제약**: 경쟁사나 타인의 로그인 정보·계정·세션을 절대 사용/복사하지 않는다.
> 모든 연동은 사용자 본인이 각 플랫폼에서 발급한 iCal URL을 입력하는 방식으로만 동작한다.

## 기술 스택

| 영역 | 스택 |
|------|------|
| 프론트엔드 | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| 상태관리 | Zustand (클라이언트), React Query (서버) |
| 캘린더 UI | FullCalendar v6 |
| 백엔드 | FastAPI, SQLAlchemy (async), asyncpg |
| DB / 캐시 | PostgreSQL 16, Redis 7 |
| 스케줄러 | APScheduler (15분 주기 iCal 폴링) |
| 결제 | TossPayments (빌링키 자동결제) |
| 알림 | Kakao 알림톡 (Solapi 경유) |
| 배포 | Docker / docker-compose |

## 디렉토리 구조

```
staySync/
├── backend/                      # FastAPI 백엔드 (실제 프로덕션)
│   ├── app/
│   │   ├── main.py               # FastAPI 앱 진입점, CORS, lifespan
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic Settings (환경변수)
│   │   │   └── auth.py           # JWT 발급/검증, get_current_user
│   │   ├── db/database.py        # async engine + session + Base
│   │   ├── models/models.py      # User, Room, PlatformConnection, Booking, Conflict
│   │   ├── services/
│   │   │   ├── ical_engine.py    # ⭐ iCal 파싱/동기화/충돌감지 핵심
│   │   │   ├── scheduler.py      # APScheduler 15분 자동동기화
│   │   │   ├── kakao_alimtalk.py # 이중예약 카톡 알림
│   │   │   └── toss_payments.py  # 구독 결제
│   │   └── routers/              # auth / rooms / calendar / billing
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
│
├── frontend/                     # Next.js 14 (현재 데모는 Mock API로 동작)
│   ├── app/
│   │   ├── page.tsx              # 랜딩 페이지
│   │   ├── auth/                 # 로그인 / 회원가입
│   │   ├── dashboard/
│   │   │   ├── calendar/         # ⭐ 멀티룸 통합 캘린더
│   │   │   ├── rooms/            # 숙소·플랫폼연결 관리
│   │   │   └── settings/         # 구독·프로필
│   │   └── api/                  # ⚠️ Mock API Routes (데모용, 실백엔드 대체)
│   ├── components/               # calendar/ rooms/ layout/
│   ├── lib/
│   │   ├── api.ts               # Axios 인스턴스 + API 함수
│   │   ├── store.ts            # Zustand (auth, calendar 필터)
│   │   └── utils.ts            # PLATFORM_LABELS/COLORS, ICAL_GUIDES
│   └── package.json
│
├── docker-compose.yml            # postgres + redis + backend + frontend
└── start-dev.bat                 # Windows 원클릭 dev 실행
```

## 핵심 도메인 로직

### 1. iCal 동기화 엔진 (`backend/app/services/ical_engine.py`)
- `fetch_ical_content()` — 플랫폼별 User-Agent로 iCal URL fetch
- `parse_ical()` — VEVENT 파싱. **DTEND는 exclusive(체크아웃 당일)** 처리. BLOCKED/CANCELLED 상태 매핑
- `sync_connection()` — `ical_uid` 기준 dedup. 신규추가/변경반영/사라진예약 cancelled 처리
- `detect_conflicts()` — 정렬된 예약을 근접비교(O(n)). 겹침 판정: `b1.start < b2.end AND b2.start < b1.end`

### 2. 플랫폼별 연동 방식
| 방식 | 플랫폼 | 동기화 주기 |
|------|--------|------------|
| **iCal (자동)** | 자리톡(10~30분), 위홈(2~3h), 에어비앤비(3h), 아고다, 부킹닷컴 | APScheduler 15분 폴링 |
| **수동 입력** | 야놀자, 여기어때 (iCal 미지원) | 사용자가 직접 입력 |
| (참고) Chrome 확장 | 삼삼엠투/33m2, 엔코스테이, 리브애니웨어 | 향후 과제 |

플랫폼별 iCal URL 발급 가이드는 `frontend/lib/utils.ts`의 `ICAL_GUIDES`에 단계별로 정의됨.

### 3. 요금제 (`toss_payments.py`)
- 1개: 7,900원 / 2~9개: 5,500원 each / 10~20개: 4,900원 each (월, VAT 포함)
- 경쟁사 대비 10~15% 저렴 포지셔닝. 14일 무료체험.

## 로컬 실행 방법

### 프론트엔드 (현재 Mock API로 단독 동작 — Docker/Python 불필요)
```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
```
> Windows에서 `npm run dev`가 막히면: `node node_modules/next/dist/bin/next dev`

Mock 인증: 로그인 페이지에서 아무 이메일/비밀번호 입력 → 대시보드 진입.
데모 데이터: 숙소 3개(강남/홍대/이태원), 6월 12일 더블부킹 충돌 1건 포함.

### 풀스택 (실제 백엔드 + DB)
```bash
docker-compose up        # postgres + redis + backend(8000) + frontend(3000)
```
백엔드 단독: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload`

## 현재 상태 & 다음 작업 후보

- ✅ 프론트엔드 전 화면 구현 + Mock API로 데모 동작 확인
- ✅ 백엔드 전 모듈 코드 작성 (모델/서비스/라우터/스케줄러/결제)
- ✅ Chrome 확장 구현 (33m2·엔코스테이·리브애니웨어·자리톡·직방 — 5개 플랫폼)
- ✅ 확장 팝업에 "시장 분석" 탭 추가 (`extension/market-analysis.js`)
- ⬜ 실제 DB 연결 후 백엔드 end-to-end 검증 (아직 Docker/Python 환경 미실행)
- ⬜ TossPayments / Kakao 알림톡 실제 키 연동 (현재 TODO 주석)
- ⬜ Mock API → 실제 백엔드로 전환 (`frontend/lib/api.ts`의 `API_URL` 변경)
- ⬜ 33m2 내부 API 엔드포인트 확정 → `extension/market-analysis.js`의 `M33_ENDPOINTS` 교체
- ⬜ 대시보드에 "시장 분석" 전체 페이지 추가 (`frontend/app/dashboard/market/`)

## Chrome 확장 구조 (`extension/`)

```
extension/
├── manifest.json         # MV3, host_permissions: 33m2·엔코·리브애니·자리톡·직방
├── background.js         # 서비스 워커: CONNECT_PLATFORM / GET_STATUS 처리
├── content-token.js      # localStorage 스냅샷 → background 캐시
├── content-reservations.js # 예약 화면 DOM 파싱 → /api/extension/sync 전송
├── platforms.js          # PLATFORMS 설정 (5개 플랫폼) + IS_PROD / STAYSYNC_API
├── popup.html/css/js     # 팝업 UI (탭: 플랫폼 연결 | 시장 분석)
└── market-analysis.js    # ⭐ 시장 분석 핵심 로직 (geocode/analyzeMarket/calcOccupancy)
```

**확장 배포 전 필수 체크:**
- `platforms.js`의 `IS_PROD = true` 로 변경 (운영 도메인으로 전환)
- `popup.js`의 `IS_PROD = true` 동일하게 맞추기
- `content-reservations.js` 상단의 `IS_PROD = true` 동일하게 맞추기

## 시장 분석 기능 (`extension/market-analysis.js`)

**목적:** 33m2 지도 기반으로 반경 N m 내 매물의 향후 예약률을 분석.

**현재 상태:** UI 완성, 33m2 API 엔드포인트 미확정 → API 실패 시 mock 데이터 표시.

**실제 데이터 연결 방법:**
1. web.33m2.co.kr 호스트 계정 로그인
2. F12 → Network(Fetch/XHR) 탭 → "지도 검색" 화면 이동 → 매물 목록 반환 XHR 확인
3. `market-analysis.js` 상단 `M33_ENDPOINTS.mapSearch` URL 교체
4. 특정 매물 상세 → 캘린더 XHR 확인 → `M33_ENDPOINTS.calendar` URL 교체
5. 상세 가이드: `docs/33m2-내부api-캡처가이드.md`

**다음 단계 — 대시보드 통합:**
- `frontend/app/dashboard/market/page.tsx` 신규 생성
- Kakao Maps API 또는 Naver Maps API로 풀스크린 지도 표시
- 좌측 사이드바: 반경/예약률/기간 필터
- 지도 위 마커: 예약률 색상(초록≥90%, 노랑≥70%, 회색<70%)
- 백엔드 라우터: `backend/app/routers/market.py` — 33m2 데이터 프록시 (CORS 우회)

## 코드 작성 규칙
- UI 텍스트·주석은 한국어 사용 (대상 사용자가 한국 호스트)
- 백엔드는 async/await 일관 사용 (SQLAlchemy async session)
- 타인의 계정/로그인 정보를 코드나 데이터에 포함하지 않는다
- 확장의 `IS_PROD` 플래그 3곳(`platforms.js`, `popup.js`, `content-reservations.js`)은 항상 동기화
</content>
