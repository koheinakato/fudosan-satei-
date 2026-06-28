import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { status, report_url } = await req.json()

  const update: Record<string, string> = { status }
  if (report_url) update.report_url = report_url

  const { data, error } = await supabaseAdmin
    .from('cases')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (status === 'completed' && process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: process.env.FROM_EMAIL!,
      to: data.customer_email,
      subject: '【不動産査定】査定レポートが完成しました',
      html: `
        <p>${data.customer_name} 様</p>
        <p>お待たせいたしました。不動産査定レポートが完成しました。</p>
        ${report_url ? `<p><a href="${report_url}" style="background:#1a1a1a;color:#fff;padding:10px 20px;text-decoration:none;display:inline-block;margin-top:8px;">レポートを確認する</a></p>` : ''}
        <br>
        <p style="color:#9a9a9a;font-size:12px;">ぷらたなすきかく株式会社<br>広島県呉市西中央3-19-6</p>
      `,
    }).catch(() => {})
  }

  return NextResponse.json({ case: data })
}
