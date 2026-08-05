import { NextResponse } from 'next/server'
import {
  REINFOLIB_ATTRIBUTION, normalizeAddress, prefCodeFromAddress, townFromAddress,
  getCityCode, geocodeJa, fetchLandPricePoints, fetchTransactions,
  parsePeriod, timeFactor,
  type LandPricePoint, type Transaction,
} from '@/lib/reinfolib'

type Case = { id: number; name: string; price: number; timeCorrect: number; areaCorrect: number }

function periodShort(period: string | undefined): string {
  const m = (period ?? '').match(/(\d{4})年第([1-4])四半期/)
  return m ? `'${m[1].slice(2)}Q${m[2]}` : ''
}

function txUnitPrice(t: Transaction): number | null {
  const area = parseInt(t.Area ?? '', 10)
  const unit = parseInt(t.UnitPrice ?? '', 10)
  if (Number.isFinite(unit) && unit > 0) return unit
  const trade = parseInt(t.TradePrice ?? '', 10)
  if (Number.isFinite(trade) && trade > 0 && Number.isFinite(area) && area > 0) {
    return Math.round(trade / area)
  }
  return null
}

// 地価ポイントの住居表示(例: 三条２－１３－６)から町名部分を取り出す
function townOfPointName(name: string): string {
  return (name.match(/^[^0-9０-９]+/)?.[0] ?? '').trim()
}

// 対象地と同じ大字 > 近傍公示地点のある町 > その他 の順に、町内では新しい四半期順
function sortByRelevance(txs: Transaction[], town: string, points: LandPricePoint[]): Transaction[] {
  const nearbyTowns = new Map<string, number>() // 町名 → 最寄り地点距離(m)
  for (const p of points) {
    const t = townOfPointName(p.name)
    if (t && !nearbyTowns.has(t)) nearbyTowns.set(t, p.distance)
  }
  const proximity = (t: Transaction): number => {
    const district = t.DistrictName ?? ''
    if (!district) return Infinity
    if (town && district.includes(town)) return 0
    let best = Infinity
    for (const [nt, dist] of nearbyTowns) {
      if (district.includes(nt) || nt.includes(district)) best = Math.min(best, dist)
    }
    return best
  }
  return [...txs].sort((a, b) => {
    const pa = proximity(a), pb = proximity(b)
    if (pa !== pb) return pa - pb
    return (parsePeriod(b.Period)?.getTime() ?? 0) - (parsePeriod(a.Period)?.getTime() ?? 0)
  })
}

// 中央値から大きく外れる単価の事例を除外(新築転売・特殊事情の混入対策)
function trimOutliers<T>(items: T[], unitOf: (t: T) => number): T[] {
  if (items.length < 4) return items
  const sorted = items.map(unitOf).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  return items.filter(t => unitOf(t) >= median * 0.4 && unitOf(t) <= median * 2.5)
}

// 建築費・地価の高騰局面では古い事例ほど現在価格と乖離するため、
// 直近4四半期の事例を最優先し、不足分のみ古い事例で補完する
const RECENT_QUARTERS = 4
function splitByRecency(txs: Transaction[]): { recent: Transaction[]; older: Transaction[] } {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - RECENT_QUARTERS * 3)
  const recent: Transaction[] = []
  const older: Transaction[] = []
  for (const t of txs) {
    ((parsePeriod(t.Period)?.getTime() ?? 0) >= cutoff.getTime() ? recent : older).push(t)
  }
  return { recent, older }
}

// 採用事例の取引時期の範囲(例: 2025年第2四半期〜2025年第4四半期)
function periodRangeOf(periods: string[]): string {
  const dated = periods
    .map(p => ({ p, d: parsePeriod(p)?.getTime() ?? 0 }))
    .filter(x => x.d > 0)
    .sort((a, b) => a.d - b.d)
  if (dated.length === 0) return ''
  const from = dated[0].p, to = dated[dated.length - 1].p
  return from === to ? from : `${from}〜${to}`
}

