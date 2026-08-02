import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'

export async function POST(req: Request) {
  const body = await req.json()
  const { customer_name, customer_email, customer_phone, property_address, property_type, assessment_purpose, renovations } = body

  if (!customer_name || !customer_email || !customer_phone || !property_address || !property_type || !assessment_purpose) {
    return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
  }

  let stripeCustomer
  try {
    stripeCustomer = await stripe.customers.create({
      name: customer_name,
      email: customer_email,
      phone: customer_phone,
      metadata: { property_address },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Stripe error'
    return NextResponse.json({ error: `Stripe: ${msg}` }, { status: 500 })
  }

  const { data, error } = await supabaseAdmin
    .from('cases')
    .insert({
      status: 'draft',
      customer_name,
      customer_email,
      customer_phone,
      property_address,
      property_type,
      assessment_purpose,
      stripe_customer_id: stripeCustomer.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 修繕・リフォーム履歴(任意入力)をストレージに保存し、受付を履歴に記録
  const { CASE_DATA_BUCKET, appendCaseEvent } = await import('@/lib/caseEvents')
  const renovationKeys: string[] = Array.isArray(renovations) ? renovations.filter(r => typeof r === 'string') : []
  if (renovationKeys.length > 0) {
    await supabaseAdmin.storage.createBucket(CASE_DATA_BUCKET, { public: false }).then(() => {}, () => {})
    await supabaseAdmin.storage
      .from(CASE_DATA_BUCKET)
      .upload(`${data.id}/renovations.json`, JSON.stringify(renovationKeys), {
        contentType: 'application/json', upsert: true,
      })
      .then(() => {}, () => {})
  }
  await appendCaseEvent(data.id, 'apply', `査定依頼を受付（修繕履歴 ${renovationKeys.length}件記載）`)

  if (process.env.RESEND_API_KEY) {
    const PROPERTY_TYPE_LABELS: Record<string, string> = { house: '戸建て', mansion: 'マンション', land: '土地' }
    const PURPOSE_LABELS: Record<string, string> = { sell: '売却', inherit: '相続', other: 'その他' }

    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: process.env.FROM_EMAIL!,
      to: customer_email,
      subject: '【不動産査定】お申し込みを受け付けました',
      html: `
        <p style="font-family:'Helvetica Neue',Arial,sans-serif;color:#5a5a5a;line-height:1.8;">
          ${customer_name} 様
        </p>
        <p style="font-family:'Helvetica Neue',Arial,sans-serif;color:#5a5a5a;line-height:1.8;">
          不動産査定のお申し込みありがとうございます。<br>
          内容を確認のうえ、担当者よりご連絡いたします。
        </p>
        <hr style="border:none;border-top:1px solid #ced4da;margin:24px 0;">
        <table style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#5a5a5a;border-collapse:collapse;width:100%;">
          <tr><td style="padding:6px 0;color:#9a9a9a;width:140px;">お名前</td><td style="padding:6px 0;">${customer_name} 様</td></tr>
          <tr><td style="padding:6px 0;color:#9a9a9a;">メールアドレス</td><td style="padding:6px 0;">${customer_email}</td></tr>
          <tr><td style="padding:6px 0;color:#9a9a9a;">電話番号</td><td style="padding:6px 0;">${customer_phone}</td></tr>
          <tr><td style="padding:6px 0;color:#9a9a9a;">物件所在地</td><td style="padding:6px 0;">${property_address}</td></tr>
          <tr><td style="padding:6px 0;color:#9a9a9a;">物件種別</td><td style="padding:6px 0;">${PROPERTY_TYPE_LABELS[property_type] ?? property_type}</td></tr>
          <tr><td style="padding:6px 0;color:#9a9a9a;">査定目的</td><td style="padding:6px 0;">${PURPOSE_LABELS[assessment_purpose] ?? assessment_purpose}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #ced4da;margin:24px 0;">
        <p style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#9a9a9a;line-height:1.8;">
          ぷらたなすきかく株式会社<br>
          〒737-0811 広島県呉市西中央3-19-6<br>
          noreply@platanus-p.com
        </p>
      `,
    }).catch(() => {})
  }

  return NextResponse.json({ case: data })
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('cases')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ cases: data })
}
