import { NextResponse } from 'next/server'

export async function GET() {
  const q = '広島県呉市三条二丁目'
  const results: Record<string, unknown> = {}

  // Test 国土地理院
  try {
    const res = await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`,
      { cache: 'no-store' }
    )
    const text = await res.text()
    results.gsi = { status: res.status, body: text.slice(0, 300) }
  } catch (e) {
    results.gsi = { error: String(e) }
  }

  // Test Nominatim
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=jp&limit=1`,
      { headers: { 'User-Agent': 'FudosanSateiApp/1.0' }, cache: 'no-store' }
    )
    const text = await res.text()
    results.nominatim = { status: res.status, body: text.slice(0, 300) }
  } catch (e) {
    results.nominatim = { error: String(e) }
  }

  return NextResponse.json(results)
}
