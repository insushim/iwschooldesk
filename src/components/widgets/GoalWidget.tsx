import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X, Trash2, Target, Edit3, Pencil, Monitor, MonitorOff, Brush, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Goal } from '../../types/goal.types'
import { useDataChange } from '../../hooks/useDataChange'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'
import { useIAmWallpaper } from '../../hooks/useIAmWallpaper'
import { useDisplayBg } from '../../lib/display-bg'
import { DisplayBgPicker } from '../ui/DisplayBgPicker'

/**
 * 목표 위젯 텍스트 색상 프리셋.
 *  - auto: 배경 밝기에 따라 자동(기본 그라디언트 또는 흰색)
 *  - 그 외: 단색(그라디언트 효과 해제) — 사용자가 강조하고 싶은 색을 선택.
 */
type GoalTextColor = {
  id: string
  label: string
  color: string | null  // null = auto
  preview: string
}
const GOAL_TEXT_COLORS: GoalTextColor[] = [
  { id: 'auto',   label: '자동',   color: null,       preview: 'linear-gradient(135deg, #1D4ED8, #7C3AED)' },
  { id: 'white',  label: '흰색',   color: '#FFFFFF',  preview: '#FFFFFF' },
  { id: 'black',  label: '검정',   color: '#0F172A',  preview: '#0F172A' },
  { id: 'gold',   label: '금색',   color: '#F59E0B',  preview: '#F59E0B' },
  { id: 'rose',   label: '로즈',   color: '#F43F5E',  preview: '#F43F5E' },
  { id: 'sky',    label: '하늘',   color: '#0EA5E9',  preview: '#0EA5E9' },
  { id: 'mint',   label: '민트',   color: '#10B981',  preview: '#10B981' },
  { id: 'violet', label: '보라',   color: '#8B5CF6',  preview: '#8B5CF6' },
  { id: 'crimson',label: '진홍',   color: '#DC2626',  preview: '#DC2626' },
  { id: 'navy',   label: '진파랑', color: '#1E40AF',  preview: '#1E40AF' },
  { id: 'cream',  label: '크림',   color: '#FEF3C7',  preview: '#FEF3C7' },
  { id: 'slate',  label: '차콜',   color: '#334155',  preview: '#334155' },
]
const goalTextColorKey = (pageKey: string): string => `goal:textColor:${pageKey}`

/** 페이지당 표시되는 최대 목표 수. 3개가 되면 새 창을 spawn. */
const GOALS_PER_PAGE = 2

/** url hash의 instance 값에서 페이지 인덱스 추출. 없으면 0. */
function getPageIndexFromHash(): number {
  const m = window.location.hash.match(/instance=([^&]+)/)
  if (!m) return 0
  const v = decodeURIComponent(m[1])
  const n = /^page(\d+)$/.exec(v)
  return n ? parseInt(n[1], 10) : 0
}

/** `listOpen`의 반환값에서 열려 있는 goal 창들의 page 인덱스 집합. */
function parseOpenGoalPages(openIds: string[]): Set<number> {
  const pages = new Set<number>()
  for (const id of openIds) {
    if (id === 'goal') pages.add(0)
    else if (id.startsWith('goal-page')) {
      const n = parseInt(id.slice('goal-page'.length), 10)
      if (!Number.isNaN(n)) pages.add(n)
    }
  }
  return pages
}

/**
 * 우리반 목표 위젯.
 *
 * 페이지 모델:
 *  - 각 goal 창은 `GOALS_PER_PAGE`(=2) 개의 목표만 담당 (url hash `instance=page<N>`).
 *  - 기본 창(instance 없음) = page 0, 2번째 창 = page 1, ...
 *  - 디스플레이 모드: 본인 페이지의 2개 목표만 순환.
 *  - 편집 모드: 전체 목표 관리(기존과 동일) + 새로 추가해 overflow 발생 시 자동으로 새 창 spawn.
 *  - 내가 담당할 목표가 0개가 되고 내가 page>0 이면 자기 자신 창을 닫음.
 */
