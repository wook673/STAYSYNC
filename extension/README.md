# staySync 연결 도우미 (Chrome 확장)

공식 API가 없는 숙박 플랫폼(**33m2·자리톡·엔코스테이·리브애니웨어·직방**)을 staySync에
연결하기 위한 Chrome 확장입니다. Hostier가 쓰는 것과 **동일한 아키텍처**를
staySync 전용으로 클린룸 구현했습니다.

> 📦 **스토어 게시 준비물**은 `docs/chrome-store/` 참고
> (개인정보처리방침·등록정보·체크리스트). zip 패키징: `bash extension/pack.sh`
> (zip 미설치 시 PowerShell `Compress-Archive` 사용 — 게시 체크리스트 참고)

## 동작 원리

> **중요: 33m2는 공식 API도, 공개된 내부 API도 없습니다.** 그래서 핵심 방법은
> "엔드포인트 호출"이 아니라 **사용자가 로그인한 화면(DOM)에서 예약을 직접 읽는 것**입니다.

```
① 사용자가 이 확장을 설치
② 사용자가 자기 브라우저에서 플랫폼(web.33m2.co.kr 등)에 직접 로그인
③ [핵심] 콘텐츠 스크립트(content-reservations.js)가 로그인된 예약 화면의
   DOM을 same-origin·인증 상태로 읽어 예약을 구조화
④ 확장 → staySync 백엔드(/api/extension/sync)로 "파싱된 예약" 전달
⑤ 백엔드가 dedup/upsert + 이중예약 감지
⑥ 33m2·자리톡은 세션 자동 유지 / 엔코·리브애니웨어는 만료 시 확장에서 재연결
```

### 두 가지 데이터 경로
> 🔬 **Hostier 확장 역분석 결과**: Hostier는 화면을 긁지 않고 **확장이 로그인 토큰만
> 수집해 백엔드에 넘기고, 백엔드가 그 토큰으로 플랫폼 내부 API를 호출**해 예약 읽기·
> 날짜 차단을 모두 server-side로 수행한다. → **토큰 경로가 정답(primary).**

| 경로 | 파일 | 역할 | 비고 |
|------|------|------|------|
| **토큰 중개 (핵심, Hostier 방식)** | `background.js` → `POST /api/extension/connect` → 백엔드가 `extension_sync.py`로 플랫폼 내부 API 호출 | 읽기 + 차단(쓰기)을 백엔드가 수행 | 내부 API 엔드포인트 확정 필요(캡처 가이드) |
| DOM 추출 (폴백) | `content-reservations.js` → `POST /api/extension/sync` | 내부 API를 못 쓸 때 화면에서 직접 추출 | 휴리스틱 자동탐지 포함 |

> 🔒 **보안·원칙**: 비밀번호는 절대 다루지 않습니다. 이미 로그인된
> **사용자 본인 세션의 토큰**만 읽어 **본인 staySync 계정**으로만 전송합니다.
> 타인·경쟁사 로그인 정보는 일절 사용하지 않습니다.

## 설치 (개발자 모드)

1. Chrome → `chrome://extensions` 접속
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드** → 이 `extension/` 폴더 선택
4. staySync 웹앱(`localhost:3000`)에 로그인
5. 각 플랫폼에 로그인 → 확장 팝업에서 **연결** 클릭

## 파일 구조

| 파일 | 역할 |
|------|------|
| `manifest.json` | MV3 매니페스트 (권한·도메인·스크립트) |
| `platforms.js` | 플랫폼별 연결 설정 (도메인·토큰 전략) |
| `background.js` | 토큰 획득(쿠키/localStorage) + 백엔드 전송 |
| `content-token.js` | localStorage 기반 플랫폼 토큰 스냅샷 |
| `popup.html/js/css` | 연결 UI |

## ⚠️ 실제 작동을 위해 확정해야 할 것 (DOM 선택자)

33m2는 API가 없으므로 **DOM 추출이 기본**입니다. 확정할 것은 "예약 화면의
HTML 구조"뿐입니다:

1. 본인 계정으로 `web.33m2.co.kr/host` 로그인 → **예약 목록/캘린더 화면**으로 이동
2. DevTools(F12) → **Elements** 탭에서 예약 한 건의 DOM 구조 확인:
   - 예약 행을 감싸는 요소의 선택자(class/data-attr)
   - 게스트명·체크인·체크아웃이 들어있는 하위 요소 선택자
   - 예약 고유 ID가 담긴 속성
3. 확인한 값을 `extension/content-reservations.js`의 `SELECTORS["33m2"]`에 입력
4. (선택) 33m2가 화면을 JSON XHR로 그린다면 그 엔드포인트를
   `backend/app/services/extension_sync.py`에 추가해 토큰 경로도 병행 가능

> 현재 `SELECTORS`는 **예시 골격**(`TODO`)입니다. 위 1~3으로 실제 선택자를
> 채우면 즉시 동기화가 작동합니다. **엔드포인트를 몰라도 됩니다.**

## ⚖️ 법적/약관 유의

33m2 등의 이용약관은 자동화 수집을 제한할 수 있습니다(자세한 내용은 프로젝트
조사 보고서 참고). **공식 제휴(서면 동의) 병행을 1순위로 권고**하며, 확장 방식은
사용자 본인 세션만 사용한다는 점에서 서버측 스크래핑보다 방어 논거가 낫지만
완전 무해를 보장하지 않습니다. 출시 전 법무 검토를 권장합니다.
