"use client"
/**
 * 방(Y축) × 날짜(X축) 타임라인 그리드 — 채널매니저 스타일
 * - 여러 방을 한눈에, 예약을 가로 막대로 표시
 * - 퇴실일 포함(inclusive)으로 렌더 → 주간 연속 예약이 끊기지 않음
 */
import { useMemo } from "react"
import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDate, getDaysInMonth,
  isSameDay, parseISO, format, isWeekend,
} from "date-fns"
import { ko } from "date-fns/locale"
import { PLATFORM_LABELS, PLATFORM_COLORS } from "@/lib/utils"

const DAY_W = 40 // px per day column
const BAR_H = 26 // px per booking bar
const LANE_GAP = 4

type Ev = any

function clampCol(d: Date, monthStart: Date, days: number) {
  // 1-based column index within month, clamped
  if (d < monthStart) return 1
  const c = getDate(d)
  return Math.min(Math.max(c, 1), days)
}

export function RoomTimeline({
  rooms, events, currentDate, onEventClick,
}: {
  rooms: any[]
  events: Ev[]
  currentDate: Date
  onEventClick?: (ev: Ev) => void
}) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const days = getDaysInMonth(currentDate)
  const dayList = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const today = new Date()

  // 방별 예약 + 레인(겹침 쌓기) 계산
  const roomRows = useMemo(() => {
    return rooms.map((room) => {
      const evs = events
        .filter((e) => (e.extendedProps?.room_id || e.room_id) === room.id)
        .map((e) => {
          const s = parseISO(e.start)
          const en = parseISO(e.end)
          return { ev: e, start: s, end: en }
        })
        .sort((a, b) => a.start.getTime() - b.start.getTime())

      // 그리디 레인 배정 (겹치면 다음 레인)
      const lanes: { end: Date }[] = []
      const placed = evs.map((it) => {
        let lane = lanes.findIndex((l) => l.end <= it.start)
        if (lane === -1) { lanes.push({ end: it.end }); lane = lanes.length - 1 }
        else lanes[lane].end = it.end
        return { ...it, lane }
      })
      return { room, placed, laneCount: Math.max(1, lanes.length) }
    })
  }, [rooms, events])

  const gridW = days * DAY_W

  return (
    <div className="overflow-x-auto border rounded-xl bg-white">
      <div style={{ minWidth: 180 + gridW }}>
        {/* 헤더: 날짜 */}
        <div className="flex sticky top-0 z-20 bg-white border-b">
          <div className="w-[180px] flex-shrink-0 px-3 py-2 text-xs font-semibold text-gray-500 border-r bg-gray-50">
            숙소 \ 날짜
          </div>
          <div className="flex" style={{ width: gridW }}>
            {dayList.map((d) => {
              const isToday = isSameDay(d, today)
              return (
                <div
                  key={d.toISOString()}
                  className={`flex-shrink-0 text-center py-1 border-r text-[11px] ${
                    isWeekend(d) ? "bg-gray-50" : ""
                  } ${isToday ? "bg-[#fff1f3]" : ""}`}
                  style={{ width: DAY_W }}
                >
                  <div className="text-gray-400">{format(d, "EEEEE", { locale: ko })}</div>
                  <div className={`font-medium ${isToday ? "text-[#ff385c]" : "text-gray-700"}`}>
                    {getDate(d)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 방별 행 */}
        {roomRows.map(({ room, placed, laneCount }) => {
          const rowH = laneCount * (BAR_H + LANE_GAP) + LANE_GAP
          return (
            <div key={room.id} className="flex border-b last:border-b-0">
              {/* 방 이름 (sticky 좌측) */}
              <div
                className="w-[180px] flex-shrink-0 px-3 py-2 border-r bg-white sticky left-0 z-10 flex items-center gap-2"
                style={{ minHeight: rowH }}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: room.color }} />
                <span className="text-sm font-medium text-gray-800 truncate">{room.name}</span>
              </div>

              {/* 날짜 그리드 + 예약 막대 */}
              <div className="relative" style={{ width: gridW, height: rowH }}>
                {/* 배경 날짜 칸 */}
                <div className="absolute inset-0 flex">
                  {dayList.map((d) => (
                    <div
                      key={d.toISOString()}
                      className={`flex-shrink-0 border-r ${isWeekend(d) ? "bg-gray-50/60" : ""} ${
                        isSameDay(d, today) ? "bg-[#fff1f3]/60" : ""
                      }`}
                      style={{ width: DAY_W }}
                    />
                  ))}
                </div>

                {/* 예약 막대 (퇴실일 포함 inclusive) */}
                {placed.map(({ ev, start, end, lane }) => {
                  const startCol = clampCol(start, monthStart, days)
                  const endCol = clampCol(end, monthStart, days) // 퇴실일 포함
                  const left = (startCol - 1) * DAY_W
                  const width = Math.max(DAY_W, (endCol - startCol + 1) * DAY_W) - 4
                  const platform = ev.extendedProps?.platform || ev.platform
                  const color = PLATFORM_COLORS[platform] || ev.backgroundColor || "#888"
                  const label = ev.extendedProps?.summary || ev.title || "예약"
                  return (
                    <div
                      key={ev.id}
                      onClick={() => onEventClick?.(ev)}
                      title={`${PLATFORM_LABELS[platform] || platform} · ${label}\n${format(start, "M/d")} ~ ${format(end, "M/d")}`}
                      className="absolute rounded-md text-white text-[11px] font-medium px-2 flex items-center cursor-pointer overflow-hidden whitespace-nowrap shadow-sm hover:brightness-110"
                      style={{
                        left: left + 2,
                        width,
                        top: LANE_GAP + lane * (BAR_H + LANE_GAP),
                        height: BAR_H,
                        background: color,
                      }}
                    >
                      {label}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {roomRows.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            등록된 방이 없습니다. 방을 추가하세요.
          </div>
        )}
      </div>
    </div>
  )
}
