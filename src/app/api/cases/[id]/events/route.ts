import { NextResponse } from 'next/server'
import { getCaseEvents } from '@/lib/caseEvents'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const events = await getCaseEvents(id)
  return NextResponse.json({ events })
}
