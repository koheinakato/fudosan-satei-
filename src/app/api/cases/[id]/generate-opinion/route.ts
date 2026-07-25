import { NextResponse } from 'next/server'
import {
  normalizeAddress, geocodeJa, fetchLandPricePoints, fetchUseArea,
  fetchNearestStation, fetchFuturePopulation,
} from '@/lib/reinfolib'

// 不動産情報ライブラリの実データを所見の根拠として組み立てる
async function buildMarketSection(rawAddress: string): Promise<string> {
  const address = normalizeAddress(rawAddress)
  const coords = await geocodeJa(address)
  if (!coords) return ''

  const [points, useArea, station, population] = await Promise.all([
    fetchLandPricePoints(coords.lat, coords.lng).catch(() => []),
    fetchUseArea(coords.lat, coords.lng).catch(() => null),
    fetchNearestStation(coords.lat, coords.lng).catch(() => null),
    fetchFuturePopulation(coords.lat, coords.lng).catch(() => null),
  ])

  const lines: string[] = []
  const near = points.filter(p => p.distance <= 3000).slice(0, 3)
  if (near.length > 0) {
    lines.push(`- 周辺の地価公示・地価調査: ${near.map(p =>
      `${p.name}(${p.distance}m) ${p.price.toLocaleString()}円/㎡` +
      (p.yoyRate != null ? `(前年比${p.yoyRate > 0 ? '+' : ''}${p.yoyRate}%)` : '')
    ).join('、')}`)
    const rates = near.map(p => p.yoyRate).filter((r): r is number => r != null)
    if (rates.length > 0) {
      const avg = rates.reduce((s, r) => s + r, 0) / rates.length
      lines.push(`- 周辺地価の平均前年比: ${avg > 0 ? '+' : ''}${avg.toFixed(1)}%`)
    }
  }
  if (useArea?.useDistrict) {
    lines.push(`- 用途地域: ${useArea.useDistrict}(建蔽率${useArea.buildingCoverage ?? '—'}%・容積率${useArea.floorAreaRatio ?? '—'}%)`)
  }
  if (station) {
    let s = `- 最寄駅: ${station.railway}${station.station}駅(直線${station.distance}m)`
    if (station.passengers != null) {
      s += ` 乗降客数 約${station.passengers.toLocaleString()}人/日`
      if (station.passengersPast != null && station.passengersPast > 0) {
        const chg = ((station.passengers / station.passengersPast) - 1) * 100
        s += `(2011年比${chg > 0 ? '+' : ''}${chg.toFixed(0)}%)`
      }
    }
    lines.push(s)
  }
  if (population) {
    lines.push(`- 周辺250mメッシュの将来推計人口: ${population.baseYear}年${population.basePop}人 → ${population.targetYear}年${population.targetPop}人(${population.changePct > 0 ? '+' : ''}${population.changePct}%)`)
  }
  if (lines.length === 0) return ''
  return `
【市場・立地の実データ（出典: 国土交通省 不動産情報ライブラリ）】
${lines.join('\n')}`
}

export async function POST(req: Request) {
  const data = await req.json()

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 })
  }

  let marketSection = ''
  try {
    if (data.address && /[　-鿿豈-﫿＀-￯]/.test(String(data.address))) {
      marketSection = await buildMarketSection(String(data.address))
    }
  } catch { /* 実データなしでも所見は生成する */ }

  const casesSection = Array.isArray(data.cases) && data.cases.length > 0
    ? `
【査定に採用した事例（実データ）】
${data.cases.map((c: { name?: string; price?: number }) => `- ${c.name}: ${Number(c.price ?? 0).toLocaleString()}円/㎡`).join('\n')}`
    : ''

  const { Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const isMansion = data.propertyType === 'mansion'

  const propertySection = isMansion ? `
【マンション概要】
- 所在地: ${data.address || '未設定'}
- 専有面積: ${data.floorArea || 0}㎡
- 所在階 / 総階数: ${data.mansionFloor || 0}階 / ${data.mansionTotalFloors || 0}階建
- 向き: ${data.mansionDirection || '未設定'}
- 構造: ${data.structure || '未設定'}
- 築年数: ${data.age || 0}年（法定耐用年数 ${data.usefulLife || 47}年）
- 管理費: ${data.mansionManagementFee || 0}円/月、修繕積立金: ${data.mansionRepairFund || 0}円/月
- 最寄駅: ${data.railway || ''} ${data.station || ''}駅 徒歩${data.walkTime || 0}分` : `
【土地の概要】
- 地積: ${data.landArea || 0}㎡（セットバック ${data.setback || 0}㎡）
- 前面道路路線価: ${data.rosenka || 0}円/㎡
- 最寄駅: ${data.railway || ''} ${data.station || ''}駅 徒歩${data.walkTime || 0}分
- 土地形状: ${data.shape || '未設定'}

【建物の概要】
- 構造: ${data.structure || '未設定'}
- 延床面積: ${data.floorArea || 0}㎡
- 築年数: ${data.age || 0}年（法定耐用年数 ${data.usefulLife || 22}年）`

  const evalSection = isMansion ? `
【査定評価額】
- 総合査定額: ${data.evaluationTotal || 0}円
- 事例比較評価額: ${data.caseEvalTotal || 0}円（比重 ${data.weightLand || 0}%）
- 建物評価額: ${data.buildingTotal || 0}円（比重 ${data.weightBuilding || 0}%）
- 収益評価額: ${data.incomeTotal || 0}円（比重 ${data.weightIncome || 0}%）` : `
【査定評価額】
- 総合査定額: ${data.evaluationTotal || 0}円
- 土地評価額: ${data.caseEvalTotal || 0}円（比重 ${data.weightLand || 0}%）
- 建物評価額: ${data.buildingTotal || 0}円（比重 ${data.weightBuilding || 0}%）
- 収益評価額: ${data.incomeTotal || 0}円（比重 ${data.weightIncome || 0}%）`

  const prompt = `以下の不動産データをもとに、プロの不動産コンサルタントによる「総合所見」を日本語で作成してください。
400〜500文字程度、段落なし・一文で書き始め、専門的かつ信頼感のある文体にしてください。

【物件情報】
- 物件名称: ${data.propertyName || '未設定'}
- 物件種別: ${isMansion ? '分譲マンション（区分所有）' : (data.propertyType === 'land' ? '土地' : '戸建て住宅')}
${propertySection}
${evalSection}
${marketSection}
${casesSection}

実データ（地価水準・地価動向・駅利用状況・将来人口など）が提示されている場合は、その中から査定額の根拠づけに有効な要点を選んで所見に自然に織り込んでください。
提示されたデータにない具体的な数値・事実を創作しないでください。
総合所見のみを出力してください。見出し・番号・箇条書き不要。`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return NextResponse.json({ opinion: text })
}
