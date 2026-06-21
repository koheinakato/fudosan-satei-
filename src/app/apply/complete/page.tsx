import { Suspense } from 'react'
import Link from 'next/link'

function CompleteContent() {
  return (
    <main className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-lg mx-auto">

        {/* 完了アイコン */}
        <div className="mb-12">
          <div className="w-10 h-10 border border-[#212529] flex items-center justify-center mb-6">
            <svg className="w-5 h-5 text-[#212529]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-medium text-[#212529] mb-2">
            申し込みが完了しました
          </h1>
          <p className="text-sm text-[#5a5a5a] leading-relaxed">
            ご登録のメールアドレスに確認メールをお送りします。
          </p>
        </div>

        {/* 今後の流れ */}
        <div className="space-y-6 mb-12">
          <p className="label-nendo border-b border-[#ced4da] pb-2">今後の流れ</p>

          <div className="space-y-6">
            <div className="flex gap-4">
              <span className="font-helvetica text-[11px] text-[#5a5a5a] tracking-[0.05em] w-4 shrink-0 mt-0.5">01</span>
              <div>
                <p className="text-sm text-[#212529]">弊社が登記情報を確認します</p>
                <p className="text-xs text-[#5a5a5a] mt-0.5">数営業日以内にご連絡します</p>
              </div>
            </div>

            <div className="flex gap-4">
              <span className="font-helvetica text-[11px] text-[#5a5a5a] tracking-[0.05em] w-4 shrink-0 mt-0.5">02</span>
              <div>
                <p className="text-sm text-[#212529]">筆数を確認後、査定料金をご案内します</p>
                <p className="text-xs text-[#5a5a5a] mt-0.5 leading-relaxed">
                  <span className="font-medium text-[#212529]">筆数</span>とは、土地の登記上の区画数です。
                  1つの土地でも複数の筆に分かれている場合があります（例: 2筆 = ¥980、3筆 = ¥1,330）。
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <span className="font-helvetica text-[11px] text-[#5a5a5a] tracking-[0.05em] w-4 shrink-0 mt-0.5">03</span>
              <div>
                <p className="text-sm text-[#212529]">AIが分析し、プロが査定レポートを作成します</p>
                <p className="text-xs text-[#5a5a5a] mt-0.5">完成後、メールでレポートをお送りします</p>
              </div>
            </div>
          </div>
        </div>

        <Link
          href="/"
          className="inline-block font-helvetica text-[11px] tracking-[0.1em] text-[#5a5a5a] uppercase border-b border-[#ced4da] hover:border-[#5a5757] hover:text-[#212529] transition-colors pb-0.5"
        >
          トップページへ
        </Link>
      </div>
    </main>
  )
}

export default function CompletePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm text-[#5a5a5a]">読み込み中...</p>
      </div>
    }>
      <CompleteContent />
    </Suspense>
  )
}
