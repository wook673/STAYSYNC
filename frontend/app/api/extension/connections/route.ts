import { NextResponse } from "next/server"

// Mock: 확장 기반 연결 상태 (데모용)
// 실제 백엔드: GET /api/extension/connections
export async function GET() {
  return NextResponse.json([
    {
      id: "ext-conn-1",
      platform: "33m2",
      auto_maintain: true,
      account_label: "wook673@host",
      last_synced_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      needs_reauth: false,
      sync_error: null,
    },
    {
      id: "ext-conn-2",
      platform: "ncostay",
      auto_maintain: false,
      account_label: "엔코 호스트",
      last_synced_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      needs_reauth: true,
      sync_error: "401 인증 만료 — 재연결 필요",
    },
  ])
}
