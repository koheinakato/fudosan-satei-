import { NextResponse } from 'next/server'
import {
  REINFOLIB_ATTRIBUTION, normalizeAddress, geocodeJa,
  fetchUseArea, fetchNearestStation, fetchLandPricePoints,
} from '@/lib/reinfolib'

// 直線距離→道路距離の補正係数と徒歩速度(80m/分、不動産表示規約)
const ROAD_FACTOR = 1.3
const WALK_M_PER_MIN = 80

export async function POST(req: Request) {
  let { address } = await req.json()
  if (!address) return NextResponse.json({ error: '住所が必要です' }, { status: 400 })
  if (/[　-鿿豈-﫿＀-￯]/.test(address)) address = normalizeAddress(address)

  // 不動産情報ライブラリの実データから取得
  try {
    const coords = await geocodeJa(address)
    if (coords) {
      const [useArea, station, points] = await Promise.all([
        fetchUseArea(coords.lat, coords.lng).catch(() => null),
        fetchNearestStation(coords.lat, coords.lng).catch(() => null),
        fetchLandPricePoints(coords.lat, coords.lng).catch(() => [] as Awaited<ReturnType<typeof fetchLandPricePoints>>),
      ])
      // 用途地域ポリゴンで判定できない場合は最寄りの地価公示ポイントの規制情報で補完
      const nearestPoint = points[0]
      const useDistrict = useArea?.useDistrict || nearestPoint?.useDistrict || ''
      const buildingCoverage = useArea?.buildingCoverage ?? nearestPoint?.buildingCoverage ?? 0
      const floorCoverage = useArea?.floorAreaRatio ?? nearestPoint?.floorAreaRatio ?? 0

      if (useDistrict || station) {
        return NextResponse.json({
          useDistrict,
          buildingCoverage,
          floorCoverage,
          railway: station ? `${station.operator}${station.railway}`.replace(/^(西日本|東日本|東海|九州|四国|北海道)旅客鉄道/, 'JR') : '',
          station: station ? station.station.replace(/駅?$/, '駅') : '',
          walkTime: station ? Math.max(1, Math.round((station.distance * ROAD_FACTOR) / WALK_M_PER_MIN)) : 0,
          shape: '整形地',
          confidence: useArea && station ? '高' : '中',
          source: 'reinfolib',
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

  const prompt = `あなたは日本の不動産・都市計画の専門家です。
以下の住所について、都市計画法・建築基準法に基づく情報と交通アクセス情報を推定してください。

【住所】${address}

以下のJSONのみを返してください（コードブロック不要）:
{
  "useDistrict": "用途地域（例: 第一種低層住居専用地域、第一種住居地域、近隣商業地域 など）",
  "buildingCoverage": 建蔽率(数値, %。例: 60),
  "floorCoverage": 容積率(数値, %。例: 200),
  "railway": "最寄り路線名（例: JR呉線、広島電鉄宮島線）",
  "station": "最寄り駅名（例: 呉駅、広島駅）",
  "walkTime": 最寄り駅までの徒歩時間(数値, 分。80m=1分で計算),
  "shape": "土地形状（整形地 または 不整形地）",
  "confidence": "高" または "中" または "低"
}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const result = JSON.parse(cleaned)
    return NextResponse.json({
      useDistrict: result.useDistrict || '',
      buildingCoverage: Number(result.buildingCoverage) || 0,
      floorCoverage: Number(result.floorCoverage) || 0,
      railway: result.railway || '',
      station: result.station || '',
      walkTime: Number(result.walkTime) || 0,
      shape: result.shape || '整形地',
      confidence: result.confidence || '中',
      source: 'ai',
    })
  } catch {
    return NextResponse.json({ error: '土地情報の推定に失敗しました' }, { status: 500 })
  }
}
