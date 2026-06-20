import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <main className="min-h-screen bg-white">

      {/* Hero */}
      <section className="px-4 pt-24 pb-20 border-b border-[#ced4da]">
        <div className="max-w-lg mx-auto">
          <p className="font-helvetica text-[11px] tracking-[0.1em] text-[#5a5a5a] uppercase mb-8">
            Real Estate Appraisal
          </p>
          <h1 className="text-4xl font-light text-[#212529] leading-tight mb-6">
            不動産の査定を<br />
            最短即日でお届け
          </h1>
          <p className="text-sm text-[#5a5a5a] leading-relaxed mb-10 max-w-sm">
            登記情報・公的データ・取引事例をAIが自動分析。
            宅建士が確認した信頼性の高い査定レポートを提供します。
          </p>
          <Link
            href="/apply"
            className="inline-block bg-[#212529] text-white text-sm py-3 px-8 font-helvetica tracking-[0.05em] hover:bg-[#5a5757] transition-colors"
          >
            査定依頼を始める
          </Link>
          <p className="text-xs text-[#5a5a5a] mt-4">
            申し込みは無料。査定完了後に料金をご請求します。
          </p>
        </div>
      </section>

      {/* サンプルレポート */}
      <section className="px-4 py-20 border-b border-[#ced4da] bg-[#f9f9f9]">
        <div className="max-w-4xl mx-auto">
          <p className="label-nendo border-b border-[#ced4da] pb-2 mb-2">サンプルレポート</p>
          <p className="text-xs text-[#5a5a5a] mb-10">実際に納品される査定書のサンプルです。</p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="bg-white border border-[#ced4da] overflow-hidden">
                <Image
                  src={`/sample-report/page-${n}.png`}
                  alt={`査定書サンプル ${n}ページ目`}
                  width={794}
                  height={1123}
                  className="w-full h-auto"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 料金 */}
      <section className="px-4 py-20 border-b border-[#ced4da]">
        <div className="max-w-lg mx-auto">
          <p className="label-nendo border-b border-[#ced4da] pb-2 mb-8">料金</p>

          <div className="mb-8">
            <p className="text-[11px] text-[#5a5a5a] font-helvetica tracking-[0.05em] uppercase mb-1">基本料金（2筆まで）</p>
            <p className="text-5xl font-light text-[#212529]">¥980</p>
          </div>

          <div className="space-y-0 border-t border-[#ced4da]">
            {[
              { label: '2筆（土地＋建物）', price: '¥980' },
              { label: '3筆', price: '¥1,330' },
              { label: '4筆', price: '¥1,680' },
              { label: '5筆', price: '¥2,030' },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-3 border-b border-[#ced4da]">
                <span className="text-sm text-[#5a5a5a]">{row.label}</span>
                <span className="text-sm font-medium text-[#212529]">{row.price}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-[#5a5a5a] mt-4">
            ※ カード登録時に料金はかかりません。筆数確認後に決済します。
          </p>
        </div>
      </section>

      {/* 筆数とは */}
      <section className="px-4 py-20 border-b border-[#ced4da] bg-[#f9f9f9]">
        <div className="max-w-lg mx-auto">
          <p className="label-nendo border-b border-[#ced4da] pb-2 mb-8">筆数とは？</p>

          <p className="text-sm text-[#212529] leading-relaxed mb-6">
            「筆数」とは、<span className="font-medium">土地の登記上の区画数</span>のことです。
            見た目では1つの土地に見えても、登記簿上では複数の区画（筆）に分かれていることがあります。
          </p>

          <div className="space-y-4 mb-8">
            <div className="flex gap-4 items-start">
              <span className="font-helvetica text-[10px] tracking-[0.05em] text-[#5a5a5a] shrink-0 mt-0.5 w-12">例 1</span>
              <p className="text-sm text-[#5a5a5a] leading-relaxed">
                一戸建て（土地＋建物）→ 通常 <span className="text-[#212529] font-medium">2筆</span>
              </p>
            </div>
            <div className="flex gap-4 items-start">
              <span className="font-helvetica text-[10px] tracking-[0.05em] text-[#5a5a5a] shrink-0 mt-0.5 w-12">例 2</span>
              <p className="text-sm text-[#5a5a5a] leading-relaxed">
                角地や分筆された土地 → 土地が複数に分かれ <span className="text-[#212529] font-medium">3筆以上</span>になることも
              </p>
            </div>
          </div>

          <div className="border border-[#ced4da] p-4">
            <p className="text-xs text-[#5a5a5a] leading-relaxed">
              筆数はお客様が調べる必要はありません。
              弊社が登記情報を取得・確認し、実際の筆数に応じた料金をお知らせします。
            </p>
          </div>
        </div>
      </section>

      {/* ご利用の流れ */}
      <section className="px-4 py-20 border-b border-[#ced4da]">
        <div className="max-w-lg mx-auto">
          <p className="label-nendo border-b border-[#ced4da] pb-2 mb-8">ご利用の流れ</p>

          <div className="space-y-8">
            {[
              {
                step: '01',
                title: '情報を入力（無料）',
                desc: '住所・物件種別・査定目的の3項目を入力するだけ。',
              },
              {
                step: '02',
                title: 'カード情報を登録',
                desc: '査定完了後にご請求します。この時点での引き落としは0円です。',
              },
              {
                step: '03',
                title: '弊社が登記情報を確認・料金をご案内',
                desc: '登記情報から筆数を確認し、確定した料金をメールでご連絡します。ご了承後に決済します。',
              },
              {
                step: '04',
                title: 'AIが自動分析',
                desc: '公的データ・路線価・取引事例をもとに査定額を算出します。',
              },
              {
                step: '05',
                title: '宅建士が確認してレポート納品',
                desc: '査定レポートをメールでお届けします。',
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-5">
                <span className="font-helvetica text-[11px] tracking-[0.05em] text-[#5a5a5a] shrink-0 w-5 mt-0.5">
                  {item.step}
                </span>
                <div>
                  <p className="text-sm font-medium text-[#212529] mb-0.5">{item.title}</p>
                  <p className="text-xs text-[#5a5a5a] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12">
            <Link
              href="/apply"
              className="inline-block bg-[#212529] text-white text-sm py-3 px-8 font-helvetica tracking-[0.05em] hover:bg-[#5a5757] transition-colors"
            >
              査定依頼を始める
            </Link>
          </div>
        </div>
      </section>

      {/* フッター */}
      <footer className="px-4 py-10">
        <div className="max-w-lg mx-auto">
          <p className="font-helvetica text-[10px] tracking-[0.08em] text-[#5a5a5a] uppercase">
            不動産簡易査定 — AI × 宅建士
          </p>
        </div>
      </footer>

    </main>
  )
}
