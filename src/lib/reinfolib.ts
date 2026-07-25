// 国土交通省 不動産情報ライブラリ APIクライアント
// https://www.reinfolib.mlit.go.jp/help/apiManual/
// 利用時は出典表記が必要:「出典:国土交通省 不動産情報ライブラリ」

const BASE = 'https://www.reinfolib.mlit.go.jp/ex-api/external'

export const REINFOLIB_ATTRIBUTION = '出典:国土交通省 不動産情報ライブラリ'

function apiHeaders(): Record<string, string> {
  const key = process.env.REINFOLIB_API_KEY
  if (!key) throw new Error('REINFOLIB_API_KEY が設定されていません')
  return { 'Ocp-Apim-Subscription-Key': key }
}

const PREF_CODES: Record<string, string> = {
  '北海道': '01', '青森': '02', '岩手': '03', '宮城': '04', '秋田': '05',
  '山形': '06', '福島': '07', '茨城': '08', '栃木': '09', '群馬': '10',
  '埼玉': '11', '千葉': '12', '東京': '13', '神奈川': '14', '新潟': '15',
  '富山': '16', '石川': '17', '福井': '18', '山梨': '19', '長野': '20',
  '岐阜': '21', '静岡': '22', '愛知': '23', '三重': '24', '滋賀': '25',
  '京都': '26', '大阪': '27', '兵庫': '28', '奈良': '29', '和歌山': '30',
  '鳥取': '31', '島根': '32', '岡山': '33', '広島': '34', '山口': '35',
  '徳島': '36', '香川': '37', '愛媛': '38', '高知': '39', '福岡': '40',
  '佐賀': '41', '長崎': '42', '熊本': '43', '大分': '44', '宮崎': '45',
  '鹿児島': '46', '沖縄': '47',
}

export function normalizeAddress(address: string): string {
  return address.replace(/\s+/g, '').trim()
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/^〒?\d{3}[-−ー‐]?\d{4}/, '') // 郵便番号を除去
    .replace(/番地/g, '番')
}

export function prefCodeFromAddress(address: string): string | null {
  for (const [name, code] of Object.entries(PREF_CODES)) {
    if (address.includes(name)) return code
  }
  return null
}

// 住所の大字・町名部分(例: 広島県呉市三条2丁目14-2 → 三条)
export function townFromAddress(address: string): string {
  const rest = address
    .replace(/^.+?[都道府県]/, '')
    .replace(/^.+?郡/, '')
    .replace(/^.+?[市町村]/, '')
    .replace(/^.+?区/, '')
  const m = rest.match(/^[^0-9０-９一二三四五六七八九]+/)
  return (m?.[0] ?? '').replace(/丁目.*$/, '').trim()
}

