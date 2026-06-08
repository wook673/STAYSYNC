# staySync 연결 도우미 (Chrome 확장)

공식 API가 없는 숙박 플랫폼(**33m2·엔코스테이·리브애니웨어·자리톡**)을 staySync에
연결하기 위한 Chrome 확장입니다. Hostier가 쓰는 것과 **동일한 아키텍처**를
staySync 전용으로 클린룸 구현했습니다.

## 동작 원리

```
① 사용자가 이 확장을 설치
② 사용자가 자기 브라우저에서 플랫폼(web.33m2.co.kr 등)에 직접 로그인
③ 확장이 그 로그인 세션의 인증 토큰을 획득 (쿠키 또는 localStorage)
④ 확장 → staySync 백엔드(/api/extension/connect)로 토큰 전달
⑤ 백엔드가 토큰으로 플랫폼 내부 웹 API를 호출해 예약 수집
⑥ 33m2·자리톡은 토큰 자동 유지 / 엔코·리브애니웨어는 만료 시 확장에서 재연결
```

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

## ⚠️ 실제 작동을 위해 확정해야 할 것 (내부 API 스펙)

각 플랫폼은 공식 API가 없으므로, **내부 웹 API 엔드포인트와 토큰 키**를
사용자 본인 세션으로 직접 확인해야 합니다:

1. 본인 계정으로 플랫폼 로그인 (예: `web.33m2.co.kr/host`)
2. DevTools(F12) → **Network** 탭 → 예약/캘린더 화면 로드
3. 예약 데이터를 반환하는 XHR/fetch 요청 확인:
   - 요청 URL → `backend/app/services/extension_sync.py`의 `PLATFORM_ENDPOINTS.reservations`
   - 인증 방식(쿠키 자동전송 vs `Authorization: Bearer`) → 같은 파일 `auth_header/format`
   - 응답 JSON 구조 → `normalize_reservations()` 파서
4. **Application** 탭 → Cookies/localStorage 에서 실제 토큰 키 확인:
   - → `platforms.js`의 `cookieNames` / `storageKeys`

> 현재 엔드포인트/키는 **추정값**으로 채워져 있으며 `TODO`로 표시되어 있습니다.
> 위 절차로 실제 값을 확인해 교체하면 동기화가 작동합니다.

## ⚖️ 법적/약관 유의

33m2 등의 이용약관은 자동화 수집을 제한할 수 있습니다(자세한 내용은 프로젝트
조사 보고서 참고). **공식 제휴(서면 동의) 병행을 1순위로 권고**하며, 확장 방식은
사용자 본인 세션만 사용한다는 점에서 서버측 스크래핑보다 방어 논거가 낫지만
완전 무해를 보장하지 않습니다. 출시 전 법무 검토를 권장합니다.
