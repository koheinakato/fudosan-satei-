import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'

async function sendPaymentEmails(caseData: Record<string, unknown>, amount: number) {
  if (!process.env.RESEND_API_KEY) return
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const name = String(caseData.customer_name || '')
  const email = String(caseData.customer_email || '')
  const address = String(caseData.property_address || '')

  await resend.emails.send({
    from: process.env.FROM_EMAIL!,
    to: email,
    subject: `【不動産査定】査定料金 ${amount.toLocaleString()}円 を引き落としました`,
    html: `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;color:#5a5a5a;max-width:600px;margin:0 auto;">
  <p style="line-height:1.8;">${name} 様</p>
  <p style="line-height:1.8;">
    査定料金 <strong>${amount.toLocaleString()}円</strong> の決済が完了しました。<br>
    現在、担当者が査定レポートを作成中です。完成次第メールにてお届けします。
  </p>
  <hr style="border:none;border-top:1px solid #ced4da;margin:24px 0;">
  <p style="font-size:12px;line-height:2.0;color:#888;">
    【ご注意・免責事項】<br>
    ・本サービスで提供する査定書は参考資料であり、実際の売買価格を保証するものではありません。<br>
    ・査定書の内容を利用した結果生じた損害について、当社は一切の責任を負いかねます。<br>
    ・既に作成着手済みのためキャンセル・返金はお受けできません。<br>
    ・査定結果に関するご質問は担当者までお気軽にご連絡ください。
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
      subject: `【決済完了】${name} 様 ¥${amount.toLocaleString()} / ${address}`,
      html: `<p>決済が完了しました。</p>
<table style="font-size:13px;color:#333;">
  <tr><td style="padding:4px 12px 4px 0;color:#888;">お名前</td><td>${name}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">住所</td><td>${address}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">金額</td><td>¥${amount.toLocaleString()}</td></tr>
</table>`,
    }).catch(() => {})
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: caseData, error: fetchError } = await supabaseAdmin
    .from('cases')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !caseData) {
    return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  }

  if (!caseData.stripe_customer_id || !caseData.total_price) {
    return NextResponse.json({ error: 'Stripe顧客IDまたは料金が未設定です' }, { status: 400 })
  }

  const customer = await stripe.customers.retrieve(caseData.stripe_customer_id) as unknown as Record<string, unknown>
  const invoiceSettings = customer.invoice_settings as Record<string, unknown> | undefined
  const paymentMethodId = invoiceSettings?.default_payment_method as string | undefined

  if (!paymentMethodId) {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: caseData.stripe_customer_id,
      type: 'card',
    })

    if (paymentMethods.data.length === 0) {
      return NextResponse.json({ error: 'カード情報が見つかりません' }, { status: 400 })
    }

    const pmId = paymentMethods.data[0].id
    const paymentIntent = await stripe.paymentIntents.create({
      amount: caseData.total_price,
      currency: 'jpy',
      customer: caseData.stripe_customer_id,
      payment_method: pmId,
      confirm: true,
      off_session: true,
      metadata: { case_id: id },
    })

    await supabaseAdmin
      .from('cases')
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq('id', id)

    await sendPaymentEmails(caseData as Record<string, unknown>, caseData.total_price)
    return NextResponse.json({ success: true, amount: caseData.total_price })
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: caseData.total_price,
    currency: 'jpy',
    customer: caseData.stripe_customer_id,
    payment_method: paymentMethodId,
    confirm: true,
    off_session: true,
    metadata: { case_id: id },
  })

  await supabaseAdmin
    .from('cases')
    .update({ stripe_payment_intent_id: paymentIntent.id })
    .eq('id', id)

  await sendPaymentEmails(caseData as Record<string, unknown>, caseData.total_price)
  return NextResponse.json({ success: true, amount: caseData.total_price })
}
