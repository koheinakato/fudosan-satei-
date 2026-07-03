import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { address, type } = await req.json()
  if (!address) return NextResponse.json({ error: '住所が必要です' }, { status: 400 })

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY が設定されていません' }, { status: 500 })

  const zoom = type === 'zone' ? 15 : 17
  const markerColor = type === 'zone' ? 'blue' : 'red'

  // 住所を段階的に簡略化しながら Static Maps API を直接呼ぶ（ジオコーディング不要）
  const variants = buildVariants(address)

  for (const variant of variants) {
    const encoded = encodeURIComponent(variant)
    const mapUrl =
      `https://maps.googleapis.com/maps/api/staticmap` +
      `?center=${encoded}` +
      `&zoom=${zoom}` +
      `&size=640x640` +
      `&scale=2` +
      `&maptype=roadmap` +
      `&markers=color:${markerColor}|size:mid|${encoded}` +
      `&language=ja` +
      `&key=${apiKey}`

    try {
      const imgRes = await fetch(mapUrl, { signal: AbortSignal.timeout(8000) })
      const contentType = imgRes.headers.get('content-type') || ''
      if (imgRes.ok && contentType.includes('image')) {
        const buffer = await imgRes.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')
        return NextResponse.json({ image: `data:image/png;base64,${base64}` })
      }
    } catch { /* 次のバリアントを試す */ }
  }

  return NextResponse.json({ error: '地図の取得に失敗しました' }, { status: 500 })
}

function buildVariants(address: string): string[] {
  const seen = new Set<string>()
  const add = (s: string) => {
    s = s.trim()
    if (s.length > 3 && !seen.has(s)) { seen.add(s); return s }
    return null
  }
  const result: string[] = []

  const push = (s: string | null) => { if (s) { const v = add(s); if (v) result.push(v) } }

  push(address)
  push(address.replace(/-?\d+号?$/, ''))                       // 号除去
  push(address.replace(/-?\d+-\d+$/, '').replace(/-\d+$/, '')) // 番地-号除去
  push(address.replace(/(丁目).*$/, '$1'))                      // 丁目まで
  push(address.replace(/\d.*$/, ''))                            // 町名まで
  push(address.match(/^.+?[都道府県].+?[市区町村]/)?.[0] ?? null) // 市区町村まで
  push(address.match(/^.+?[都道府県]/)?.[0] ?? null)             // 都道府県まで

  return result
}
