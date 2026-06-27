"use client"
/**
 * 방(Y축) × 날짜(X축) 타임라인 그리드 — 채널매니저 스타일
 * - 여러 달이 끊김 없이 이어지는 연속 스트립 (월 경계는 라벨/구분선만)
 * - 오늘 기준: 과거는 회색 음영, 오늘은 Rausch 틴트, 미래는 흰색
 * - 예약은 퇴실일 포함(inclusive) 가로 막대
 */
import { useMemo, useRef, useEffect } from "react"
import {
  startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval,
  getDate, getMonth, differenceInCalendarDays, isSameDay, parseISO,
  format, isWeekend, startOfDay,
} from "date-fns"
import { ko } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { PLATFORM_LABELS, PLATFORM_COLORS } from "@/lib/utils"

const DAY_W = 40
const BAR_H = 26
const LANE_GAP = 4
const LEFT_W = 180

type Ev = any

// 날짜 셀 배경 (오늘 기준 음영)
function cellBg(d: Date, today: Date) {
  if (isSameDay(d, today)) return "#ffe1e7"          // 오늘 — Rausch 틴트(진하게)
  if (d < today) return isWeekend(d) ? "#eceae6" : "#f3f1ee" // 과거 — 회색
  return isWeekend(d) ? "#f7f7f5" : "#ffffff"         // 미래 — 흰색(주말 살짝)
}

