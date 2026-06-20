import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  const body = await req.text()
  const headersList = await headers()
  const sig = headersList.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 })
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object
      const caseId = paymentIntent.metadata?.case_id
      if (caseId) {
        await supabaseAdmin
          .from('cases')
          .update({ status: 'paid' })
          .eq('id', caseId)
      }
      break
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object
      const caseId = paymentIntent.metadata?.case_id
      if (caseId) {
        await supabaseAdmin
          .from('cases')
          .update({ status: 'payment_failed' })
          .eq('id', caseId)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
