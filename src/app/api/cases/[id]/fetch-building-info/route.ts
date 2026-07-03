import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { address, propertyType } = await req.json()
  if (!address) return NextResponse.json({ error: '住所が必要です' }, { status: 400 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 })
  }

  const typeLabel =
    propertyType === 'house' ? '戸建て住宅' :
    propertyType === 'mansion' ? 'マンション（区分所有）' :
    propertyType === 'land' ? '更地（建物なし）' : '不動産'

  const { Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `あなたは日本の不動産鑑定の専門家です。
以下の物件について、建物概要と収益還元に必要な数値を推定してください。

【住所】${address}
【物件種別】${typeLabel}

以下のJSONのみを返してください（コードブロック不要）:
{
  "structure": "建物構造（例: 木造2階建、RC造、軽量鉄骨造2階建）",
  "floorArea": 延床面積の推定値(数値, ㎡。戸建て平均約100㎡、マンション約70㎡。土地の場合は0),
  "age": 築年数の推定値(数値, 年。地域の平均的な築年数を考慮。土地の場合は0),
  "usefulLife": 法定耐用年数(数値, 年。木造=22、軽量鉄骨=19または27、RC=47、SRC=47),
  "newPrice": 再調達原価(数値, 円/㎡。木造=150000〜180000、RC=200000〜250000 程度),
  "monthlyRent": 月額想定賃料(数値, 円。その地域の相場を反映。土地の場合は更地賃料相場),
  "vacancyRate": 空室率(数値, %。地域の需給を反映。通常5〜15),
  "expenseRate": 経費率(数値, %。管理費・修繕費等。通常15〜25),
  "capRate": 還元利回り(数値, %。地域・物件種別による。戸建て=5〜8、マンション=4〜7),
  "confidence": "高" または "中" または "低"
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
      structure: result.structure || '',
      floorArea: Number(result.floorArea) || 0,
      age: Number(result.age) || 0,
      usefulLife: Number(result.usefulLife) || 22,
      newPrice: Number(result.newPrice) || 200000,
      monthlyRent: Number(result.monthlyRent) || 0,
      vacancyRate: Number(result.vacancyRate) || 8.0,
      expenseRate: Number(result.expenseRate) || 18.0,
      capRate: Number(result.capRate) || 6.5,
      confidence: result.confidence || '低',
    })
  } catch {
    return NextResponse.json({ error: '建物情報の推定に失敗しました' }, { status: 500 })
  }
}
