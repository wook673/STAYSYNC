# staySync 🏠

한국 단기임대 호스트를 위한 **멀티 플랫폼 예약 통합 관리 SaaS**.

자리톡·위홈·에어비앤비·아고다·부킹닷컴·삼삼엠투 등 여러 숙박 플랫폼의 예약을
하나의 캘린더에서 통합 관리하고, **이중예약(더블부킹)을 자동으로 감지**합니다.

## ✨ 주요 기능

- 📅 **멀티룸 통합 캘린더** — 여러 숙소·플랫폼 예약을 한 화면에서 색상별로 관리
- 🔄 **iCal 자동 동기화** — 15분마다 각 플랫폼 예약을 자동 동기화
- ⚠️ **이중예약 자동 감지** — 날짜 겹침을 실시간 탐지하고 즉시 경고
- 📱 **카카오 알림톡** — 더블부킹 발생 시 즉시 알림
- 💳 **구독 결제** — TossPayments 기반 자동결제 (월 4,900원~)

## 🛠 기술 스택

**프론트엔드**: Next.js 14 · TypeScript · Tailwind CSS · FullCalendar · Zustand · React Query
**백엔드**: FastAPI · SQLAlchemy(async) · PostgreSQL · Redis · APScheduler
**연동**: iCal(RFC 5545) · TossPayments · Kakao 알림톡(Solapi)

## 🚀 빠른 시작

### 프론트엔드만 (Mock 데이터로 즉시 데모)
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```
로그인 페이지에서 아무 이메일/비밀번호나 입력하면 데모 대시보드로 진입합니다.

### 풀스택 (Docker)
```bash
docker-compose up
```

## 📂 구조

```
backend/   FastAPI 백엔드 (모델·서비스·라우터·스케줄러·결제)
frontend/  Next.js 14 앱 (랜딩·인증·대시보드·캘린더)
```

자세한 개발 가이드는 [`CLAUDE.md`](./CLAUDE.md) 참고.

## 📌 플랫폼별 연동 방식

| 플랫폼 | 방식 |
|--------|------|
| 자리톡 · 위홈 · 에어비앤비 · 아고다 · 부킹닷컴 | iCal 자동 동기화 |
| 야놀자 · 여기어때 | 수동 입력 (iCal 미지원) |
| 삼삼엠투 · 엔코스테이 · 리브애니웨어 | Chrome 확장 (예정) |

---
*본 서비스는 사용자 본인이 각 플랫폼에서 발급한 iCal URL로만 연동하며, 타인의 계정/로그인 정보를 사용하지 않습니다.*
</content>
