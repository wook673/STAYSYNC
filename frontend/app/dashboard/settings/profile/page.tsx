"use client"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Loader2, Save } from "lucide-react"
import { api } from "@/lib/api"
import { useAuthStore } from "@/lib/store"
import { toast } from "sonner"

export default function ProfilePage() {
  const { user, setAuth } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit } = useForm({
    defaultValues: { name: user?.name || "", phone: user?.phone || "" },
  })

  const onSubmit = async (data: any) => {
    setLoading(true)
    try {
      const res = await api.patch("/api/auth/profile", data)
      toast.success("프로필이 저장되었습니다.")
    } catch {
      toast.error("저장에 실패했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-1">프로필 설정</h1>
      <p className="text-sm text-gray-500 mb-8">계정 정보를 수정하세요</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">이메일</label>
          <input
            value={user?.email}
            disabled
            className="w-full border rounded-lg px-4 py-3 text-sm bg-gray-50 text-gray-400"
          />
          <p className="text-xs text-gray-400 mt-1">이메일은 변경할 수 없습니다</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">이름</label>
          <input
            {...register("name")}
            className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            연락처 <span className="text-gray-400 font-normal">(카카오 알림톡 수신)</span>
          </label>
          <input
            {...register("phone")}
            type="tel"
            placeholder="010-0000-0000"
            className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          저장
        </button>
      </form>
    </div>
  )
}
