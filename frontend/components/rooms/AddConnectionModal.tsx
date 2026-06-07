"use client"
import { useState } from "react"
import { X, Loader2, ExternalLink, ChevronRight } from "lucide-react"
import { roomsApi } from "@/lib/api"
import { PLATFORM_LABELS, PLATFORM_COLORS, ICAL_GUIDES } from "@/lib/utils"
import { toast } from "sonner"

interface Props {
  roomId: string
  onClose: () => void
  onSuccess: () => void
}

const SUPPORTED_PLATFORMS = ["zaritalk", "wehome", "airbnb", "agoda", "bookingcom"]

export function AddConnectionModal({ roomId, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<"select" | "guide" | "input">("select")
  const [selectedPlatform, setSelectedPlatform] = useState("")
  const [icalUrl, setIcalUrl] = useState("")
  const [loading, setLoading] = useState(false)

  const guide = ICAL_GUIDES[selectedPlatform]

  const handleSubmit = async () => {
    if (!icalUrl.startsWith("http")) {
      toast.error("올바른 URL을 입력하세요")
      return
    }
    setLoading(true)
    try {
      await roomsApi.addConnection(roomId, {
        platform: selectedPlatform,
        ical_url: icalUrl,
      })
      toast.success(`${PLATFORM_LABELS[selectedPlatform]} 연결이 추가되었습니다!`)
      onSuccess()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "연결 추가 실패")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-gray-900">
            {step === "select" && "플랫폼 선택"}
            {step === "guide" && `${PLATFORM_LABELS[selectedPlatform]} iCal URL 찾기`}
            {step === "input" && "iCal URL 입력"}
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* Step 1: 플랫폼 선택 */}
        {step === "select" && (
          <div className="p-5">
            <p className="text-sm text-gray-500 mb-4">연결할 플랫폼을 선택하세요</p>
            <div className="space-y-2">
              {SUPPORTED_PLATFORMS.map((platform) => (
                <button
                  key={platform}
                  onClick={() => {
                    setSelectedPlatform(platform)
                    setStep("guide")
                  }}
                  className="w-full flex items-center justify-between p-3.5 border rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: PLATFORM_COLORS[platform] }}
                    />
                    <span className="font-medium text-gray-900">{PLATFORM_LABELS[platform]}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-xs text-amber-700 font-medium">야놀자·여기어때·삼삼엠투</p>
              <p className="text-xs text-amber-600 mt-0.5">
                iCal 미지원 플랫폼은 캘린더 페이지에서 '수동 예약 추가'로 등록하세요.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: 안내 */}
        {step === "guide" && guide && (
          <div className="p-5">
            <p className="text-sm text-gray-600 mb-4">
              아래 단계를 따라 <strong>{PLATFORM_LABELS[selectedPlatform]}</strong>에서 iCal URL을 복사하세요.
            </p>

            <ol className="space-y-3 mb-5">
              {guide.steps.map((step: string, i: number) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-700">{step}</span>
                </li>
              ))}
            </ol>

            <a
              href={guide.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 border border-blue-200 rounded-lg px-4 py-2.5 hover:bg-blue-50 mb-5"
            >
              <ExternalLink className="w-4 h-4" />
              {PLATFORM_LABELS[selectedPlatform]} 열기
            </a>

            <div className="flex gap-3">
              <button onClick={() => setStep("select")}
                className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                이전
              </button>
              <button onClick={() => setStep("input")}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700">
                URL 복사했어요 →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: URL 입력 */}
        {step === "input" && (
          <div className="p-5">
            <p className="text-sm text-gray-600 mb-4">
              복사한 iCal URL을 붙여넣으세요.
            </p>

            <textarea
              value={icalUrl}
              onChange={(e) => setIcalUrl(e.target.value)}
              placeholder="https://..."
              rows={3}
              className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              webcal:// URL은 https://로 바꿔서 붙여넣으세요.
            </p>

            <div className="flex gap-3 mt-4">
              <button onClick={() => setStep("guide")}
                className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                이전
              </button>
              <button onClick={handleSubmit} disabled={loading || !icalUrl}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                연결 완료
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
