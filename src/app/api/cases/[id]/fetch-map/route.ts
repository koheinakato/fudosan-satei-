import { NextResponse } from 'next/server'
import { REINFOLIB_ATTRIBUTION, fetchLandPricePoints } from '@/lib/reinfolib'

function isJapanese(s: string): boolean {
  return /[　-鿿豈-﫿＀-￯]/.test(s)
}

function buildVariants(address: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const push = (s: string) => {
    s = s.trim()
    if (s.length > 3 && !seen.has(s)) { seen.add(s); result.push(s) }
  }

  if (isJapanese(address)) {
    // 日本語住所: 文字間スペース除去・全角数字→半角・番地正規化
    address = address.replace(/\s+/g, '').trim()
    address = address.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    address = address.replace(/番地/g, '番')

    push(address)
    push(address.replace(/-?\d+号?$/, ''))
    push(address.replace(/-\d+-\d+$/, '').replace(/-\d+$/, ''))
    push(address.replace(/(丁目).*$/, '$1'))
    push(address.replace(/\d.*$/, ''))
    const city = address.match(/^.+?[都道府県].+?[市区町村]/)?.[0]
    if (city) push(city)
    const pref = address.match(/^.+?[都道府県]/)?.[0]
    if (pref) push(pref)
  } else {
    // 海外住所: スペースはそのまま保持
    push(address)
    push(address.replace(/\s+NO\.\s*\d+.*/i, ''))
    push(address.replace(/[,，].*$/, '').trim())
    push(address.split(/[,，]+/)[0].trim())
  }

  return result
}

async function geocodeGSI(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`,
      { cache: 'no-store' }
    )
    const text = await res.text()
    const data = JSON.parse(text)
    if (Array.isArray(data) && data.length > 0) {
      return { lat: data[0].geometry.coordinates[1], lng: data[0].geometry.coordinates[0] }
    }
  } catch { /* ignore */ }
  return null
}

async function geocodeNominatim(q: string, jp: boolean): Promise<{ lat: number; lng: number } | null> {
  try {
    const cc = jp ? '&countrycodes=jp' : ''
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json${cc}&limit=1`,
      { headers: { 'User-Agent': 'FudosanSateiApp/1.0' }, cache: 'no-store' }
    )
    const text = await res.text()
    const data = JSON.parse(text)
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

  const jp = isJapanese(address)
  let coords: { lat: number; lng: number } | null = null
  for (const variant of buildVariants(address)) {
    coords = jp
      ? (await geocodeGSI(variant) ?? await geocodeNominatim(variant, true))
      : await geocodeNominatim(variant, false)
    if (coords) break
  }

  if (!coords) {
    return NextResponse.json({
      error: '住所から座標を取得できませんでした',
      debug: { address, variants: buildVariants(address) }
    }, { status: 422 })
  }

  const { lat, lng } = coords

  // 周辺地価マップ: 対象地(赤)+地価公示・地価調査ポイント(青・番号)を1枚に描画
  if (type === 'chika') {
    let points: Awaited<ReturnType<typeof fetchLandPricePoints>> = []
    try {
      points = (await fetchLandPricePoints(lat, lng)).filter(p => p.distance <= 3000).slice(0, 5)
    } catch { /* ポイントなしでも対象地のみの地図を返す */ }

    const pointMarkers = points
      .map((p, i) => `&markers=color:blue|label:${i + 1}|${p.lat},${p.lng}`)
      .join('')
    const mapUrl =
      `https://maps.googleapis.com/maps/api/staticmap` +
      `?size=640x640` +
      `&scale=2` +
      `&maptype=roadmap` +
      (points.length === 0 ? `&zoom=15&center=${lat},${lng}` : '') +
      `&markers=color:red|size:mid|${lat},${lng}` +
      pointMarkers +
      `&language=ja` +
      `&key=${apiKey}`

    try {
      const imgRes = await fetch(mapUrl, { cache: 'no-store' })
      if (!imgRes.ok || !(imgRes.headers.get('content-type') || '').includes('image')) {
        const body = await imgRes.text()
        return NextResponse.json({ error: `Maps API エラー (${imgRes.status}): ${body.slice(0, 200)}` }, { status: 500 })
      }
      const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64')
      return NextResponse.json({
        image: `data:image/png;base64,${base64}`,
        points: points.map((p, i) => ({
          label: String(i + 1),
          name: p.name,
          type: p.type === 0 ? '地価公示' : '地価調査',
          price: p.price,
          yoyRate: p.yoyRate,
          useDistrict: p.useDistrict,
          distance: p.distance,
        })),
        attribution: REINFOLIB_ATTRIBUTION,
      })
    } catch (e) {
      return NextResponse.json({ error: `Maps API 通信エラー: ${e}` }, { status: 500 })
    }
  }

  const zoom = type === 'zone' ? 15 : 17
  const markerColor = type === 'zone' ? 'blue' : 'red'

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
    const imgRes = await fetch(mapUrl, { cache: 'no-store' })
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
