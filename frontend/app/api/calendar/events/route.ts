import { NextResponse } from "next/server"

function d(offsetDays: number) {
  const dt = new Date()
  dt.setDate(dt.getDate() + offsetDays)
  return dt.toISOString().split("T")[0]
}

const DEMO_EVENTS = [
  // 강남 스튜디오 - 에어비앤비
  { id: "e1", title: "[에어비앤비] 김민준", start: d(-2), end: d(2), backgroundColor: "#FF5A5F", borderColor: "#FF5A5F",
    extendedProps: { room_id: "room-1", room_name: "강남 스튜디오 301호", platform: "airbnb", summary: "HM3K9P2", status: "confirmed", guest_name: "김민준", guest_count: 2, notes: "늦은 체크인 요청" }},
  { id: "e2", title: "[에어비앤비] Sarah K.", start: d(5), end: d(9), backgroundColor: "#FF5A5F", borderColor: "#FF5A5F",
    extendedProps: { room_id: "room-1", room_name: "강남 스튜디오 301호", platform: "airbnb", summary: "HM7X2Q5", status: "confirmed", guest_name: "Sarah K.", guest_count: 1 }},
  { id: "e3", title: "[자리톡] 이수아", start: d(12), end: d(17), backgroundColor: "#5B8DEF", borderColor: "#5B8DEF",
    extendedProps: { room_id: "room-1", room_name: "강남 스튜디오 301호", platform: "zaritalk", summary: "ZT-2024-8821", status: "confirmed", guest_name: "이수아", guest_count: 2 }},
  { id: "e4", title: "[에어비앤비] 차단", start: d(20), end: d(22), backgroundColor: "#FF5A5F", borderColor: "#FF5A5F",
    extendedProps: { room_id: "room-1", room_name: "강남 스튜디오 301호", platform: "airbnb", summary: "Blocked", status: "blocked" }},

  // 강남 스튜디오 - 이중예약 충돌!
  { id: "e8", title: "[자리톡] 정우성 ⚠️", start: d(5), end: d(8), backgroundColor: "#5B8DEF", borderColor: "#FF0000",
    extendedProps: { room_id: "room-1", room_name: "강남 스튜디오 301호", platform: "zaritalk", summary: "ZT-CONFLICT", status: "confirmed", guest_name: "정우성", guest_count: 2, notes: "⚠️ 이중예약 충돌!" }},

  // 홍대 원룸
  { id: "e5", title: "[위홈] 박지현", start: d(-1), end: d(4), backgroundColor: "#1EC782", borderColor: "#1EC782",
    extendedProps: { room_id: "room-2", room_name: "홍대 원룸 202호", platform: "wehome", summary: "WH-55432", status: "confirmed", guest_name: "박지현", guest_count: 3 }},
  { id: "e6", title: "[아고다] James L.", start: d(7), end: d(11), backgroundColor: "#EB1C24", borderColor: "#EB1C24",
    extendedProps: { room_id: "room-2", room_name: "홍대 원룸 202호", platform: "agoda", summary: "AG-9923441", status: "confirmed", guest_name: "James L.", guest_count: 2 }},
  { id: "e7", title: "[부킹닷컴] 최다은", start: d(14), end: d(18), backgroundColor: "#003580", borderColor: "#003580",
    extendedProps: { room_id: "room-2", room_name: "홍대 원룸 202호", platform: "bookingcom", summary: "BK-4421009", status: "confirmed", guest_name: "최다은", guest_count: 1 }},

  // 이태원 - 수동 예약
  { id: "e9", title: "[직접] 나영희", start: d(3), end: d(7), backgroundColor: "#95A5A6", borderColor: "#95A5A6",
    extendedProps: { room_id: "room-3", room_name: "이태원 복층 401호", platform: "manual", summary: "야놀자 수동 입력", status: "confirmed", guest_name: "나영희", guest_count: 4, notes: "야놀자 예약 수동 등록" }},
]

export async function GET() {
  return NextResponse.json(DEMO_EVENTS)
}
