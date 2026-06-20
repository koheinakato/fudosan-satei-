'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ApplyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    property_address: '',
    property_type: '',
    assessment_purpose: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'エラーが発生しました')
      return
    }

    router.push(`/apply/payment?case_id=${data.case.id}`)
  }

  return (
    <main className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-lg mx-auto">

        {/* ステップ表示 */}
        <div className="mb-12">
          <p className="font-helvetica text-[11px] tracking-[0.1em] text-[#5a5a5a] uppercase mb-4">
            Step 1 / 2
          </p>
          <h1 className="text-2xl font-medium text-[#212529] mb-2">
            査定依頼フォーム
          </h1>
          <p className="text-sm text-[#5a5a5a]">
            物件情報をご入力ください。この時点では費用はかかりません。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* お客様情報 */}
          <div className="space-y-5">
            <p className="label-nendo border-b border-[#ced4da] pb-2">お客様情報</p>

            <div className="space-y-1.5">
              <label className="label-nendo">お名前</label>
              <input
                type="text"
                placeholder="山田 太郎"
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                required
                className="w-full border border-[#ced4da] rounded px-3 py-2 text-sm text-[#495057] focus:outline-none focus:border-[#5a5757] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="label-nendo">メールアドレス</label>
              <input
                type="email"
                placeholder="example@email.com"
                value={form.customer_email}
                onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                required
                className="w-full border border-[#ced4da] rounded px-3 py-2 text-sm text-[#495057] focus:outline-none focus:border-[#5a5757] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="label-nendo">電話番号</label>
              <input
                type="tel"
                placeholder="090-1234-5678"
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                required
                className="w-full border border-[#ced4da] rounded px-3 py-2 text-sm text-[#495057] focus:outline-none focus:border-[#5a5757] transition-colors"
              />
            </div>
          </div>

          {/* 物件情報 */}
          <div className="space-y-5">
            <p className="label-nendo border-b border-[#ced4da] pb-2">物件情報</p>

            <div className="space-y-1.5">
              <label className="label-nendo">物件住所</label>
              <input
                type="text"
                placeholder="東京都〇〇区〇〇1-2-3"
                value={form.property_address}
                onChange={(e) => setForm({ ...form, property_address: e.target.value })}
                required
                className="w-full border border-[#ced4da] rounded px-3 py-2 text-sm text-[#495057] focus:outline-none focus:border-[#5a5757] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="label-nendo">物件種別</label>
              <select
                value={form.property_type}
                onChange={(e) => setForm({ ...form, property_type: e.target.value })}
                required
                className="w-full border border-[#ced4da] rounded px-3 py-2 text-sm text-[#495057] focus:outline-none focus:border-[#5a5757] transition-colors bg-white"
              >
                <option value="" disabled>選択してください</option>
                <option value="house">戸建て</option>
                <option value="mansion">マンション</option>
                <option value="land">土地</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="label-nendo">査定目的</label>
              <select
                value={form.assessment_purpose}
                onChange={(e) => setForm({ ...form, assessment_purpose: e.target.value })}
                required
                className="w-full border border-[#ced4da] rounded px-3 py-2 text-sm text-[#495057] focus:outline-none focus:border-[#5a5757] transition-colors bg-white"
              >
                <option value="" disabled>選択してください</option>
                <option value="sell">売却</option>
                <option value="inherit">相続</option>
                <option value="other">その他</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-[#dc3545]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !form.property_type || !form.assessment_purpose}
            className="w-full bg-[#212529] text-white text-sm py-3 px-6 font-helvetica tracking-[0.05em] hover:bg-[#5a5757] disabled:bg-[#ced4da] disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '送信中...' : 'カード登録へ進む'}
          </button>

          <p className="text-xs text-[#5a5a5a] text-center">
            次の画面でクレジットカードを登録していただきます（この画面では課金されません）
          </p>
        </form>
      </div>
    </main>
  )
}
