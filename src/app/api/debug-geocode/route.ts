import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address') || '広島県呉市三条二丁目１４番地２'
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || ''
  const results: Record<string, unknown> = { address, apiKey: apiKey ? '***設定済み***' : '未設定' }

  // buildVariants と同じロジック
  const variants: string[] = []
  const seen = new Set<string>()
  const push = (s: string) => {
    s = s.trim()
    if (s.length > 3 && !seen.has(s)) { seen.add(s); variants.push(s) }
  }
  push(address)
  push(address.replace(/-?\d+号?$/, ''))
  push(address.replace(/-\d+-\d+$/, '').replace(/-\d+$/, ''))
  push(address.replace(/(丁目).*$/, '$1'))
  push(address.replace(/\d.*$/, ''))
  const city = address.match(/^.+?[都道府県].+?[市区町村]/)?.[0]
  if (city) push(city)
  const pref = address.match(/^.+?[都道府県]/)?.[0]
  if (pref) push(pref)
  results.variants = variants

  // 各バリアントで GSI を試す
  const gsiResults: Record<string, unknown>[] = []
  for (const v of variants) {
    try {
      const res = await fetch(
        `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(v)}`,
        { cache: 'no-store' }
      )
      const text = await res.text()
      let parsed: unknown = null
      try { parsed = JSON.parse(text) } catch { /* ignore */ }
      gsiResults.push({ variant: v, status: res.status, body: text.slice(0, 150), parsed: Array.isArray(parsed) ? (parsed as unknown[]).length : 'not array' })
    } catch (e) {
      gsiResults.push({ variant: v, error: String(e) })
    }
  }
  results.gsi = gsiResults

  // Static Maps API テスト（座標固定）
  try {
    const lat = 34.246967, lng = 132.552994
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=17&size=640x640&scale=2&maptype=roadmap&markers=color:red|size:mid|${lat},${lng}&language=ja&key=${apiKey}`
    const imgRes = await fetch(mapUrl, { cache: 'no-store' })
    results.staticMaps = { status: imgRes.status, contentType: imgRes.headers.get('content-type') }
  } catch (e) {
    results.staticMaps = { error: String(e) }
  }

  return NextResponse.json(results)
}
