import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'
import { calcPrice, BASE_PRICE, EXTRA_PARCEL_PRICE } from '@/lib/stripe'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { parcel_count, admin_notes } = await req.json()

  if (!parcel_count || parcel_count < 1) {
    return NextResponse.json({ error: '筆数は1以上を指定してください' }, { status: 400 })
  }

  const total = calcPrice(parcel_count)
  const additional = Math.max(0, parcel_count - 2) * EXTRA_PARCEL_PRICE

  // 筆数・料金を確定
  const { data: caseData, error } = await supabaseAdmin
    .from('cases')
    .update({
      parcel_count,
      base_price: BASE_PRICE,
      additional_price: additional,
      total_price: total,
      status: 'processing',
      admin_notes: admin_notes || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error || !caseData) {
    return NextResponse.json({ error: error?.message || '更新失敗' }, { status: 500 })
  }

  // Stripe 即時請求
  let chargeError: string | null = null
  let paymentIntentId: string | null = null

  if (caseData.stripe_customer_id) {
    try {
      const customer = await stripe.customers.retrieve(caseData.stripe_customer_id) as unknown as Record<string, unknown>
      const invoiceSettings = customer.invoice_settings as Record<string, unknown> | undefined
      let pmId = invoiceSettings?.default_payment_method as string | undefined

      if (!pmId) {
        const paymentMethods = await stripe.paymentMethods.list({
          customer: caseData.stripe_customer_id,
          type: 'card',
        })
        if (paymentMethods.data.length > 0) pmId = paymentMethods.data[0].id
      }

      if (pmId) {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: total,
          currency: 'jpy',
          customer: caseData.stripe_customer_id,
          payment_method: pmId,
          confirm: true,
          off_session: true,
          metadata: { case_id: id },
        })
        paymentIntentId = paymentIntent.id
        await supabaseAdmin
          .from('cases')
          .update({ stripe_payment_intent_id: paymentIntent.id })
          .eq('id', id)
      } else {
        chargeError = 'カード情報が見つかりません'
      }
    } catch (e) {
      chargeError = e instanceof Error ? e.message : '請求処理に失敗しました'
    }
  }

  // メール送信（1通）
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const name = caseData.customer_name || ''
    const email = caseData.customer_email || ''
    const address = caseData.property_address || ''

    const chargedNote = chargeError
      ? `<p style="color:#c0392b;">※ 決済処理中にエラーが発生しました。担当者よりご連絡いたします。</p>`
      : `<p style="line-height:1.8;">クレジットカードへの請求 <strong>${total.toLocaleString()}円</strong> を実施しました。</p>`

    await resend.emails.send({
      from: process.env.FROM_EMAIL!,
      to: email,
      subject: '【不動産査定】登記情報の確認が完了しました',
      html: `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;color:#5a5a5a;max-width:600px;margin:0 auto;">
  <p style="line-height:1.8;">${name} 様</p>
  <p style="line-height:1.8;">
    登記情報の確認が完了しました。<br>
    以下の内容にて査定書の作成を進めてまいります。
  </p>

  <hr style="border:none;border-top:1px solid #ced4da;margin:24px 0;">

  <table style="font-size:13px;color:#5a5a5a;border-collapse:collapse;width:100%;">
    <tr><td style="padding:6px 0;color:#9a9a9a;width:150px;">物件所在地</td><td style="padding:6px 0;">${address}</td></tr>
    <tr><td style="padding:6px 0;color:#9a9a9a;">取得登記筆数</td><td style="padding:6px 0;"><strong>${parcel_count}筆</strong></td></tr>
    <tr><td style="padding:6px 0;color:#9a9a9a;">確定サービス料</td><td style="padding:6px 0;"><strong>${total.toLocaleString()}円</strong>${parcel_count > 2 ? `<br><span style="font-size:11px;color:#9a9a9a;">（基本料金980円 + 追加${parcel_count - 2}筆 × 350円）</span>` : ''}</td></tr>
  </table>

  <hr style="border:none;border-top:1px solid #ced4da;margin:24px 0;">

  ${chargedNote}
  <p style="line-height:1.8;">
    担当者が査定レポートを作成中です。完成次第メールにてお届けします。<br>
    しばらくお待ちください。
  </p>

  <hr style="border:none;border-top:1px solid #ced4da;margin:24px 0;">

  <p style="font-size:12px;line-height:2.0;color:#888;">
    【ご注意・免責事項】<br>
    ・本サービスで提供する査定書は参考資料であり、実際の売買価格を保証するものではありません。<br>
    ・査定書の内容を利用した結果生じた損害について、当社は一切の責任を負いかねます。<br>
    ・登記情報取得後のキャンセル・返金はお受けできません。<br>
    ・ご不明な点はお気軽にお問い合わせください。
  </p>

  <hr style="border:none;border-top:1px solid #ced4da;margin:24px 0;">

  <p style="font-size:12px;color:#9a9a9a;line-height:1.8;">
    ぷらたなすきかく株式会社<br>
    〒737-0811 広島県呉市西中央3-19-6
  </p>
</div>`,
    }).catch(() => {})

    if (process.env.ADMIN_EMAIL) {
      await resend.emails.send({
        from: process.env.FROM_EMAIL!,
        to: process.env.ADMIN_EMAIL,
        subject: `【筆数確定・請求完了】${name} 様 ${parcel_count}筆 ¥${total.toLocaleString()} / ${address}`,
        html: `
<p>筆数確定・即時請求が完了しました。</p>
<table style="font-size:13px;color:#333;border-collapse:collapse;">
  <tr><td style="padding:4px 12px 4px 0;color:#888;">お名前</td><td>${name}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">住所</td><td>${address}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">筆数</td><td>${parcel_count}筆</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">金額</td><td>¥${total.toLocaleString()}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">決済</td><td>${chargeError ? `エラー: ${chargeError}` : `完了 (${paymentIntentId})`}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">案件ID</td><td>${id}</td></tr>
</table>`,
      }).catch(() => {})
    }
  }

  const updatedCase = await supabaseAdmin.from('cases').select('*').eq('id', id).single()
  return NextResponse.json({ case: updatedCase.data, chargeError })
}
