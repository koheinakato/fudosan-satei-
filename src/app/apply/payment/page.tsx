'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

function PaymentForm({ caseId }: { caseId: string }) {
  const router = useRouter()
  const stripe = useStripe()
  const elements = useElements()
  const [clientSecret, setClientSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/cases/${caseId}/setup-intent`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => setClientSecret(d.client_secret))
  }, [caseId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements || !clientSecret) return

    setLoading(true)
    setError('')

    const cardElement = elements.getElement(CardElement)
    if (!cardElement) return

    const { setupIntent, error: stripeError } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement },
    })

    if (stripeError) {
      setError(stripeError.message || 'カードの登録に失敗しました')
      setLoading(false)
      return
    }

    if (setupIntent?.status === 'succeeded') {
      await fetch(`/api/cases/${caseId}/confirm-card`, { method: 'POST' })
      router.push(`/apply/complete?case_id=${caseId}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* カード入力 */}
      <div className="space-y-1.5">
        <label className="label-nendo">クレジットカード情報</label>
        <div className="border border-[#ced4da] rounded px-3 py-3 bg-white">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '15px',
                  color: '#495057',
                  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                  '::placeholder': { color: '#adb5bd' },
                },
                invalid: { color: '#dc3545' },
              },
            }}
          />
        </div>
      </div>

      {/* 料金説明 */}
      <div className="border-l-2 border-[#ced4da] pl-4 space-y-1.5">
        <p className="label-nendo">お支払いについて</p>
        <p className="text-sm text-[#5a5a5a] leading-relaxed">
          この時点では引き落としは行いません。
          弊社が登記情報を確認し、筆数に応じた料金をご案内してから決済します。
        </p>
        <div className="pt-1 space-y-0.5 text-sm text-[#5a5a5a]">
          <p>基本料金 ¥980（2筆まで）</p>
          <p>3筆目以降 +¥350 / 筆</p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-[#dc3545]">{error}</p>
      )}

      <button
        type="submit"
        disabled={!stripe || !clientSecret || loading}
        className="w-full bg-[#212529] text-white text-sm py-3 px-6 font-helvetica tracking-[0.05em] hover:bg-[#5a5757] disabled:bg-[#ced4da] disabled:cursor-not-allowed transition-colors"
      >
        {loading ? '登録中...' : 'カードを登録して申し込む'}
      </button>
    </form>
  )
}

function PaymentPageContent() {
  const searchParams = useSearchParams()
  const caseId = searchParams.get('case_id')

  if (!caseId) {
    return <p className="text-center text-sm text-[#5a5a5a]">案件IDが見つかりません</p>
  }

  return (
    <main className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-lg mx-auto">

        {/* ステップ表示 */}
        <div className="mb-12">
          <p className="font-helvetica text-[11px] tracking-[0.1em] text-[#5a5a5a] uppercase mb-4">
            Step 2 / 2
          </p>
          <h1 className="text-2xl font-medium text-[#212529] mb-2">
            カード情報の登録
          </h1>
          <p className="text-sm text-[#5a5a5a]">
            査定完了後にご請求します。登録後の即時引き落としはありません。
          </p>
        </div>

        <Elements stripe={stripePromise}>
          <PaymentForm caseId={caseId} />
        </Elements>
      </div>
    </main>
  )
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm text-[#5a5a5a]">読み込み中...</p>
      </div>
    }>
      <PaymentPageContent />
    </Suspense>
  )
}
