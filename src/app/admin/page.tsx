'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Case } from '@/types/database'

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: '申し込み中', variant: 'secondary' },
  card_saved: { label: '登記取得中', variant: 'default' },
  parcel_confirmed: { label: '地番入力待ち', variant: 'outline' },
  lot_input_pending: { label: '地番入力待ち', variant: 'outline' },
  processing: { label: 'AI分析中', variant: 'default' },
  review_pending: { label: 'プロ確認中', variant: 'outline' },
  completed: { label: '完了', variant: 'secondary' },
  cancelled: { label: 'キャンセル', variant: 'destructive' },
}

export default function AdminPage() {
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cases')
      .then((r) => r.json())
      .then((d) => {
        setCases(d.cases || [])
        setLoading(false)
      })
  }, [])

  if (loading) {
    return <div className="min-h-screen bg-stone-50 flex items-center justify-center">読み込み中...</div>
  }

  return (
    <main className="min-h-screen bg-stone-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-stone-800">案件管理</h1>
          <span className="text-stone-500 text-sm">{cases.length}件</span>
        </div>

        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-stone-500 font-medium">受付日</th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium">お客様名</th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium">住所</th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium">筆数</th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium">料金</th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium">ステータス</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {cases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-stone-400">
                    案件がありません
                  </td>
                </tr>
              ) : (
                cases.map((c) => {
                  const status = STATUS_LABELS[c.status] || { label: c.status, variant: 'secondary' as const }
                  return (
                    <tr key={c.id} className="hover:bg-stone-50">
                      <td className="px-4 py-3 text-stone-500">
                        {new Date(c.created_at).toLocaleDateString('ja-JP')}
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-800">{c.customer_name}</td>
                      <td className="px-4 py-3 text-stone-600 max-w-[200px] truncate">{c.property_address}</td>
                      <td className="px-4 py-3 text-stone-600">
                        {c.parcel_count ? `${c.parcel_count}筆` : '—'}
                      </td>
                      <td className="px-4 py-3 text-stone-800 font-medium">
                        {c.total_price ? `¥${c.total_price.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/case/${c.id}`}
                          className="text-amber-600 hover:text-amber-700 font-medium"
                        >
                          詳細 →
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
