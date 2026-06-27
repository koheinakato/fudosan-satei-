import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const data = await req.json()

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 })
  }

  const { Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `以下の不動産データをもとに、プロの不動産コンサルタントによる「総合所見」を日本語で作成してください。
400〜500文字程度、段落なし・一文で書き始め、専門的かつ信頼感のある文体にしてください。

【物件情報】
- 物件名称: ${data.propertyName || '未設定'}
- 所在地: ${data.address || '未設定'}
- 物件種別: ${data.propertyType || '未設定'}

【土地の概要】
- 地積: ${data.landArea || 0}㎡（セットバック ${data.setback || 0}㎡）
- 前面道路路線価: ${data.rosenka || 0}円/㎡
- 用途地域: ${data.useDistrict || '未設定'}
- 建蔽率/容積率: ${data.buildingCoverage || 0}%/${data.floorCoverage || 0}%
- 最寄駅: ${data.railway || ''} ${data.station || ''}駅 徒歩${data.walkTime || 0}分
- 土地形状: ${data.shape || '未設定'}

【建物の概要】
- 構造: ${data.structure || '未設定'}
- 延床面積: ${data.floorArea || 0}㎡
- 築年数: ${data.age || 0}年（法定耐用年数 ${data.usefulLife || 22}年）

【査定評価額】
- 総合査定額: ${data.evaluationTotal || 0}円
- 土地評価額: ${data.landTotal || 0}円（比重 ${data.weightLand || 0}%）
- 建物評価額: ${data.buildingTotal || 0}円（比重 ${data.weightBuilding || 0}%）
- 収益評価額: ${data.incomeTotal || 0}円（比重 ${data.weightIncome || 0}%）

総合所見のみを出力してください。見出し・番号・箇条書き不要。`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return NextResponse.json({ opinion: text })
}
