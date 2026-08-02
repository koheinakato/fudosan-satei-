import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { CASE_DATA_BUCKET, appendCaseEvent } from '@/lib/caseEvents'

// 登記データ(PDF抽出テキスト+ページ画像)はサイズが大きくVercelの4.5MB制限を
// 超えうるため、読み書きともSupabase Storageの署名付きURL経由で直接やり取りする

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `${id}/registry.json`
  const { data, error } = await supabaseAdmin.storage
    .from(CASE_DATA_BUCKET)
    .createSignedUrl(path, 3600)
  if (error || !data) return NextResponse.json({ exists: false })
  return NextResponse.json({ exists: true, signedUrl: data.signedUrl })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { action, label } = await req.json()
  const path = `${id}/registry.json`

  if (action === 'upload-url') {
    await supabaseAdmin.storage.createBucket(CASE_DATA_BUCKET, { public: false }).then(() => {}, () => {})
    await supabaseAdmin.storage.from(CASE_DATA_BUCKET).remove([path])
    const { data, error } = await supabaseAdmin.storage.from(CASE_DATA_BUCKET).createSignedUploadUrl(path)
    if (error) return NextResponse.json({ error: `アップロードURL発行に失敗: ${error.message}` }, { status: 500 })
    return NextResponse.json({ signedUrl: data.signedUrl })
  }

  if (action === 'commit') {
    await appendCaseEvent(id, 'registry', String(label || '登記データを更新'))
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '不正なアクションです' }, { status: 400 })
}
