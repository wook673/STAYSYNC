"use client"
import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { billingApi } from "@/lib/api"
import { useAuthStore } from "@/lib/store"

export default function SubscriptionSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")

  useEffect(() => {
    const authKey = searchParams.get("authKey")
    const customerKey = searchParams.get("customerKey")

    if (!authKey) {
      setStatus("error")
      return
    }

    billingApi.subscribe(authKey)
      .then(() => {
        setStatus("success")
        setTimeout(() => router.push("/dashboard/settings/subscription"), 2500)
      })
      .catch(() => setStatus("error"))
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">결제 처리 중...</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">구독이 시작되었습니다!</h2>
            <p className="text-gray-500">잠시 후 구독 페이지로 이동합니다...</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">결제에 실패했습니다</h2>
            <button
              onClick={() => router.back()}
              className="text-blue-600 hover:underline text-sm"
            >
              다시 시도
            </button>
          </>
        )}
      </div>
    </div>
  )
}
