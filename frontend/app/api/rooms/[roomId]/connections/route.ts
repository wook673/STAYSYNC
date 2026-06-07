import { NextResponse } from "next/server"
import { PLATFORM_COLORS } from "@/lib/utils"

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  const body = await req.json()
  return NextResponse.json({
    id: `conn-${Date.now()}`,
    platform: body.platform,
    nickname: body.nickname || null,
    has_ical: true,
    last_synced_at: null,
    sync_error: null,
    color: (PLATFORM_COLORS as any)[body.platform] || "#95A5A6",
  })
}
