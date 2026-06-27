"use client"
/**
 * 타임라인 셀 클릭 시 뜨는 등록 모달
 * - 유형: 예약 / 수동 차단
 * - 기간: 시작일 ~ 종료일 (언제부터 언제까지)
 * - 예약일 때: 게스트 이름 + 수익(원) → 정산 반영
 */
import { useState } from "react"
import { X, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { calendarApi } from "@/lib/api"
import { format, addDays } from "date-fns"

export function CellBookingModal({
  roomId, roomName, date, onClose, onSuccess,
}: {
  roomId: string
  roomName: string
  date: Date
  onClose: () => void
  onSuccess: () => void
}) {
  const [start, setStart] = useState(format(date, "yyyy-MM-dd"))
  const [end, setEnd] = useState(format(addDays(date, 1), "yyyy-MM-dd"))
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (start > end) { toast.error("종료일이 시작일보다 빠릅니다."); return }
    setSaving(true)
    try {
      await calendarApi.createBooking({
        room_id: roomId,
        start_date: start,
        end_date: end,
        status: "confirmed",
        guest_name: name || undefined,
        summary: name || "직접 등록",
        amount: amount ? Number(amount.replace(/,/g, "")) : undefined,
      })
      toast.success("등록되었습니다.")
      onSuccess()
    } catch {
      toast.error("등록에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">일정 등록 — {roomName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* 기간 */}
        <div className="grid grid-cols-2 gap-2 mb-1">
          <div>
            <label className="text-xs text-gray-500">시작일</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="w-full border rounded-lg px-2 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500">종료일(퇴실)</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="w-full border rounded-lg px-2 py-2 text-sm mt-1" />
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-3">{start} ~ {end}</p>

        {/* 선택 입력 — 게스트 이름 / 수익 */}
        <div className="space-y-2 mb-4">
          <div>
            <label className="text-xs text-gray-500">게스트 이름 <span className="text-gray-400">(선택)</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 홍길동"
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500">수익 (원) <span className="text-gray-400">(선택 · 정산 반영)</span></label>
            <input value={amount} inputMode="numeric"
              onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ""))}
              placeholder="예: 280,000"
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
        </div>

        <button onClick={submit} disabled={saving}
          className="w-full bg-[#111] text-white text-sm font-semibold rounded-lg py-2.5 hover:bg-[#333] disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          등록
        </button>
      </div>
    </div>
  )
}
