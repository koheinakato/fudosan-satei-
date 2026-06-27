'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { Case } from '@/types/database'

const COMPANY = {
  name: 'ぷらたなすきかく株式会社',
  postal: '737-0811',
  address: '広島県呉市西中央3-19-6',
  representative: '代表取締役 中藤 宏平',
}

const formatNum = (v: number) => new Intl.NumberFormat('ja-JP').format(Math.round(v || 0))

type CaseItem = { id: number; name: string; price: number; timeCorrect: number; areaCorrect: number }

const defaultCases: CaseItem[] = [
  { id: 1, name: '公示地 ①', price: 90000, timeCorrect: 1.01, areaCorrect: 0.98 },
  { id: 2, name: '公示地 ②', price: 86000, timeCorrect: 1.01, areaCorrect: 0.97 },
  { id: 3, name: '基準地 ①', price: 84000, timeCorrect: 1.00, areaCorrect: 1.00 },
  { id: 4, name: '取引事例 ①', price: 82000, timeCorrect: 1.02, areaCorrect: 1.02 },
  { id: 5, name: '取引事例 ②', price: 88000, timeCorrect: 1.00, areaCorrect: 0.95 },
  { id: 6, name: '取引事例 ③', price: 83000, timeCorrect: 1.01, areaCorrect: 1.01 },
]

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstance = useRef<unknown>(null)

  const [caseData, setCaseData] = useState<Case | null>(null)
  const [generating, setGenerating] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [message, setMessage] = useState('')

  // Property info
  const [info, setInfo] = useState({
    propertyName: '',
    address: '',
    jyukyoHyoji: '',
    chiban: '',
    kaheiNumber: '',
    clientName: '',
    remarks: '',
    date: new Date().toLocaleDateString('ja-JP'),
  })

  // Land
  const [land, setLand] = useState({
    totalArea: 0, setback: 0, rosenka: 0,
    usefulRoad: '', railway: '', station: '', walkTime: 0,
    useDistrict: '', buildingCoverage: 0, floorCoverage: 0,
    shape: '', rights: '所有権', marketability: '普通',
  })

  // Building
  const [building, setBuilding] = useState({
    structure: '', floorArea: 0, age: 0, usefulLife: 22, newPrice: 200000,
  })

  // Cases
  const [cases, setCases] = useState<CaseItem[]>(defaultCases)
  const [individualCorr, setIndividualCorr] = useState(1.00)
  const [obsCorr, setObsCorr] = useState(1.00)

  // Weights
  const [weights, setWeights] = useState({ land: 45, building: 45, income: 10 })

  // Income
  const [income, setIncome] = useState({
    monthlyRent: 0, vacancyRate: 8.0, expenseRate: 18.0, capRate: 6.5,
  })

  // Map images
  const [rosenkaMap, setRosenkaMap] = useState<string>('')
  const [zoneMap, setZoneMap] = useState<string>('')
  const [registryImages, setRegistryImages] = useState<string[]>([])

  // Load case
  useEffect(() => {
    fetch(`/api/cases/${id}`)
      .then(r => r.json())
      .then(d => {
        const c: Case = d.case
        setCaseData(c)
        setInfo(prev => ({
          ...prev,
          address: c.property_address || '',
          clientName: c.customer_name ? `${c.customer_name} 様` : '',
        }))
      })
  }, [id])

  // Calculations
  const validLandArea = Math.max(0, land.totalArea - land.setback)

  const landEval = (() => {
    let sum = 0
    const calced = cases.map(c => {
      const val = c.price * c.timeCorrect * c.areaCorrect
      sum += val
      return { ...c, calculated: val }
    })
    const avg = sum / (cases.length || 1)
    return { cases: calced, average: avg, total: avg * individualCorr * validLandArea }
  })()

  const buildingEval = (() => {
    let r = (building.usefulLife - building.age) / (building.usefulLife || 1)
    if (r < 0.1) r = 0.1
    return { remainRatio: r, total: building.floorArea * building.newPrice * r * obsCorr }
  })()

  const incomeEval = (() => {
    const annual = income.monthlyRent * 12
    const net = annual * (1 - income.vacancyRate / 100 - income.expenseRate / 100)
    return net / ((income.capRate || 1) / 100)
  })()

  const totalEval =
    landEval.total * (weights.land / 100) +
    buildingEval.total * (weights.building / 100) +
    incomeEval * (weights.income / 100)

  const weightSum = weights.land + weights.building + weights.income

  // Chart
  useEffect(() => {
    const initChart = async () => {
      if (!chartRef.current) return
      const { Chart } = await import('chart.js/auto')
      if (chartInstance.current) (chartInstance.current as { destroy(): void }).destroy()
      const base = Math.round(landEval.average || 60000)
      chartInstance.current = new Chart(chartRef.current, {
        type: 'line',
        data: {
          labels: ['2022年', '2023年', '2024年', '2025年', '2026年'],
          datasets: [{
            label: '周辺基準地価推移 (円/㎡)',
            data: [base * 0.94, base * 0.96, base * 0.98, base * 0.99, base],
            borderColor: '#5a5a5a',
            backgroundColor: 'rgba(90,90,90,0.05)',
            borderWidth: 1.5,
            pointBackgroundColor: '#5a5a5a',
            pointRadius: 3,
            fill: true,
            tension: 0.2,
          }],
        },
        options: {
          devicePixelRatio: 4,
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { ticks: { font: { size: 9 } }, grid: { color: '#e8e8e8' } },
            x: { ticks: { font: { size: 9 } }, grid: { display: false } },
          },
        },
      })
    }
    initChart()
  }, [landEval.average])

  const handleImageUpload = (setter: (s: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setter(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleRegistryImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const readers = files.map(f => new Promise<string>(resolve => {
      const r = new FileReader()
      r.onload = ev => resolve(ev.target?.result as string)
      r.readAsDataURL(f)
    }))
    Promise.all(readers).then(imgs => setRegistryImages(imgs))
  }

  const handleRegistryPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    setMessage('登記PDFを解析中...')
    try {
      const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
      GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js'
      const buf = await file.arrayBuffer()
      const pdf = await getDocument({ data: new Uint8Array(buf) }).promise
      let text = ''
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p)
        const content = await page.getTextContent()
        text += content.items.map((i) => ('str' in i ? i.str : '')).join(' ') + '\n'
      }

      const res = await fetch(`/api/cases/${id}/parse-registry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const parsed = await res.json()
      if (parsed.error) { setMessage(`解析エラー: ${parsed.error}`); return }

      if (parsed.address) setInfo(prev => ({ ...prev, address: parsed.address, jyukyoHyoji: parsed.jyukyoHyoji || prev.jyukyoHyoji, chiban: parsed.chiban || prev.chiban, kaheiNumber: parsed.kaheiNumber || prev.kaheiNumber, propertyName: parsed.propertyName || prev.propertyName }))
      if (parsed.landArea) setLand(prev => ({ ...prev, totalArea: parsed.landArea }))
      if (parsed.floorArea) setBuilding(prev => ({ ...prev, floorArea: parsed.floorArea, structure: parsed.structure || prev.structure, age: parsed.builtYear ? new Date().getFullYear() - parsed.builtYear : prev.age }))
      setMessage('登記情報を自動入力しました')
    } catch {
      setMessage('PDF解析に失敗しました。手動で入力してください。')
    } finally {
      setParsing(false)
    }
  }

  const generateOpinion = async () => {
    setGenerating(true)
    setMessage('Claude AIで所見を生成中...')
    try {
      const res = await fetch(`/api/cases/${id}/generate-opinion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyName: info.propertyName,
          address: info.address,
          propertyType: caseData?.property_type,
          landArea: land.totalArea,
          setback: land.setback,
          rosenka: land.rosenka,
          useDistrict: land.useDistrict,
          buildingCoverage: land.buildingCoverage,
          floorCoverage: land.floorCoverage,
          railway: land.railway,
          station: land.station,
          walkTime: land.walkTime,
          shape: land.shape,
          structure: building.structure,
          floorArea: building.floorArea,
          age: building.age,
          usefulLife: building.usefulLife,
          evaluationTotal: totalEval,
          landTotal: landEval.total,
          buildingTotal: buildingEval.total,
          incomeTotal: incomeEval,
          weightLand: weights.land,
          weightBuilding: weights.building,
          weightIncome: weights.income,
        }),
      })
      const d = await res.json()
      if (d.opinion) {
        setInfo(prev => ({ ...prev, remarks: d.opinion }))
        setMessage('所見を生成しました')
      } else {
        setMessage(`エラー: ${d.error}`)
      }
    } catch {
      setMessage('所見の生成に失敗しました')
    } finally {
      setGenerating(false)
    }
  }

  const generatePDF = async () => {
    if (weightSum !== 100) { setMessage(`ウェイト合計が${weightSum}%です。100%にしてください。`); return }
    setPdfLoading(true)
    setMessage('PDF生成中...')
    try {
      const html2pdf = (await import('html2pdf.js')).default
      const el = document.getElementById('pdf-print-area')!
      const pages = el.getElementsByClassName('pdf-page')
      el.style.gap = '0'
      el.style.width = '210mm'
      for (let i = 0; i < pages.length; i++) {
        (pages[i] as HTMLElement).style.boxShadow = 'none'
        ;(pages[i] as HTMLElement).style.margin = '0'
      }
      await html2pdf().set({
        margin: 0,
        filename: `${info.propertyName || '不動産査定書'}_不動産評価レポート.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: { scale: 4, dpi: 300, useCORS: true, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        // pagebreak handled via page-break-after CSS
      }).from(el).save()
      el.style.gap = ''
      el.style.width = ''
      for (let i = 0; i < pages.length; i++) {
        (pages[i] as HTMLElement).style.boxShadow = ''
        ;(pages[i] as HTMLElement).style.margin = ''
      }
      setMessage('PDF出力完了')
    } catch {
      setMessage('PDF出力に失敗しました')
    } finally {
      setPdfLoading(false)
    }
  }

  const updateCase = (caseId: number, field: keyof CaseItem, value: string) => {
    setCases(cases.map(c => c.id === caseId ? { ...c, [field]: field === 'name' ? value : parseFloat(value) || 0 } : c))
  }

  // PDF page header component
  const PageHeader = ({ page }: { page: number }) => (
    <div className="flex justify-between items-end border-b border-[#5a5a5a] pb-1 mb-4">
      <span className="text-[9px] tracking-widest text-[#5a5a5a] uppercase font-medium">Property Valuation Report</span>
      <span className="text-[9px] text-[#5a5a5a]">{page} / 6</span>
    </div>
  )

  const PageFooter = () => (
    <div className="border-t border-[#ced4da] pt-2 flex justify-between text-[8px] text-[#9a9a9a]">
      <span>{COMPANY.name}</span>
      <span>{info.date}</span>
    </div>
  )

  const SectionHead = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-[9px] font-medium text-[#5a5a5a] uppercase tracking-widest border-b border-[#ced4da] pb-0.5 mb-2">{children}</h3>
  )

  const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
    <th className={`p-1.5 bg-[#f9f9f9] text-[9px] font-medium text-[#5a5a5a] border border-[#ced4da] ${right ? 'text-right' : 'text-left'}`}>{children}</th>
  )
  const Td = ({ children, right, bold }: { children: React.ReactNode; right?: boolean; bold?: boolean }) => (
    <td className={`p-1.5 text-[9.5px] border border-[#ced4da] ${right ? 'text-right' : ''} ${bold ? 'font-semibold text-[#1a1a1a]' : 'text-[#5a5a5a]'}`}>{children}</td>
  )
  const TdHead = ({ children }: { children: React.ReactNode }) => (
    <td className="p-1.5 text-[9px] font-medium text-[#5a5a5a] bg-[#f9f9f9] border border-[#ced4da] whitespace-nowrap">{children}</td>
  )

  if (!caseData) return <div className="min-h-screen flex items-center justify-center text-[#5a5a5a]">読み込み中...</div>

  return (
    <main className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="border-b border-[#ced4da] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/admin/case/${id}`)} className="text-[#9a9a9a] hover:text-[#5a5a5a] text-sm">← 案件詳細</button>
          <span className="text-[#ced4da]">|</span>
          <span className="text-sm text-[#5a5a5a] font-medium">査定書作成</span>
        </div>
        <button
          onClick={generatePDF}
          disabled={pdfLoading}
          className="text-sm px-4 py-1.5 border border-[#5a5a5a] text-[#5a5a5a] hover:bg-[#5a5a5a] hover:text-white transition-colors disabled:opacity-40"
        >
          {pdfLoading ? '生成中...' : 'PDF出力'}
        </button>
      </div>

      {message && (
        <div className="px-6 py-2 bg-[#f9f9f9] border-b border-[#ced4da] text-xs text-[#5a5a5a]">{message}</div>
      )}

      <div className="flex min-h-[calc(100vh-53px)]">
        {/* Left: Input panel */}
        <div className="w-[380px] shrink-0 border-r border-[#ced4da] overflow-y-auto p-5 space-y-6">

          {/* 登記PDF */}
          <section>
            <h2 className="text-xs font-medium text-[#5a5a5a] mb-2 uppercase tracking-widest">登記簿 PDF 読み込み</h2>
            <label className="block border border-dashed border-[#ced4da] rounded p-3 text-center cursor-pointer hover:bg-[#f9f9f9] transition">
              <input type="file" accept=".pdf" onChange={handleRegistryPdfUpload} className="hidden" />
              <span className="text-xs text-[#9a9a9a]">{parsing ? '解析中...' : '登記PDFをドロップ / クリックして選択'}</span>
            </label>
          </section>

          {/* 物件情報 */}
          <section>
            <h2 className="text-xs font-medium text-[#5a5a5a] mb-2 uppercase tracking-widest">物件情報</h2>
            <div className="space-y-2">
              {([
                ['物件名称', 'propertyName', 'text', '例: 呉市西中央 中藤様邸'],
                ['所在地（地番）', 'address', 'text', '例: 広島県呉市西中央3-19-6'],
                ['住居表示', 'jyukyoHyoji', 'text', '例: 呉市西中央3丁目19番6号'],
                ['地番', 'chiban', 'text', '14番2'],
                ['家屋番号', 'kaheiNumber', 'text', '14番2'],
                ['依頼者', 'clientName', 'text', '例: 中藤 宏平 様'],
              ] as [string, keyof typeof info, string, string][]).map(([label, key, type, ph]) => (
                <div key={key}>
                  <label className="block text-[10px] text-[#9a9a9a] mb-0.5">{label}</label>
                  <input type={type} value={info[key]} placeholder={ph}
                    onChange={e => setInfo(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full border border-[#ced4da] rounded px-2 py-1 text-xs text-[#5a5a5a] focus:outline-none focus:border-[#5a5a5a]" />
                </div>
              ))}
            </div>
          </section>

          {/* 土地 */}
          <section>
            <h2 className="text-xs font-medium text-[#5a5a5a] mb-2 uppercase tracking-widest">土地の概要</h2>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['地積 (㎡)', 'totalArea', 'number', '0.00'],
                ['セットバック (㎡)', 'setback', 'number', '0.00'],
                ['路線価 (円/㎡)', 'rosenka', 'number', '80000'],
                ['前面道路', 'usefulRoad', 'text', '南東側4.5m'],
                ['沿線名', 'railway', 'text', 'JR呉線'],
                ['最寄駅', 'station', 'text', '呉駅'],
                ['徒歩 (分)', 'walkTime', 'number', '10'],
                ['土地形状', 'shape', 'text', '整形'],
                ['権利区分', 'rights', 'text', '所有権'],
                ['市場流通性', 'marketability', 'text', '普通'],
                ['用途地域', 'useDistrict', 'text', '第1種中高層'],
                ['建蔽率 (%)', 'buildingCoverage', 'number', '60'],
                ['容積率 (%)', 'floorCoverage', 'number', '200'],
              ] as [string, keyof typeof land, string, string][]).map(([label, key, type, ph]) => (
                <div key={key}>
                  <label className="block text-[10px] text-[#9a9a9a] mb-0.5">{label}</label>
                  <input type={type} step={type === 'number' ? '0.01' : undefined} value={(land as Record<string, number | string>)[key] || ''} placeholder={ph}
                    onChange={e => setLand(prev => ({ ...prev, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                    className="w-full border border-[#ced4da] rounded px-2 py-1 text-xs text-[#5a5a5a] focus:outline-none focus:border-[#5a5a5a]" />
                </div>
              ))}
            </div>
          </section>

          {/* 建物 */}
          <section>
            <h2 className="text-xs font-medium text-[#5a5a5a] mb-2 uppercase tracking-widest">建物の概要</h2>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['構造', 'structure', 'text', '木造2階建'],
                ['延床面積 (㎡)', 'floorArea', 'number', '0.00'],
                ['築年数 (年)', 'age', 'number', '0'],
                ['法定耐用年数 (年)', 'usefulLife', 'number', '22'],
                ['再調達原価 (円/㎡)', 'newPrice', 'number', '200000'],
              ] as [string, keyof typeof building, string, string][]).map(([label, key, type, ph]) => (
                <div key={key} className={key === 'structure' ? 'col-span-2' : ''}>
                  <label className="block text-[10px] text-[#9a9a9a] mb-0.5">{label}</label>
                  <input type={type} step={type === 'number' ? '0.01' : undefined} value={(building as Record<string, number | string>)[key] || ''} placeholder={ph}
                    onChange={e => setBuilding(prev => ({ ...prev, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                    className="w-full border border-[#ced4da] rounded px-2 py-1 text-xs text-[#5a5a5a] focus:outline-none focus:border-[#5a5a5a]" />
                </div>
              ))}
              <div>
                <label className="block text-[10px] text-[#9a9a9a] mb-0.5">観察補正係数</label>
                <input type="number" step="0.01" value={obsCorr} onChange={e => setObsCorr(parseFloat(e.target.value) || 1)}
                  className="w-full border border-[#ced4da] rounded px-2 py-1 text-xs text-[#5a5a5a] focus:outline-none focus:border-[#5a5a5a]" />
              </div>
            </div>
          </section>

          {/* 取引事例 */}
          <section>
            <h2 className="text-xs font-medium text-[#5a5a5a] mb-2 uppercase tracking-widest">土地 取引事例</h2>
            <table className="w-full text-[9px] border-collapse">
              <thead>
                <tr>
                  <th className="p-1 text-left text-[#9a9a9a] border-b border-[#ced4da]">事例</th>
                  <th className="p-1 text-right text-[#9a9a9a] border-b border-[#ced4da]">単価</th>
                  <th className="p-1 text-right text-[#9a9a9a] border-b border-[#ced4da]">時点</th>
                  <th className="p-1 text-right text-[#9a9a9a] border-b border-[#ced4da]">地域</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(c => (
                  <tr key={c.id}>
                    <td className="p-0.5"><input value={c.name} onChange={e => updateCase(c.id, 'name', e.target.value)} className="w-full border border-[#ced4da] rounded px-1 py-0.5 text-[9px] focus:outline-none focus:border-[#5a5a5a]" /></td>
                    <td className="p-0.5"><input type="number" value={c.price} onChange={e => updateCase(c.id, 'price', e.target.value)} className="w-full border border-[#ced4da] rounded px-1 py-0.5 text-[9px] text-right focus:outline-none focus:border-[#5a5a5a]" /></td>
                    <td className="p-0.5"><input type="number" step="0.01" value={c.timeCorrect} onChange={e => updateCase(c.id, 'timeCorrect', e.target.value)} className="w-full border border-[#ced4da] rounded px-1 py-0.5 text-[9px] text-right focus:outline-none focus:border-[#5a5a5a]" /></td>
                    <td className="p-0.5"><input type="number" step="0.01" value={c.areaCorrect} onChange={e => updateCase(c.id, 'areaCorrect', e.target.value)} className="w-full border border-[#ced4da] rounded px-1 py-0.5 text-[9px] text-right focus:outline-none focus:border-[#5a5a5a]" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2">
              <label className="block text-[10px] text-[#9a9a9a] mb-0.5">個別修正係数</label>
              <input type="number" step="0.01" value={individualCorr} onChange={e => setIndividualCorr(parseFloat(e.target.value) || 1)}
                className="w-24 border border-[#ced4da] rounded px-2 py-1 text-xs text-[#5a5a5a] focus:outline-none focus:border-[#5a5a5a]" />
            </div>
          </section>

          {/* ウェイト */}
          <section>
            <h2 className="text-xs font-medium text-[#5a5a5a] mb-2 uppercase tracking-widest">査定ウェイト</h2>
            <div className="grid grid-cols-3 gap-2">
              {(['land', 'building', 'income'] as const).map((k, i) => (
                <div key={k}>
                  <label className="block text-[10px] text-[#9a9a9a] mb-0.5">{['土地 (%)', '建物 (%)', '収益 (%)'][i]}</label>
                  <input type="number" value={weights[k]} onChange={e => setWeights(prev => ({ ...prev, [k]: parseInt(e.target.value) || 0 }))}
                    className="w-full border border-[#ced4da] rounded px-2 py-1 text-xs text-center text-[#5a5a5a] focus:outline-none focus:border-[#5a5a5a]" />
                </div>
              ))}
            </div>
            <p className={`text-[10px] mt-1 ${weightSum === 100 ? 'text-[#9a9a9a]' : 'text-red-500'}`}>合計: {weightSum}% {weightSum !== 100 && '← 100%にしてください'}</p>
          </section>

          {/* 収益 */}
          <section>
            <h2 className="text-xs font-medium text-[#5a5a5a] mb-2 uppercase tracking-widest">収益還元（参考）</h2>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['月額想定賃料 (円)', 'monthlyRent'],
                ['空室率 (%)', 'vacancyRate'],
                ['経費率 (%)', 'expenseRate'],
                ['還元利回り (%)', 'capRate'],
              ] as [string, keyof typeof income][]).map(([label, key]) => (
                <div key={key}>
                  <label className="block text-[10px] text-[#9a9a9a] mb-0.5">{label}</label>
                  <input type="number" step="0.1" value={income[key] || ''} onChange={e => setIncome(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-[#ced4da] rounded px-2 py-1 text-xs text-[#5a5a5a] focus:outline-none focus:border-[#5a5a5a]" />
                </div>
              ))}
            </div>
          </section>

          {/* 地図画像 */}
          <section>
            <h2 className="text-xs font-medium text-[#5a5a5a] mb-2 uppercase tracking-widest">地図・登記資料 画像</h2>
            <div className="space-y-2">
              <div>
                <label className="block text-[10px] text-[#9a9a9a] mb-0.5">路線価住宅地図</label>
                <input type="file" accept="image/*" onChange={handleImageUpload(setRosenkaMap)}
                  className="w-full text-[10px] text-[#9a9a9a] file:mr-2 file:py-1 file:px-2 file:border file:border-[#ced4da] file:bg-white file:text-[#5a5a5a] file:text-[10px]" />
              </div>
              <div>
                <label className="block text-[10px] text-[#9a9a9a] mb-0.5">用途地域図</label>
                <input type="file" accept="image/*" onChange={handleImageUpload(setZoneMap)}
                  className="w-full text-[10px] text-[#9a9a9a] file:mr-2 file:py-1 file:px-2 file:border file:border-[#ced4da] file:bg-white file:text-[#5a5a5a] file:text-[10px]" />
              </div>
              <div>
                <label className="block text-[10px] text-[#9a9a9a] mb-0.5">登記資料（複数可）</label>
                <input type="file" accept="image/*" multiple onChange={handleRegistryImagesUpload}
                  className="w-full text-[10px] text-[#9a9a9a] file:mr-2 file:py-1 file:px-2 file:border file:border-[#ced4da] file:bg-white file:text-[#5a5a5a] file:text-[10px]" />
              </div>
            </div>
          </section>

          {/* 所見 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-medium text-[#5a5a5a] uppercase tracking-widest">総合所見</h2>
              <button onClick={generateOpinion} disabled={generating}
                className="text-[10px] px-2 py-1 border border-[#5a5a5a] text-[#5a5a5a] hover:bg-[#5a5a5a] hover:text-white transition-colors disabled:opacity-40">
                {generating ? '生成中...' : 'Claude AI で生成'}
              </button>
            </div>
            <textarea value={info.remarks} rows={6}
              onChange={e => setInfo(prev => ({ ...prev, remarks: e.target.value }))}
              placeholder="Claude AIで自動生成、または直接入力"
              className="w-full border border-[#ced4da] rounded px-2 py-1.5 text-xs text-[#5a5a5a] focus:outline-none focus:border-[#5a5a5a] leading-relaxed resize-none" />
          </section>
        </div>

        {/* Right: PDF Preview */}
        <div className="flex-1 bg-[#f0f0f0] overflow-y-auto p-6">
          <div id="pdf-print-area" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>

            {/* PAGE 1: 表紙 */}
            <div className="pdf-page" style={{ width: '210mm', minHeight: '297mm', padding: '16mm 20mm', background: 'white', boxSizing: 'border-box', boxShadow: '0 2px 12px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pageBreakAfter: 'always', breakInside: 'avoid', fontFamily: '"Noto Sans JP", "Helvetica Neue", sans-serif', color: '#5a5a5a' }}>
              <div>
                <div style={{ height: '2px', background: '#5a5a5a', marginBottom: '24mm' }} />
                <p style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9a9a9a', marginBottom: '8px' }}>Property Valuation Report</p>
                <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a1a', lineHeight: 1.3, marginBottom: '8px', fontFamily: '"Noto Serif JP", serif' }}>
                  {info.propertyName || '不動産評価レポート'}
                </h1>
                <p style={{ fontSize: '11px', color: '#5a5a5a', marginBottom: '4px' }}>{info.address || '（所在地未入力）'}</p>
                <p style={{ fontSize: '11px', color: '#5a5a5a' }}>{info.clientName}</p>
              </div>

              <div style={{ borderTop: '1px solid #ced4da', paddingTop: '8mm' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    <p style={{ fontSize: '11px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>{COMPANY.name}</p>
                    <p style={{ fontSize: '9px', color: '#9a9a9a' }}>〒{COMPANY.postal} {COMPANY.address}</p>
                    <p style={{ fontSize: '9px', color: '#9a9a9a' }}>{COMPANY.representative}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '9px', color: '#9a9a9a' }}>作成日: {info.date}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* PAGE 2: 総合評価 */}
            <div className="pdf-page" style={{ width: '210mm', minHeight: '297mm', padding: '14mm 18mm', background: 'white', boxSizing: 'border-box', boxShadow: '0 2px 12px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pageBreakAfter: 'always', breakInside: 'avoid', fontFamily: '"Noto Sans JP", "Helvetica Neue", sans-serif', color: '#5a5a5a' }}>
              <div style={{ flex: 1 }}>
                <PageHeader page={1} />

                {/* 総合評価額 */}
                <div style={{ border: '1px solid #ced4da', padding: '12px', marginBottom: '14px', textAlign: 'center' }}>
                  <p style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9a9a9a', marginBottom: '6px' }}>査定算出 総合評価額</p>
                  <p style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a', fontFamily: '"Noto Serif JP", serif' }}>{formatNum(totalEval)} <span style={{ fontSize: '12px', fontWeight: '400', color: '#5a5a5a' }}>円</span></p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ced4da' }}>
                    <div style={{ fontSize: '9px', color: '#9a9a9a' }}>土地評価 ({weights.land}%)<br /><span style={{ color: '#1a1a1a', fontWeight: '600', fontSize: '10px' }}>{formatNum(landEval.total)}円</span></div>
                    <div style={{ fontSize: '9px', color: '#9a9a9a' }}>建物評価 ({weights.building}%)<br /><span style={{ color: '#1a1a1a', fontWeight: '600', fontSize: '10px' }}>{formatNum(buildingEval.total)}円</span></div>
                    <div style={{ fontSize: '9px', color: '#9a9a9a' }}>収益評価 ({weights.income}%)<br /><span style={{ color: '#1a1a1a', fontWeight: '600', fontSize: '10px' }}>{formatNum(incomeEval)}円</span></div>
                  </div>
                </div>

                {/* 評価対象不動産 */}
                <div style={{ marginBottom: '14px' }}>
                  <SectionHead>評価対象不動産</SectionHead>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['所在地', info.address],
                        ['住居表示', info.jyukyoHyoji],
                        ['地番', info.chiban],
                        ['家屋番号', info.kaheiNumber],
                      ].map(([label, val]) => (
                        <tr key={label}><TdHead>{label}</TdHead><Td>{val || '—'}</Td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 土地の概要 */}
                <div style={{ marginBottom: '14px' }}>
                  <SectionHead>土地の概要</SectionHead>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr>
                        <TdHead>総地積</TdHead>
                        <Td>{land.totalArea.toFixed(2)} ㎡（セットバック {land.setback.toFixed(2)} ㎡）</Td>
                        <TdHead>有効面積</TdHead>
                        <Td bold>{validLandArea.toFixed(2)} ㎡</Td>
                      </tr>
                      <tr>
                        <TdHead>前面道路路線価</TdHead>
                        <Td bold>{formatNum(land.rosenka)} 円/㎡</Td>
                        <TdHead>交通機関</TdHead>
                        <Td>{land.railway} {land.station}駅 徒歩{land.walkTime}分</Td>
                      </tr>
                      <tr>
                        <TdHead>用途地域</TdHead>
                        <Td>{land.useDistrict || '—'}</Td>
                        <TdHead>建蔽率 / 容積率</TdHead>
                        <Td>{land.buildingCoverage}% / {land.floorCoverage}%</Td>
                      </tr>
                      <tr>
                        <TdHead>前面道路</TdHead>
                        <Td>{land.usefulRoad || '—'}</Td>
                        <TdHead>土地形状</TdHead>
                        <Td>{land.shape || '—'}</Td>
                      </tr>
                      <tr>
                        <TdHead>権利関係</TdHead>
                        <Td>{land.rights || '—'}</Td>
                        <TdHead>流通・市場性</TdHead>
                        <Td>{land.marketability || '—'}</Td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 建物の概要 */}
                <div>
                  <SectionHead>建物の概要</SectionHead>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr><Th>種類</Th><Th>構造</Th><Th right>延床面積</Th><Th right>経過年数</Th></tr>
                    </thead>
                    <tbody>
                      <tr>
                        <Td>居宅</Td>
                        <Td>{building.structure || '—'}</Td>
                        <Td right bold>{building.floorArea.toFixed(2)} ㎡</Td>
                        <Td right>築 {building.age} 年（耐用 {building.usefulLife}年）</Td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <PageFooter />
            </div>

            {/* PAGE 3: 査定表・地価推移・所見 */}
            <div className="pdf-page" style={{ width: '210mm', minHeight: '297mm', padding: '14mm 18mm', background: 'white', boxSizing: 'border-box', boxShadow: '0 2px 12px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pageBreakAfter: 'always', breakInside: 'avoid', fontFamily: '"Noto Sans JP", "Helvetica Neue", sans-serif', color: '#5a5a5a' }}>
              <div style={{ flex: 1 }}>
                <PageHeader page={2} />

                {/* 土地査定表 */}
                <div style={{ marginBottom: '14px' }}>
                  <SectionHead>土地の詳細査定表（複数事例比準）</SectionHead>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <Th>項目</Th>
                        {landEval.cases.map((c, i) => <Th key={c.id} right>事例{i + 1}<br /><span style={{ fontWeight: 400, fontSize: '8px' }}>({c.name})</span></Th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        ['価格 (円/㎡)', (c: typeof landEval.cases[0]) => formatNum(c.price)],
                        ['時点修正', (c: typeof landEval.cases[0]) => c.timeCorrect.toFixed(2)],
                        ['地域格差', (c: typeof landEval.cases[0]) => c.areaCorrect.toFixed(2)],
                        ['比準単価', (c: typeof landEval.cases[0]) => formatNum(c.calculated)],
                      ] as [string, (c: typeof landEval.cases[0]) => string][]).map(([label, fn]) => (
                        <tr key={label}>
                          <TdHead>{label}</TdHead>
                          {landEval.cases.map(c => <Td key={c.id} right>{fn(c)}</Td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#f9f9f9', border: '1px solid #ced4da', marginTop: '4px', fontSize: '9px' }}>
                    <span>比準㎡平均: <strong>{formatNum(landEval.average)} 円/㎡</strong></span>
                    <span>個別修正: <strong>{individualCorr.toFixed(2)} 倍</strong></span>
                    <span>土地評価額: <strong>{formatNum(landEval.total)} 円</strong></span>
                  </div>
                </div>

                {/* 建物査定表 */}
                <div style={{ marginBottom: '14px' }}>
                  <SectionHead>建物の査定表（積算評価）</SectionHead>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <Th>再調達原価</Th><Th right>耐用年数</Th><Th right>残存/経過</Th><Th right>延床面積</Th><Th right>観察補正</Th><Th right>建物評価額</Th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <Td>{formatNum(building.newPrice)} 円/㎡</Td>
                        <Td right>{building.usefulLife} 年</Td>
                        <Td right>{building.usefulLife - building.age}年 / {building.age}年</Td>
                        <Td right>{building.floorArea.toFixed(2)} ㎡</Td>
                        <Td right>{obsCorr.toFixed(2)} 倍</Td>
                        <Td right bold>{formatNum(buildingEval.total)} 円</Td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 地価推移グラフ */}
                <div style={{ marginBottom: '14px' }}>
                  <SectionHead>基準地価格の推移モデル（過去5年）</SectionHead>
                  <div style={{ height: '100px', border: '1px solid #ced4da', padding: '8px', position: 'relative' }}>
                    <canvas ref={chartRef} />
                  </div>
                </div>

                {/* 総合所見 */}
                <div>
                  <SectionHead>不動産評価 総合所見</SectionHead>
                  <div style={{ border: '1px solid #ced4da', padding: '10px', fontSize: '9.5px', lineHeight: 1.8, color: '#5a5a5a', textAlign: 'justify', minHeight: '60px' }}>
                    {info.remarks || '（所見未入力）'}
                  </div>
                </div>
              </div>
              <PageFooter />
            </div>

            {/* PAGE 4: 路線価住宅地図 */}
            <div className="pdf-page" style={{ width: '210mm', minHeight: '297mm', padding: '14mm 18mm', background: 'white', boxSizing: 'border-box', boxShadow: '0 2px 12px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pageBreakAfter: 'always', breakInside: 'avoid', fontFamily: '"Noto Sans JP", "Helvetica Neue", sans-serif', color: '#5a5a5a' }}>
              <div style={{ flex: 1 }}>
                <PageHeader page={3} />
                <SectionHead>路線価住宅地図</SectionHead>
                <div style={{ width: '100%', height: '220mm', border: '1px solid #ced4da', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9f9f9' }}>
                  {rosenkaMap ? (
                    <img src={rosenkaMap} alt="路線価住宅地図" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <p style={{ fontSize: '9px', color: '#9a9a9a' }}>路線価住宅地図をアップロードしてください</p>
                  )}
                </div>
              </div>
              <PageFooter />
            </div>

            {/* PAGE 5: 用途地域図 */}
            <div className="pdf-page" style={{ width: '210mm', minHeight: '297mm', padding: '14mm 18mm', background: 'white', boxSizing: 'border-box', boxShadow: '0 2px 12px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pageBreakAfter: 'always', breakInside: 'avoid', fontFamily: '"Noto Sans JP", "Helvetica Neue", sans-serif', color: '#5a5a5a' }}>
              <div style={{ flex: 1 }}>
                <PageHeader page={4} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <SectionHead>都市計画 用途地域図</SectionHead>
                  {land.useDistrict && (
                    <span style={{ fontSize: '9px', border: '1px solid #ced4da', padding: '2px 8px', color: '#5a5a5a' }}>指定区分: {land.useDistrict}</span>
                  )}
                </div>
                <div style={{ width: '100%', height: '220mm', border: '1px solid #ced4da', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9f9f9' }}>
                  {zoneMap ? (
                    <img src={zoneMap} alt="用途地域図" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <p style={{ fontSize: '9px', color: '#9a9a9a' }}>用途地域図をアップロードしてください</p>
                  )}
                </div>
              </div>
              <PageFooter />
            </div>

            {/* PAGE 6: 登記資料 + 免責事項 */}
            <div className="pdf-page" style={{ width: '210mm', minHeight: '297mm', padding: '14mm 18mm', background: 'white', boxSizing: 'border-box', boxShadow: '0 2px 12px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: '"Noto Sans JP", "Helvetica Neue", sans-serif', color: '#5a5a5a' }}>
              <div style={{ flex: 1 }}>
                <PageHeader page={5} />

                {registryImages.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <SectionHead>取得登記資料</SectionHead>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(registryImages.length, 2)}, 1fr)`, gap: '8px' }}>
                      {registryImages.map((src, i) => (
                        <img key={i} src={src} alt={`登記資料 ${i + 1}`} style={{ width: '100%', border: '1px solid #ced4da', objectFit: 'contain' }} />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <SectionHead>免責事項</SectionHead>
                  <div style={{ fontSize: '8px', lineHeight: 1.8, color: '#9a9a9a', textAlign: 'justify' }}>
                    {[
                      `本レポートは、${COMPANY.name}が情報提供のみを目的として作成したものであり、特定の不動産の売買・賃貸借および投資の推奨、勧誘または申込みを目的としたものではありません。`,
                      '本レポートの不動産価格情報は、何らの公的な効力や私的な拘束力を有するものではありません。',
                      '当社は本レポートに掲載された情報の正確性・信頼性・完全性・妥当性について、いかなる表明・保証をするものではなく、一切の責任又は義務を負わないものとします。',
                      '本レポートに含まれる情報は、不動産市場や経済環境の変化等のために最新のものではなくなる可能性があります。',
                      '不動産売買・賃貸借・投資の最終判断はお客様ご自身においてなされなければならず、取引に対する一切の責任はお客様自身にあります。',
                      '本レポートに含まれる情報は、将来の実績・効果を示唆または保証するものではありません。',
                    ].map((text, i) => (
                      <p key={i} style={{ marginBottom: '6px' }}>{i + 1}. {text}</p>
                    ))}
                  </div>
                </div>
              </div>
              <PageFooter />
            </div>

          </div>
        </div>
      </div>
    </main>
  )
}