// XIT002: 都道府県内市区町村一覧から住所に合う市区町村コードを返す
export async function getCityCode(prefCode: string, address: string): Promise<string | null> {
  const res = await fetch(`${BASE}/XIT002?area=${prefCode}`, {
    headers: apiHeaders(), signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  const json = await res.json()
  const cities: { id: string; name: string }[] = json.data ?? []
  const local = address.replace(/^.+?[都道府県]/, '')
  const matches = cities.filter(c => local.includes(c.name))
  if (matches.length === 0) return null
  // 政令市は「広島市」(34100)と「中区」(34101)が両方マッチしうるので、区のほうを優先
  const wards = matches.filter(c => !c.id.endsWith('00'))
  const pool = wards.length > 0 ? wards : matches
  return pool.sort((a, b) => b.name.length - a.name.length)[0].id
}

// 国土地理院ジオコーディング(住所を段階的に短くしながら試行)
export async function geocodeJa(address: string): Promise<{ lat: number; lng: number } | null> {
  const variants: string[] = []
  const push = (s: string) => { s = s.trim(); if (s.length > 3 && !variants.includes(s)) variants.push(s) }
  push(address)
  push(address.replace(/-?\d+号?$/, ''))
  push(address.replace(/-\d+-\d+$/, '').replace(/-\d+$/, ''))
  push(address.replace(/(丁目).*$/, '$1'))
  push(address.replace(/\d.*$/, ''))

  for (const q of variants) {
    try {
      const res = await fetch(
        `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`,
        { cache: 'no-store', signal: AbortSignal.timeout(6000) }
      )
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        return { lat: data[0].geometry.coordinates[1], lng: data[0].geometry.coordinates[0] }
      }
    } catch { /* try next variant */ }
  }
  return null
}

export function latLngToTile(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  return { x, y }
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export type LandPricePoint = {
  name: string           // 住居表示または所在地番
  price: number          // 当年価格(円/㎡)
  lastYearPrice: number | null
  yoyRate: number | null // 前年比変動率(%)
  type: 0 | 1            // 0=地価公示 1=都道府県地価調査
  priceDate: Date        // 価格時点(公示=1/1、調査=7/1)
  useDistrict: string
  buildingCoverage: number | null // 建蔽率(%)
  floorAreaRatio: number | null   // 容積率(%)
  station: string
  stationDistance: string
  lat: number
  lng: number
  distance: number       // 対象地からの距離(m)
}

function parsePricePerSqm(s: string | undefined): number | null {
  const m = (s ?? '').match(/[\d,]+/)
  if (!m) return null
  const v = parseInt(m[0].replace(/,/g, ''), 10)
  return Number.isFinite(v) && v > 0 ? v : null
}

function parsePercent(s: string | undefined): number | null {
  const m = (s ?? '').match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}

// XPT002: 対象地周辺の地価公示・地価調査ポイントを距離順に取得
export async function fetchLandPricePoints(lat: number, lng: number): Promise<LandPricePoint[]> {
  const z = 13
  const { x, y } = latLngToTile(lat, lng, z)
  const currentYear = new Date().getFullYear()

  const fetchYear = async (year: number): Promise<LandPricePoint[]> => {
    const tiles: Promise<LandPricePoint[]>[] = []
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      tiles.push((async () => {
        try {
          const res = await fetch(
            `${BASE}/XPT002?response_format=geojson&z=${z}&x=${x + dx}&y=${y + dy}&year=${year}`,
            { headers: apiHeaders(), signal: AbortSignal.timeout(10000) }
          )
          if (!res.ok) return []
          const json = await res.json()
          type Feature = { geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }
          return ((json.features ?? []) as Feature[]).flatMap((f): LandPricePoint[] => {
            const p = f.properties ?? {}
            const price = parsePricePerSqm(p.u_current_years_price_ja as string)
            const [plng, plat] = f.geometry?.coordinates ?? []
            if (!price || plat == null || plng == null || Number(p.pause_flag ?? 0) !== 0) return []
            const type = (Number(p.land_price_type) === 1 ? 1 : 0) as 0 | 1
            // 数値フィールドは文字列で返ることがあるため両対応でパース
            const yoy = parseFloat(String(p.year_on_year_change_rate ?? ''))
            const lastPrice = parseFloat(String(p.last_years_price ?? ''))
            return [{
              name: String(p.residence_display_name_ja || p.location_number_ja || ''),
              price,
              lastYearPrice: Number.isFinite(lastPrice) && lastPrice > 0 ? lastPrice : null,
              yoyRate: Number.isFinite(yoy) ? yoy : null,
              type,
              priceDate: new Date(year, type === 1 ? 6 : 0, 1),
              useDistrict: String(p.regulations_use_category_name_ja || ''),
              buildingCoverage: parsePercent(p.u_regulations_building_coverage_ratio_ja as string),
              floorAreaRatio: parsePercent(p.u_regulations_floor_area_ratio_ja as string),
              station: String(p.nearest_station_name_ja || ''),
              stationDistance: String(p.u_road_distance_to_nearest_station_name_ja || ''),
              lat: plat,
              lng: plng,
              distance: Math.round(distanceMeters(lat, lng, plat, plng)),
            }]
          })
        } catch { return [] }
      })())
    }
    return (await Promise.all(tiles)).flat()
  }

  let points = await fetchYear(currentYear)
  // 年初は当年データ未公開のことがある。また地価調査(7/1時点)は公表が遅いので前年分も補完
  if (points.length < 3 || !points.some(p => p.type === 1)) {
    const prev = await fetchYear(currentYear - 1)
    const seen = new Set(points.map(p => `${p.name}:${p.type}`))
    points = points.concat(prev.filter(p => !seen.has(`${p.name}:${p.type}`)))
  }
  return points.sort((a, b) => a.distance - b.distance)
}

// 偶奇則による点のポリゴン内外判定(外環+穴の全リングで交差数を数える)
function pointInPolygon(lat: number, lng: number, rings: number[][][]): boolean {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside
      }
    }
  }
  return inside
}

export type UseArea = {
  useDistrict: string
  buildingCoverage: number | null // 建蔽率(%)
  floorAreaRatio: number | null   // 容積率(%)
}

