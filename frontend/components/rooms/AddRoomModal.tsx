"use client"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { X, Loader2 } from "lucide-react"
import { roomsApi } from "@/lib/api"
import { toast } from "sonner"

const COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
]

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export function AddRoomModal({ onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [selectedColor, setSelectedColor] = useState(COLORS[0])
  const { register, handleSubmit, formState: { errors } } = useForm()

  const onSubmit = async (data: any) => {
    setLoading(true)
    try {
      await roomsApi.create({ ...data, color: selectedColor })
      toast.success("방이 추가되었습니다.")
      onSuccess()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "방 추가 실패")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-gray-900">방 추가</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">방 이름 *</label>
            <input
              {...register("name", { required: "방 이름을 입력하세요" })}
              placeholder="예: 강남 스튜디오 301호"
              className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message as string}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">주소</label>
            <input
              {...register("address")}
              placeholder="서울시 강남구..."
              className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">청소 담당자</label>
              <input
                {...register("cleaner_name")}
                placeholder="이름"
                className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">담당자 연락처</label>
              <input
                {...register("cleaner_phone")}
                type="tel"
                placeholder="010-0000-0000"
                className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-gray-400">게스트 입실일에 담당자에게 청소 일정(퇴실일) 문자가 발송됩니다.</p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">캘린더 색상</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className={`w-8 h-8 rounded-full border-2 ${
                    selectedColor === c ? "border-gray-900 scale-110" : "border-transparent"
                  } transition-transform`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">
              취소
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              추가
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
