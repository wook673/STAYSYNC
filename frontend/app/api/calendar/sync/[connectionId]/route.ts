import { NextResponse } from "next/server"

export async function POST() {
  await new Promise(r => setTimeout(r, 800)) // 동기화 시뮬레이션
  return NextResponse.json({ added: 2, updated: 1, removed: 0, errors: [], conflicts: 0 })
}
