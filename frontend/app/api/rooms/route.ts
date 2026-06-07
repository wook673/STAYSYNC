import { NextResponse } from "next/server"

const DEMO_ROOMS = [
  {
    id: "room-1",
    name: "강남 스튜디오 301호",
    address: "서울시 강남구 역삼동 123-4",
    color: "#3B82F6",
    connections: [
      {
        id: "conn-1",
        platform: "airbnb",
        nickname: "강남 모던 스튜디오",
        has_ical: true,
        last_synced_at: new Date(Date.now() - 12 * 60000).toISOString(),
        sync_error: null,
        color: "#FF5A5F",
      },
      {
        id: "conn-2",
        platform: "zaritalk",
        nickname: "자리톡 강남점",
        has_ical: true,
        last_synced_at: new Date(Date.now() - 8 * 60000).toISOString(),
        sync_error: null,
        color: "#5B8DEF",
      },
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: "room-2",
    name: "홍대 원룸 202호",
    address: "서울시 마포구 서교동 456-7",
    color: "#10B981",
    connections: [
      {
        id: "conn-3",
        platform: "wehome",
        nickname: "홍대 위홈",
        has_ical: true,
        last_synced_at: new Date(Date.now() - 5 * 60000).toISOString(),
        sync_error: null,
        color: "#1EC782",
      },
      {
        id: "conn-4",
        platform: "agoda",
        nickname: "홍대 아고다",
        has_ical: true,
        last_synced_at: new Date(Date.now() - 20 * 60000).toISOString(),
        sync_error: null,
        color: "#EB1C24",
      },
      {
        id: "conn-5",
        platform: "bookingcom",
        nickname: "홍대 부킹닷컴",
        has_ical: true,
        last_synced_at: new Date(Date.now() - 15 * 60000).toISOString(),
        sync_error: null,
        color: "#003580",
      },
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: "room-3",
    name: "이태원 복층 401호",
    address: "서울시 용산구 이태원동 789-1",
    color: "#F59E0B",
    connections: [
      {
        id: "conn-6",
        platform: "33m2",
        nickname: "삼삼엠투 이태원",
        has_ical: false,
        last_synced_at: null,
        sync_error: "iCal URL이 없습니다",
        color: "#F39C12",
      },
    ],
    created_at: new Date().toISOString(),
  },
]

export async function GET() {
  return NextResponse.json(DEMO_ROOMS)
}

export async function POST(req: Request) {
  const body = await req.json()
  const newRoom = {
    id: `room-${Date.now()}`,
    name: body.name,
    address: body.address || null,
    color: body.color || "#3B82F6",
    connections: [],
    created_at: new Date().toISOString(),
  }
  return NextResponse.json(newRoom)
}
