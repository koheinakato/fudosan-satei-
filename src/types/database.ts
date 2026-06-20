export type CaseStatus =
  | 'draft'
  | 'card_saved'
  | 'parcel_confirmed'
  | 'lot_input_pending'
  | 'processing'
  | 'review_pending'
  | 'completed'
  | 'cancelled'

export interface Case {
  id: string
  status: CaseStatus
  created_at: string
  updated_at: string
  customer_name: string
  customer_email: string
  customer_phone: string
  property_address: string
  property_type: 'house' | 'mansion' | 'land'
  assessment_purpose: 'sell' | 'inherit' | 'other'
  parcel_count: number | null
  lot_numbers: string[] | null
  base_price: number | null
  additional_price: number | null
  total_price: number | null
  stripe_customer_id: string | null
  stripe_setup_intent_id: string | null
  stripe_payment_intent_id: string | null
  report_url: string | null
  admin_notes: string | null
}

export type CaseInsert = Omit<Case, 'id' | 'created_at' | 'updated_at'>
export type CaseUpdate = Partial<Omit<Case, 'id' | 'created_at'>>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any
