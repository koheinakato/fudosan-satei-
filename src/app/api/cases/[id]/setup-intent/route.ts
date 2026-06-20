import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: caseData, error } = await supabaseAdmin
    .from('cases')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !caseData) {
    return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: caseData.stripe_customer_id!,
    payment_method_types: ['card'],
    metadata: { case_id: id },
  })

  await supabaseAdmin
    .from('cases')
    .update({ stripe_setup_intent_id: setupIntent.id })
    .eq('id', id)

  return NextResponse.json({ client_secret: setupIntent.client_secret })
}
