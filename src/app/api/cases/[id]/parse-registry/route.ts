import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { text } = await req.json()

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 })
  }

  if (!text || text.trim().length < 10) {
    return NextResponse.json({ error: 'テキストが短すぎます' }, { status: 400 })
  }

  const { Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `以下の日本の不動産登記簿謄本から抽出されたテキストを解析し、JSONで返してください。

【抽出テキスト】
${text.slice(0, 3000)}

以下のJSONフォーマットのみを返してください（コードブロック不要）:
{
  "address": "所在地（地番）",
  "jyukyoHyoji": "住居表示",
  "chiban": "地番",
  "kaheiNumber": "家屋番号",
  "landArea": 土地面積(数値, ㎡),
  "floorArea": 建物床面積(数値, ㎡),
  "structure": "建物構造（例: 木造合金メッキ鋼板ぶき2階建）",
  "builtYear": 新築年(西暦数値),
  "propertyName": "物件名称（地名＋施主名等）"
}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
  try {
    const parsed = JSON.parse(raw)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: '解析に失敗しました' }, { status: 422 })
  }
}
