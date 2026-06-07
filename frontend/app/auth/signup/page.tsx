"use client"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Calendar, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { authApi } from "@/lib/api"
import { useAuthStore } from "@/lib/store"

const schema = z.object({
  name: z.string().min(2, "이름은 2자 이상이어야 합니다"),
  email: z.string().email("올바른 이메일을 입력하세요"),
  phone: z.string().optional(),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "비밀번호가 일치하지 않습니다",
  path: ["confirmPassword"],
})

type FormData = z.infer<typeof schema>

export default function SignupPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await authApi.signup({
        name: data.name,
        email: data.email,
        password: data.password,
        phone: data.phone,
      })
      setAuth(res.data.user, res.data.access_token)
      toast.success("가입 완료! 14일 무료 체험을 시작합니다.")
      router.push("/dashboard/calendar")
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "회원가입에 실패했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-2xl text-gray-900">StaySync</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">14일 무료 체험 시작</h1>
          <p className="text-gray-500 mt-2">신용카드 없이 바로 시작하세요</p>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
          <ul className="space-y-1.5">
            {["모든 플랫폼 연동 무료", "이중예약 감지 알림", "14일 후 방 수 기반 과금"].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-blue-800">
                <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">이름</label>
              <input
                {...register("name")}
                placeholder="홍길동"
                className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">이메일</label>
              <input
                {...register("email")}
                type="email"
                placeholder="host@example.com"
                className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                연락처 <span className="text-gray-400 font-normal">(알림톡 수신)</span>
              </label>
              <input
                {...register("phone")}
                type="tel"
                placeholder="010-0000-0000"
                className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">비밀번호</label>
              <input
                {...register("password")}
                type="password"
                placeholder="8자 이상"
                className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">비밀번호 확인</label>
              <input
                {...register("confirmPassword")}
                type="password"
                placeholder="••••••••"
                className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.confirmPassword && (
                <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              무료 체험 시작하기
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            이미 계정이 있으신가요?{" "}
            <Link href="/auth/login" className="text-blue-600 font-semibold hover:underline">
              로그인
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
