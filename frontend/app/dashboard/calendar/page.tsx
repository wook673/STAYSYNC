"use client"
import { useEffect, useRef, useState } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import interactionPlugin from "@fullcalendar/interaction"
import { useQuery } from "@tanstack/react-query"
import { format, startOfMonth, endOfMonth, addMonths } from "date-fns"
import { ko } from "date-fns/locale"
import { RefreshCw, AlertTriangle, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { calendarApi, roomsApi } from "@/lib/api"
import { useCalendarStore } from "@/lib/store"
import { PLATFORM_LABELS, PLATFORM_COLORS } from "@/lib/utils"
import { BookingDetailPanel } from "@/components/calendar/BookingDetailPanel"
import { ManualBookingModal } from "@/components/calendar/ManualBookingModal"

export default function CalendarPage() {
  const calendarRef = useRef<any>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [showManualModal, setShowManualModal] = useState(false)
  const { selectedRoomIds, toggleRoom, setAllRooms } = useCalendarStore()

  // 방 목록
  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms"],
    queryFn: () => roomsApi.list().then((r) => r.data),
  })

  useEffect(() => {
    if (rooms.length > 0 && selectedRoomIds.length === 0) {
      setAllRooms(rooms.map((r: any) => r.id))
    }
  }, [rooms])

  // 캘린더 이벤트
  const start = format(startOfMonth(currentDate), "yyyy-MM-dd")
  const end = format(endOfMonth(addMonths(currentDate, 1)), "yyyy-MM-dd")

  const { data: events = [], refetch } = useQuery({
    queryKey: ["calendar-events", start, end, selectedRoomIds],
    queryFn: () =>
      calendarApi.events({ start, end, room_ids: selectedRoomIds }).then((r) => r.data),
    enabled: selectedRoomIds.length > 0,
  })

  // 충돌 감지
  const { data: conflicts = [] } = useQuery({
    queryKey: ["conflicts"],
    queryFn: () => calendarApi.conflicts().then((r) => r.data),
    refetchInterval: 60000, // 1분마다
  })

  return (
    <div className="flex h-full">
      {/* 왼쪽: 방 필터 사이드 패널 */}
      <div className="w-52 border-r bg-white p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">방 필터</h3>
          <button
            onClick={() => refetch()}
            className="text-gray-400 hover:text-gray-600"
            title="새로고침"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-1.5">
          {rooms.map((room: any) => (
            <button
              key={room.id}
              onClick={() => toggleRoom(room.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                selectedRoomIds.includes(room.id)
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: room.color }}
              />
              <span className="truncate">{room.name}</span>
            </button>
          ))}
        </div>

        {/* 플랫폼 범례 */}
        <div className="mt-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">플랫폼</h3>
          <div className="space-y-1.5">
            {Object.entries(PLATFORM_LABELS)
              .filter(([key]) => key !== "manual")
              .map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: PLATFORM_COLORS[key] }}
                  />
                  <span className="text-xs text-gray-600">{label}</span>
                </div>
              ))}
          </div>
        </div>

        {/* 수동 예약 추가 버튼 (야놀자/여기어때 대응) */}
        <div className="mt-6">
          <button
            onClick={() => setShowManualModal(true)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg py-2 hover:bg-blue-50"
          >
            <Plus className="w-3.5 h-3.5" />
            수동 예약 추가
          </button>
          <p className="text-xs text-gray-400 mt-1 text-center">야놀자·여기어때 등</p>
        </div>
      </div>

      {/* 메인 캘린더 영역 */}
      <div className="flex-1 flex flex-col">
        {/* 이중예약 경고 배너 */}
        {conflicts.length > 0 && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="text-sm text-red-700 font-medium">
              이중예약 {conflicts.length}건 감지됨
            </span>
            <span className="text-sm text-red-600">— 즉시 확인하고 조치하세요.</span>
          </div>
        )}

        <div className="flex-1 p-6">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale="ko"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,dayGridWeek",
            }}
            events={events}
            eventClick={(info) => setSelectedEvent(info.event)}
            datesSet={(info) => setCurrentDate(info.start)}
            height="100%"
            eventDisplay="block"
            dayMaxEvents={3}
            moreLinkText={(n) => `+${n}개`}
            buttonText={{ today: "오늘", month: "월", week: "주" }}
            eventContent={(arg) => (
              <div className="px-1 py-0.5 text-xs truncate text-white font-medium">
                {arg.event.title}
              </div>
            )}
          />
        </div>
      </div>

      {/* 예약 상세 패널 */}
      {selectedEvent && (
        <BookingDetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onRefresh={refetch}
        />
      )}

      {/* 수동 예약 모달 */}
      {showManualModal && (
        <ManualBookingModal
          rooms={rooms}
          onClose={() => setShowManualModal(false)}
          onSuccess={() => {
            setShowManualModal(false)
            refetch()
            toast.success("예약이 추가되었습니다.")
          }}
        />
      )}
    </div>
  )
}
