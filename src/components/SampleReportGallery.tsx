'use client'

import { useState, useEffect } from 'react'

const PAGES = [1, 2, 3, 4, 5, 6]

export default function SampleReportGallery() {
  const [lightbox, setLightbox] = useState<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowRight') setLightbox((p) => p !== null ? Math.min(p + 1, PAGES.length) : null)
      if (e.key === 'ArrowLeft') setLightbox((p) => p !== null ? Math.max(p - 1, 1) : null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {/* スクロールギャラリー */}
      <div
        className="flex gap-4 overflow-x-auto px-4 pb-4"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        {PAGES.map((n) => (
          <button
            key={n}
            onClick={() => setLightbox(n)}
            className="shrink-0 bg-white border border-[#ced4da] overflow-hidden cursor-zoom-in hover:border-[#5a5a5a] transition-colors"
            style={{ scrollSnapAlign: 'start', width: 'min(72vw, 320px)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/sample-report/page-${n}.png`}
              alt={`査定書サンプル ${n}ページ目`}
              className="w-full h-auto"
            />
          </button>
        ))}
        <div className="shrink-0 w-4" />
      </div>

      <div className="px-4 mt-3">
        <p className="text-[10px] text-[#5a5a5a] font-helvetica tracking-[0.05em]">← swipe · click to zoom →</p>
      </div>

      {/* ライトボックス */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white text-3xl px-3 py-2 opacity-70 hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); setLightbox((p) => p !== null ? Math.max(p - 1, 1) : null) }}
          >
            ‹
          </button>

          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/sample-report/page-${lightbox}.png`}
              alt={`査定書サンプル ${lightbox}ページ目`}
              className="h-[90vh] w-auto object-contain"
            />
            <p className="absolute bottom-2 left-0 right-0 text-center text-white/60 text-xs font-helvetica tracking-widest">
              {lightbox} / {PAGES.length}
            </p>
          </div>

          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white text-3xl px-3 py-2 opacity-70 hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); setLightbox((p) => p !== null ? Math.min(p + 1, PAGES.length) : null) }}
          >
            ›
          </button>

          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
