import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { lot_numbers } = await req.json()

  if (!lot_numbers || !Array.isArray(lot_numbers) || lot_numbers.length === 0) {
    return NextResponse.json({ error: '地番を入力してください' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('cases')
    .update({
      lot_numbers,
      status: 'processing',
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ case: data })
}
