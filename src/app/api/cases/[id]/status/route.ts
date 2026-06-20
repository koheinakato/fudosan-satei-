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

  return NextResponse.json({ case: data })
}
