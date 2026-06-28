"use client"
import { useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Calendar, Home, Settings, LogOut, AlertTriangle, TrendingUp } from "lucide-react"
import { useAuthStore } from "@/lib/store"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/dashboard/calendar", label: "캘린더", icon: Calendar },
  { href: "/dashboard/rooms", label: "방 관리", icon: Home },
  { href: "/dashboard/market", label: "시장 분석", icon: TrendingUp },
  { href: "/dashboard/settings/profile", label: "설정", icon: Settings },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout, hasHydrated } = useAuthStore()

  useEffect(() => {
    if (hasHydrated && !user) router.replace("/auth/login")
  }, [hasHydrated, user, router])

  // 영속화 복원 전에는 판단 보류 (새로고침 시 깜빡 로그인 튕김 방지)
  if (!hasHydrated) return null
  if (!user) return null

  const isTrialing = user.plan === "trial"
  const trialDaysLeft = user.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(user.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 사이드바 */}
      <aside className="w-56 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <Link href="/dashboard/calendar" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900">StaySync</span>
          </Link>
        </div>

        {/* 트라이얼 배너 */}
        {isTrialing && trialDaysLeft <= 7 && (
          <div className="m-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-1.5 text-amber-700 text-xs font-semibold mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              무료 체험 {trialDaysLeft}일 남음
            </div>
            <Link
              href="/dashboard/settings/subscription"
              className="text-xs text-amber-600 underline"
            >
              구독하기 →
            </Link>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t">
          <div className="px-3 py-2 mb-1">
            <div className="text-sm font-medium text-gray-900 truncate">{user.name}</div>
            <div className="text-xs text-gray-500 truncate">{user.email}</div>
          </div>
          <button
            onClick={() => {
              logout()
              router.push("/")
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 w-full"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </button>
        </div>
      </aside>

      {/* 메인 */}
      <main className="flex-1 overflow-auto min-w-0">{children}</main>
    </div>
  )
}
