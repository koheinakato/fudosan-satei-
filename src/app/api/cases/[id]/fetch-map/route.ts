import { NextResponse } from 'next/server'

// 住所を精度の低い順にバリエーション生成（完全一致→丁目→町名）
function addressVariants(address: string): string[] {
  const seen = new Set<string>()
  const push = (v: string) => {
    const s = v.trim()
    if (s.length > 4 && !seen.has(s)) { seen.add(s); return s }
    return null
  }
  const variants: string[] = []

  const a = push(address)
  if (a) variants.push(a)

  // "3-19-6" → "3-19"（号を除去）
  const v1 = push(address.replace(/-?\d+号?$/, ''))
  if (v1) {
    variants.push(v1)
    // "3-19" → "3"（番地を除去）
    const v2 = push(v1.replace(/-?\d+番?$/, ''))
    if (v2) variants.push(v2)
  }

  // "2丁目3番4号" → "2丁目"
  const v3 = push(address.replace(/(丁目).*$/, '$1'))
  if (v3 && v3 !== address) variants.push(v3)

  // 最初の数字以降を除去（町名レベル）: "西中央3-19-6" → "西中央"
  const v4 = push(address.replace(/\d.*$/, ''))
  if (v4 && v4 !== address) variants.push(v4)

  return variants
}

async function geocode(variant: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  // 国土地理院（失敗時1回リトライ）
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(variant)}`,
        { signal: AbortSignal.timeout(6000) }
      )
      const data = await res.json()
      if (data?.length > 0) {
        return { lat: data[0].geometry.coordinates[1], lng: data[0].geometry.coordinates[0] }
      }
      break
    } catch { if (attempt === 0) await new Promise(r => setTimeout(r, 500)) }
  }

  // Google Maps Geocoding（失敗時1回リトライ）
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(variant)}&language=ja&region=JP&key=${apiKey}`,
        { signal: AbortSignal.timeout(6000) }
      )
      const data = await res.json()
      if (data.results?.length > 0) {
        return {
          lat: data.results[0].geometry.location.lat,
          lng: data.results[0].geometry.location.lng,
        }
      }
      break
    } catch { if (attempt === 0) await new Promise(r => setTimeout(r, 500)) }
  }

  return null
}

export async function POST(req: Request) {
  const { address, type } = await req.json()
  if (!address) return NextResponse.json({ error: '住所が必要です' }, { status: 400 })

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY が設定されていません' }, { status: 500 })

  // 住所を段階的に簡略化してジオコーディングを試みる
  let coords: { lat: number; lng: number } | null = null
  for (const variant of addressVariants(address)) {
    coords = await geocode(variant, apiKey)
    if (coords) break
  }

  if (!coords) {
    return NextResponse.json({ error: '住所から座標を取得できませんでした' }, { status: 422 })
  }

  const { lat, lng } = coords
  const zoom = type === 'zone' ? 15 : 17
  const size = '640x640'
  const scale = 2
  const markerColor = type === 'zone' ? 'blue' : 'red'

  const mapUrl =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=${zoom}` +
    `&size=${size}` +
    `&scale=${scale}` +
    `&maptype=roadmap` +
    `&markers=color:${markerColor}|size:mid|${lat},${lng}` +
    `&language=ja` +
    `&key=${apiKey}`

  const imgRes = await fetch(mapUrl, { signal: AbortSignal.timeout(8000) })
  const contentType = imgRes.headers.get('content-type') || ''

  if (!imgRes.ok || !contentType.includes('image')) {
    const body = await imgRes.text()
    return NextResponse.json(
      { error: `Google Maps APIエラー (${imgRes.status}): ${body.slice(0, 300)}` },
      { status: 500 }
    )
  }

  const buffer = await imgRes.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const dataUrl = `data:image/png;base64,${base64}`

  return NextResponse.json({ image: dataUrl, lat, lng })
}
