// 建物価値評価基準(構造別・経年掛け率表/修繕更新履歴による加減算基準 2026年8月)に基づく建物評価

export type StructureClass = '木造' | '軽量鉄骨' | 'RC・SRC'

// 申込フォーム・管理画面で共通の修繕・リフォーム加算項目
// group: 同一部位は択一(高い方のみ採用)
export const RENOVATION_ITEMS = [
  { key: 'roof_full', label: '屋根・外壁の葺替／張替（施工後10年以内）', points: 10, group: 'roof' },
  { key: 'roof_paint', label: '屋根・外壁の塗装のみ（施工後10年以内）', points: 5, group: 'roof' },
  { key: 'water_full', label: '水回り4点一式の更新（キッチン・浴室・洗面・トイレ／10年以内）', points: 10, group: 'water' },
  { key: 'water_part', label: '水回りの一部更新（1〜2点／10年以内）', points: 4, group: 'water' },
  { key: 'interior', label: '内装フルリフォーム（クロス・床の全面更新／5年以内）', points: 6, group: null },
  { key: 'pipes', label: '給排水管の更新（本管・枝管とも）', points: 10, group: null },
  { key: 'sash', label: 'サッシ交換・内窓・断熱改修（全開口部）', points: 5, group: null },
  { key: 'seismic', label: '耐震改修（新耐震基準適合・適合証明書あり）', points: 8, group: null },
  { key: 'hvac', label: '給湯器・空調の更新（5年以内）', points: 2, group: null },
] as const

export type RenovationKey = typeof RENOVATION_ITEMS[number]['key']

// ベース掛け率表(未更新前提、%)。5年刻み・中間年は直線補間
const AGES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
const BASE_RATES: Record<StructureClass, number[]> = {
  '木造': [100, 90, 80, 70, 60, 52, 45, 37, 30, 22, 15, 10, 10],
  '軽量鉄骨': [100, 91, 82, 72, 62, 52, 42, 33, 25, 18, 12, 10, 10],
  'RC・SRC': [100, 93, 86, 79, 72, 64, 56, 48, 40, 34, 28, 23, 18],
}
// 残価下限(使用可能な限り建物価値をゼロとしない)
const RATE_FLOOR: Record<StructureClass, number> = { '木造': 10, '軽量鉄骨': 10, 'RC・SRC': 15 }

// 登記の構造文言から掛け率表の構造区分を判定
export function structureClassOf(structure: string): StructureClass | null {
  if (!structure) return null
  if (/軽量鉄骨/.test(structure)) return '軽量鉄骨'
  if (/ＳＲＣ|SRC|鉄骨鉄筋|ＲＣ|RC|鉄筋コンクリート|コンクリート/.test(structure)) return 'RC・SRC'
  if (/木造|Ｗ造/.test(structure)) return '木造'
  if (/鉄骨|Ｓ造/.test(structure)) return '軽量鉄骨' // 重量鉄骨は表にないため保守的に軽量鉄骨欄を準用
  return null
}

// 築年数からベース掛け率(%)を算出(中間年は直線補間、60年超は下限へ向けて逓減)
export function baseRate(cls: StructureClass, age: number): number {
  const rates = BASE_RATES[cls]
  const floor = RATE_FLOOR[cls]
  if (age <= 0) return 100
  const last = AGES[AGES.length - 1]
  if (age >= last) {
    // 最終区間の傾きで逓減し、残価下限で止める
    const slope = (rates[rates.length - 2] - rates[rates.length - 1]) / 5
    return Math.max(floor, Math.round(rates[rates.length - 1] - slope * (age - last)))
  }
  const i = AGES.findIndex(a => a >= age)
  const a0 = AGES[i - 1], a1 = AGES[i]
  const r0 = rates[i - 1], r1 = rates[i]
  return Math.max(floor, Math.round(r0 - ((r0 - r1) * (age - a0)) / (a1 - a0)))
}

// 修繕履歴による加算pt(同一部位は択一、築15年未満は1/2圧縮、上限+20pt)
export function renovationPoints(keys: string[], age: number): { points: number; adopted: string[] } {
  const selected = RENOVATION_ITEMS.filter(item => keys.includes(item.key))
  const adopted: typeof selected = []
  for (const item of selected) {
    if (item.group) {
      const rival = adopted.find(a => a.group === item.group)
      if (rival) {
        if (item.points > rival.points) adopted[adopted.indexOf(rival)] = item
        continue
      }
    }
    adopted.push(item)
  }
  let raw = adopted.reduce((s, item) => s + item.points, 0)
  if (age < 15) raw = raw / 2 // 築15年未満は加算を1/2に圧縮
  return { points: Math.min(Math.round(raw), 20), adopted: adopted.map(a => a.key) }
}

// 最終掛け率(%): ベース+加算。95%上限は「加算の上限」なので、
// 加算で95%を超えることは不可だが、ベース自体が95%超(築浅)の場合はそのまま
export function buildingRate(cls: StructureClass, age: number, renovationKeys: string[]): {
  base: number; added: number; rate: number
} {
  const base = baseRate(cls, age)
  const { points } = renovationPoints(renovationKeys, age)
  return { base, added: points, rate: Math.min(base + points, Math.max(base, 95)) }
}
