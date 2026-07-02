import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { address, type } = await req.json()
  if (!address) return NextResponse.json({ error: '住所が必要です' }, { status: 400 })

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY が設定されていません' }, { status: 500 })

  // Geocode with 国土地理院
  let lat: number | null = null
  let lng: number | null = null
  try {
    const geoRes = await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`
    )
    const geoData = await geoRes.json()
    if (geoData && geoData.length > 0) {
      lng = geoData[0].geometry.coordinates[0]
      lat = geoData[0].geometry.coordinates[1]
    }
  } catch {
    return NextResponse.json({ error: 'ジオコーディングに失敗しました' }, { status: 500 })
  }

  if (!lat || !lng) {
    return NextResponse.json({ error: '住所から座標を取得できませんでした' }, { status: 422 })
  }

  // 路線価地図: zoom 17（詳細）、用途地域図: zoom 15（広域）
  const zoom = type === 'zone' ? 15 : 17
  const size = '640x640'
  const scale = 2
  const markerColor = type === 'zone' ? 'blue' : 'red'

  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=${zoom}` +
    `&size=${size}` +
    `&scale=${scale}` +
    `&maptype=roadmap` +
    `&markers=color:${markerColor}|size:mid|${lat},${lng}` +
    `&language=ja` +
    `&key=${apiKey}`

  const imgRes = await fetch(mapUrl)
  const contentType = imgRes.headers.get('content-type') || ''

  if (!imgRes.ok || !contentType.includes('image')) {
    const body = await imgRes.text()
    return NextResponse.json({
      error: `Google Maps APIエラー (${imgRes.status}): ${body.slice(0, 300)}`,
    }, { status: 500 })
  }

  const buffer = await imgRes.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const dataUrl = `data:image/png;base64,${base64}`

  return NextResponse.json({ image: dataUrl, lat, lng })
}
