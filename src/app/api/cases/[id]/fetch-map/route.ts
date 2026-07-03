import { NextResponse } from 'next/server'

// 住所を段階的に簡略化したバリアント一覧（詳細→都道府県）
function buildVariants(address: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const push = (s: string) => {
    s = s.trim()
    if (s.length > 3 && !seen.has(s)) { seen.add(s); result.push(s) }
  }

  push(address)
  push(address.replace(/-?\d+号?$/, ''))                              // 号除去
  push(address.replace(/-\d+-\d+$/, '').replace(/-\d+$/, ''))        // 番地-号除去
  push(address.replace(/(丁目).*$/, '$1'))                            // 丁目まで
  push(address.replace(/\d.*$/, ''))                                  // 町名まで
  const city = address.match(/^.+?[都道府県].+?[市区町村]/)?.[0]
  if (city) push(city)                                                // 市区町村まで
  const pref = address.match(/^.+?[都道府県]/)?.[0]
  if (pref) push(pref)                                                // 都道府県まで

  return result
}

// 国土地理院（日本国内IPから有効）
async function geocodeGSI(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`,
      { cache: 'no-store' }
    )
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      return { lat: data[0].geometry.coordinates[1], lng: data[0].geometry.coordinates[0] }
    }
  } catch { /* ignore */ }
  return null
}

// OpenStreetMap Nominatim（グローバルアクセス可・無料）
async function geocodeNominatim(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=jp&limit=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FudosanSateiApp/1.0' },
      cache: 'no-store',
    })
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch { /* ignore */ }
  return null
}

export async function POST(req: Request) {
  const { address, type } = await req.json()
  if (!address) return NextResponse.json({ error: '住所が必要です' }, { status: 400 })

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY が設定されていません' }, { status: 500 })

  // 住所バリアントを順に試してジオコーディング（GSI → Nominatim の順）
  let coords: { lat: number; lng: number } | null = null
  for (const variant of buildVariants(address)) {
    coords = await geocodeGSI(variant) ?? await geocodeNominatim(variant)
    if (coords) break
  }

  if (!coords) {
    return NextResponse.json({ error: '住所から座標を取得できませんでした' }, { status: 422 })
  }

  const { lat, lng } = coords
  const zoom = type === 'zone' ? 15 : 17
  const markerColor = type === 'zone' ? 'blue' : 'red'

  // 座標で Static Maps API を呼ぶ（Geocoding API 不要）
  const mapUrl =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=${zoom}` +
    `&size=640x640` +
    `&scale=2` +
    `&maptype=roadmap` +
    `&markers=color:${markerColor}|size:mid|${lat},${lng}` +
    `&language=ja` +
    `&key=${apiKey}`

  try {
    const imgRes = await fetch(mapUrl, { signal: AbortSignal.timeout(10000) })
    const contentType = imgRes.headers.get('content-type') || ''

    if (imgRes.ok && contentType.includes('image')) {
      const buffer = await imgRes.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      return NextResponse.json({ image: `data:image/png;base64,${base64}` })
    }

    const body = await imgRes.text()
    return NextResponse.json(
      { error: `Maps API エラー (${imgRes.status}): ${body.slice(0, 200)}` },
      { status: 500 }
    )
  } catch (e) {
    return NextResponse.json({ error: `Maps API 通信エラー: ${e}` }, { status: 500 })
  }
}
