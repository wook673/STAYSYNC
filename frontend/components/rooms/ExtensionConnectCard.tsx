"use client"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Puzzle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react"
import { extensionApi } from "@/lib/api"
import { format } from "date-fns"
import { ko } from "date-fns/locale"

// 확장으로만 연결되는(공식 API 부재) 플랫폼
const EXT_PLATFORMS: Record<string, { label: string; color: string; text?: string; auto: boolean }> = {
  "33m2": { label: "33m2", color: "#242424", text: "#fff", auto: true },
  ncostay: { label: "엔코스테이", color: "#f8e585", text: "#2a2410", auto: false },
  liveanywhere: { label: "리브애니웨어", color: "#1fadff", text: "#fff", auto: false },
  zaritalk: { label: "자리톡", color: "#5B8DEF", text: "#fff", auto: true },
  zigbang: { label: "직방", color: "#FF6F0F", text: "#fff", auto: false },
}

// 확장 Chrome Web Store / 개발자 설치 안내 URL (배포 시 교체)
const EXTENSION_INSTALL_URL =
  process.env.NEXT_PUBLIC_EXTENSION_URL || "https://chromewebstore.google.com/"

export function ExtensionConnectCard() {
  const [open, setOpen] = useState(true)

  const { data: conns = [], refetch, isFetching } = useQuery({
    queryKey: ["extension-connections"],
    queryFn: () => extensionApi.connections().then((r) => r.data),
    refetchInterval: 60000,
  })

  const byPlatform: Record<string, any> = {}
  for (const c of conns) byPlatform[c.platform] = c
  const reauthCount = conns.filter((c: any) => c.needs_reauth).length

  return (
    <div className="bg-white border rounded-2xl overflow-hidden mb-4">
      {/* 헤더 */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#fff1f3] flex items-center justify-center">
            <Puzzle className="w-5 h-5 text-[#ff385c]" />
          </div>
          <div>
            <div className="font-semibold text-gray-900 flex items-center gap-2">
              확장으로 연결
              {reauthCount > 0 && (
                <span className="text-xs font-medium bg-[#fff1f3] text-[#99002e] px-2 py-0.5 rounded-full">
                  재연결 {reauthCount}건
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              API가 없는 33m2·자리톡·엔코·리브애니웨어·직방을 내 세션으로 연결
            </div>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </div>

      {open && (
        <div className="border-t">
          {/* 플랫폼 상태 그리드 */}
          <div className="p-4 grid sm:grid-cols-2 gap-2.5">
            {Object.entries(EXT_PLATFORMS).map(([key, p]) => {
              const conn = byPlatform[key]
              const connected = !!conn && !conn.needs_reauth
              const needsReauth = !!conn?.needs_reauth
              return (
                <div
                  key={key}
                  className="flex items-center justify-between border rounded-xl px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="text-xs font-bold px-2 py-1 rounded-md flex-shrink-0"
                      style={{ backgroundColor: p.color, color: p.text || "#fff" }}
                    >
                      {p.label}
                    </span>
                    <div className="min-w-0">
                      {connected && (
                        <div className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {conn.last_synced_at
                            ? format(new Date(conn.last_synced_at), "M/d HH:mm 동기화", { locale: ko })
                            : "연결됨"}
                        </div>
                      )}
                      {needsReauth && (
                        <div className="text-xs text-[#e00b41] flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          인증 만료 — 재연결 필요
                        </div>
                      )}
                      {!conn && (
                        <div className="text-xs text-gray-400">
                          미연결 {p.auto ? "· 자동유지" : "· 만료시 재연결"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 안내 + CTA */}
          <div className="px-4 pb-4">
            <div className="bg-[#f8f9fa] rounded-xl p-3.5 text-xs text-gray-600 leading-relaxed">
              <p className="font-medium text-gray-800 mb-1.5">연결 방법</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>staySync 확장 프로그램을 Chrome에 설치</li>
                <li>각 플랫폼에 <b>내 계정으로 로그인</b></li>
                <li>확장 팝업을 열고 플랫폼별 <b>연결</b> 클릭</li>
              </ol>
              <p className="mt-2 text-gray-400">
                ※ 비밀번호는 수집하지 않으며, 이미 로그인된 내 세션 토큰만 전달됩니다.
              </p>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <a
                href={EXTENSION_INSTALL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#111111] text-white text-sm font-semibold rounded-lg py-2.5 hover:bg-[#242424]"
              >
                <Puzzle className="w-4 h-4" />
                확장 설치
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex items-center justify-center gap-1.5 border text-sm text-gray-600 rounded-lg px-4 py-2.5 hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                상태 새로고침
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
