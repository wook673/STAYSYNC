"use client"
import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, CreditCard, Loader2, AlertTriangle } from "lucide-react"
import { billingApi } from "@/lib/api"
import { useAuthStore } from "@/lib/store"
import { toast } from "sonner"
import { format, differenceInDays } from "date-fns"
import { ko } from "date-fns/locale"

declare global {
  interface Window {
    TossPayments: any
  }
}

export default function SubscriptionPage() {
  const { user } = useAuthStore()
  const [subscribing, setSubscribing] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const { data: pricing } = useQuery({
    queryKey: ["pricing"],
    queryFn: () => billingApi.pricing().then((r) => r.data),
  })

  // TossPayments SDK 로드
  useEffect(() => {
    const script = document.createElement("script")
    script.src = "https://js.tosspayments.com/v2/standard"
    script.async = true
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  const handleSubscribe = async () => {
    setSubscribing(true)
    try {
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!
      const tossPayments = window.TossPayments(clientKey)
      const customerKey = `staysync_${user!.id}`

      // 빌링 위젯으로 카드 등록
      const billing = tossPayments.requestBillingAuth("카드", {
        customerKey,
        successUrl: `${window.location.origin}/dashboard/settings/subscription/success`,
        failUrl: `${window.location.origin}/dashboard/settings/subscription/fail`,
      })

      // successUrl에서 authKey를 받아 백엔드에 전달
      // (실제로는 successUrl 페이지에서 처리)
    } catch (err: any) {
      toast.error("결제 창을 열지 못했습니다.")
    } finally {
      setSubscribing(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm("구독을 취소하시겠습니까? 현재 기간 종료 후 서비스가 중단됩니다.")) return
    setCancelling(true)
    try {
      await billingApi.cancel()
      toast.success("구독이 취소되었습니다.")
    } catch {
      toast.error("취소에 실패했습니다.")
    } finally {
      setCancelling(false)
    }
  }

  const isTrialing = user?.plan === "trial"
  const trialDaysLeft = user?.trial_ends_at
    ? Math.max(0, differenceInDays(new Date(user.trial_ends_at), new Date()))
    : 0
  const trialEndsAt = user?.trial_ends_at
    ? format(new Date(user.trial_ends_at), "M월 d일 (E)", { locale: ko })
    : ""

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">구독 관리</h1>
      <p className="text-sm text-gray-500 mb-8">요금제 및 결제 정보를 관리하세요</p>

      {/* 현재 상태 */}
      <div className={`rounded-2xl p-5 mb-8 ${
        isTrialing
          ? trialDaysLeft <= 3 ? "bg-red-50 border border-red-200" : "bg-blue-50 border border-blue-100"
          : "bg-green-50 border border-green-100"
      }`}>
        <div className="flex items-center gap-2 mb-2">
          {isTrialing
            ? <AlertTriangle className={`w-5 h-5 ${trialDaysLeft <= 3 ? "text-red-500" : "text-blue-500"}`} />
            : <CheckCircle2 className="w-5 h-5 text-green-600" />}
          <span className={`font-semibold ${isTrialing ? (trialDaysLeft <= 3 ? "text-red-700" : "text-blue-700") : "text-green-700"}`}>
            {isTrialing ? `무료 체험 중 (${trialDaysLeft}일 남음)` : "구독 중"}
          </span>
        </div>
        {isTrialing && (
          <p className={`text-sm ${trialDaysLeft <= 3 ? "text-red-600" : "text-blue-600"}`}>
            {trialEndsAt}에 체험이 종료됩니다. 종료 전에 구독하면 서비스가 끊기지 않습니다.
          </p>
        )}
      </div>

      {/* 요금 테이블 */}
      <div className="mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">요금 안내</h2>
        <div className="border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">방 수</th>
                <th className="px-4 py-3 text-right text-gray-600 font-medium">단가</th>
                <th className="px-4 py-3 text-right text-gray-600 font-medium">월 합계</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                { rooms: "1개", unit: "7,900원", total: "7,900원", highlight: false },
                { rooms: "2~9개", unit: "5,500원/방", total: "방 수 × 5,500원", highlight: true },
                { rooms: "10~20개", unit: "4,900원/방", total: "방 수 × 4,900원", highlight: false },
                { rooms: "21개 이상", unit: "협의", total: "별도 문의", highlight: false },
              ].map((row) => (
                <tr key={row.rooms} className={row.highlight ? "bg-blue-50" : ""}>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.rooms}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{row.unit}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-500">
            VAT 포함 금액 · 매월 동일 날짜 자동 결제
          </div>
        </div>
      </div>

      {/* 포함 기능 */}
      <div className="mb-8">
        <h2 className="font-semibold text-gray-900 mb-3">포함 기능</h2>
        <ul className="grid grid-cols-2 gap-2">
          {[
            "자리톡·위홈·에어비앤비 iCal 연동",
            "아고다·부킹닷컴 연동",
            "15분 자동 동기화",
            "이중예약 즉시 감지",
            "카카오 알림톡 알림",
            "수동 예약 등록 (야놀자·여기어때)",
            "통합 멀티룸 캘린더",
            "방 무제한 등록",
          ].map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* 구독 / 취소 버튼 */}
      {isTrialing ? (
        <button
          onClick={handleSubscribe}
          disabled={subscribing}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-3.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 w-full"
        >
          {subscribing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
          카드 등록하고 구독 시작
        </button>
      ) : (
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">구독 중</div>
              <div className="text-sm text-gray-500">다음 결제일에 자동 갱신됩니다</div>
            </div>
            <CheckCircle2 className="w-6 h-6 text-green-500" />
          </div>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="w-full text-sm text-gray-500 border rounded-lg py-2.5 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelling ? "취소 중..." : "구독 취소"}
          </button>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4 text-center">
        결제 관련 문의: support@staysync.kr · 언제든 취소 가능
      </p>
    </div>
  )
}
