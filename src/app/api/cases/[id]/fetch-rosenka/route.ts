import { NextResponse } from 'next/server'
import {
  REINFOLIB_ATTRIBUTION, normalizeAddress, geocodeJa, fetchLandPricePoints, timeFactor,
} from '@/lib/reinfolib'

// 路線価(相続税評価)は地価公示価格水準の8割程度で設定される(国税庁)
const ROSENKA_RATIO = 0.8

export async function POST(req: Request) {
  let { address } = await req.json()
  if (!address) return NextResponse.json({ error: '住所が必要です' }, { status: 400 })
  if (/[　-鿿豈-﫿＀-￯]/.test(address)) address = normalizeAddress(address)

  // 不動産情報ライブラリの地価公示・地価調査ポイントから算出
  try {
    const coords = await geocodeJa(address)
    if (coords) {
      const points = await fetchLandPricePoints(coords.lat, coords.lng)
      const near = points.filter(p => p.distance <= 3000).slice(0, 3)
      if (near.length > 0) {
        // 距離加重平均(近い地点ほど重く)×0.8。時点修正込み
        let wSum = 0, vSum = 0
        for (const p of near) {
          const w = 1 / Math.max(p.distance, 100)
          wSum += w
          vSum += w * p.price * timeFactor(p.priceDate, p.yoyRate ?? 0)
        }
        const rosenka = Math.round((vSum / wSum) * ROSENKA_RATIO / 1000) * 1000
        const nearest = near[0]
        const confidence = nearest.distance <= 500 ? '高' : nearest.distance <= 1500 ? '中' : '低'
        return NextResponse.json({
          rosenka,
          confidence,
          basis: `近隣${near.length}地点の公示・基準地価×${ROSENKA_RATIO}(最寄${nearest.distance}m)`,
          chikaPoints: near.map(p => ({ name: p.name, price: p.price, distance: p.distance })),
          source: '地価公示・地価調査データから算出',
          attribution: REINFOLIB_ATTRIBUTION,
        })
      }
    }
  } catch { /* 実データが取れない場合はAI推定へ */ }

  // フォールバック: AI推定
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 })
  }
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `住所「${address}」の路線価（国税庁・路線価図）を推定してください。

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
      chikaPoints: [],
      source: 'Claude AI推定',
    })
  } catch {
    return NextResponse.json({ error: '路線価の推定に失敗しました' }, { status: 500 })
  }
}
