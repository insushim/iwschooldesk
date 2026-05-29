import { useState, useEffect, useRef } from 'react'
import { Megaphone, Pencil, Check, X, Monitor, MonitorOff, Plus, Minus, AlignLeft, AlignCenter, AlignRight, Type, Expand } from 'lucide-react'
import { useIAmWallpaper } from '../../hooks/useIAmWallpaper'

const STORAGE_KEY = 'noticeboard:content'
const FONT_SIZE_KEY = 'noticeboard:fontSize'
const FONT_COLOR_KEY = 'noticeboard:fontColor'
const TEXT_ALIGN_KEY = 'noticeboard:textAlign'
const FONT_FAMILY_KEY = 'noticeboard:fontFamily'

/** 무료 한글 폰트 (Google Fonts + 로컬 Pretendard) — 알림판 메뉴에서 선택. */
const FONT_FAMILIES = [
  { id: 'default',    label: '기본',     css: 'Pretendard, system-ui, sans-serif' },
  { id: 'noto-sans',  label: '노토 산스', css: '"Noto Sans KR", Pretendard, sans-serif' },
  { id: 'gowun',      label: '고운바탕', css: '"Gowun Batang", "Noto Serif KR", serif' },
  { id: 'black-han',  label: '검은고딕', css: '"Black Han Sans", "Noto Sans KR", sans-serif' },
  { id: 'do-hyeon',   label: '도현체',   css: '"Do Hyeon", Pretendard, sans-serif' },
  { id: 'jua',        label: '주아체',   css: '"Jua", Pretendard, sans-serif' },
  { id: 'nanum-pen',  label: '손글씨',   css: '"Nanum Pen Script", cursive' },
] as const
type FontFamilyId = (typeof FONT_FAMILIES)[number]['id']
type TextAlignVal = 'left' | 'center' | 'right'

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
function loadTextAlign(): TextAlignVal {
  try {
    const v = localStorage.getItem(TEXT_ALIGN_KEY)
    if (v === 'left' || v === 'center' || v === 'right') return v
  } catch { /* noop */ }
  return 'center'
}
/** 본문에서 URL(http/https/www.) 을 감지해서 클릭 가능한 링크로 변환.
 *  Electron main 의 setWindowOpenHandler 가 window.open 을 가로채서 외부 브라우저로 안전 오픈. */
