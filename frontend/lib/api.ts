import axios from "axios"

const API_URL = process.env.NEXT_PUBLIC_API_URL || ""  // 빈 문자열 = 동일 origin (Next.js API Routes)

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
})

// JWT 자동 첨부
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token")
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 → 로그인 페이지 리다이렉트
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("access_token")
      window.location.href = "/auth/login"
    }
    return Promise.reject(err)
  }
)

// API 함수들
export const authApi = {
  signup: (data: { email: string; password: string; name: string; phone?: string }) =>
    api.post("/api/auth/signup", data),
  login: (data: { email: string; password: string }) =>
    api.post("/api/auth/login", data),
  me: () => api.get("/api/auth/me"),
}

export const roomsApi = {
  list: () => api.get("/api/rooms"),
  create: (data: { name: string; address?: string; color?: string }) =>
    api.post("/api/rooms", data),
  update: (id: string, data: Partial<{ name: string; address: string; color: string }>) =>
    api.patch(`/api/rooms/${id}`, data),
  delete: (id: string) => api.delete(`/api/rooms/${id}`),
  addConnection: (
    roomId: string,
    data: { platform: string; ical_url: string; nickname?: string }
  ) => api.post(`/api/rooms/${roomId}/connections`, data),
  removeConnection: (roomId: string, connectionId: string) =>
    api.delete(`/api/rooms/${roomId}/connections/${connectionId}`),
}

export const calendarApi = {
  events: (params: { start: string; end: string; room_ids?: string[] }) =>
    api.get("/api/calendar/events", { params }),
  conflicts: () => api.get("/api/calendar/conflicts"),
  sync: (connectionId: string) => api.post(`/api/calendar/sync/${connectionId}`),
  createBooking: (data: {
    room_id: string
    start_date: string
    end_date: string
    guest_name?: string
    guest_count?: number
    notes?: string
    summary?: string
  }) => api.post("/api/calendar/bookings", data),
  deleteBooking: (bookingId: string) => api.delete(`/api/calendar/bookings/${bookingId}`),
}

export const extensionApi = {
  // 확장 기반(33m2·엔코·리브애니웨어·자리톡) 연결 목록 + 재인증 필요 여부
  connections: () => api.get("/api/extension/connections"),
}

export const billingApi = {
  pricing: () => api.get("/api/billing/pricing"),
  subscribe: (authKey: string) => api.post("/api/billing/subscribe", { auth_key: authKey }),
  cancel: () => api.post("/api/billing/cancel"),
}
