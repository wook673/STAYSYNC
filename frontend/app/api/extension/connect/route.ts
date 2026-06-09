import { NextResponse } from "next/server"

// Mock: 확장이 보낸 "연결 요청"(세션 토큰) 수신 — 로컬 테스트용
// 실제 백엔드: POST /api/extension/connect (토큰 저장)
export async function POST(req: Request) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {}

  const platform = body?.platform || "unknown"
  const credCount = body?.credentials ? Object.keys(body.credentials).length : 0

  // 토큰 후보가 하나도 없으면 "플랫폼 로그인 필요"로 응답
  if (credCount === 0) {
    return NextResponse.json(
      { ok: false, needLogin: true, error: "플랫폼 세션을 찾지 못했습니다. 먼저 로그인하세요." },
      { status: 422 }
    )
  }

  return NextResponse.json({
    ok: true,
    platform,
    connection_id: `mock-${platform}-${Date.now()}`,
    auto_maintain: !!body?.auto_maintain,
    received_keys: credCount,
    message: "[MOCK] 연결 수신 완료 — 실제 백엔드라면 토큰을 저장하고 동기화를 시작합니다.",
  })
}
