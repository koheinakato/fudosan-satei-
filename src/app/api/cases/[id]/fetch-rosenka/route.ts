import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  let { address } = await req.json()
  if (!address) return NextResponse.json({ error: '住所が必要です' }, { status: 400 })
  address = address.replace(/\s+/g, '').trim()
    .replace(/[０-９]/g, (c: string) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/番地/g, '番')

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 })
  }

  // Step 1: Geocode with 国土地理院 API
  let lat: number | null = null
  let lng: number | null = null
  let prefCode = ''
  let cityCode = ''

  try {
    const geoRes = await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`,
      { next: { revalidate: 0 } }
    )
    const geoData = await geoRes.json()
    if (geoData && geoData.length > 0) {
      lng = geoData[0].geometry.coordinates[0]
      lat = geoData[0].geometry.coordinates[1]
    }
  } catch {
    // geocoding failed, continue with Claude only
  }

  // Step 2: Try 国土交通省 地価公示 API
  let chikaPoints: { name: string; price: number; distance: number }[] = []

  if (lat && lng) {
    try {
      // Extract prefecture code from address
      const prefMap: Record<string, string> = {
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
      for (const [name, code] of Object.entries(prefMap)) {
        if (address.includes(name)) { prefCode = code; break }
      }

      if (prefCode) {
        // Get cities in prefecture
        const cityRes = await fetch(
          `https://www.land.mlit.go.jp/webland_mobile/api/CitySearch?area=${prefCode}`,
          { signal: AbortSignal.timeout(5000) }
        )
        if (cityRes.ok) {
          const cityData = await cityRes.json()
          // Find matching city from address
          if (cityData.data) {
            for (const city of cityData.data) {
              if (address.includes(city.name.replace(/市|町|村|区/, ''))) {
                cityCode = city.id
                break
              }
            }
          }

          if (cityCode) {
            const year = new Date().getFullYear()
            const pointRes = await fetch(
              `https://www.land.mlit.go.jp/webland_mobile/api/PointSearch?year=${year}&area=${prefCode}&city=${cityCode}`,
              { signal: AbortSignal.timeout(8000) }
            )
            if (pointRes.ok) {
              const pointData = await pointRes.json()
              if (pointData.data && pointData.data.length > 0) {
                const calcDist = (la1: number, lo1: number, la2: number, lo2: number) => {
                  const R = 6371000
                  const dLat = (la2 - la1) * Math.PI / 180
                  const dLon = (lo2 - lo1) * Math.PI / 180
                  const a = Math.sin(dLat / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
                  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
                }

                chikaPoints = pointData.data
                  .map((p: { name?: string; price?: string; latitude?: string; longitude?: string }) => ({
                    name: p.name || '',
                    price: parseInt(p.price || '0'),
                    distance: Math.round(calcDist(lat!, lng!, parseFloat(p.latitude || '0'), parseFloat(p.longitude || '0'))),
                  }))
                  .filter((p: { price: number; distance: number }) => p.price > 0 && p.distance < 3000)
                  .sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance)
                  .slice(0, 5)
              }
            }
          }
        }
      }
    } catch {
      // Government API failed, fall through to Claude
    }
  }

  // Step 3: Claude API for estimation / verification
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const chikaContext = chikaPoints.length > 0
    ? `\n\n参考となる周辺地価公示データ（国土交通省）:\n${chikaPoints.map(p => `- ${p.name}: ${p.price.toLocaleString()}円/㎡（${p.distance}m地点）`).join('\n')}`
    : ''

  const prompt = `住所「${address}」の路線価（国税庁・路線価図）を推定してください。${chikaContext}

以下のJSONのみを返してください（コードブロック不要）:
{
  "rosenka": 路線価の推定値(数値, 円/㎡),
  "confidence": "高" または "中" または "低",
  "basis": "推定根拠（40字以内）"
}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const result = JSON.parse(cleaned)
    return NextResponse.json({
      rosenka: result.rosenka,
      confidence: result.confidence,
      basis: result.basis,
      chikaPoints,
      source: chikaPoints.length > 0 ? '地価公示データ + Claude AI推定' : 'Claude AI推定',
    })
  } catch {
    return NextResponse.json({ error: '路線価の推定に失敗しました' }, { status: 500 })
  }
}