// XKT002: 都市計画決定GISデータ(用途地域)から対象地点の用途地域を判定
export async function fetchUseArea(lat: number, lng: number): Promise<UseArea | null> {
  const z = 15
  const { x, y } = latLngToTile(lat, lng, z)
  const res = await fetch(
    `${BASE}/XKT002?response_format=geojson&z=${z}&x=${x}&y=${y}`,
    { headers: apiHeaders(), signal: AbortSignal.timeout(10000) }
  )
  if (!res.ok) return null
  const json = await res.json()
  type Feature = {
    geometry?: { type?: string; coordinates?: unknown }
    properties?: Record<string, unknown>
  }
  for (const f of (json.features ?? []) as Feature[]) {
    const g = f.geometry
    if (!g?.coordinates) continue
    const polygons = (g.type === 'MultiPolygon'
      ? g.coordinates
      : [g.coordinates]) as number[][][][]
    if (polygons.some(rings => pointInPolygon(lat, lng, rings))) {
      const p = f.properties ?? {}
      return {
        useDistrict: String(p.use_area_ja || ''),
        buildingCoverage: parsePercent(p.u_building_coverage_ratio_ja as string),
        floorAreaRatio: parsePercent(p.u_floor_area_ratio_ja as string),
      }
    }
  }
  return null
}

export type NearestStation = {
  station: string
  railway: string
  operator: string
  distance: number // 直線距離(m)
}

// XKT015: 国土数値情報(駅別乗降客数)から最寄駅を検索
export async function fetchNearestStation(lat: number, lng: number): Promise<NearestStation | null> {
  const z = 13
  const { x, y } = latLngToTile(lat, lng, z)
  const tiles: Promise<NearestStation[]>[] = []
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    tiles.push((async () => {
      try {
        const res = await fetch(
          `${BASE}/XKT015?response_format=geojson&z=${z}&x=${x + dx}&y=${y + dy}`,
          { headers: apiHeaders(), signal: AbortSignal.timeout(10000) }
        )
        if (!res.ok) return []
        const json = await res.json()
        type Feature = { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }
        return ((json.features ?? []) as Feature[]).flatMap((f): NearestStation[] => {
          const p = f.properties ?? {}
          const name = String(p.S12_001_ja || '')
          if (!name) return []
          // 駅はLineString(ホーム線分)なので中点までの距離を使う
          const coords = (f.geometry?.type === 'LineString'
            ? f.geometry.coordinates
            : []) as number[][]
          if (coords.length === 0) return []
          const mid = coords[Math.floor(coords.length / 2)]
          return [{
            station: name,
            railway: String(p.S12_003_ja || ''),
            operator: String(p.S12_002_ja || ''),
            distance: Math.round(distanceMeters(lat, lng, mid[1], mid[0])),
          }]
        })
      } catch { return [] }
    })())
  }
  const stations = (await Promise.all(tiles)).flat()
  if (stations.length === 0) return null
  // 同名駅(複数路線)は最も近いものだけ残す
  stations.sort((a, b) => a.distance - b.distance)
  return stations[0]
}

export type Transaction = {
  Type?: string; Region?: string; DistrictName?: string
  TradePrice?: string; UnitPrice?: string; Area?: string
  BuildingYear?: string; FloorPlan?: string; Structure?: string
  Period?: string; CityPlanning?: string; CoverageRatio?: string; FloorAreaRatio?: string
}

// 「2025年第3四半期」→ 四半期中央の日付
export function parsePeriod(period: string | undefined): Date | null {
  const m = (period ?? '').match(/(\d{4})年第([1-4])四半期/)
  if (!m) return null
  return new Date(parseInt(m[1], 10), (parseInt(m[2], 10) - 1) * 3 + 1, 15)
}

// XIT001: 直近の取引価格情報を新しい四半期から順に取得(データは約2四半期遅れで公開)
export async function fetchTransactions(
  prefCode: string, cityCode: string, maxQuarters = 8
): Promise<Transaction[]> {
  const now = new Date()
  const quarters: { year: number; quarter: number }[] = []
  let y = now.getFullYear()
  let q = Math.floor(now.getMonth() / 3) + 1
  for (let i = 0; i < maxQuarters + 2; i++) {
    quarters.push({ year: y, quarter: q })
    q--; if (q === 0) { q = 4; y-- }
  }

  const results = await Promise.all(quarters.map(async ({ year, quarter }) => {
    try {
      const res = await fetch(
        `${BASE}/XIT001?year=${year}&quarter=${quarter}&area=${prefCode}&city=${cityCode}&priceClassification=01`,
        { headers: apiHeaders(), signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) return []
      const json = await res.json()
      return (json.data ?? []) as Transaction[]
    } catch { return [] }
  }))
  return results.flat()
}

// 価格時点から現在までの時点修正率(変動率を年複利で適用、0.90〜1.10にクランプ)
export function timeFactor(priceDate: Date | null, yoyRatePct: number): number {
  if (!priceDate) return 1.00
  const years = Math.max(0, (Date.now() - priceDate.getTime()) / (365.25 * 24 * 3600 * 1000))
  const f = Math.pow(1 + yoyRatePct / 100, years)
  return Math.min(1.10, Math.max(0.90, parseFloat(f.toFixed(2))))
}
