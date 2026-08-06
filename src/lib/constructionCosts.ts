// 再調達原価の実勢初期値: 国土交通省 建築着工統計調査(住宅着工統計 第34表)の
// 新築住宅1㎡あたり工事費予定額を、物件所在の都道府県×構造で引き当てる
import {
  CONSTRUCTION_COSTS, CONSTRUCTION_COST_PERIOD, PREF_CODE_TO_KEY, type CostClass,
} from './constructionCostsData'
import { prefCodeFromAddress } from './reinfolib'

export { CONSTRUCTION_COST_PERIOD }

// 標本(年間着工床面積)がこれ未満の都道府県×構造は単価が不安定なため全国平均を使う
const MIN_SAMPLE_AREA = 10000

// 登記の構造文言→建築着工統計の構造区分(軽量鉄骨・重量鉄骨は「鉄骨造」に含まれる)
export function costClassOf(structure: string): CostClass | null {
  if (!structure) return null
  if (/ＳＲＣ|SRC|鉄骨鉄筋/.test(structure)) return 'SRC'
  if (/ＲＣ|RC|鉄筋コンクリート|コンクリート/.test(structure)) return 'RC'
  if (/鉄骨|Ｓ造/.test(structure)) return '鉄骨造'
  if (/木造|Ｗ造/.test(structure)) return '木造'
  return null
}

export type ReplacementCost = {
  rate: number      // 円/㎡
  region: string    // 引き当てた地域(都道府県名 or 全国平均)
  costClass: CostClass
}

export function replacementCost(structure: string, address: string): ReplacementCost | null {
  const cls = costClassOf(structure)
  if (!cls) return null
  const prefCode = prefCodeFromAddress(address || '')
  const prefKey = prefCode ? PREF_CODE_TO_KEY[prefCode] : null
  const prefCell = prefKey ? CONSTRUCTION_COSTS[prefKey]?.[cls] : null
  if (prefCell?.rate && prefCell.area >= MIN_SAMPLE_AREA) {
    return { rate: prefCell.rate, region: prefKey!, costClass: cls }
  }
  const national = CONSTRUCTION_COSTS['全国'][cls]
  if (national.rate) return { rate: national.rate, region: '全国平均', costClass: cls }
  return null
}
