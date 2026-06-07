import { create } from "zustand"
import { persist } from "zustand/middleware"

interface User {
  id: string
  email: string
  name: string
  phone?: string
  plan: "trial" | "basic" | "pro"
  trial_ends_at?: string
}

interface AuthStore {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem("access_token", token)
        set({ user, token })
      },
      logout: () => {
        localStorage.removeItem("access_token")
        set({ user: null, token: null })
      },
    }),
    { name: "auth-store" }
  )
)

// 캘린더 필터 상태
interface CalendarStore {
  selectedRoomIds: string[]
  toggleRoom: (id: string) => void
  setAllRooms: (ids: string[]) => void
}

export const useCalendarStore = create<CalendarStore>((set) => ({
  selectedRoomIds: [],
  toggleRoom: (id) =>
    set((state) => ({
      selectedRoomIds: state.selectedRoomIds.includes(id)
        ? state.selectedRoomIds.filter((r) => r !== id)
        : [...state.selectedRoomIds, id],
    })),
  setAllRooms: (ids) => set({ selectedRoomIds: ids }),
}))
