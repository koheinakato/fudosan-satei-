import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('cases')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  }

  // 申込時の修繕・リフォーム履歴(あれば)を添付
  let renovations: string[] = []
  try {
    const { CASE_DATA_BUCKET } = await import('@/lib/caseEvents')
    const { data: file } = await supabaseAdmin.storage.from(CASE_DATA_BUCKET).download(`${id}/renovations.json`)
    if (file) {
      const parsed = JSON.parse(await file.text())
      if (Array.isArray(parsed)) renovations = parsed
    }
  } catch { /* ignore */ }

  return NextResponse.json({ case: data, renovations })
}
