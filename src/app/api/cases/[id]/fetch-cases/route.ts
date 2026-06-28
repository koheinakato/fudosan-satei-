import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { address, propertyType, rosenka } = await req.json()
  if (!address) return NextResponse.json({ error: '住所が必要です' }, { status: 400 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 })
  }

  const rosenkaHint = rosenka ? `路線価: ${Number(rosenka).toLocaleString()}円/㎡` : ''
  const typeLabel = propertyType === 'mansion' ? 'マンション（区分所有）' : propertyType === 'land' ? '土地' : '戸建て'

  const { Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `あなたは不動産鑑定の専門家です。
以下の物件の土地査定に使う「取引事例比較法」の比準表を作成してください。

【対象物件】
所在地: ${address}
物件種別: ${typeLabel}
${rosenkaHint}

公示地・基準地・取引事例を合計6件、実在しうる合理的な数値で作成してください。
価格は円/㎡単位（土地単価）で、路線価・地価公示の知識に基づいた現実的な値にしてください。
時点修正は直近1〜2年の地価動向を反映（1.00〜1.05程度）、
地域格差は対象地との比較（0.90〜1.10程度）で設定してください。

以下のJSONのみを返してください（コードブロック不要）:
[
  { "name": "公示地 ①", "price": 数値, "timeCorrect": 数値, "areaCorrect": 数値 },
  { "name": "公示地 ②", "price": 数値, "timeCorrect": 数値, "areaCorrect": 数値 },
  { "name": "基準地 ①", "price": 数値, "timeCorrect": 数値, "areaCorrect": 数値 },
  { "name": "取引事例 ①", "price": 数値, "timeCorrect": 数値, "areaCorrect": 数値 },
  { "name": "取引事例 ②", "price": 数値, "timeCorrect": 数値, "areaCorrect": 数値 },
  { "name": "取引事例 ③", "price": 数値, "timeCorrect": 数値, "areaCorrect": 数値 }
]`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'
  try {
    const result = JSON.parse(raw)
    if (!Array.isArray(result) || result.length === 0) throw new Error('invalid')
    const cases = result.map((c: { name?: string; price?: number; timeCorrect?: number; areaCorrect?: number }, i: number) => ({
      id: i + 1,
      name: c.name ?? `事例 ${i + 1}`,
      price: Math.round(c.price ?? 80000),
      timeCorrect: parseFloat((c.timeCorrect ?? 1.00).toFixed(2)),
      areaCorrect: parseFloat((c.areaCorrect ?? 1.00).toFixed(2)),
    }))
    return NextResponse.json({ cases })
  } catch {
    return NextResponse.json({ error: '取引事例の生成に失敗しました' }, { status: 500 })
  }
}
