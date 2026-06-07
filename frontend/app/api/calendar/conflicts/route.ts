import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json([
    {
      id: "conflict-1",
      room_id: "room-1",
      booking_id_1: "e2",
      booking_id_2: "e8",
      detected_at: new Date().toISOString(),
    },
  ])
}
