"use client"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { X, Loader2 } from "lucide-react"
import { calendarApi } from "@/lib/api"
import { toast } from "sonner"

interface Props {
  rooms: any[]
  onClose: () => void
  onSuccess: () => void
}

export function ManualBookingModal({ rooms, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit } = useForm()

  const onSubmit = async (data: any) => {
    if (!data.room_id) return toast.error("방을 선택하세요")
    if (!data.start_date || !data.end_date) return toast.error("날짜를 입력하세요")
    if (data.start_date >= data.end_date) return toast.error("체크아웃은 체크인 이후여야 합니다")

    setLoading(true)
    try {
      const res = await calendarApi.createBooking({
        room_id: data.room_id,
        start_date: data.start_date,
        end_date: data.end_date,
        guest_name: data.guest_name || undefined,
        guest_count: data.guest_count ? Number(data.guest_count) : undefined,
        notes: data.notes || undefined,
        summary: data.summary || undefined,
      })
      if (res.data.conflicts > 0) {
        toast.warning(`예약이 추가되었으나 이중예약 ${res.data.conflicts}건이 감지되었습니다!`)
      }
      onSuccess()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "예약 추가 실패")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">수동 예약 추가</h2>
            <p className="text-xs text-gray-500 mt-0.5">야놀자, 여기어때 등 iCal 미지원 플랫폼</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">방 선택 *</label>
            <select
              {...register("room_id")}
              className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">방을 선택하세요</option>
              {rooms.map((r: any) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">체크인 *</label>
              <input
                {...register("start_date")}
                type="date"
                className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">체크아웃 *</label>
              <input
                {...register("end_date")}
                type="date"
                className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">게스트 이름</label>
            <input
              {...register("guest_name")}
              placeholder="홍길동"
              className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">인원</label>
              <input
                {...register("guest_count")}
                type="number"
                min="1"
                placeholder="2"
                className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">예약번호</label>
              <input
                {...register("summary")}
                placeholder="YNJ-12345"
                className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">메모</label>
            <textarea
              {...register("notes")}
              rows={2}
              placeholder="특이사항, 요청사항 등"
              className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              예약 추가
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