export function GoalWidget() {
  // page 인덱스는 창 수명 동안 고정 (hash에서 한 번 읽음).
  const lockedPageIndex = useRef<number>(getPageIndexFromHash()).current

  const [goals, setGoals] = useState<Goal[]>([])
  const [index, setIndex] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  // 디스플레이 모드: 편집 버튼·인디케이터를 숨기고 목표 문장만 가득.
  // 교사가 배경 프리셋을 팔레트에서 고를 수 있다.
  const [displayMode, setDisplayMode] = useState(false)
  // 배경화면 모드: 클릭 통과 + 맨 뒤 고정 → 컨트롤도 시각적으로 모두 숨긴다.
  // hook 내부에서 url hash 의 instance 까지 합쳐 'widget-goal[-pageN]' 매칭.
  const iAmWallpaper = useIAmWallpaper('goal')
  const { preset: displayBg, setPresetId: setDisplayBgId } = useDisplayBg(
    lockedPageIndex === 0 ? 'goal' : `goal:page${lockedPageIndex}`,
  )
  // 목표 글씨 색 — 사용자 선택(자동/흰색/검정/금색/…). 페이지별로 localStorage 에 저장.
  const pageColorKey = lockedPageIndex === 0 ? 'goal' : `goal:page${lockedPageIndex}`
  const [textColorId, setTextColorId] = useState<string>(() => {
    try { return localStorage.getItem(goalTextColorKey(pageColorKey)) ?? 'auto' } catch { return 'auto' }
  })
  const [colorOpen, setColorOpen] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const selectedColor = GOAL_TEXT_COLORS.find((c) => c.id === textColorId) ?? GOAL_TEXT_COLORS[0]
  const applyTextColor = (id: string): void => {
    setTextColorId(id)
    try { localStorage.setItem(goalTextColorKey(pageColorKey), id) } catch { /* noop */ }
    setColorOpen(false)
  }
  useEffect(() => {
    if (!colorOpen) return
    const onDown = (e: MouseEvent): void => {
      if (!colorPickerRef.current?.contains(e.target as Node)) setColorOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setColorOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [colorOpen])

  // 배경모드 진입 → 디스플레이 모드 ON, 배경모드 해제 → 디스플레이 모드 OFF.
  // 추가로 **마스터 디스플레이 모드 브로드캐스트** 도 함께 동기화 — 다른 위젯의 디스플레이 모드 토글
  // 또는 헤더의 마스터 버튼을 눌렀을 때 목표 위젯도 같이 ON/OFF 되도록 한다.
  useEffect(() => {
    const myId = lockedPageIndex === 0 ? 'widget-goal' : `widget-goal-page${lockedPageIndex}`
    let cancelled = false
    const sync = async (): Promise<void> => {
      try {
        const map = await window.api.widget.getWallpaperModeMap()
        if (cancelled) return
        if (Array.isArray(map) && map.includes(myId)) setDisplayMode(true)
      } catch { /* noop */ }
    }
    sync()
    const offWallpaper = window.api.widget.onWallpaperModeChanged?.((p) => {
      if (p.widgetId !== myId) return
      setDisplayMode(p.on)
    })
    const offAll = window.api.widget.onAllDisplayModeChanged?.((p) => {
      setDisplayMode(!!p.on)
    })
    return () => {
      cancelled = true
      if (offWallpaper) offWallpaper()
      if (offAll) offAll()
    }
  }, [lockedPageIndex])

  /** 내 디스플레이 모드 토글 — 마스터 브로드캐스트까지 함께 보내 모든 위젯 동기화. */
  const toggleMyDisplayMode = (): void => {
    const next = !displayMode
    setDisplayMode(next)
    try { window.api.widget.setAllDisplayMode?.(next) } catch { /* noop */ }
  }

  // 디스플레이 모드 상태를 WidgetShell 에 알려 헤더 숨김. 배경화면 모드 아니어도 풀 노출.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('widget:displayMode', { detail: { on: displayMode } }))
  }, [displayMode])

  const reload = useCallback(() => {
    window.api.goal.list().then(setGoals)
  }, [])
  useEffect(() => { reload() }, [reload])
  useDataChange('goal', reload)
  useAutoRefresh(reload)

  // 이 창이 담당하는 페이지의 목표들만 슬라이스.
  const pageStart = lockedPageIndex * GOALS_PER_PAGE
  const pageGoals = goals.slice(pageStart, pageStart + GOALS_PER_PAGE)

  // 이 페이지에 속한 목표가 더 이상 없고 내가 2번째 창 이상이면 자신을 닫는다.
  // 첫 창(page 0)은 '목표 추가' 빈 상태 UI를 유지해야 하므로 닫지 않음.
  useEffect(() => {
    if (lockedPageIndex > 0 && goals.length > 0 && pageGoals.length === 0) {
      // 목록은 로드됐는데 내 페이지가 빈 경우 (뒤쪽 목표가 지워진 상황)
      try { window.api.widget.closeSelf() } catch { /* ignore */ }
    }
  }, [lockedPageIndex, goals.length, pageGoals.length])

  // 페이지 내 2개를 8초마다 자동 회전. 편집 중엔 정지.
  useEffect(() => {
    if (editOpen || pageGoals.length < 2) return
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % pageGoals.length)
    }, 8000)
    return () => clearInterval(t)
  }, [pageGoals.length, editOpen])

  useEffect(() => {
    if (index >= pageGoals.length && pageGoals.length > 0) setIndex(0)
  }, [pageGoals.length, index])

  const current = pageGoals[index]

  /** 새 목표 추가 후, 해당 목표의 페이지 창이 없으면 자동으로 open. */
  const ensureWindowForLatest = async (): Promise<void> => {
    const fresh = await window.api.goal.list()
    if (fresh.length <= GOALS_PER_PAGE) return // 첫 창에서만 표시되면 spawn 불필요
    const latestPage = Math.floor((fresh.length - 1) / GOALS_PER_PAGE)
    // 이미 이 창(나)이 해당 페이지면 굳이 새 창 안 띄움
    if (latestPage === lockedPageIndex) return
    try {
      const openIds = await window.api.widget.listOpen()
      const openPages = parseOpenGoalPages(openIds)
      if (!openPages.has(latestPage)) {
        await window.api.widget.openWindow(
          'goal',
          latestPage === 0 ? undefined : { instanceId: `page${latestPage}` },
        )
      }
    } catch { /* ignore — 유저 경험이 더 중요 */ }
  }

  const handleAdd = async (): Promise<void> => {
    if (!newContent.trim()) return
    await window.api.goal.create({ content: newContent.trim(), emoji: '' })
    setNewContent('')
    await ensureWindowForLatest()
    reload()
  }

  const handleDelete = async (id: string): Promise<void> => {
    await window.api.goal.delete(id)
    reload()
  }

  const startEdit = (g: Goal) => { setEditingId(g.id); setEditingContent(g.content) }
  const commitEdit = async () => {
    if (!editingId) return
    const t = editingContent.trim()
    if (t) await window.api.goal.update(editingId, { content: t })
    setEditingId(null); setEditingContent('')
    reload()
  }

  // ───── 편집 모드 ─────
  if (editOpen) {
    return (
      <div className="flex flex-col h-full" style={{ padding: '14px 26px 28px 26px' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-[var(--text-primary)]">목표 관리</span>
          <button
            onClick={() => setEditOpen(false)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            title="보기로 돌아가기"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <input
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="우리반 목표를 입력하세요..."
            className="flex-1 text-xs bg-[var(--bg-secondary)] rounded-md px-2.5 py-1.5 outline-none text-[var(--text-primary)]"
          />
          <button
            onClick={handleAdd}
            disabled={!newContent.trim()}
            className="shrink-0 flex items-center justify-center hover:opacity-85 disabled:opacity-40 transition-opacity"
            style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'var(--accent)', color: '#fff' }}
          >
            <Plus size={14} strokeWidth={2.6} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5">
          {goals.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-6">
              아직 목표가 없어요. 위에서 추가해 보세요
            </p>
          ) : (
            goals.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-2 group"
                style={{ padding: '8px 10px', borderRadius: 10, backgroundColor: 'var(--bg-secondary)' }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 3, height: 14, borderRadius: 2,
                    background: 'linear-gradient(180deg, var(--accent), #4338CA)',
                    flexShrink: 0,
                  }}
                />
                {editingId === g.id ? (
                  <input
                    autoFocus
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit()
                      if (e.key === 'Escape') { setEditingId(null); setEditingContent('') }
                    }}
                    className="flex-1 text-xs bg-white dark:bg-[var(--bg-primary)] rounded px-1.5 py-0.5 outline-none text-[var(--text-primary)] border border-[var(--accent)]"
                  />
                ) : (
                  <span
                    onDoubleClick={() => startEdit(g)}
                    title="더블클릭 또는 연필 아이콘을 눌러 수정"
                    className="flex-1 text-xs text-[var(--text-primary)] cursor-text"
                  >
                    {g.content}
                  </span>
                )}
                {editingId !== g.id && (
                  <>
                    <button
                      onClick={() => startEdit(g)}
                      className="shrink-0 p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-light)] transition-colors opacity-0 group-hover:opacity-100"
                      title="목표 수정"
                    >
                      <Pencil size={11} strokeWidth={2.4} />
                    </button>
                    <button
                      onClick={() => handleDelete(g.id)}
                      className="shrink-0 p-1 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="목표 삭제"
                    >
                      <Trash2 size={11} strokeWidth={2.4} />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // ───── 표시 모드 (항상 콘텐츠 중심) ─────
  // displayMode 여부와 무관하게 사용자가 고른 배경 프리셋을 항상 적용 — 기본 모드에서도 같은 느낌.
  // (사용자가 'default' 프리셋을 두면 기존 연한 블루 그라디언트 유지.)
  const isLightText = displayBg.textMode === 'light'
  const displayBgValue = displayBg.bg
    ? displayBg.bg
    : 'linear-gradient(135deg, rgba(37,99,235,0.04) 0%, rgba(67,56,202,0.06) 100%)'
  const displayGlow = displayBg.glow

  return (
    <div
      className="flex flex-col h-full items-center justify-center relative overflow-hidden"
      style={{
        padding: 'clamp(8px, 1.5vw, 18px) clamp(12px, 2vw, 28px) clamp(10px, 1.8vw, 22px)',
        background: displayBgValue,
        transition: 'background 320ms ease',
      }}
    >
      {/* 디스플레이 모드 — 은은한 빛 효과 */}
      {displayGlow && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: displayGlow }}
        />
      )}
      {/* 우상단 컨트롤 — [글씨색] [팔레트(display 전용)] [디스플레이 토글] [편집(일반)].
          z-50 + gap-1.5 로 중첩 없이, 버튼이 다른 콘텐츠보다 확실히 위에 오도록.
          ※ 배경화면 모드(iAmWallpaper)에선 어차피 클릭이 통과되어 누를 수 없으므로
             전체 컨트롤을 숨겨 사용자 혼란을 방지한다. */}
      {!iAmWallpaper && (
      <div
        className="absolute top-2 right-2 flex items-center gap-1.5 z-50"
        style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as React.CSSProperties}
      >
        {/* 글씨색 선택기 — 모든 모드에서 노출. 프리뷰 원이 현재 선택 색을 보여줌. */}
        <div ref={colorPickerRef} className="relative">
          <button
            onClick={() => setColorOpen((v) => !v)}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-secondary)] relative"
            style={{
              color: isLightText ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)',
              border: isLightText ? '1px solid rgba(255,255,255,0.18)' : '1px solid var(--border-widget)',
            }}
            title={`글씨 색 · ${selectedColor.label}`}
          >
            <Brush size={13} strokeWidth={2.2} />
            <span
              aria-hidden
              className="absolute block rounded-full"
              style={{
                width: 7, height: 7,
                right: -2, bottom: -2,
                background: selectedColor.preview,
                border: '1.5px solid #fff',
                boxShadow: '0 1px 3px rgba(15,23,42,0.28)',
              }}
            />
          </button>
          <AnimatePresence>
            {colorOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 z-50"
                style={{
                  top: 'calc(100% + 6px)',
                  padding: 10,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.97)',
                  backdropFilter: 'blur(14px)',
                  boxShadow: '0 12px 36px rgba(15,23,42,0.18), 0 0 0 1px rgba(15,23,42,0.06)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 30px)',
                  gap: 8,
                  minWidth: 152,
                }}
              >
                {GOAL_TEXT_COLORS.map((c) => {
                  const active = c.id === textColorId
                  return (
                    <button
                      key={c.id}
                      onClick={() => applyTextColor(c.id)}
                      title={c.label}
                      className="relative transition-transform hover:scale-110 flex items-center justify-center"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 10,
                        background: c.preview,
                        border: active
                          ? '2px solid #0F172A'
                          : c.id === 'white'
                            ? '1.2px solid rgba(15,23,42,0.2)'
                            : '1px solid rgba(255,255,255,0.25)',
                        boxShadow: active ? '0 0 0 2px rgba(14,165,233,0.28)' : '0 2px 6px rgba(15,23,42,0.12)',
                      }}
                    >
                      {active && (
                        <Check
                          size={14}
                          strokeWidth={3}
                          style={{ color: c.id === 'auto' || c.id === 'black' || c.id === 'navy' || c.id === 'crimson' || c.id === 'slate' || c.id === 'violet' ? '#fff' : '#0F172A' }}
                        />
                      )}
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {displayMode && (
          <DisplayBgPicker current={displayBg} onPick={setDisplayBgId} />
        )}
        <button
          onClick={toggleMyDisplayMode}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-secondary)]"
          style={{
            color: isLightText ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)',
            border: isLightText ? '1px solid rgba(255,255,255,0.18)' : '1px solid var(--border-widget)',
          }}
          title={displayMode ? '디스플레이 모드 해제 (모든 위젯 동기)' : '디스플레이 모드 — 목표만 크게 보이기. 모든 위젯에 동일 적용.'}
        >
          {displayMode ? <MonitorOff size={13} strokeWidth={2.2} /> : <Monitor size={13} strokeWidth={2.2} />}
        </button>
        {!displayMode && (
          <button
            onClick={() => setEditOpen(true)}
            className="p-1.5 rounded-md text-[var(--text-muted)]/60 hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
            title="목표 관리"
          >
            <Edit3 size={13} strokeWidth={2.2} />
          </button>
        )}
      </div>
      )}

      {pageGoals.length === 0 ? (
        <div className="flex flex-col items-center gap-3 text-center px-4">
          <div
            className="flex items-center justify-center"
            style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: 'var(--accent-light)' }}
          >
            <Target size={24} className="text-[var(--accent)]" strokeWidth={2.2} />
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-medium">
            {lockedPageIndex === 0
              ? '우리반의 목표를 설정해 보세요'
              : `${lockedPageIndex + 1}번째 창 — 곧 사라져요`}
          </p>
          {lockedPageIndex === 0 && (
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold"
              style={{
                padding: '8px 14px', borderRadius: 10,
                backgroundColor: 'var(--accent)', color: '#fff',
              }}
            >
              <Plus size={13} strokeWidth={2.6} /> 목표 추가
            </button>
          )}
        </div>
      ) : (
        <>
          {/* motion.div 제거 — transform 애니메이션이 GPU 레이어를 생성하고 해제하면서
              흰색 텍스트의 서브픽셀 anti-aliasing 이 바뀌어 "초기 밝은 흰색 → 어두운 흰색" 깜빡임 발생.
              정적 div 로 교체해 텍스트 렌더링을 일관되게. 목표 전환은 key 기반 React remount 로. */}
          <div
            key={current?.id ?? 'empty'}
            className="flex items-center justify-center flex-1 w-full"
            style={{ gap: 'clamp(10px, 2vw, 28px)' }}
          >
              {/* 좌측 악센트 바 — 두 모드 모두 유지해 가로 폭이 일관됨(=줄바꿈도 일관). */}
              <span
                aria-hidden
                style={{
                  width: 'clamp(4px, 0.9vw, 10px)',
                  height: 'clamp(40%, 60%, 70%)',
                  minHeight: 32,
                  borderRadius: 999,
                  background: isLightText
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,255,255,0.55))'
                    : 'linear-gradient(180deg, var(--accent), #4338CA)',
                  flexShrink: 0,
                  boxShadow: isLightText
                    ? '0 4px 14px rgba(255,255,255,0.28)'
                    : '0 4px 14px rgba(37,99,235,0.3)',
                }}
              />

              {/* 본문 — 글자 수에 따라 max 폰트 자동 축소해 자연스러운 줄바꿈 유도.
                    짧은 구(5자 이하)는 최대 220px, 긴 문장은 80~140px 수준으로 제한. */}
              <div
                style={(() => {
                  const len = current?.content?.length ?? 5
                  const maxPx = len <= 5 ? 320 : len <= 7 ? 260 : len <= 10 ? 210 : len <= 14 ? 170 : 140
                  const vw = len <= 5 ? 20 : len <= 7 ? 17 : len <= 10 ? 14 : len <= 14 ? 11 : 9
                  const fontSize = `clamp(36px, ${vw}vw, ${maxPx}px)`
                  const common: React.CSSProperties = {
                    fontSize,
                    fontWeight: 900,
                    lineHeight: 1.12,
                    letterSpacing: '-0.035em',
                    wordBreak: 'keep-all',
                    whiteSpace: 'normal',
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'center',
                  }
                  // 1) 사용자가 단색 선택 → 그라디언트/클립/그림자까지 모두 싹 초기화하고 순수 색만 적용.
                  if (selectedColor.color) {
                    const isWhite = selectedColor.color.toUpperCase() === '#FFFFFF'
                    const whiteOnDark = isWhite && isLightText
                    // 흰색 + 어두운 배경 조합 디버그 노트:
                    //  - 시도1) textShadow 흰 글로우 → 글자 외곽이 흐려져 "덮어쓴 느낌" (실패).
                    //  - 시도2) subpixel AA → 어두운 배경에서 R/G/B fringing → 회색톤 (실패).
                    //  - 시도3) grayscale AA + textShadow 글로우 → 동일 (실패).
                    //  - 채택)  WebkitTextStroke 0.55px 같은 색 → 글자 stroke 자체를 굵고 진하게.
                    //          그림자 0, antialiased 로 균일 픽셀. "원래 더 밝은 흰색" 의 정체.
                    return {
                      ...common,
                      color: selectedColor.color,
                      background: 'none',
                      backgroundImage: 'none',
                      backgroundClip: 'border-box' as const,
                      WebkitBackgroundClip: 'border-box' as const,
                      WebkitTextFillColor: selectedColor.color,
                      // 글로우는 외곽을 흐림 → 모두 제거. 색 외 단색만.
                      textShadow: 'none',
                      // 흰글씨를 어두운 배경 위에 stroke 로 진하게. 다른 색은 stroke 없이.
                      WebkitTextStroke: whiteOnDark ? '1.2px #FFFFFF' : 'initial',
                      paintOrder: whiteOnDark ? 'stroke fill' as const : 'normal' as const,
                      WebkitFontSmoothing: whiteOnDark ? 'antialiased' as const : 'subpixel-antialiased' as const,
                      MozOsxFontSmoothing: whiteOnDark ? 'grayscale' as const : 'auto' as const,
                      // ★ GPU 레이어 강제 활성화 — 사용자가 결정적 단서 제공:
                      //   "이전엔 글씨가 반짝일 때 '밝은 흰색' 이었는데, 반짝임 고치고 나서 어두워졌다"
                      //   = motion.div 의 transform 애니메이션이 GPU 레이어를 만들 때만 밝은 흰색으로 렌더링됨.
                      //   GPU 레이어에서 텍스트가 sRGB 정확도 + 풀 명도로 그려지는 Chromium 동작.
                      //   translateZ(0) 으로 GPU 레이어를 영구히 켜서, 깜빡임 없이 항상 밝은 흰색.
                      transform: whiteOnDark ? 'translateZ(0)' : undefined,
                      willChange: whiteOnDark ? 'transform' : 'auto',
                      backfaceVisibility: whiteOnDark ? 'hidden' as const : 'visible' as const,
                    } as React.CSSProperties
                  }
                  // 2) 자동(기본) — 어떤 배경이든 브랜드 블루→퍼플 그라디언트.
                  //    "자동" 과 "순백" 이 구별되어야 한다는 요구 반영: 자동은 색감 있는 그라디언트.
                  //    어두운 배경에서도 그라디언트 보이되 약한 그림자로 가독성 보강.
                  return {
                    ...common,
                    color: 'var(--text-primary)',
                    background: 'linear-gradient(135deg, #1D4ED8 0%, #4338CA 60%, #7C3AED 100%)',
                    WebkitBackgroundClip: 'text' as const,
                    WebkitTextFillColor: 'transparent' as const,
                    backgroundClip: 'text' as const,
                    textShadow: isLightText
                      ? '0 2px 10px rgba(0,0,0,0.22)'
                      : '0 1px 2px rgba(15,23,42,0.04)',
                  }
                })()}
              >
                {current?.content}
              </div>
          </div>

          {/* 인디케이터 — 디스플레이 모드에선 숨김. 이 창 페이지의 2개만 표시. */}
          {!displayMode && pageGoals.length > 1 && (
            <div
              className="flex items-center"
              style={{ gap: 'clamp(4px, 0.6vw, 10px)', marginTop: 'clamp(6px, 1vw, 16px)' }}
            >
              {pageGoals.map((g, i) => (
                <button
                  key={g.id}
                  onClick={() => setIndex(i)}
                  className="transition-all"
                  style={{
                    width: i === index ? 'clamp(16px, 2vw, 36px)' : 'clamp(6px, 0.8vw, 12px)',
                    height: 'clamp(6px, 0.8vw, 12px)',
                    borderRadius: 999,
                    backgroundColor: i === index ? 'var(--accent)' : 'var(--bg-secondary)',
                  }}
                  aria-label={`목표 ${i + 1}번`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
