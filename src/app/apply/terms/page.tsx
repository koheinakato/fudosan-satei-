'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function TermsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const caseId = searchParams.get('case_id')
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [agreedPayment, setAgreedPayment] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!caseId) {
    return <p className="text-center text-sm text-[#5a5a5a]">案件IDが見つかりません</p>
  }

  const canProceed = agreedTerms && agreedPayment

  const handleProceed = async () => {
    if (!canProceed) return
    setLoading(true)
    await fetch(`/api/cases/${caseId}/record-consent`, { method: 'POST' }).catch(() => {})
    router.push(`/apply/payment?case_id=${caseId}`)
  }

  return (
    <main className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-lg mx-auto">

        <div className="mb-10">
          <p className="font-helvetica text-[11px] tracking-[0.1em] text-[#5a5a5a] uppercase mb-4">
            Step 2 / 3
          </p>
          <h1 className="text-2xl font-medium text-[#212529] mb-2">
            利用規約の確認
          </h1>
          <p className="text-sm text-[#5a5a5a]">
            以下の利用規約をお読みいただき、同意のうえお進みください。
          </p>
        </div>

        {/* 利用規約本文 */}
        <div className="border border-[#ced4da] rounded bg-[#f8f9fa] h-72 overflow-y-auto p-5 text-xs text-[#495057] leading-relaxed space-y-4 mb-6">
          <p className="font-medium text-[#212529] text-sm">不動産査定サービス 利用規約</p>

          <div className="space-y-1">
            <p className="font-medium text-[#212529]">第1条（サービスの内容）</p>
            <p>本サービスは、ぷらたなすきかく株式会社（以下「当社」）が提供する不動産査定サービスです。お客様からご依頼いただいた物件について、登記情報・公示地価・取引事例等をもとに査定書を作成し、提供します。</p>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-[#212529]">第2条（料金）</p>
            <p>料金は物件の登記筆数に応じて決定されます。基本料金は2筆まで¥980、3筆目以降は1筆につき¥350が加算されます。実際の料金は当社が登記情報を確認後にご案内します。</p>
            <p>お客様が事前に筆数を把握していない場合でも、当社が取得した登記情報に基づく確定筆数をもとに料金が決定されます。筆数が予想より多い場合であっても、確定料金に同意のうえで決済を行います。</p>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-[#212529]">第3条（クレジットカードの登録と決済）</p>
            <p>お客様には事前にクレジットカード情報をご登録いただきます。カード登録時点では引き落としは行われません。料金確定後、当社からのご案内を経てご請求します。</p>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-[#212529]">第4条（キャンセル・返金）</p>
            <p>査定書の作成着手前であればキャンセルを承ります。作成着手後のキャンセルはお受けできません。なお、提供した査定書の内容についての返金はいたしかねます。</p>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-[#212529]">第5条（査定書の性質）</p>
            <p>本サービスで提供する査定書は参考資料であり、実際の売買価格を保証するものではありません。査定書の内容を利用した結果について、当社は一切の責任を負いません。</p>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-[#212529]">第6条（個人情報の取り扱い）</p>
            <p>ご入力いただいた個人情報は、査定サービスの提供および関連するご連絡のみに使用します。第三者への提供は、法令に基づく場合を除き行いません。</p>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-[#212529]">第7条（免責事項）</p>
            <p>天災・通信障害・その他当社の責によらない事由によりサービスの提供が困難となった場合、当社は責任を負いません。</p>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-[#212529]">第8条（準拠法・管轄）</p>
            <p>本規約は日本法に準拠します。本サービスに関する紛争は、広島地方裁判所を第一審の専属的合意管轄裁判所とします。</p>
          </div>

          <p className="text-[#5a5a5a]">制定日：2025年1月1日<br />ぷらたなすきかく株式会社</p>
        </div>

        {/* 同意チェックボックス */}
        <div className="space-y-4 mb-8">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={agreedTerms}
              onChange={e => setAgreedTerms(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#212529] cursor-pointer flex-shrink-0"
            />
            <span className="text-sm text-[#495057] leading-relaxed">
              利用規約を読み、内容に同意します
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group border border-[#ced4da] rounded p-3 bg-[#f8f9fa]">
            <input
              type="checkbox"
              checked={agreedPayment}
              onChange={e => setAgreedPayment(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#212529] cursor-pointer flex-shrink-0"
            />
            <span className="text-sm text-[#495057] leading-relaxed">
              登記情報取得後に確定する筆数（登記取得数）にかかわらず、当社が案内する確定サービス料を支払うことに同意します。
            </span>
          </label>
        </div>

        <button
          disabled={!canProceed || loading}
          onClick={handleProceed}
          className="w-full bg-[#212529] text-white text-sm py-3 px-6 font-helvetica tracking-[0.05em] hover:bg-[#5a5757] disabled:bg-[#ced4da] disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '処理中...' : '同意してカード登録へ進む'}
        </button>

      </div>
    </main>
  )
}

export default function TermsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm text-[#5a5a5a]">読み込み中...</p>
      </div>
    }>
      <TermsContent />
    </Suspense>
  )
}
