import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'

export async function POST(req: Request) {
  const body = await req.json()
  const { customer_name, customer_email, customer_phone, property_address, property_type, assessment_purpose } = body

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
