import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-05-27.dahlia',
})

export const BASE_PRICE = 980
export const EXTRA_PARCEL_PRICE = 350

export function calcPrice(parcelCount: number): number {
  const extra = Math.max(0, parcelCount - 2) * EXTRA_PARCEL_PRICE
  return BASE_PRICE + extra
}
