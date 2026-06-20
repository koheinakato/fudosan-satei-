import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'

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

  // 保存済みのデフォルトカードを取得
  const customer = await stripe.customers.retrieve(caseData.stripe_customer_id) as any
  const paymentMethodId = customer.invoice_settings?.default_payment_method

  if (!paymentMethodId) {
    // SetupIntentで保存したカードを取得
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

    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
      from: process.env.FROM_EMAIL!,
      to: caseData.customer_email,
      subject: `【不動産査定】査定料金 ${caseData.total_price.toLocaleString()}円 を引き落としました`,
      html: `
        <p>${caseData.customer_name} 様</p>
        <p>査定料金 <strong>${caseData.total_price.toLocaleString()}円</strong> を決済しました。</p>
        <p>現在査定レポートを作成中です。完成次第ご連絡いたします。</p>
      `,
      })
    }

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

  return NextResponse.json({ success: true, amount: caseData.total_price })
}