export function RoomTimeline({
  rooms, events, currentDate, onEventClick, onCellClick,
}: {
  rooms: any[]
  events: Ev[]
  currentDate: Date
  onEventClick?: (ev: Ev) => void
  onCellClick?: (roomId: string, roomName: string, date: Date) => void
}) {
  // 연속 범위: 직전 달 1일 ~ +2달 말일 (약 4개월)
  const rangeStart = startOfMonth(subMonths(currentDate, 1))
  const rangeEnd = endOfMonth(addMonths(currentDate, 2))
  const dayList = useMemo(() => eachDayOfInterval({ start: rangeStart, end: rangeEnd }), [
    rangeStart.getTime(), rangeEnd.getTime(),
  ])
  const days = dayList.length
  const gridW = days * DAY_W
  const today = startOfDay(new Date())
  const col = (d: Date) => differenceInCalendarDays(d, rangeStart)

  // 월 구분 헤더 세그먼트
  const monthSegs = useMemo(() => {
    const segs: { label: string; count: number }[] = []
    for (const d of dayList) {
      const label = format(d, "yyyy년 M월", { locale: ko })
      const last = segs[segs.length - 1]
      if (last && last.label === label) last.count++
      else segs.push({ label, count: 1 })
    }
    return segs
  }, [days, rangeStart.getTime()])

  // 방별 예약 + 레인(겹침 쌓기)
  const roomRows = useMemo(() => {
    return rooms.map((room) => {
      const evs = events
        .filter((e) => (e.extendedProps?.room_id || e.room_id) === room.id)
        .map((e) => ({ ev: e, start: parseISO(e.start), end: parseISO(e.end) }))
        .sort((a, b) => a.start.getTime() - b.start.getTime())
      const lanes: { end: Date }[] = []
      const placed = evs.map((it) => {
        let lane = lanes.findIndex((l) => l.end <= it.start)
        if (lane === -1) { lanes.push({ end: it.end }); lane = lanes.length - 1 }
        else lanes[lane].end = it.end
        return { ...it, lane }
      })
      return { room, placed, laneCount: Math.max(1, lanes.length) }
    })
  }, [rooms, events, days])

  // 오늘이 화면 왼쪽 1/4쯤 오도록 자동 스크롤
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const tc = col(today)
    if (scrollRef.current && tc >= 0 && tc < days) {
      scrollRef.current.scrollLeft = Math.max(0, tc * DAY_W - 120)
    }
  }, [days, rangeStart.getTime()])

  const scrollBy = (dir: number) =>
    scrollRef.current?.scrollBy({ left: dir * DAY_W * 7, behavior: "smooth" })

  return (
    <div className="relative">
      <button onClick={() => scrollBy(-1)} aria-label="이전 날짜"
        className="absolute z-30 w-8 h-8 rounded-full bg-white border shadow-md flex items-center justify-center hover:bg-gray-50"
        style={{ left: LEFT_W + 6, top: "50%", transform: "translateY(-50%)" }}>
        <ChevronLeft className="w-4 h-4 text-gray-600" />
      </button>
      <button onClick={() => scrollBy(1)} aria-label="다음 날짜"
        className="absolute right-2 z-30 w-8 h-8 rounded-full bg-white border shadow-md flex items-center justify-center hover:bg-gray-50"
        style={{ top: "50%", transform: "translateY(-50%)" }}>
        <ChevronRight className="w-4 h-4 text-gray-600" />
      </button>

      <div ref={scrollRef} className="overflow-x-auto border rounded-xl bg-white">
        <div style={{ minWidth: LEFT_W + gridW }}>
          {/* 헤더 */}
          <div className="flex sticky top-0 z-20 bg-white border-b">
            <div className="flex-shrink-0 border-r bg-gray-50 sticky left-0 z-10 flex items-end px-3 py-1 text-xs font-semibold text-gray-500"
              style={{ width: LEFT_W }}>
              숙소 \ 날짜
            </div>
            <div style={{ width: gridW }}>
              {/* 월 라벨 줄 */}
              <div className="flex border-b">
                {monthSegs.map((s, i) => (
                  <div key={i} className="flex-shrink-0 text-xs font-semibold text-gray-700 px-2 py-1 border-r border-gray-200"
                    style={{ width: s.count * DAY_W }}>
                    {s.label}
                  </div>
                ))}
              </div>
              {/* 일자 줄 */}
              <div className="flex">
                {dayList.map((d) => {
                  const isToday = isSameDay(d, today)
                  const monthStart = getDate(d) === 1
                  return (
                    <div key={d.toISOString()} className="flex-shrink-0 text-center py-1 text-[11px]"
                      style={{ width: DAY_W, background: cellBg(d, today),
                        borderRight: "1px solid #f1f1ef",
                        borderLeft: monthStart ? "1px solid #d4d4d4" : undefined }}>
                      <div className="text-gray-400">{format(d, "EEEEE", { locale: ko })}</div>
                      <div className={isToday ? "font-bold text-[#ff385c]" : "font-medium text-gray-700"}>
                        {getDate(d)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 방별 행 */}
          {roomRows.map(({ room, placed, laneCount }) => {
            const rowH = laneCount * (BAR_H + LANE_GAP) + LANE_GAP
            return (
              <div key={room.id} className="flex border-b last:border-b-0">
                <div className="flex-shrink-0 px-3 py-2 border-r bg-white sticky left-0 z-10 flex items-center gap-2"
                  style={{ width: LEFT_W, minHeight: rowH }}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: room.color }} />
                  <span className="text-sm font-medium text-gray-800 truncate">{room.name}</span>
                </div>
                <div className="relative" style={{ width: gridW, height: rowH }}>
                  {/* 배경 날짜 칸 (오늘 기준 음영, 클릭 시 등록 모달) */}
                  <div className="absolute inset-0 flex">
                    {dayList.map((d) => (
                      <div key={d.toISOString()} className="flex-shrink-0 cursor-pointer hover:bg-[#fff1f3]"
                        title={`${room.name} · ${format(d, "M/d")} 등록`}
                        onClick={() => onCellClick?.(room.id, room.name, d)}
                        style={{ width: DAY_W, background: cellBg(d, today),
                          borderRight: "1px solid #f5f5f3",
                          borderLeft: getDate(d) === 1 ? "1px solid #d4d4d4" : undefined }} />
                    ))}
                  </div>
                  {/* 예약 막대 */}
                  {placed.map(({ ev, start, end, lane }) => {
                    const sCol = Math.max(0, col(start))
                    const eCol = Math.min(days - 1, col(end))
                    if (eCol < 0 || sCol > days - 1) return null
                    const left = sCol * DAY_W
                    const width = Math.max(DAY_W, (eCol - sCol + 1) * DAY_W) - 4
                    const platform = ev.extendedProps?.platform || ev.platform
                    const color = PLATFORM_COLORS[platform] || ev.backgroundColor || "#888"
                    const label = ev.extendedProps?.summary || ev.title || "예약"
                    return (
                      <div key={ev.id} onClick={() => onEventClick?.(ev)}
                        title={`${PLATFORM_LABELS[platform] || platform} · ${label}\n${format(start, "M/d")} ~ ${format(end, "M/d")}`}
                        className="absolute rounded-md text-white text-[11px] font-medium px-2 flex items-center cursor-pointer overflow-hidden whitespace-nowrap shadow-sm hover:brightness-110"
                        style={{ left: left + 2, width, top: LANE_GAP + lane * (BAR_H + LANE_GAP), height: BAR_H, background: color }}>
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
    </div>
  )
}
