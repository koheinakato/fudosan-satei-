import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const BUCKET = 'reports'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { action, filename } = await req.json()

  // Step 1: PDFはVercelのボディ上限(4.5MB)を超えうるので、
  // Supabase Storageへ直接アップロードさせるための署名付きURLを発行する
  if (action === 'upload-url') {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: false }).then(() => {}, () => {})
    await supabaseAdmin.storage.from(BUCKET).remove([`${id}.pdf`])
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(`${id}.pdf`)
    if (error) return NextResponse.json({ error: `アップロードURL発行に失敗: ${error.message}` }, { status: 500 })
    return NextResponse.json({ signedUrl: data.signedUrl })
  }

  // Step 2: アップロード済みの査定書を添付してお客様へメール送信
  if (action === 'send') {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY が設定されていません' }, { status: 500 })
    }
    const { data: c, error } = await supabaseAdmin.from('cases').select('*').eq('id', id).single()
    if (error || !c) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })

    const { data: file, error: dlError } = await supabaseAdmin.storage.from(BUCKET).download(`${id}.pdf`)
    if (dlError || !file) {
      return NextResponse.json({ error: '査定書ファイルの取得に失敗しました' }, { status: 500 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())

    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error: mailError } = await resend.emails.send({
      from: process.env.FROM_EMAIL!,
      to: c.customer_email,
      subject: '【不動産査定】査定書が完成いたしました',
      html: `
        <p style="font-family:'Helvetica Neue',Arial,sans-serif;color:#5a5a5a;line-height:1.8;">
          ${c.customer_name} 様
        </p>
        <p style="font-family:'Helvetica Neue',Arial,sans-serif;color:#5a5a5a;line-height:1.8;">
          この度は不動産査定サービスをご利用いただき、誠にありがとうございます。<br>
          ご依頼いただいておりました下記物件の査定書が完成いたしましたので、<br>
          本メールに添付してお送りいたします。
        </p>
        <p style="font-family:'Helvetica Neue',Arial,sans-serif;color:#5a5a5a;line-height:1.8;background:#f9f9f9;padding:12px 16px;border:1px solid #e0e0e0;">
          対象物件: ${c.property_address}
        </p>
        <p style="font-family:'Helvetica Neue',Arial,sans-serif;color:#5a5a5a;line-height:1.8;">
          内容についてご不明な点がございましたら、本メールへの返信にて<br>
          お気軽にお問い合わせください。<br>
          今後ともどうぞよろしくお願いいたします。
        </p>
        <p style="font-family:'Helvetica Neue',Arial,sans-serif;color:#9a9a9a;font-size:12px;line-height:1.8;border-top:1px solid #e0e0e0;padding-top:12px;">
          ぷらたなすきかく株式会社
        </p>
      `,
      attachments: [{ filename: filename || '不動産査定書.pdf', content: buffer }],
    })
    if (mailError) return NextResponse.json({ error: `メール送信に失敗: ${mailError.message}` }, { status: 500 })

    await supabaseAdmin.from('cases')
      .update({ status: 'completed', report_url: `${BUCKET}/${id}.pdf` })
      .eq('id', id)
    return NextResponse.json({ ok: true, to: c.customer_email })
  }

  return NextResponse.json({ error: '不正なアクションです' }, { status: 400 })
}
