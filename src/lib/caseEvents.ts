import { supabaseAdmin } from '@/lib/supabase'

// 案件ごとの登記データ・操作履歴を保存するストレージバケット
export const CASE_DATA_BUCKET = 'case-data'

export type CaseEvent = { at: string; type: string; label: string }

async function ensureBucket() {
  await supabaseAdmin.storage.createBucket(CASE_DATA_BUCKET, { public: false }).then(() => {}, () => {})
}

export async function getCaseEvents(caseId: string): Promise<CaseEvent[]> {
  const { data } = await supabaseAdmin.storage.from(CASE_DATA_BUCKET).download(`${caseId}/events.json`)
  if (!data) return []
  try {
    const events = JSON.parse(await data.text())
    return Array.isArray(events) ? events : []
  } catch {
    return []
  }
}

// 操作履歴を1件追記する(記録失敗で呼び出し元の処理は止めない)
export async function appendCaseEvent(caseId: string, type: string, label: string): Promise<void> {
  try {
    await ensureBucket()
    const events = await getCaseEvents(caseId)
    events.push({ at: new Date().toISOString(), type, label })
    await supabaseAdmin.storage
      .from(CASE_DATA_BUCKET)
      .upload(`${caseId}/events.json`, JSON.stringify(events), {
        contentType: 'application/json',
        upsert: true,
      })
  } catch { /* ignore */ }
}
