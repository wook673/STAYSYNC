import { NextResponse } from "next/server"

// Mock: 확장 콘텐츠 스크립트가 DOM에서 추출해 보낸 예약 수신 — 로컬 테스트용
// 실제 백엔드: POST /api/extension/sync (예약 dedup/upsert + 충돌감지)
export async function POST(req: Request) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {}

  const platform = body?.platform || "unknown"
  const bookings = Array.isArray(body?.bookings) ? body.bookings : []

  // 받은 예약 개수만큼 added로 응답 (실제 백엔드는 dedup 후 added/updated 구분)
  return NextResponse.json({
    ok: true,
    platform,
    added: bookings.length,
    updated: 0,
    removed: 0,
    conflicts: 0,
    message: `[MOCK] ${platform} 예약 ${bookings.length}건 수신 완료.`,
  })
}
