"use client"
/**
 * 시장 분석 페이지 — 33m2 매물 예약률 분석
 * 확장 팝업의 market-analysis.js 로직을 대시보드 웹페이지로 포팅.
 * (실제 33m2 API는 확장/쿠키 필요 → 웹페이지는 샘플 데이터로 미리보기)
 */
import { useState, useEffect, useRef } from "react"
import { Search, MapPin, TrendingUp, Loader2, Star } from "lucide-react"

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function geocode(address: string) {
  const q = encodeURIComponent(address.includes("대한민국") ? address : address + " 대한민국")
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&accept-language=ko`, {
    headers: { Accept: "application/json" },
  })
  const data = await res.json()
  if (!data.length) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name }
}

const MOCK_NAMES = ["한강뷰 스튜디오", "합정 감성 원룸", "홍대 코지룸", "마포 모던 하우스", "연남동 아늑한 방",
  "신촌 게스트하우스", "이대 넓은 원룸", "망원 빈티지 스튜디오", "상수 레트로룸", "홍대입구 편리한 방",
  "합정역 도보 3분", "서교동 루프탑 있는 집"]

function genMock(lat: number, lng: number, radiusM: number) {
  return MOCK_NAMES.map((name, i) => {
    const angle = (i / MOCK_NAMES.length) * 2 * Math.PI
    const dist = 100 + Math.random() * (radiusM - 100)
    const latOff = ((dist * Math.cos(angle)) / 111000) * (0.7 + Math.random() * 0.6)
    const lngOff = ((dist * Math.sin(angle)) / 111000) * (0.7 + Math.random() * 0.6)
    return {
      id: `mock-${i}`, name, lat: lat + latOff, lng: lng + lngOff,
      price: Math.floor(40000 + Math.random() * 120000),
      occupancy: Math.floor(40 + Math.random() * 55),
      reviewCount: Math.floor(Math.random() * 120),
      distance: Math.round(haversineM(lat, lng, lat + latOff, lng + lngOff)),
    }
  })
}

function badge(occ: number) {
  if (occ >= 90) return { cls: "bg-green-100 text-green-700", bar: "#16a34a" }
  if (occ >= 70) return { cls: "bg-yellow-100 text-yellow-800", bar: "#ca8a04" }
  return { cls: "bg-gray-100 text-gray-600", bar: "#9ca3af" }
}

export default function MarketPage() {
  const [address, setAddress] = useState("서울 마포구 합정동")
  const [radius, setRadius] = useState(500)
  const [threshold, setThreshold] = useState(70)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState("")
  const [center, setCenter] = useState<any>(null)
  const [results, setResults] = useState<any[] | null>(null)

  const run = async () => {
    setLoading(true); setResults(null); setProgress("주소 변환 중...")
    try {
      // 지오코딩 실패 시 서울 중심 좌표로 폴백 (오프라인/차단 대비)
      const geo = (await geocode(address).catch(() => null))
        || { lat: 37.5495, lng: 126.9135, display: address }
      setCenter(geo)
      setProgress("33m2 매물 검색 중... (샘플 데이터)")
      await new Promise((r) => setTimeout(r, 500))
      const listings = genMock(geo.lat, geo.lng, radius)
        .filter((r) => r.distance <= radius && r.occupancy >= threshold)
        .sort((a, b) => b.occupancy - a.occupancy)
      setResults(listings)
      setProgress("")
    } catch (e) {
      setProgress("분석 실패 — 잠시 후 다시 시도하세요.")
    }
    setLoading(false)
  }

  // ?run=1 이면 자동 분석 (데모/캡처용)
  const auto = useRef(false)
  useEffect(() => {
    if (auto.current) return
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("run") === "1") {
      auto.current = true
      run()
    }
  }, [])

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#ff385c]" /> 시장 분석
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          관심 지역 반경 내 33m2 매물의 예약률을 분석해 입지를 판단하세요.
        </p>
      </div>

      {/* 입력 폼 */}
      <div className="bg-white border rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs text-gray-500">주소</label>
          <div className="flex items-center gap-2 border rounded-lg px-3 py-2 mt-1">
            <MapPin className="w-4 h-4 text-gray-400" />
            <input value={address} onChange={(e) => setAddress(e.target.value)}
              className="flex-1 outline-none text-sm" placeholder="예: 서울 마포구 합정동" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">반경</label>
          <select value={radius} onChange={(e) => setRadius(+e.target.value)}
            className="block mt-1 border rounded-lg px-3 py-2 text-sm font-medium">
            <option value={300}>300m</option><option value={500}>500m</option>
            <option value={1000}>1km</option><option value={2000}>2km</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">예약률</label>
          <select value={threshold} onChange={(e) => setThreshold(+e.target.value)}
            className="block mt-1 border rounded-lg px-3 py-2 text-sm font-medium">
            {[50, 60, 70, 80, 90].map((v) => <option key={v} value={v}>{v}%+</option>)}
          </select>
        </div>
        <button onClick={run} disabled={loading}
          className="bg-[#111] text-white text-sm font-semibold rounded-lg px-5 py-2.5 hover:bg-[#333] disabled:opacity-50 flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          분석하기
        </button>
      </div>

      {progress && <p className="text-sm text-gray-500 mt-3">{progress}</p>}

      {results && (
        <div className="mt-5">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 mb-3">
            ⚠️ 샘플 데이터 미리보기입니다. 확장 프로그램으로 33m2에 로그인하면 실제 매물·예약률이 표시됩니다.
            (33m2 내부 API 엔드포인트 확정 필요 — <span className="font-medium">docs/33m2-내부api-캡처가이드.md</span>)
          </div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900">
              예약률 {threshold}%+ 매물 {results.length}곳
              {center && <span className="text-gray-400 font-normal text-sm"> · {address} 반경 {radius}m</span>}
            </h3>
          </div>

          {/* 산점 시각화 (간이 지도) + 리스트 */}
          <div className="grid md:grid-cols-2 gap-4">
            <ScatterMap center={center} listings={results} radius={radius} />
            <ul className="space-y-2">
              {results.map((r) => {
                const b = badge(r.occupancy)
                return (
                  <li key={r.id} className="border rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm text-gray-900 truncate">{r.name}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${b.cls}`}>{r.occupancy}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full my-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${r.occupancy}%`, background: b.bar }} />
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>{r.price.toLocaleString()}원/박</span>
                      <span>· {r.distance}m</span>
                      <span className="flex items-center gap-0.5">· <Star className="w-3 h-3" />{r.reviewCount}</span>
                    </div>
                  </li>
                )
              })}
              {results.length === 0 && (
                <li className="text-sm text-gray-400 text-center py-8">
                  조건을 만족하는 매물이 없습니다. 임계값을 낮추거나 반경을 넓혀보세요.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function ScatterMap({ center, listings, radius }: any) {
  const SIZE = 320, R = 140
  return (
    <div className="border rounded-xl bg-gray-50 flex items-center justify-center" style={{ minHeight: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="#fff" stroke="#e5e7eb" />
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R * 0.5} fill="none" stroke="#f3f4f6" />
        <text x={SIZE / 2} y={SIZE / 2 + R + 16} textAnchor="middle" className="fill-gray-400" fontSize="11">
          반경 {radius}m
        </text>
        {listings.map((r: any, i: number) => {
          const angle = (i / Math.max(listings.length, 1)) * 2 * Math.PI
          const rr = (r.distance / radius) * R
          const x = SIZE / 2 + rr * Math.cos(angle)
          const y = SIZE / 2 + rr * Math.sin(angle)
          const col = r.occupancy >= 90 ? "#16a34a" : r.occupancy >= 70 ? "#ca8a04" : "#9ca3af"
          return <circle key={i} cx={x} cy={y} r={7} fill={col} opacity={0.85}>
            <title>{r.name} · {r.occupancy}%</title>
          </circle>
        })}
        <circle cx={SIZE / 2} cy={SIZE / 2} r={6} fill="#ff385c" />
        <text x={SIZE / 2} y={SIZE / 2 - 12} textAnchor="middle" className="fill-[#ff385c]" fontSize="11" fontWeight="600">내 위치</text>
      </svg>
    </div>
  )
}
