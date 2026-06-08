"use client"
import Link from "next/link"
import { Calendar, Shield, Zap, Bell, ChevronRight, CheckCircle2 } from "lucide-react"

const PLATFORMS = [
  { name: "자리톡", color: "#5B8DEF", icon: "🏠" },
  { name: "위홈", color: "#1EC782", icon: "🌿" },
  { name: "에어비앤비", color: "#FF5A5F", icon: "✈️" },
  { name: "아고다", color: "#EB1C24", icon: "🌏" },
  { name: "부킹닷컴", color: "#003580", icon: "📅" },
  { name: "삼삼엠투", color: "#F39C12", icon: "🏢" },
]

const FEATURES = [
  {
    icon: <Calendar className="w-6 h-6 text-blue-600" />,
    title: "통합 캘린더",
    desc: "모든 플랫폼 예약을 하나의 캘린더에서 한눈에 확인. 색상으로 플랫폼 구분.",
  },
  {
    icon: <Shield className="w-6 h-6 text-red-500" />,
    title: "이중예약 방지",
    desc: "날짜 충돌 자동 감지. 이중예약 발생 즉시 카카오 알림톡으로 통보.",
  },
  {
    icon: <Zap className="w-6 h-6 text-yellow-500" />,
    title: "자동 동기화",
    desc: "15분마다 자동으로 모든 플랫폼 예약 정보를 가져와 최신 상태 유지.",
  },
  {
    icon: <Bell className="w-6 h-6 text-green-500" />,
    title: "카카오 알림톡",
    desc: "새 예약, 이중예약 감지, 체크인 리마인더를 카카오톡으로 즉시 수신.",
  },
]

const PRICING = [
  { rooms: "방 1개", price: "7,900원", period: "/월", highlight: false },
  { rooms: "방 2~9개", price: "5,500원", period: "/방/월", highlight: true },
  { rooms: "방 10~20개", price: "4,900원", period: "/방/월", highlight: false },
  { rooms: "방 21개+", price: "협의", period: "", highlight: false },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* 헤더 */}
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900">StaySync</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600">
            <a href="#features" className="hover:text-gray-900">기능</a>
            <a href="#pricing" className="hover:text-gray-900">요금</a>
            <a href="#platforms" className="hover:text-gray-900">연동 플랫폼</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm text-gray-600 hover:text-gray-900">
              로그인
            </Link>
            <Link
              href="/auth/signup"
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              14일 무료 시작
            </Link>
          </div>
        </div>
      </header>

      {/* 히어로 */}
      <section className="bg-gradient-to-b from-blue-50 to-white py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-sm px-3 py-1 rounded-full mb-6">
            <Zap className="w-4 h-4" />
            이중예약 걱정 없이 운영하세요
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            모든 숙박 플랫폼 예약을<br />
            <span className="text-blue-600">한 화면</span>에서 관리
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            자리톡, 위홈, 에어비앤비, 아고다, 부킹닷컴의 예약을 자동으로 수집하고,
            이중예약을 즉시 감지하여 카카오 알림톡으로 알려드립니다.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              className="w-full sm:w-auto bg-blue-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              14일 무료로 시작하기
              <ChevronRight className="w-5 h-5" />
            </Link>
            <Link
              href="/dashboard/calendar"
              className="w-full sm:w-auto border border-gray-300 text-gray-700 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-50 transition-colors"
            >
              데모 보기
            </Link>
          </div>
          <p className="text-sm text-gray-500 mt-4">신용카드 없이 14일 무료 · 언제든 취소 가능</p>
        </div>
      </section>

      {/* 연동 플랫폼 */}
      <section id="platforms" className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-center text-gray-500 text-sm font-semibold uppercase tracking-wider mb-8">
            연동 지원 플랫폼
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            {PLATFORMS.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-2 border rounded-full px-4 py-2 text-sm font-medium"
                style={{ borderColor: p.color + "40", color: p.color }}
              >
                <span>{p.icon}</span>
                {p.name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 기능 */}
      <section id="features" className="py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              복잡한 멀티 플랫폼 운영을 단순하게
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              여러 앱을 오가며 확인하던 시간을 절약하고, 실수 없이 운영하세요.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-8 shadow-sm">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 요금 */}
      <section id="pricing" className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">방 수만큼만 내세요</h2>
            <p className="text-gray-600">VAT 포함 · 14일 무료 체험 후 자동 결제</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING.map((p) => (
              <div
                key={p.rooms}
                className={`rounded-2xl p-6 border-2 ${
                  p.highlight
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-100 bg-gray-50"
                }`}
              >
                {p.highlight && (
                  <div className="text-xs font-bold text-blue-600 uppercase mb-2">인기</div>
                )}
                <div className="text-sm text-gray-600 mb-2">{p.rooms}</div>
                <div className="text-2xl font-bold text-gray-900">{p.price}</div>
                <div className="text-sm text-gray-500">{p.period}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 bg-gray-50 rounded-2xl p-6">
            <ul className="grid sm:grid-cols-2 gap-3">
              {[
                "모든 플랫폼 iCal 연동 포함",
                "15분 자동 동기화",
                "이중예약 감지 알림",
                "카카오 알림톡",
                "수동 예약 등록 (야놀자·여기어때)",
                "무제한 방 등록",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-blue-600">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            지금 바로 시작하세요
          </h2>
          <p className="text-blue-100 mb-8">
            14일 동안 무료로 모든 기능을 사용해보세요. 신용카드 불필요.
          </p>
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 bg-white text-blue-600 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-blue-50 transition-colors"
          >
            무료 체험 시작
            <ChevronRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* 푸터 — Cal.com 다크 마감 */}
      <footer className="footer-dark py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <Calendar className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-on-dark">StaySync</span>
          </div>
          <p className="text-sm text-on-dark-soft">
            © 2026 StaySync. 한국 단기임대 호스트를 위한 통합 예약 관리 서비스.
          </p>
        </div>
      </footer>
    </div>
  )
}
