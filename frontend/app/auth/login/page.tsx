"use client"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Calendar, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { authApi } from "@/lib/api"
import { useAuthStore } from "@/lib/store"

const schema = z.object({
  email: z.string().email("올바른 이메일을 입력하세요"),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다"),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      // zod v3/resolver 타입 추론이 필드를 optional로 뽑는 문제 → 명시 캐스팅
      const res = await authApi.login(data as { email: string; password: string })
      setAuth(res.data.user, res.data.access_token)
      toast.success(`환영합니다, ${res.data.user.name}님!`)
      router.push("/dashboard/calendar")
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "로그인에 실패했습니다.")
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
          <h1 className="text-2xl font-bold text-gray-900">로그인</h1>
          <p className="text-gray-500 mt-2">계속하려면 로그인하세요</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                이메일
              </label>
              <input
                {...register("email")}
                type="email"
                placeholder="host@example.com"
                className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                비밀번호
              </label>
              <input
                {...register("password")}
                type="password"
                placeholder="••••••••"
                className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              로그인
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            계정이 없으신가요?{" "}
            <Link href="/auth/signup" className="text-blue-600 font-semibold hover:underline">
              14일 무료 시작
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
