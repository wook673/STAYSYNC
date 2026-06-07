"use client"
import { X, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { PLATFORM_LABELS, PLATFORM_COLORS } from "@/lib/utils"
import { calendarApi } from "@/lib/api"
import { toast } from "sonner"
import { useState } from "react"

interface Props {
  event: any
  onClose: () => void
  onRefresh: () => void
}

export function BookingDetailPanel({ event, onClose, onRefresh }: Props) {
  const props = event.extendedProps
  const [deleting, setDeleting] = useState(false)

  const platformColor = PLATFORM_COLORS[props.platform] || "#95A5A6"
  const platformLabel = PLATFORM_LABELS[props.platform] || props.platform

  const handleDelete = async () => {
    if (!confirm("이 예약을 삭제하시겠습니까?")) return
    setDeleting(true)
    try {
      await calendarApi.deleteBooking(event.id)
      toast.success("예약이 삭제되었습니다.")
      onClose()
      onRefresh()
    } catch {
      toast.error("삭제에 실패했습니다.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="w-72 border-l bg-white flex flex-col">
      {/* 헤더 */}
      <div
        className="p-4 flex items-center justify-between"
        style={{ backgroundColor: platformColor + "15" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: platformColor }}
          />
          <span className="font-semibold text-sm" style={{ color: platformColor }}>
            {platformLabel}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 내용 */}
      <div className="p-5 flex-1 space-y-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">방</div>
          <div className="font-medium text-gray-900">{props.room_name}</div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">체크인 · 체크아웃</div>
          <div className="font-medium text-gray-900">
            {format(event.start, "M월 d일 (E)", { locale: ko })}
            {" "}~{" "}
            {format(event.end, "M월 d일 (E)", { locale: ko })}
          </div>
        </div>

        {props.guest_name && (
          <div>
            <div className="text-xs text-gray-500 mb-1">게스트</div>
            <div className="font-medium text-gray-900">{props.guest_name}</div>
          </div>
        )}

        {props.guest_count && (
          <div>
            <div className="text-xs text-gray-500 mb-1">인원</div>
            <div className="font-medium text-gray-900">{props.guest_count}명</div>
          </div>
        )}

        {props.summary && (
          <div>
            <div className="text-xs text-gray-500 mb-1">예약 정보</div>
            <div className="text-sm text-gray-700">{props.summary}</div>
          </div>
        )}

        {props.notes && (
          <div>
            <div className="text-xs text-gray-500 mb-1">메모</div>
            <div className="text-sm text-gray-700">{props.notes}</div>
          </div>
        )}

        <div>
          <div className="text-xs text-gray-500 mb-1">상태</div>
          <span
            className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
              props.status === "confirmed"
                ? "bg-green-100 text-green-700"
                : props.status === "blocked"
                ? "bg-gray-100 text-gray-600"
                : "bg-red-100 text-red-600"
            }`}
          >
            {props.status === "confirmed" ? "확정" : props.status === "blocked" ? "차단" : "취소"}
          </span>
        </div>
      </div>

      {/* 삭제 버튼 (수동 예약만) */}
      {props.platform === "manual" && (
        <div className="p-4 border-t">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full flex items-center justify-center gap-2 text-sm text-red-600 border border-red-200 rounded-lg py-2 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            예약 삭제
          </button>
        </div>
      )}
    </div>
  )
}
