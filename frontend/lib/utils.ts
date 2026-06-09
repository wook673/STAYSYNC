import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const PLATFORM_LABELS: Record<string, string> = {
  airbnb: "에어비앤비",
  agoda: "아고다",
  bookingcom: "부킹닷컴",
  zaritalk: "자리톡",
  wehome: "위홈",
  ncostay: "엔코스테이",
  liveanywhere: "리브애니웨어",
  "33m2": "삼삼엠투",
  zigbang: "직방",
  manual: "직접입력",
}

export const PLATFORM_COLORS: Record<string, string> = {
  airbnb: "#FF5A5F",
  agoda: "#EB1C24",
  bookingcom: "#003580",
  zaritalk: "#5B8DEF",
  wehome: "#1EC782",
  ncostay: "#FF8C00",
  liveanywhere: "#9B59B6",
  "33m2": "#F39C12",
  zigbang: "#FF6F0F",
  manual: "#95A5A6",
}

export const ICAL_GUIDES: Record<string, { steps: string[]; url: string }> = {
  zaritalk: {
    url: "https://tenant.zaritalk.com",
    steps: [
      "자리톡 앱 실행",
      "하단 '내 정보' 탭 선택",
      "'캘린더 연동' 또는 '예약 관리' 메뉴",
      "iCal 주소 복사 버튼 클릭",
      "복사된 URL을 아래에 붙여넣기",
    ],
  },
  wehome: {
    url: "https://www.wehome.me",
    steps: [
      "위홈 호스트 대시보드 로그인",
      "상단 '캘린더' 메뉴 클릭",
      "'달력불러오기' 또는 '캘린더 연동' 클릭",
      "위홈 iCal URL 복사",
      "복사된 URL을 아래에 붙여넣기",
    ],
  },
  airbnb: {
    url: "https://www.airbnb.co.kr",
    steps: [
      "에어비앤비 호스트 대시보드 로그인",
      "캘린더 메뉴 선택",
      "가용성 설정 → '캘린더 내보내기'",
      "iCal 주소 복사",
      "복사된 URL을 아래에 붙여넣기",
    ],
  },
  agoda: {
    url: "https://ycs.agoda.com",
    steps: [
      "Agoda YCS 호스트 센터 로그인",
      "캘린더 탭 선택",
      "'캘린더 연결하기' 클릭",
      "아고다 iCal URL 복사",
      "복사된 URL을 아래에 붙여넣기",
    ],
  },
  bookingcom: {
    url: "https://admin.booking.com",
    steps: [
      "Booking.com 익스트라넷 로그인",
      "캘린더 메뉴 선택",
      "'iCal 내보내기' 클릭",
      "iCal 주소 복사",
      "복사된 URL을 아래에 붙여넣기",
    ],
  },
}
