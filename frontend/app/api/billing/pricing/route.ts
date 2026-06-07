import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    plans: [
      { rooms: "1개", price_per_room: 7900, total: 7900 },
      { rooms: "2~9개", price_per_room: 5500, total: "5,500원 × 방 수" },
      { rooms: "10~20개", price_per_room: 4900, total: "4,900원 × 방 수" },
      { rooms: "21개+", price_per_room: null, total: "별도 협의" },
    ],
    trial_days: 14,
    note: "VAT 포함 금액",
  })
}
