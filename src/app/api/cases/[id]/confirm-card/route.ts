import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const PROPERTY_TYPE_LABELS: Record<string, string> = { house: '戸建て', mansion: 'マンション', land: '土地' }
const PURPOSE_LABELS: Record<string, string> = { sell: '売却', inherit: '相続', other: 'その他' }

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

  const { error } = await supabaseAdmin
    .from('cases')
    .update({ status: 'card_saved' })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const name = caseData.customer_name || ''
    const address = caseData.property_address || ''
    const typeLabel = PROPERTY_TYPE_LABELS[caseData.property_type] ?? caseData.property_type
    const purposeLabel = PURPOSE_LABELS[caseData.assessment_purpose] ?? caseData.assessment_purpose

    const customerHtml = `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;color:#5a5a5a;max-width:600px;margin:0 auto;">
  <p style="line-height:1.8;">${name} 様</p>
  <p style="line-height:1.8;">
    この度は不動産査定サービスにお申し込みいただき、誠にありがとうございます。<br>
    カード情報のご登録が完了しました。担当者が登記情報を確認のうえ、改めてご連絡いたします。
  </p>

  <hr style="border:none;border-top:1px solid #ced4da;margin:24px 0;">

  <table style="font-size:13px;color:#5a5a5a;border-collapse:collapse;width:100%;">
    <tr><td style="padding:6px 0;color:#9a9a9a;width:150px;">お名前</td><td style="padding:6px 0;">${name} 様</td></tr>
    <tr><td style="padding:6px 0;color:#9a9a9a;">メールアドレス</td><td style="padding:6px 0;">${caseData.customer_email}</td></tr>
    <tr><td style="padding:6px 0;color:#9a9a9a;">電話番号</td><td style="padding:6px 0;">${caseData.customer_phone}</td></tr>
    <tr><td style="padding:6px 0;color:#9a9a9a;">物件所在地</td><td style="padding:6px 0;">${address}</td></tr>
    <tr><td style="padding:6px 0;color:#9a9a9a;">物件種別</td><td style="padding:6px 0;">${typeLabel}</td></tr>
    <tr><td style="padding:6px 0;color:#9a9a9a;">査定目的</td><td style="padding:6px 0;">${purposeLabel}</td></tr>
  </table>

  <hr style="border:none;border-top:1px solid #ced4da;margin:24px 0;">

  <p style="font-size:12px;line-height:1.8;color:#5a5a5a;">
    <strong>【料金について】</strong><br>
    現時点での引き落としはございません。弊社が登記情報を確認し、筆数（登記上の区画数）が確定した時点で確定料金をご案内します。お客様のご承認後に決済を行います。
  </p>
  <p style="font-size:12px;line-height:1.8;color:#5a5a5a;">
    基本料金：¥980（2筆まで）<br>
    3筆目以降：1筆につき ¥350 加算
  </p>
  <p style="font-size:12px;line-height:1.8;color:#5a5a5a;">
    ※ 実際の筆数はお客様が事前に把握していなくても問題ありません。弊社が取得した登記情報をもとに確定いたします。
  </p>

  <hr style="border:none;border-top:1px solid #ced4da;margin:24px 0;">

  <p style="font-size:12px;line-height:2.0;color:#888;">
    【ご注意・免責事項】<br>
    ・本サービスで提供する査定書は参考資料であり、実際の売買価格を保証するものではありません。<br>
    ・査定書の内容を利用した結果生じた損害について、当社は一切の責任を負いかねます。<br>
    ・査定書作成着手後のキャンセルおよび返金はお受けできません。<br>
    ・登記情報の取得には数営業日かかる場合がございます。<br>
    ・ご入力いただいた個人情報は査定業務にのみ使用し、第三者への提供は行いません。<br>
    ・ご不明な点はお気軽にお問い合わせください。
  </p>

  <hr style="border:none;border-top:1px solid #ced4da;margin:24px 0;">

  <p style="font-size:12px;color:#9a9a9a;line-height:1.8;">
    ぷらたなすきかく株式会社<br>
    〒737-0811 広島県呉市西中央3-19-6
  </p>
</div>`

    await resend.emails.send({
      from: process.env.FROM_EMAIL!,
      to: caseData.customer_email,
      subject: '【不動産査定】お申し込みが完了しました',
      html: customerHtml,
    }).catch(() => {})

    if (process.env.ADMIN_EMAIL) {
      await resend.emails.send({
        from: process.env.FROM_EMAIL!,
        to: process.env.ADMIN_EMAIL,
        subject: `【査定新規申込】${name} 様 / ${address}`,
        html: `
<p>新しい査定依頼が届きました。</p>
<table style="font-size:13px;color:#333;border-collapse:collapse;">
  <tr><td style="padding:4px 12px 4px 0;color:#888;">お名前</td><td>${name}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">メール</td><td>${caseData.customer_email}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">電話</td><td>${caseData.customer_phone}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">住所</td><td>${address}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">種別</td><td>${typeLabel}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">目的</td><td>${purposeLabel}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888;">案件ID</td><td>${id}</td></tr>
</table>`,
      }).catch(() => {})
    }
  }

  return NextResponse.json({ success: true })
}
