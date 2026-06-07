import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const { email, password } = await req.json()
  if (!email || !password) {
    return NextResponse.json({ detail: "이메일과 비밀번호를 입력하세요" }, { status: 400 })
  }
  return NextResponse.json({
    access_token: "mock_token_demo_1234",
    token_type: "bearer",
    user: {
      id: "demo-user-id",
      email,
      name: "데모 호스트",
      phone: "010-1234-5678",
      plan: "trial",
      trial_ends_at: new Date(Date.now() + 10 * 86400000).toISOString(),
    },
  })
}