async function buildRealCases(address: string, propertyType: string): Promise<{ cases: Case[]; note: string } | null> {
  const prefCode = prefCodeFromAddress(address)
  if (!prefCode) return null

  const [coords, cityCode] = await Promise.all([
    geocodeJa(address),
    getCityCode(prefCode, address),
  ])
  const town = townFromAddress(address)

  const points: LandPricePoint[] = coords ? await fetchLandPricePoints(coords.lat, coords.lng) : []
  const avgYoy = points.length > 0
    ? points.slice(0, 5).reduce((s, p) => s + (p.yoyRate ?? 0), 0) / Math.min(points.length, 5)
    : 0

  const txs: Transaction[] = cityCode ? await fetchTransactions(prefCode, cityCode) : []
  const cases: Case[] = []
  const adoptedPeriods: string[] = []
  const pointYears = new Set<number>()

  if (propertyType === 'mansion') {
    // マンション: 実取引の専有面積㎡単価で比準(建物込み単価なので公示地価とは混ぜない)
    const candidates = trimOutliers(
      txs.filter(t => (t.Type ?? '').includes('マンション') && (txUnitPrice(t) ?? 0) >= 30000),
      t => txUnitPrice(t)!
    )
    const { recent, older } = splitByRecency(candidates)
    const mans = [...sortByRelevance(recent, town, points), ...sortByRelevance(older, town, points)]
    for (const t of mans) {
      const unit = txUnitPrice(t)
      if (!unit) continue
      const area = parseInt(t.Area ?? '', 10) || 0
      const built = (t.BuildingYear ?? '').replace(/年$/, '')
      cases.push({
        id: cases.length + 1,
        name: `取引 ${t.DistrictName ?? ''} ${area}㎡${built ? `・${built}築` : ''} ${periodShort(t.Period)}`,
        price: unit,
        timeCorrect: timeFactor(parsePeriod(t.Period), avgYoy),
        areaCorrect: 1.00,
      })
      if (t.Period) adoptedPeriods.push(t.Period)
      if (cases.length >= 6) break
    }
  } else {
    // 土地・戸建て: 公示地2 + 基準地1 + 宅地(土地)の実取引3
    const kouji = points.filter(p => p.type === 0).slice(0, 2)
    const kijun = points.filter(p => p.type === 1).slice(0, 1)
    const nearby = [...kouji, ...kijun]
    // 基準地がない場合は公示地で補完
    for (const p of points.filter(p => p.type === 0).slice(2)) {
      if (nearby.length >= 3) break
      nearby.push(p)
    }
    for (const p of nearby) {
      cases.push({
        id: cases.length + 1,
        name: `${p.type === 0 ? '公示地' : '基準地'} ${p.name}(${(p.distance / 1000).toFixed(1)}km)`,
        price: p.price,
        timeCorrect: timeFactor(p.priceDate, p.yoyRate ?? avgYoy),
        areaCorrect: 1.00,
      })
      pointYears.add(p.priceDate.getFullYear())
    }

    const { recent, older } = splitByRecency(txs.filter(t => t.Type === '宅地(土地)'))
    const lands = [...sortByRelevance(recent, town, points), ...sortByRelevance(older, town, points)]
    let added = 0
    for (const t of lands) {
      const unit = txUnitPrice(t)
      const area = parseInt(t.Area ?? '', 10) || 0
      if (!unit || unit < 1000 || area < 40) continue
      cases.push({
        id: cases.length + 1,
        name: `取引 ${t.DistrictName ?? ''} ${area}㎡ ${periodShort(t.Period)}`,
        price: unit,
        timeCorrect: timeFactor(parsePeriod(t.Period), avgYoy),
        areaCorrect: 1.00,
      })
      if (t.Period) adoptedPeriods.push(t.Period)
      if (++added >= 3) break
    }
  }

  if (cases.length < 3) return null
  const range = periodRangeOf(adoptedPeriods)
  const years = [...pointYears].sort().map(y => `${y}年`).join('・')
  const noteParts = [
    range ? `採用した取引事例の時期: ${range}（直近${RECENT_QUARTERS}四半期を優先、時点修正で現在価格へ補正）` : null,
    years ? `地価公示・地価調査は${years}時点の価格` : null,
  ].filter(Boolean)
  return { cases, note: noteParts.join(' / ') }
}

// フォールバック: 実データが取れない場合のみAI推定(従来ロジック)
async function buildAiCases(address: string, propertyType: string, rosenka: number | undefined): Promise<Case[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null

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
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const result = JSON.parse(cleaned)
    if (!Array.isArray(result) || result.length === 0) return null
    return result.map((c: { name?: string; price?: number; timeCorrect?: number; areaCorrect?: number }, i: number) => ({
      id: i + 1,
      name: c.name ?? `事例 ${i + 1}`,
      price: Math.round(c.price ?? 80000),
      timeCorrect: parseFloat((c.timeCorrect ?? 1.00).toFixed(2)),
      areaCorrect: parseFloat((c.areaCorrect ?? 1.00).toFixed(2)),
    }))
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const { address: rawAddress, propertyType, rosenka } = await req.json()
  if (!rawAddress) return NextResponse.json({ error: '住所が必要です' }, { status: 400 })
  const address = /[　-鿿豈-﫿＀-￯]/.test(rawAddress) ? normalizeAddress(rawAddress) : rawAddress

  try {
    const real = await buildRealCases(address, propertyType)
    if (real) {
      return NextResponse.json({
        cases: real.cases,
        source: 'reinfolib',
        note: real.note,
        attribution: REINFOLIB_ATTRIBUTION,
      })
    }
  } catch { /* 実データ取得に失敗した場合はAI推定へ */ }

  const aiCases = await buildAiCases(address, propertyType, rosenka)
  if (aiCases) return NextResponse.json({ cases: aiCases, source: 'ai' })
  return NextResponse.json({ error: '取引事例の生成に失敗しました' }, { status: 500 })
}
