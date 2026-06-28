"use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Save, Send, Sparkles, MessageSquare } from "lucide-react"
import { toast } from "sonner"
import { notificationsApi } from "@/lib/api"
import { useAuthStore } from "@/lib/store"

export default function NotificationsPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [sender, setSender] = useState("")
  const [enabled, setEnabled] = useState(false)
  const [template, setTemplate] = useState("")
  const [testTo, setTestTo] = useState(user?.phone || "")
  const [initialized, setInitialized] = useState(false)

  const { isLoading } = useQuery({
    queryKey: ["notif-settings"],
    queryFn: async () => {
      const { data } = await notificationsApi.getSettings()
      if (!initialized) {
        setApiKey(data.solapi_api_key || "")
        setSender(data.solapi_sender || "")
        setEnabled(!!data.cleaning_notify_enabled)
        setTemplate(data.cleaning_msg_template || data.default_template || "")
        setInitialized(true)
      }
      return data
    },
  })

  const save = useMutation({
    mutationFn: () =>
      notificationsApi.updateSettings({
        solapi_api_key: apiKey,
        ...(apiSecret ? { solapi_api_secret: apiSecret } : {}),
        solapi_sender: sender,
        cleaning_notify_enabled: enabled,
        cleaning_msg_template: template,
      }),
    onSuccess: () => {
      toast.success("알림 설정이 저장되었습니다.")
      setApiSecret("")
      qc.invalidateQueries({ queryKey: ["notif-settings"] })
    },
    onError: () => toast.error("저장에 실패했습니다."),
  })

  const sendTest = useMutation({
    mutationFn: () => notificationsApi.test(testTo),
    onSuccess: ({ data }) => {
      if (data.dry_run) toast.info("키/발신번호 미설정 — 미리보기만 생성 (실발송 생략)")
      else if (data.ok) toast.success("테스트 문자를 발송했습니다.")
      else toast.error(`발송 실패: ${data.detail}`)
    },
    onError: () => toast.error("테스트 발송 실패"),
  })

  const runNow = useMutation({
    mutationFn: () => notificationsApi.runCleaning(),
    onSuccess: ({ data }) =>
      toast.success(`오늘 입실 ${data.candidates}건 중 ${data.sent}건 발송 (스킵 ${data.skipped}, 실패 ${data.failed})`),
    onError: () => toast.error("일괄 발송 실패"),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-1">청소 알림</h1>
      <p className="text-sm text-gray-500 mb-6">
        게스트 입실일에 매물별 청소 담당자에게 청소 일정(퇴실일)을 문자로 자동 발송합니다.
      </p>

      {/* 활성화 토글 */}
      <label className="flex items-center justify-between border rounded-xl px-4 py-3.5 mb-6 cursor-pointer">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <div>
            <div className="text-sm font-medium text-gray-900">자동 청소 알림</div>
            <div className="text-xs text-gray-500">매일 오전 8시, 오늘 입실 예약 기준 발송</div>
          </div>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-5 h-5 accent-blue-600"
        />
      </label>

      {/* 솔라피 연동 */}
      <div className="space-y-4">
        <div className="text-sm font-semibold text-gray-900">솔라피(Solapi) 연동</div>
        <p className="text-xs text-gray-400 -mt-2">
          solapi.com 콘솔에서 API Key/Secret을 발급하고, 발신번호를 사전 등록하세요.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">API Key</label>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="NCS..."
            className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            API Secret <span className="text-gray-400 font-normal">(저장 시에만 입력)</span>
          </label>
          <input
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            type="password"
            placeholder="••••••• (변경 시에만 입력)"
            className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">발신번호</label>
          <input
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            type="tel"
            placeholder="025550000 (사전 등록된 번호)"
            className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 메시지 템플릿 */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4" /> 메시지 템플릿
        </label>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={6}
          className="w-full border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">
          변수: <code>{"{room}"}</code> 매물명, <code>{"{checkin}"}</code> 입실일,{" "}
          <code>{"{checkout}"}</code> 퇴실일(청소예정), <code>{"{guest}"}</code> 게스트
        </p>
      </div>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="mt-6 flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        설정 저장
      </button>

      {/* 테스트 / 즉시 발송 */}
      <div className="mt-8 pt-6 border-t space-y-3">
        <div className="text-sm font-semibold text-gray-900">테스트 / 수동 발송</div>
        <div className="flex gap-2">
          <input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            type="tel"
            placeholder="테스트 받을 번호 010-..."
            className="flex-1 border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => sendTest.mutate()}
            disabled={sendTest.isPending || !testTo}
            className="flex items-center gap-1.5 border border-blue-200 text-blue-600 px-4 rounded-lg text-sm hover:bg-blue-50 disabled:opacity-50"
          >
            {sendTest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            테스트
          </button>
        </div>
        <button
          onClick={() => runNow.mutate()}
          disabled={runNow.isPending}
          className="text-sm text-gray-600 underline disabled:opacity-50"
        >
          오늘 입실 예약 청소 알림 지금 일괄 발송
        </button>
      </div>
    </div>
  )
}
