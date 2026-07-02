'use client'

import { useEffect, useState, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Case } from '@/types/database'

const calcPrice = (n: number) => 980 + Math.max(0, n - 2) * 350

const PROPERTY_TYPE_LABELS = { house: '戸建て', mansion: 'マンション', land: '土地' }
const PURPOSE_LABELS = { sell: '売却', inherit: '相続', other: 'その他' }

export default function AdminCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [caseData, setCaseData] = useState<Case | null>(null)
  const [parcelCount, setParcelCount] = useState('')
  const [parsedLots, setParsedLots] = useState<string[]>([])
  const [adminNotes, setAdminNotes] = useState('')
  const [reportUrl, setReportUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsing, setParsing] = useState<'land' | 'building' | null>(null)
  const [message, setMessage] = useState('')
  const landPdfInputRef = useRef<HTMLInputElement>(null)
  const buildingPdfInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/cases/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setCaseData(d.case)
        setAdminNotes(d.case?.admin_notes || '')
        setParcelCount(d.case?.parcel_count?.toString() || '')
        setReportUrl(d.case?.report_url || '')
        if (d.case?.lot_numbers) setParsedLots(d.case.lot_numbers as string[])
      })
  }, [id])

  const parsePdf = async (file: File, type: 'land' | 'building') => {
    setParsing(type)
    setMessage(`${type === 'land' ? '土地' : '建物'}登記PDFを解析中...`)
    try {
      const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
      GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@6.0.227/build/pdf.worker.min.mjs`
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await getDocument({ data: arrayBuffer }).promise
      let fullText = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        fullText += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n'
      }

      const res = await fetch(`/api/cases/${id}/parse-parcels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullText }),
      })
      const d = await res.json()
      if (d.parcelCount !== undefined && d.parcelCount !== null) {
        if (type === 'land') {
          setParcelCount(String(d.parcelCount))
          setParsedLots(d.lotNumbers || [])
          setMessage(`土地登記 解析完了: ${d.parcelCount}筆 / ${d.address || ''}`)
        } else {
          setMessage(`建物登記 解析完了: ${d.address || ''}（筆数は土地登記から取得済み）`)
        }
      } else {
        setMessage(`解析失敗: ${d.error}`)
      }
    } catch (err) {
      setMessage(`PDFの読み込みに失敗しました: ${err instanceof Error ? err.message : ''}`)
    } finally {
      setParsing(null)
      if (type === 'land' && landPdfInputRef.current) landPdfInputRef.current.value = ''
      if (type === 'building' && buildingPdfInputRef.current) buildingPdfInputRef.current.value = ''
    }
  }

  const handleConfirmParcels = async () => {
    const count = parseInt(parcelCount)
    if (!count || count < 1) return
    setLoading(true)

    const res = await fetch(`/api/cases/${id}/confirm-parcels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parcel_count: count, admin_notes: adminNotes }),
    })

    setLoading(false)
    if (res.ok) {
      setMessage('筆数を確定しました。顧客にメールを送信しました。')
      const data = await res.json()
      setCaseData(data.case)
    } else {
      setMessage('エラーが発生しました')
    }
  }

  const handleCharge = async () => {
    if (!confirm(`¥${caseData?.total_price?.toLocaleString()} を請求します。よろしいですか？`)) return
    setLoading(true)

    const res = await fetch(`/api/cases/${id}/charge`, { method: 'POST' })
    setLoading(false)

    if (res.ok) {
      setMessage('請求を実行しました')
    } else {
      const d = await res.json()
      setMessage(`エラー: ${d.error}`)
    }
  }

  const handleUpdateStatus = async (status: string) => {
    setLoading(true)
    const res = await fetch(`/api/cases/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, report_url: reportUrl || undefined }),
    })
    setLoading(false)
    if (res.ok) {
      const d = await res.json()
      setCaseData(d.case)
      setMessage('ステータスを更新しました')
    }
  }

  if (!caseData) {
    return <div className="min-h-screen bg-stone-50 flex items-center justify-center">読み込み中...</div>
  }

  const previewPrice = parcelCount ? calcPrice(parseInt(parcelCount)) : null

  return (
    <main className="min-h-screen bg-stone-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin')} className="text-stone-400 hover:text-stone-600">← 一覧</button>
            <h1 className="text-xl font-bold text-stone-800">案件詳細</h1>
          </div>
          <button onClick={() => router.push(`/admin/case/${id}/report`)} className="text-sm px-4 py-1.5 bg-stone-800 text-white rounded hover:bg-stone-700">
            査定書作成 →
          </button>
        </div>

        {/* 基本情報 */}
        <Card>
          <CardHeader><CardTitle>基本情報</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="ステータス" value={<Badge>{caseData.status}</Badge>} />
            <Separator />
            <Row label="お客様名" value={caseData.customer_name} />
            <Row label="メール" value={caseData.customer_email} />
            <Row label="電話" value={caseData.customer_phone} />
            <Separator />
            <Row label="物件住所" value={caseData.property_address} />
            <Row label="物件種別" value={PROPERTY_TYPE_LABELS[caseData.property_type as keyof typeof PROPERTY_TYPE_LABELS]} />
            <Row label="査定目的" value={PURPOSE_LABELS[caseData.assessment_purpose as keyof typeof PURPOSE_LABELS]} />
            <Separator />
            {caseData.lot_numbers && (
              <>
                <Row label="地番" value={
                  <ul className="space-y-1">
                    {(caseData.lot_numbers as string[]).map((lot, i) => (
                      <li key={i}>{i + 1}. {lot}</li>
                    ))}
                  </ul>
                } />
                <Separator />
              </>
            )}
            <Row label="受付日" value={new Date(caseData.created_at).toLocaleString('ja-JP')} />
          </CardContent>
        </Card>

        {/* 筆数確定 */}
        {['card_saved', 'parcel_confirmed', 'lot_input_pending'].includes(caseData.status) && (
          <Card className="border-amber-200">
            <CardHeader><CardTitle>筆数の確定・請求</CardTitle></CardHeader>
            <CardContent className="space-y-4">

              {/* PDF自動解析 */}
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-stone-700">登記PDFから自動解析</p>
                <p className="text-xs text-stone-400">土地・建物それぞれの登記PDFをアップロードしてください。筆数は土地登記から取得します。</p>

                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-stone-500 mb-1">土地登記（筆数・地番を取得）</p>
                    <div className="flex gap-2 items-center">
                      <input
                        ref={landPdfInputRef}
                        type="file"
                        accept="application/pdf"
                        onChange={e => { const f = e.target.files?.[0]; if (f) parsePdf(f, 'land') }}
                        disabled={parsing !== null}
                        className="text-xs text-stone-500 file:mr-2 file:py-1.5 file:px-3 file:border file:border-stone-300 file:bg-white file:text-stone-700 file:text-xs file:cursor-pointer hover:file:bg-stone-50"
                      />
                      {parsing === 'land' && <span className="text-xs text-amber-600 animate-pulse">解析中...</span>}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-stone-500 mb-1">建物登記（参考）</p>
                    <div className="flex gap-2 items-center">
                      <input
                        ref={buildingPdfInputRef}
                        type="file"
                        accept="application/pdf"
                        onChange={e => { const f = e.target.files?.[0]; if (f) parsePdf(f, 'building') }}
                        disabled={parsing !== null}
                        className="text-xs text-stone-500 file:mr-2 file:py-1.5 file:px-3 file:border file:border-stone-300 file:bg-white file:text-stone-700 file:text-xs file:cursor-pointer hover:file:bg-stone-50"
                      />
                      {parsing === 'building' && <span className="text-xs text-amber-600 animate-pulse">解析中...</span>}
                    </div>
                  </div>
                </div>

                {parsedLots.length > 0 && (
                  <div className="pt-1 border-t border-stone-200">
                    <p className="text-xs text-stone-500 mb-1">解析された地番:</p>
                    <ul className="text-xs text-stone-700 space-y-0.5">
                      {parsedLots.map((lot, i) => (
                        <li key={i} className="flex gap-1">
                          <span className="text-stone-400">{i + 1}.</span>
                          <span>{lot}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>筆数</Label>
                <div className="flex gap-3 items-center">
                  <Input
                    type="number"
                    min={1}
                    value={parcelCount}
                    onChange={(e) => setParcelCount(e.target.value)}
                    className="w-32"
                    placeholder="例: 3"
                  />
                  {previewPrice && (
                    <span className="text-stone-600 text-sm">
                      → 査定料金: <strong>¥{previewPrice.toLocaleString()}</strong>
                      {parseInt(parcelCount) > 2 && (
                        <span className="text-stone-400 ml-2">
                          （980 + {parseInt(parcelCount) - 2}筆 × 350）
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>備考（顧客には送信しない）</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="内部メモ..."
                  rows={3}
                />
              </div>

              <Button
                onClick={handleConfirmParcels}
                disabled={loading || !parcelCount}
                className="bg-amber-500 hover:bg-amber-600 text-stone-900 font-bold"
              >
                筆数を確定してメール送信
              </Button>

              {caseData.total_price && (
                <div className="border-t pt-4">
                  <p className="text-sm text-stone-600 mb-3">
                    確定済み料金: <strong>¥{caseData.total_price.toLocaleString()}</strong>
                  </p>
                  <Button
                    onClick={handleCharge}
                    disabled={loading}
                    variant="destructive"
                  >
                    ¥{caseData.total_price.toLocaleString()} を請求する
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ステータス更新 */}
        <Card>
          <CardHeader><CardTitle>ステータス更新</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {caseData.status === 'processing' && (
              <Button onClick={() => handleUpdateStatus('review_pending')} disabled={loading} variant="outline">
                プロ確認中に変更
              </Button>
            )}
            {caseData.status === 'review_pending' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>レポートURL</Label>
                  <Input
                    value={reportUrl}
                    onChange={(e) => setReportUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <Button onClick={() => handleUpdateStatus('completed')} disabled={loading || !reportUrl} className="bg-green-600 hover:bg-green-700 text-white">
                  完了・納品済みに変更
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {message && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 text-sm">
            {message}
          </div>
        )}
      </div>
    </main>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-stone-500 flex-shrink-0">{label}</span>
      <span className="text-stone-800 text-right">{value}</span>
    </div>
  )
}
