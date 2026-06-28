"use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, RefreshCw, Wifi, WifiOff, ChevronDown, ChevronUp, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { roomsApi, calendarApi } from "@/lib/api"
import { PLATFORM_LABELS, PLATFORM_COLORS, ICAL_GUIDES } from "@/lib/utils"
import { AddRoomModal } from "@/components/rooms/AddRoomModal"
import { AddConnectionModal } from "@/components/rooms/AddConnectionModal"
import { ExtensionConnectCard } from "@/components/rooms/ExtensionConnectCard"
import { format } from "date-fns"
import { ko } from "date-fns/locale"

export default function RoomsPage() {
  const qc = useQueryClient()
  const [showAddRoom, setShowAddRoom] = useState(false)
  const [addConnectionRoom, setAddConnectionRoom] = useState<string | null>(null)
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set())
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["rooms"],
    queryFn: () => roomsApi.list().then((r) => r.data),
  })

  const toggleExpand = (id: string) => {
    setExpandedRooms((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSync = async (connectionId: string) => {
    setSyncingId(connectionId)
    try {
      const res = await calendarApi.sync(connectionId)
      toast.success(
        `동기화 완료: +${res.data.added}건 추가, ~${res.data.updated}건 업데이트${
          res.data.conflicts > 0 ? ` ⚠️ 충돌 ${res.data.conflicts}건` : ""
        }`
      )
      qc.invalidateQueries({ queryKey: ["rooms"] })
      qc.invalidateQueries({ queryKey: ["calendar-events"] })
    } catch {
      toast.error("동기화에 실패했습니다.")
    } finally {
      setSyncingId(null)
    }
  }

  const handleDeleteRoom = async (roomId: string, name: string) => {
    if (!confirm(`'${name}' 매물을 삭제하시겠습니까?\n연결된 플랫폼과 예약 데이터도 함께 숨겨집니다.`)) return
    try {
      await roomsApi.delete(roomId)
      qc.invalidateQueries({ queryKey: ["rooms"] })
      qc.invalidateQueries({ queryKey: ["calendar-events"] })
      toast.success("매물이 삭제되었습니다.")
    } catch {
      toast.error("삭제에 실패했습니다.")
    }
  }

  const handleRemoveConnection = async (roomId: string, connId: string) => {
    if (!confirm("이 플랫폼 연결을 삭제하시겠습니까?")) return
    try {
      await roomsApi.removeConnection(roomId, connId)
      qc.invalidateQueries({ queryKey: ["rooms"] })
      toast.success("연결이 삭제되었습니다.")
    } catch {
      toast.error("삭제에 실패했습니다.")
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">방 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">방을 등록하고 플랫폼을 연결하세요</p>
        </div>
        <button
          onClick={() => setShowAddRoom(true)}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm px-4 py-2.5 rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          방 추가
        </button>
      </div>

      {/* 확장 기반 연결 (33m2·엔코·리브애니웨어·자리톡) */}
      <ExtensionConnectCard />

      {rooms.length === 0 ? (
        <div className="border-2 border-dashed rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">🏠</div>
          <h3 className="font-semibold text-gray-900 mb-1">아직 등록된 방이 없어요</h3>
          <p className="text-sm text-gray-500 mb-4">방을 추가하고 플랫폼을 연결하세요</p>
          <button
            onClick={() => setShowAddRoom(true)}
            className="bg-blue-600 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-blue-700"
          >
            첫 번째 방 추가하기
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {rooms.map((room: any) => (
            <div key={room.id} className="bg-white border rounded-2xl overflow-hidden">
              {/* 방 헤더 */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleExpand(room.id)}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: room.color }}
                  />
                  <div>
                    <div className="font-semibold text-gray-900">{room.name}</div>
                    {room.address && (
                      <div className="text-xs text-gray-500 mt-0.5">{room.address}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {room.connections.length}개 연결됨
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteRoom(room.id, room.name)
                    }}
                    title="매물 삭제"
                    className="text-gray-300 hover:text-red-500 transition-colors p-1 -m-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expandedRooms.has(room.id)
                    ? <ChevronUp className="w-4 h-4 text-gray-400" />
                    : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {/* 연결 목록 */}
              {expandedRooms.has(room.id) && (
                <div className="border-t">
                  {room.connections.map((conn: any) => (
                    <div
                      key={conn.id}
                      className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: conn.color }}
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {PLATFORM_LABELS[conn.platform] || conn.platform}
                          </div>
                          {conn.last_synced_at && (
                            <div className="text-xs text-gray-400">
                              {format(new Date(conn.last_synced_at), "M/d HH:mm 동기화", { locale: ko })}
                            </div>
                          )}
                          {conn.sync_error && (
                            <div className="text-xs text-red-500">{conn.sync_error}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {conn.has_ical ? (
                          <Wifi className="w-4 h-4 text-green-500" />
                        ) : (
                          <WifiOff className="w-4 h-4 text-gray-400" />
                        )}
                        <button
                          onClick={() => handleSync(conn.id)}
                          disabled={syncingId === conn.id}
                          className="text-xs text-blue-600 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 disabled:opacity-50 flex items-center gap-1"
                        >
                          {syncingId === conn.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <RefreshCw className="w-3 h-3" />}
                          동기화
                        </button>
                        <button
                          onClick={() => handleRemoveConnection(room.id, conn.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* 플랫폼 추가 버튼 */}
                  <div className="p-3">
                    <button
                      onClick={() => setAddConnectionRoom(room.id)}
                      className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 border border-dashed rounded-lg py-2.5 hover:bg-gray-50 hover:text-gray-700"
                    >
                      <Plus className="w-4 h-4" />
                      플랫폼 연결 추가
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddRoom && (
        <AddRoomModal
          onClose={() => setShowAddRoom(false)}
          onSuccess={() => {
            setShowAddRoom(false)
            qc.invalidateQueries({ queryKey: ["rooms"] })
          }}
        />
      )}

      {addConnectionRoom && (
        <AddConnectionModal
          roomId={addConnectionRoom}
          onClose={() => setAddConnectionRoom(null)}
          onSuccess={() => {
            setAddConnectionRoom(null)
            qc.invalidateQueries({ queryKey: ["rooms"] })
          }}
        />
      )}
    </div>
  )
}
