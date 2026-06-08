import type { Config } from "tailwindcss"

/**
 * staySync 디자인 시스템
 * - 구조(중립색·타이포·여백·라운드·푸터): Cal.com
 * - 브랜드 보강색(CTA·강조·경고): Airbnb "Rausch" (#ff385c)
 *
 * 기존 컴포넌트가 쓰던 Tailwind `blue` 스케일을 Rausch 램프로 리맵하여
 * 모든 화면의 1차 액션 컬러가 일괄 적용되도록 함.
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Airbnb Rausch 램프 (구 blue 자리) ──────────────────
        blue: {
          50: "#fff1f3",
          100: "#ffe4e8",
          200: "#ffccd5",
          300: "#ffa3b3",
          400: "#ff6f88",
          500: "#ff385c", // Rausch
          600: "#ff385c", // 1차 CTA
          700: "#e00b41", // active / hover (Rausch Active)
          800: "#c1093a",
          900: "#99002e",
        },
        // 의미 토큰 (별칭)
        rausch: {
          DEFAULT: "#ff385c",
          active: "#e00b41",
          tint: "#fff1f3",
        },
        // ── Cal.com 중립/구조 토큰 ─────────────────────────────
        ink: "#111111", // 헤드라인·본문 강조
        body: "#374151", // 본문
        canvas: "#ffffff",
        "surface-card": "#f5f5f5", // 기능/가격 카드
        "surface-soft": "#f8f9fa", // 분할선·연한 배경
        "surface-dark": "#101010", // 다크 푸터 / 강조 카드
        "on-dark": "#ffffff",
        "on-dark-soft": "#a1a1aa",
        border: "#e5e7eb",
        background: "#ffffff",
        foreground: "#111111",
        primary: {
          DEFAULT: "#ff385c",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "#f5f5f5",
          foreground: "#6b7280",
        },
      },
      fontFamily: {
        // Cal.com: Inter 본문 + 디스플레이도 Inter(타이트 트래킹)로 대체
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        // Cal.com 라운드 위계: 버튼 8, 카드 12, 히어로 16
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      letterSpacing: {
        tighter: "-0.04em", // Cal Sans 대체용 디스플레이 트래킹
      },
    },
  },
  plugins: [],
}

export default config
