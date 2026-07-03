import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { address } = await req.json()
  if (!address) return NextResponse.json({ error: '住所が必要です' }, { status: 400 })

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
    })
  } catch {
    return NextResponse.json({ error: '土地情報の推定に失敗しました' }, { status: 500 })
  }
}
