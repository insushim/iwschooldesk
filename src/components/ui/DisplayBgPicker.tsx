import { useEffect, useRef, useState } from 'react'
import { Palette, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { DISPLAY_BG_PRESETS, type DisplayBgPreset } from '../../lib/display-bg'

/**
 * 디스플레이 모드 배경 프리셋 피커.
 *
 * 우상단 작은 팔레트 아이콘 → 클릭 시 인라인 팝오버로 8색 원형 버튼 노출.
 * 외부 클릭·Esc 시 닫힘.
 */
export function DisplayBgPicker({
  current,
  onPick,
  className,
}: {
  current: DisplayBgPreset
  onPick: (id: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1 rounded-md transition-colors"
        style={{
          color: current.textMode === 'light' ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)',
          backgroundColor: open
            ? current.textMode === 'light'
              ? 'rgba(255,255,255,0.14)'
              : 'rgba(15,23,42,0.08)'
            : 'transparent',
        }}
        title="배경색 변경"
      >
        <Palette size={13} strokeWidth={2.2} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50"
            style={{
              top: 'calc(100% + 6px)',
              padding: 8,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(14px)',
              boxShadow: '0 12px 36px rgba(15,23,42,0.18), 0 0 0 1px rgba(15,23,42,0.06)',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 28px)',
              gap: 8,
            }}
          >
            {DISPLAY_BG_PRESETS.map((p) => {
              const active = p.id === current.id
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    onPick(p.id)
                    setOpen(false)
                  }}
                  title={p.label}
                  className="relative transition-transform hover:scale-110"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 10,
                    background: p.preview,
                    border: active
                      ? '2px solid #0F172A'
                      : p.id === 'default'
                        ? '1.2px solid rgba(15,23,42,0.18)'
                        : '1px solid rgba(255,255,255,0.35)',
                    boxShadow: active ? '0 0 0 2px rgba(14,165,233,0.25)' : '0 2px 6px rgba(15,23,42,0.12)',
                  }}
                >
                  {active && (
                    <span
                      className="absolute inset-0 flex items-center justify-center"
                      style={{
                        color: p.textMode === 'light' ? '#fff' : '#0F172A',
                      }}
                    >
                      <Check size={14} strokeWidth={3} />
                    </span>
                  )}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
