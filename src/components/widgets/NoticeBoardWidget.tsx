import { useState, useEffect, useRef } from 'react'
import { Megaphone, Pencil, Check, X, Monitor, Plus, Minus } from 'lucide-react'
import { useIAmWallpaper } from '../../hooks/useIAmWallpaper'

const STORAGE_KEY = 'noticeboard:content'
const FONT_SIZE_KEY = 'noticeboard:fontSize'
const FONT_COLOR_KEY = 'noticeboard:fontColor'

/** 글씨 크기 단계 — 일반/디스플레이 공통. 사용자가 ± 버튼으로 조절. */
const FONT_SIZES = [24, 32, 40, 48, 60, 72, 88, 108, 132, 160, 200, 240, 300] as const
const DEFAULT_FONT_IDX = 5  // 72px
/** 글씨 색 팔레트 — 학교 알림에 자주 쓰는 색. */
const FONT_COLORS = [
  { hex: '#1F2937', label: '검정' },
  { hex: '#DC2626', label: '빨강' },
  { hex: '#2563EB', label: '파랑' },
  { hex: '#059669', label: '초록' },
  { hex: '#D97706', label: '주황' },
  { hex: '#7C3AED', label: '보라' },
  { hex: '#DB2777', label: '분홍' },
  { hex: '#374151', label: '회색' },
] as const

function loadFontIdx(): number {
  try {
    const v = parseInt(localStorage.getItem(FONT_SIZE_KEY) ?? '', 10)
    if (Number.isFinite(v) && v >= 0 && v < FONT_SIZES.length) return v
  } catch { /* noop */ }
  return DEFAULT_FONT_IDX
}
function loadFontColor(): string {
  try {
    const v = localStorage.getItem(FONT_COLOR_KEY)
    if (v && FONT_COLORS.some((c) => c.hex === v)) return v
  } catch { /* noop */ }
  return FONT_COLORS[0].hex
}

/**
 * 알림판 위젯 — 전자칠판에 학생들에게 보여줄 공지/할말.
 *
 * - 단일 텍스트 + 글씨 크기 + 색 저장(localStorage). 위젯 여러 개 띄워도 storage event 로 sync.
 * - 일반 모드: 헤더(편집/디스플레이) + 큰 본문(클릭하면 인라인 편집).
 * - 배경화면/디스플레이 모드: 좌상단 작은 알림판 라벨 + 풀스크린 큰 글씨.
 * - 글씨 크기·색 변경 시 박스 크기는 그대로(Shell zoom 대신 자체 fontSize 사용).
 * - 표시/편집 모드 fontSize 일관 → 편집 진입 시 작아지는 버그 없음.
 */