const URL_RE = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/g
function renderWithLinks(text: string, linkColor: string): React.ReactNode[] {
  if (!text) return []
  const parts: React.ReactNode[] = []
  let last = 0
  URL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    let url = m[0]
    // 끝의 구두점 제거 (예: "방문하세요." 의 "." 까지 잡지 않게)
    let trim = ''
    while (url.length > 0 && /[.,;!?)\]]/.test(url[url.length - 1])) {
      trim = url[url.length - 1] + trim
      url = url.slice(0, -1)
    }
    const href = url.startsWith('http') ? url : `https://${url}`
    parts.push(
      <a
        key={m.index}
        href={href}
        onClick={(e) => { e.preventDefault(); try { window.open(href, '_blank') } catch { /* noop */ } }}
        style={{ color: linkColor, textDecoration: 'underline', textUnderlineOffset: '0.18em', cursor: 'pointer' }}
      >{url}</a>
    )
    if (trim) parts.push(trim)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function loadFontFamily(): FontFamilyId {
  try {
    const v = localStorage.getItem(FONT_FAMILY_KEY)
    if (v && FONT_FAMILIES.some((f) => f.id === v)) return v as FontFamilyId
  } catch { /* noop */ }
  return 'default'
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
  const [textAlign, setTextAlign] = useState<TextAlignVal>(loadTextAlign)
  const [fontFamilyId, setFontFamilyId] = useState<FontFamilyId>(loadFontFamily)
  const [fontMenuOpen, setFontMenuOpen] = useState(false)
  const fontMenuRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fontFamilyCss = FONT_FAMILIES.find((f) => f.id === fontFamilyId)?.css ?? FONT_FAMILIES[0].css

  const fontSize = FONT_SIZES[fontIdx]

  // 배경화면 모드일 때 — 클릭 통과라 편집 불가. 헤더 자동 숨김(WidgetShell 이 처리).
  const iAmWallpaper = useIAmWallpaper('noticeboard')

  // 알림판 단일 토글 — compact(헤더만) ↔ maximize(풀스크린) 사이클.
  // compact=true 면 본문 안 보임, false 면 정상 본문(혹은 풀스크린).
  const [compact, setCompact] = useState(false)
  // main 이 보내는 상태 변화로 sync — IPC 한 호출이 끝나면 compact 토글.
  useEffect(() => {
    const off = window.api.widget.onNoticeboardExpandChanged?.((p) => setCompact(!!p.compact))
    return () => { if (off) off() }
  }, [])
  const toggleExpand = (): void => {
    if (!compact && editing) setEditing(false)  // compact 들어가면 편집 해제
    try { window.api.widget.toggleExpandSelf?.() } catch { /* noop */ }
  }
  // 기존 minimized 변수 호환 — 본문/색팔레트 숨김 조건에 사용. 항상 compact 와 동기.
  const minimized = compact

  // 사용자가 창을 위아래로 직접 줄여 "헤더만 남게" 만들 때 — 본문/컨트롤이 들어갈 높이가
  // 안 나오면 자동으로 접어서 헤더만 깔끔히 남긴다(사용자 요청). compact 토글과 별개로 동작.
  const rootRef = useRef<HTMLDivElement>(null)
  const [tooShort, setTooShort] = useState(false)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const update = (h: number): void => setTooShort(h < 44)
    update(el.getBoundingClientRect().height)
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height
      if (h != null) update(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // 본문/컨트롤을 숨길지 — compact 토글이거나, 직접 줄여서 너무 짧을 때.
  const collapsed = minimized || tooShort

  const changeTextAlign = (v: TextAlignVal): void => {
    setTextAlign(v)
    try { localStorage.setItem(TEXT_ALIGN_KEY, v) } catch { /* noop */ }
  }
  const changeFontFamily = (id: FontFamilyId): void => {
    setFontFamilyId(id)
    setFontMenuOpen(false)
    try { localStorage.setItem(FONT_FAMILY_KEY, id) } catch { /* noop */ }
  }

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
      else if (e.key === TEXT_ALIGN_KEY) setTextAlign(loadTextAlign())
      else if (e.key === FONT_FAMILY_KEY) setFontFamilyId(loadFontFamily())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // 폰트 메뉴 외부 클릭 닫기
  useEffect(() => {
    if (!fontMenuOpen) return
    const onDoc = (e: MouseEvent): void => {
      if (!fontMenuRef.current?.contains(e.target as Node)) setFontMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [fontMenuOpen])

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

  // 정렬/폰트/크기/편집 버튼 묶음 — 일반 모드와 디스플레이 모드에서 공유.
  // variant='display' 는 더 큰 흰 캡슐(32px), 'normal' 은 28px. 디스플레이 모드에서도
  // 학생에게 보여주면서 바로 편집할 수 있도록 동일 컨트롤 노출(사용자 요청).
  const renderEditControls = (variant: 'normal' | 'display'): React.ReactNode => {
    const isDisplay = variant === 'display'
    const btn: React.CSSProperties = isDisplay
      ? {
          width: 32, height: 32, borderRadius: 10,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-primary)', background: 'rgba(255,255,255,0.94)',
          border: '1px solid rgba(15,23,42,0.18)', boxShadow: '0 3px 10px rgba(15,23,42,0.14)',
          backdropFilter: 'blur(8px)', cursor: 'pointer', flexShrink: 0,
        }
      : {
          width: 28, height: 28, borderRadius: 8,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-primary)', background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(15,23,42,0.18)',
          boxShadow: '0 2px 6px rgba(15,23,42,0.10), 0 0 0 1px rgba(255,255,255,0.6) inset',
          backdropFilter: 'blur(6px)', cursor: 'pointer',
          transition: 'transform 0.12s ease, background 0.12s ease', flexShrink: 0,
        }
    const btnActive: React.CSSProperties = {
      ...btn, color: '#fff',
      background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
      border: '1px solid #B91C1C', boxShadow: '0 3px 10px rgba(220,38,38,0.40)',
    }
    const btnDisabled: React.CSSProperties = { ...btn, opacity: 0.35, cursor: 'not-allowed' }
    const isz = isDisplay ? 15 : 14
    return (
      <>
        {/* 정렬 3개 */}
        <button onClick={() => changeTextAlign('left')} style={textAlign === 'left' ? btnActive : btn} title="왼쪽 정렬">
          <AlignLeft size={isz} strokeWidth={2.4} />
        </button>
        <button onClick={() => changeTextAlign('center')} style={textAlign === 'center' ? btnActive : btn} title="가운데 정렬">
          <AlignCenter size={isz} strokeWidth={2.4} />
        </button>
        <button onClick={() => changeTextAlign('right')} style={textAlign === 'right' ? btnActive : btn} title="오른쪽 정렬">
          <AlignRight size={isz} strokeWidth={2.4} />
        </button>
        {/* 폰트 선택 (드롭다운) — 일반/디스플레이 모드는 동시 렌더되지 않으므로 ref 공유 OK */}
        <div ref={fontMenuRef} className="relative">
          <button onClick={() => setFontMenuOpen((v) => !v)} style={btn} title={`폰트 · ${FONT_FAMILIES.find((f) => f.id === fontFamilyId)?.label}`}>
            <Type size={isz} strokeWidth={2.4} />
          </button>
          {fontMenuOpen && (
            <div
              className="absolute right-0 z-50"
              style={{
                top: 'calc(100% + 6px)', padding: 6, borderRadius: 12,
                background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(14px)',
                boxShadow: '0 12px 36px rgba(15,23,42,0.18), 0 0 0 1px rgba(15,23,42,0.08)',
                minWidth: 140,
              }}
            >
              {FONT_FAMILIES.map((f) => (
                <button
                  key={f.id}
                  onClick={() => changeFontFamily(f.id)}
                  className="w-full text-left transition-colors hover:bg-[var(--bg-secondary)]"
                  style={{
                    padding: '6px 10px', borderRadius: 8, fontFamily: f.css,
                    fontSize: 14, fontWeight: 700,
                    color: fontFamilyId === f.id ? '#DC2626' : 'var(--text-primary)',
                    background: fontFamilyId === f.id ? 'rgba(220,38,38,0.08)' : 'transparent',
                    display: 'block',
                  }}
                >{f.label}</button>
              ))}
            </div>
          )}
        </div>
        {/* 글씨 크기 */}
        <button onClick={() => changeFontIdx(-1)} disabled={fontIdx <= 0} style={fontIdx <= 0 ? btnDisabled : btn} title={`글씨 작게 (현재 ${fontSize}px)`}>
          <Minus size={isz} strokeWidth={2.4} />
        </button>
        <button onClick={() => changeFontIdx(+1)} disabled={fontIdx >= FONT_SIZES.length - 1} style={fontIdx >= FONT_SIZES.length - 1 ? btnDisabled : btn} title={`글씨 크게 (현재 ${fontSize}px)`}>
          <Plus size={isz} strokeWidth={2.4} />
        </button>
        {/* 편집 — 편집 중이 아닐 때만 */}
        {!editing && (
          <button onClick={startEdit} style={btn} title="공지 편집">
            <Pencil size={isz} strokeWidth={2.2} />
          </button>
        )}
      </>
    )
  }

  // 색 팔레트 — 편집 중일 때 색 점들. 일반/디스플레이 공용.
  const renderColorPalette = (): React.ReactNode => (
    <>
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
    </>
  )

  return (
    <div
      ref={rootRef}
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        padding: collapsed
          ? '8px 12px'
          : big ? 'clamp(8px, 1.5vw, 16px) clamp(16px, 3vw, 36px)' : '14px 18px 22px 18px',
        background: big
          ? 'radial-gradient(ellipse at 30% 0%, rgba(220,38,38,0.10) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(217,119,6,0.08) 0%, transparent 50%)'
          : 'radial-gradient(ellipse at 0% 0%, rgba(220,38,38,0.06) 0%, transparent 55%)',
      }}
    >
      {/* 큰 모드(디스플레이/배경) — 좌상단에 세련된 알림판 라벨.
          최소화(compact)여도 "무슨 위젯인지" 알 수 있게 항상 표시 — 세로 중앙 정렬. */}
      {big && (
        <div
          className="absolute flex items-center gap-2 z-20"
          style={{
            top: minimized ? '50%' : 'clamp(12px, 2vw, 22px)',
            transform: minimized ? 'translateY(-50%)' : undefined,
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

      {/* 디스플레이/배경 모드 — 우상단에 디스플레이 해제 + 최소화 + 최대화 한 줄. */}
      {big && !iAmWallpaper && (() => {
        const floatBtn: React.CSSProperties = {
          width: 32, height: 32, borderRadius: 10,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-primary)',
          background: 'rgba(255,255,255,0.94)',
          border: '1px solid rgba(15,23,42,0.18)',
          boxShadow: '0 3px 10px rgba(15,23,42,0.14)',
          backdropFilter: 'blur(8px)',
          cursor: 'pointer',
        }
        return (
        <div
          className="absolute flex items-center gap-1.5 z-30"
          style={{ top: minimized ? '50%' : 'clamp(12px, 2vw, 22px)', transform: minimized ? 'translateY(-50%)' : undefined, right: 'clamp(12px, 2vw, 22px)', WebkitAppRegion: 'no-drag', pointerEvents: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end', rowGap: 6 } as React.CSSProperties}
        >
          {/* 디스플레이 모드에서도 정렬/폰트/크기/편집 버튼 노출 — 학생에게 보여주면서 바로 편집(사용자 요청).
              minimized(얇은 strip)면 공간이 없어 해제·펼치기만. */}
          {!minimized && renderEditControls('display')}
          <button
            onClick={() => { try { window.api.widget.setAllDisplayMode?.(false) } catch { /* noop */ } }}
            style={{ ...floatBtn, color: 'var(--accent)' }}
            title="디스플레이 모드 해제 (모든 위젯)"
          >
            <MonitorOff size={15} strokeWidth={2.4} />
          </button>
          <button
            onClick={toggleExpand}
            style={floatBtn}
            title="알림판 접기/펼치기"
          >
            <Expand size={15} strokeWidth={2.2} />
          </button>
        </div>
        )
      })()}

      {/* 디스플레이 모드 편집 중 — 색 팔레트(컨트롤 줄 아래 우측). */}
      {big && !iAmWallpaper && editing && !minimized && (
        <div
          className="absolute flex items-center gap-1.5 z-30 flex-wrap"
          style={{
            top: 'clamp(54px, 7vw, 70px)', right: 'clamp(12px, 2vw, 22px)',
            padding: '6px 10px', borderRadius: 12,
            background: 'rgba(255,255,255,0.94)', boxShadow: '0 3px 10px rgba(15,23,42,0.14)',
            backdropFilter: 'blur(8px)', maxWidth: 'min(92vw, 420px)', justifyContent: 'flex-end',
            WebkitAppRegion: 'no-drag', pointerEvents: 'auto',
          } as React.CSSProperties}
        >
          {renderColorPalette()}
        </div>
      )}

      {/* 일반 모드 컨트롤 — 정렬/폰트/크기/편집/디스플레이/최소화/최대화.
          버튼 스타일은 학급 목표 위젯 톤 — 흰 캡슐 + 진한 보더 + boxShadow 로 시인성 강화. */}
      {!big && !collapsed && (() => {
        // 최소화(또는 직접 줄여 짧아짐) 시엔 셸 헤더의 최대화 버튼이 펼치기를 담당 → 자체 컨트롤 줄 없음.
        const btn: React.CSSProperties = {
          width: 28, height: 28, borderRadius: 8,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-primary)', background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(15,23,42,0.18)',
          boxShadow: '0 2px 6px rgba(15,23,42,0.10), 0 0 0 1px rgba(255,255,255,0.6) inset',
          backdropFilter: 'blur(6px)', cursor: 'pointer',
          transition: 'transform 0.12s ease, background 0.12s ease', flexShrink: 0,
        }
        return (
        <div className="flex items-center justify-end shrink-0 mb-2" style={{ gap: 6, flexWrap: 'nowrap', overflow: 'hidden' }}>
          {renderEditControls('normal')}
          <button onClick={toggleDisplayMode} style={btn} title="디스플레이 모드 — 큰 글씨로 학생에게">
            <Monitor size={14} strokeWidth={2.2} />
          </button>
          {/* 접기/펼치기(최대화)는 셸 헤더로 이동 — 중복 제거(사용자 요청) */}
        </div>
        )
      })()}

      {/* 편집 모드 — 색 팔레트 (textarea 위, 일반 모드). 접힘 시 숨김. */}
      {editing && !big && !collapsed && (
        <div className="flex items-center gap-1.5 shrink-0 mb-2 flex-wrap" style={{ paddingLeft: 4 }}>
          {renderColorPalette()}
        </div>
      )}

      {/* 본문 — 표시/편집 모드 모두 동일 fontSize/fontColor 적용 (편집 시 작아지는 버그 해결).
          접힘(compact 토글 or 직접 줄여 짧아짐) 면 본문 자체를 안 그려 헤더만 남김. */}
      {!collapsed && (
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
              fontFamily: fontFamilyCss,
              fontWeight: 900,
              letterSpacing: '-0.025em',
              lineHeight: 1.25,
              color: fontColor,
              textAlign,
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
              fontFamily: fontFamilyCss,
              fontWeight: 900,
              letterSpacing: '-0.025em',
              lineHeight: 1.28,
              color: fontColor,
              textAlign,
              whiteSpace: 'pre-wrap',
              wordBreak: 'keep-all',
              overflowWrap: 'anywhere',
              textShadow: big ? '0 2px 14px rgba(220,38,38,0.12)' : undefined,
              padding: big ? 0 : '8px 4px',
            }}
          >
            {renderWithLinks(content, fontColor === '#2563EB' ? '#1D4ED8' : '#2563EB')}
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
      )}

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
