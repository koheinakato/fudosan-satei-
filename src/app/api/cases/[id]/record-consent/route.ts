import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ''

  await supabaseAdmin
    .from('cases')
    .update({ terms_agreed_at: new Date().toISOString(), terms_agreed_ip: ip })
    .eq('id', id)

  return NextResponse.json({ success: true })
}
