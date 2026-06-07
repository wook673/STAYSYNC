import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    id: "demo-user-id",
    email: "demo@staysync.kr",
    name: "데모 호스트",
    phone: "010-1234-5678",
    plan: "trial",
    trial_ends_at: new Date(Date.now() + 10 * 86400000).toISOString(),
  })
}
