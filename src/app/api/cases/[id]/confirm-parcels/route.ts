import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { calcPrice, BASE_PRICE, EXTRA_PARCEL_PRICE } from '@/lib/stripe'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { parcel_count, admin_notes } = await req.json()

  if (!parcel_count || parcel_count < 1) {
    return NextResponse.json({ error: '筆数は1以上を指定してください' }, { status: 400 })
  }

  const total = calcPrice(parcel_count)
  const additional = Math.max(0, parcel_count - 2) * EXTRA_PARCEL_PRICE

  const { data: caseData, error } = await supabaseAdmin
    .from('cases')
    .update({
      parcel_count,
      base_price: BASE_PRICE,
      additional_price: additional,
      total_price: total,
      status: 'lot_input_pending',
      admin_notes: admin_notes || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error || !caseData) {
    return NextResponse.json({ error: error?.message || '更新失敗' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: process.env.FROM_EMAIL!,
      to: caseData.customer_email,
      subject: '【不動産査定】筆数・料金のご確認',
      html: `
        <p>${caseData.customer_name} 様</p>
        <p>登記情報の確認が完了しました。</p>
        <p><strong>筆数: ${parcel_count}筆 / 査定料金: ${total.toLocaleString()}円</strong></p>
        ${parcel_count > 2 ? `<p>（基本料金980円 + 追加${parcel_count - 2}筆 × 350円）</p>` : ''}
        <p>ご確認のほどよろしくお願いいたします。</p>
        <p><a href="${appUrl}/case/${id}">査定状況を確認する</a></p>
      `,
    })
  }

  return NextResponse.json({ case: caseData })
}
