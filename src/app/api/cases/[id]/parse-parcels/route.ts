import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { text } = await req.json()

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 })
  }
  if (!text || text.trim().length < 10) {
    return NextResponse.json({ error: 'PDFからテキストを抽出できませんでした。スキャン画像PDFの場合は手動で入力してください。' }, { status: 400 })
  }

  const { Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `以下は日本の不動産登記簿謄本（または登記情報）から抽出したテキストです。
このテキストを解析して、土地の「筆数」（地番の数）を数えてください。

【抽出テキスト】
${text.slice(0, 30000)}

以下のJSONのみを返してください（コードブロック不要）:
{
  "parcelCount": 筆数(数値),
  "lotNumbers": ["地番1", "地番2", ...],
  "address": "所在（市区町村＋大字・丁目まで）"
}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const result = JSON.parse(cleaned)
    return NextResponse.json({
      parcelCount: result.parcelCount ?? null,
      lotNumbers: result.lotNumbers ?? [],
      address: result.address ?? '',
    })
  } catch {
    return NextResponse.json({ error: `AIの返答を解析できませんでした。手動で入力してください。（raw: ${cleaned.slice(0, 100)}）` }, { status: 422 })
  }
}