export function NoticeBoardWidget() {
  const [content, setContent] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? '' } catch { return '' }
  })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)
  const [fontIdx, setFontIdx] = useState<number>(loadFontIdx)
  const [fontColor, setFontColor] = useState<string>(loadFontColor)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const fontSize = FONT_SIZES[fontIdx]

  // 배경화면 모드일 때 — 클릭 통과라 편집 불가. 헤더 자동 숨김(WidgetShell 이 처리).
  const iAmWallpaper = useIAmWallpaper('noticeboard')

  // 디스플레이 모드(마스터 브로드캐스트) 동기화.
  const [displayMode, setDisplayMode] = useState(false)
  useEffect(() => {
    const off = window.api.widget.onAllDisplayModeChanged?.((p) => setDisplayMode(!!p.on))
    return () => { if (off) off() }
  }, [])

  // 배경화면 모드 ON 시 자체 디스플레이 모드도 ON — 헤더 숨김 신호를 WidgetShell 에 전달.
  useEffect(() => {
    if (iAmWallpaper) setDisplayMode(true)
  }, [iAmWallpaper])

  // displayMode → WidgetShell 헤더 숨김 신호
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('widget:displayMode', { detail: { on: displayMode } }))
  }, [displayMode])

  // 다른 위젯 창에서 변경되면 sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === STORAGE_KEY) setContent(e.newValue ?? '')
      else if (e.key === FONT_SIZE_KEY) setFontIdx(loadFontIdx())
      else if (e.key === FONT_COLOR_KEY) setFontColor(loadFontColor())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // 편집 진입 시 textarea focus.
  useEffect(() => {
    if (!editing) return
    const t = setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    }, 30)
    return () => clearTimeout(t)
  }, [editing])

  const save = (): void => {
    const next = draft
    setContent(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
    setEditing(false)
  }

  const cancel = (): void => {
    setDraft(content)
    setEditing(false)
  }

  const startEdit = (): void => {
    if (iAmWallpaper) return // 클릭 통과 — 편집 불가
    setDraft(content)
    setEditing(true)
  }

  const changeFontIdx = (delta: number): void => {
    setFontIdx((prev) => {
      const next = Math.max(0, Math.min(FONT_SIZES.length - 1, prev + delta))
      try { localStorage.setItem(FONT_SIZE_KEY, String(next)) } catch { /* ignore */ }
      return next
    })
  }
  const changeFontColor = (hex: string): void => {
    setFontColor(hex)
    try { localStorage.setItem(FONT_COLOR_KEY, hex) } catch { /* ignore */ }
  }

  // 화면 가득한 큰 글씨 모드 — 디스플레이/배경화면.
  const big = displayMode || iAmWallpaper

  const toggleDisplayMode = (): void => {
    const next = !displayMode
    setDisplayMode(next)
    try { window.api.widget.setAllDisplayMode?.(next) } catch { /* noop */ }
  }

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        padding: big ? 'clamp(8px, 1.5vw, 16px) clamp(16px, 3vw, 36px)' : '14px 18px 22px 18px',
        background: big
          ? 'radial-gradient(ellipse at 30% 0%, rgba(220,38,38,0.10) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(217,119,6,0.08) 0%, transparent 50%)'
          : 'radial-gradient(ellipse at 0% 0%, rgba(220,38,38,0.06) 0%, transparent 55%)',
      }}
    >
      {/* 큰 모드(디스플레이/배경) — 좌상단에 세련된 알림판 라벨 */}
      {big && (
        <div
          className="absolute flex items-center gap-2 z-20"
          style={{
            top: 'clamp(12px, 2vw, 22px)',
            left: 'clamp(12px, 2vw, 22px)',
            padding: 'clamp(5px, 0.7vw, 10px) clamp(10px, 1.2vw, 16px)',
            borderRadius: 999,
            background: 'linear-gradient(135deg, rgba(220,38,38,0.94) 0%, rgba(185,28,28,0.94) 100%)',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(220,38,38,0.35)',
            backdropFilter: 'blur(6px)',
            letterSpacing: '-0.02em',
          }}
        >
          <Megaphone size={14} strokeWidth={2.6} />
          <span style={{ fontSize: 'clamp(11px, 1.2vw, 16px)', fontWeight: 800 }}>알림판</span>
        </div>
      )}

      {/* 일반 모드 컨트롤 — Shell 헤더에 이미 '알림판' 라벨 있으므로 자체 아이콘·라벨 제거.
          글씨 ± / 편집 / 디스플레이 모드 버튼만 우측 정렬 한 줄. */}
      {!big && (
        <div className="flex items-center justify-end gap-1.5 shrink-0 mb-2">
          <button
            onClick={() => changeFontIdx(-1)}
            disabled={fontIdx <= 0}
            className="flex items-center justify-center transition-colors text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] disabled:opacity-30"
            style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--border-widget)' }}
            title={`글씨 작게 (현재 ${fontSize}px)`}
          >
            <Minus size={13} strokeWidth={2.4} />
          </button>
          <button
            onClick={() => changeFontIdx(+1)}
            disabled={fontIdx >= FONT_SIZES.length - 1}
            className="flex items-center justify-center transition-colors text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] disabled:opacity-30"
            style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--border-widget)' }}
            title={`글씨 크게 (현재 ${fontSize}px)`}
          >
            <Plus size={13} strokeWidth={2.4} />
          </button>
          {!editing && (
            <button
              onClick={startEdit}
              className="flex items-center justify-center transition-colors text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
              style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--border-widget)' }}
              title="공지 편집"
            >
              <Pencil size={13} strokeWidth={2.2} />
            </button>
          )}
          <button
            onClick={toggleDisplayMode}
            className="flex items-center justify-center transition-colors text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
            style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--border-widget)' }}
            title="디스플레이 모드 — 큰 글씨로 학생에게. 모든 위젯에 동일 적용."
          >
            <Monitor size={13} strokeWidth={2.2} />
          </button>
        </div>
      )}

      {/* 편집 모드 — 색 팔레트 (textarea 위) */}
      {editing && !big && (
        <div className="flex items-center gap-1.5 shrink-0 mb-2 flex-wrap" style={{ paddingLeft: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>색</span>
          {FONT_COLORS.map((c) => (
            <button
              key={c.hex}
              onClick={() => changeFontColor(c.hex)}
              className="transition-transform hover:scale-110"
              style={{
                width: 18, height: 18, borderRadius: '50%',
                background: c.hex,
                border: fontColor === c.hex ? '2px solid var(--text-primary)' : '1.5px solid var(--border-widget)',
                boxShadow: fontColor === c.hex ? `0 0 0 2px ${c.hex}33` : undefined,
              }}
              title={c.label}
            />
          ))}
        </div>
      )}

      {/* 본문 — 표시/편집 모드 모두 동일 fontSize/fontColor 적용 (편집 시 작아지는 버그 해결) */}
      <div
        className="flex-1 flex items-center justify-center min-h-0 relative"
        onClick={() => { if (!editing && !iAmWallpaper) startEdit() }}
        style={{ cursor: !editing && !iAmWallpaper ? 'text' : undefined }}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); cancel() }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() }
            }}
            className="w-full h-full outline-none resize-none bg-transparent"
            placeholder="공지 / 안내 / 학생들에게 보여줄 텍스트…"
            style={{
              fontSize,
              fontWeight: 900,
              letterSpacing: '-0.025em',
              lineHeight: 1.25,
              color: fontColor,
              textAlign: 'center',
              padding: big ? 'clamp(24px, 4vw, 56px)' : '14px 16px',
              borderRadius: big ? 18 : 12,
              border: big ? '2px dashed rgba(220,38,38,0.32)' : '1.5px solid #DC2626',
              background: big ? 'rgba(255,255,255,0.55)' : 'var(--bg-secondary)',
              backdropFilter: big ? 'blur(8px)' : undefined,
            }}
          />
        ) : content ? (
          <div
            className="w-full"
            style={{
              fontSize,
              fontWeight: 900,
              letterSpacing: '-0.025em',
              lineHeight: 1.28,
              color: fontColor,
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
              wordBreak: 'keep-all',
              overflowWrap: 'anywhere',
              textShadow: big ? '0 2px 14px rgba(220,38,38,0.12)' : undefined,
              padding: big ? 0 : '8px 4px',
            }}
          >
            {content}
          </div>
        ) : (
          <div
            className="w-full text-center"
            style={{
              fontSize: big ? 'clamp(18px, 2.6vw, 36px)' : 15,
              fontWeight: 700,
              color: 'var(--text-muted)',
              letterSpacing: '-0.02em',
              padding: big ? 'clamp(28px, 4vw, 56px)' : 22,
              borderRadius: big ? 18 : 12,
              border: '2px dashed rgba(220,38,38,0.32)',
              background: big ? 'rgba(255,255,255,0.4)' : 'transparent',
            }}
          >
            {iAmWallpaper
              ? '배경화면 모드에선 편집할 수 없어요'
              : '여기를 클릭해 공지를 적어주세요'}
          </div>
        )}
      </div>

      {/* 편집 액션 — 저장/취소. 편집 중에만 우하단. */}
      {editing && (
        <div
          className="absolute flex items-center gap-1.5 z-30"
          style={{ bottom: 8, right: 8, WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as React.CSSProperties}
        >
          <button
            onClick={cancel}
            className="flex items-center justify-center transition-colors"
            style={{
              width: 30, height: 30, borderRadius: 9,
              color: 'var(--text-muted)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-widget)',
            }}
            title="취소 (Esc)"
          >
            <X size={14} strokeWidth={2.4} />
          </button>
          <button
            onClick={save}
            className="flex items-center justify-center transition-all hover:scale-105"
            style={{
              width: 30, height: 30, borderRadius: 9,
              color: '#fff',
              background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
              boxShadow: '0 3px 10px rgba(220,38,38,0.42)',
            }}
            title="저장 (Cmd/Ctrl + Enter)"
          >
            <Check size={14} strokeWidth={2.6} />
          </button>
        </div>
      )}
    </div>
  )
}
