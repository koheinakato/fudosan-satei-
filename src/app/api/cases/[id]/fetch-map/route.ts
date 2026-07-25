import { NextResponse } from 'next/server'
import {
  REINFOLIB_ATTRIBUTION, fetchLandPricePoints,
  fetchUseAreaFeatures, findContainingUseArea,
  latLngToTile, latLngToWorldPixel,
} from '@/lib/reinfolib'

// 用途地域の標準的な色分け(youto_idは法令上の並び: 8=田園住居)
const YOUTO_COLORS: Record<number, string> = {
  1: '#8CC63F',  // 第一種低層住居専用地域
  2: '#B5E08C',  // 第二種低層住居専用地域
  3: '#C3D825',  // 第一種中高層住居専用地域
  4: '#DCE775',  // 第二種中高層住居専用地域
  5: '#F9E265',  // 第一種住居地域
  6: '#FCEFB4',  // 第二種住居地域
  7: '#F5B041',  // 準住居地域
  8: '#A9DFBF',  // 田園住居地域
  9: '#F8BBD0',  // 近隣商業地域
  10: '#F1948A', // 商業地域
  11: '#C39BD3', // 準工業地域
  12: '#85C1E9', // 工業地域
  13: '#5499C7', // 工業専用地域
}
const YOUTO_FALLBACK_COLOR = '#BDBDBD'

// 地理院タイル(淡色)+用途地域ポリゴンを合成した用途地域図を生成
async function buildZoneMap(lat: number, lng: number) {
  const features = await fetchUseAreaFeatures(lat, lng, 1)
  if (features.length === 0) return null

  const sharp = (await import('sharp')).default
  const z = 16
  const ct = latLngToTile(lat, lng, z)
  const originX = (ct.x - 2) * 256
  const originY = (ct.y - 2) * 256
  const world = latLngToWorldPixel(lat, lng, z)
  const cropLeft = Math.round(world.x - originX) - 512
  const cropTop = Math.round(world.y - originY) - 512

  // 背景: 地理院タイル5x5をモザイク合成して対象地中心に1024pxを切り出す
  const tileLayers = (await Promise.all(
    Array.from({ length: 25 }, async (_, i) => {
      const dx = (i % 5) - 2
      const dy = Math.floor(i / 5) - 2
      try {
        const res = await fetch(
          `https://cyberjapandata.gsi.go.jp/xyz/pale/${z}/${ct.x + dx}/${ct.y + dy}.png`,
          { cache: 'no-store', signal: AbortSignal.timeout(10000) }
        )
        if (!res.ok) return null
        return { input: Buffer.from(await res.arrayBuffer()), left: (dx + 2) * 256, top: (dy + 2) * 256 }
      } catch { return null }
    })
  )).filter((t): t is NonNullable<typeof t> => t !== null)
  if (tileLayers.length === 0) return null

  const mosaic = await sharp({ create: { width: 1280, height: 1280, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite(tileLayers).png().toBuffer()
  const base = await sharp(mosaic)
    .extract({ left: cropLeft, top: cropTop, width: 1024, height: 1024 }).png().toBuffer()

  // 前景: 用途地域ポリゴン(半透明)+対象地マーカーのSVG
  const px = (plng: number, plat: number): string => {
    const w = latLngToWorldPixel(plat, plng, z)
    return `${(w.x - originX - cropLeft).toFixed(1)},${(w.y - originY - cropTop).toFixed(1)}`
  }
  const colorOf = (youtoId: number | null) => YOUTO_COLORS[youtoId ?? -1] ?? YOUTO_FALLBACK_COLOR
  const paths = features.map(f => {
    const d = f.polygons
      .flatMap(rings => rings.map(ring => `M${ring.map(([plng, plat]) => px(plng, plat)).join('L')}Z`))
      .join(' ')
    const color = colorOf(f.youtoId)
    // タイル境界のクリップ線が見えないよう輪郭線なし(境界は色の差で表現)
    return `<path d="${d}" fill="${color}" fill-opacity="0.4" fill-rule="evenodd"/>`
  }).join('')
  const svg =
    `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">` +
    paths +
    `<circle cx="512" cy="512" r="11" fill="#e53935" stroke="#ffffff" stroke-width="4"/>` +
    `</svg>`

  const image = await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toBuffer()

  // 凡例: 表示範囲内の用途地域(重複除去)。対象地の地域を先頭に
  const subject = findContainingUseArea(lat, lng, features)
  const seen = new Set<string>()
  const zones = features.flatMap(f => {
    const key = `${f.useDistrict}|${f.buildingCoverage}|${f.floorAreaRatio}`
    if (!f.useDistrict || seen.has(key)) return []
    seen.add(key)
    return [{
      name: f.useDistrict,
      color: colorOf(f.youtoId),
      buildingCoverage: f.buildingCoverage,
      floorAreaRatio: f.floorAreaRatio,
      isSubject: subject != null &&
        f.useDistrict === subject.useDistrict &&
        f.buildingCoverage === subject.buildingCoverage &&
        f.floorAreaRatio === subject.floorAreaRatio,
    }]
  }).sort((a, b) => Number(b.isSubject) - Number(a.isSubject))

  return {
    image: `data:image/png;base64,${image.toString('base64')}`,
    zones,
    subjectZone: subject?.useDistrict ?? null,
    attribution: `${REINFOLIB_ATTRIBUTION}(用途地域)・地理院タイル`,
  }
}

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
    // 日本語住所: 文字間スペース除去・全角数字→半角・郵便番号除去・番地正規化
    address = address.replace(/\s+/g, '').trim()
    address = address.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    address = address.replace(/^〒?\d{3}[-−ー‐]?\d{4}/, '')
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

  // 用途地域図: ポリゴンが取れる場合は本物の色分け図を生成、
  // 非都市計画区域などで取れない場合は従来のGoogle地図にフォールバック
  if (type === 'zone') {
    try {
      const zoneMap = await buildZoneMap(lat, lng)
      if (zoneMap) return NextResponse.json(zoneMap)
    } catch { /* フォールバックへ */ }
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
