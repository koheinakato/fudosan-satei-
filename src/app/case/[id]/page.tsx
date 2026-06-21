'use client'

import { useEffect, useState, use } from 'react'
import { Case } from '@/types/database'

const STATUS_STEPS = [
  { key: 'card_saved', label: '登記情報確認中' },
  { key: 'parcel_confirmed', label: '料金確定' },
  { key: 'processing', label: 'AI分析中' },
  { key: 'review_pending', label: 'プロ確認中' },
  { key: 'completed', label: '完了' },
]

const STATUS_ORDER = ['draft', 'card_saved', 'parcel_confirmed', 'lot_input_pending', 'processing', 'review_pending', 'completed']

export default function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [caseData, setCaseData] = useState<Case | null>(null)

  useEffect(() => {
    fetch(`/api/cases/${id}`)
      .then((r) => r.json())
      .then((d) => setCaseData(d.case))
  }, [id])

  if (!caseData) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm text-[#5a5a5a]">読み込み中...</p>
      </div>
    )
  }

  const currentIndex = STATUS_ORDER.indexOf(caseData.status)

  return (
    <main className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-lg mx-auto">

        {/* ヘッダー */}
        <div className="mb-12">
          <p className="font-helvetica text-[11px] tracking-[0.1em] text-[#5a5a5a] uppercase mb-4">
            Case {caseData.id.slice(0, 8)}
          </p>
          <h1 className="text-2xl font-medium text-[#212529] mb-2">査定状況</h1>
          <p className="text-sm text-[#5a5a5a]">{caseData.property_address}</p>
        </div>

        {/* ステータスステッパー */}
        <div className="space-y-4 mb-12">
          <p className="label-nendo border-b border-[#ced4da] pb-2">進捗</p>
          <div className="space-y-3 pt-1">
            {STATUS_STEPS.map((step) => {
              const stepIndex = STATUS_ORDER.indexOf(step.key)
              const isDone = currentIndex > stepIndex
              const isCurrent = currentIndex === stepIndex || (step.key === 'parcel_confirmed' && caseData.status === 'lot_input_pending')
              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isDone ? 'bg-[#212529]' : isCurrent ? 'bg-[#5a5a5a]' : 'bg-[#ced4da]'}`} />
                  <span className={`text-sm ${isDone ? 'text-[#5a5a5a] line-through' : isCurrent ? 'text-[#212529] font-medium' : 'text-[#ced4da]'}`}>
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 料金情報 */}
        {caseData.total_price && (
          <div className="space-y-3 mb-12">
            <p className="label-nendo border-b border-[#ced4da] pb-2">料金</p>
            <div className="flex justify-between items-baseline pt-1">
              <span className="text-sm text-[#5a5a5a]">
                査定料金
                {caseData.parcel_count && (
                  <span className="ml-1 text-xs">（{caseData.parcel_count}筆）</span>
                )}
              </span>
              <span className="text-lg font-medium text-[#212529]">¥{caseData.total_price.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* 筆数説明 */}
        {caseData.parcel_count && (
          <div className="border-l-2 border-[#ced4da] pl-4 mb-12">
            <p className="label-nendo mb-1">筆数について</p>
            <p className="text-xs text-[#5a5a5a] leading-relaxed">
              「筆数」とは、土地の登記上の区画数です。見た目が1つの土地でも、登記上は複数の筆に分かれていることがあります。
              弊社が登記情報を確認し、筆数に応じた料金を算出しました。
            </p>
          </div>
        )}

        {/* レポート完成 */}
        {caseData.status === 'completed' && caseData.report_url && (
          <div className="space-y-3">
            <p className="label-nendo border-b border-[#ced4da] pb-2">査定レポート</p>
            <p className="text-sm text-[#212529] pt-1">査定レポートが完成しました。</p>
            <a
              href={caseData.report_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-[#212529] text-white text-sm py-2.5 px-6 font-helvetica tracking-[0.05em] hover:bg-[#5a5757] transition-colors"
            >
              レポートを見る
            </a>
          </div>
        )}
      </div>
    </main>
  )
}
