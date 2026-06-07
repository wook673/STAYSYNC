import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const { email, name, phone } = await req.json()
  return NextResponse.json({
    access_token: "mock_token_demo_1234",
    token_type: "bearer",
    user: {
      id: "demo-user-id",
      email,
      name: name || "데모 호스트",
      phone,
      plan: "trial",
      trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    },
  })
}
