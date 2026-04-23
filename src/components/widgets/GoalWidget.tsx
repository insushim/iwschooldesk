import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X, Trash2, Target, Edit3, Monitor, MonitorOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Goal } from '../../types/goal.types'
import { useDataChange } from '../../hooks/useDataChange'
import { useDisplayBg } from '../../lib/display-bg'
import { DisplayBgPicker } from '../ui/DisplayBgPicker'

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
  const { preset: displayBg, setPresetId: setDisplayBgId } = useDisplayBg(
    lockedPageIndex === 0 ? 'goal' : `goal:page${lockedPageIndex}`,
  )

  // 배경모드 진입 감지 → 디스플레이 모드 자동 ON. 학생 대상 뷰 일관성 확보.
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
    const off = window.api.widget.onWallpaperModeChanged?.((p) => {
      if (p.widgetId === myId && p.on) setDisplayMode(true)
    })
    return () => { cancelled = true; if (off) off() }
  }, [lockedPageIndex])

  const reload = useCallback(() => {
    window.api.goal.list().then(setGoals)
  }, [])
  useEffect(() => { reload() }, [reload])
  useDataChange('goal', reload)

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
                    title="더블클릭하여 수정"
                    className="flex-1 text-xs text-[var(--text-primary)] cursor-text"
                  >
                    {g.content}
                  </span>
                )}
                <button
                  onClick={() => handleDelete(g.id)}
                  className="shrink-0 p-1 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                  title="목표 삭제"
                >
                  <Trash2 size={11} strokeWidth={2.4} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // ───── 표시 모드 (항상 콘텐츠 중심) ─────
  const isLightText = displayMode && displayBg.textMode === 'light'
  const displayBgValue = displayMode && displayBg.bg
    ? displayBg.bg
    : 'linear-gradient(135deg, rgba(37,99,235,0.04) 0%, rgba(67,56,202,0.06) 100%)'
  const displayGlow = displayMode ? displayBg.glow : undefined

  return (
    <div
      className="flex flex-col h-full items-center justify-center relative overflow-hidden"
      style={{
        padding: 'clamp(14px, 3vw, 40px) clamp(14px, 3vw, 48px) clamp(20px, 4vw, 56px)',
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
      {/* 우상단 컨트롤 — [팔레트(display 전용)] [디스플레이 토글] [편집(일반)] */}
      <div
        className="absolute top-2 right-2 flex items-center gap-1 z-10"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {displayMode && (
          <DisplayBgPicker current={displayBg} onPick={setDisplayBgId} />
        )}
        <button
          onClick={() => setDisplayMode((v) => !v)}
          className="p-1.5 rounded-md transition-colors"
          style={{
            color: isLightText ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)',
          }}
          title={displayMode ? '디스플레이 모드 해제' : '디스플레이 모드 (목표만 크게 보이기)'}
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
          <AnimatePresence mode="wait">
            <motion.div
              key={current?.id ?? 'empty'}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.5 }}
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
                style={{
                  fontSize: (() => {
                    const len = current?.content?.length ?? 5
                    // content 글자수 → max font. 11자 이상이면 ~100px, 5자 이하면 220px.
                    const maxPx = len <= 5 ? 220 : len <= 7 ? 180 : len <= 10 ? 140 : len <= 14 ? 110 : 90
                    const vw = len <= 5 ? 14 : len <= 7 ? 12 : len <= 10 ? 10 : len <= 14 ? 8 : 7
                    return `clamp(26px, ${vw}vw, ${maxPx}px)`
                  })(),
                  fontWeight: 900,
                  lineHeight: 1.12,
                  letterSpacing: '-0.035em',
                  // keep-all 만 사용 — break-word 조합은 한글 단어 중간 분리 유발.
                  wordBreak: 'keep-all',
                  whiteSpace: 'normal',
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'center',
                  color: isLightText ? '#FFFFFF' : 'var(--text-primary)',
                  textShadow: isLightText
                    ? '0 4px 24px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.12)'
                    : '0 1px 2px rgba(15,23,42,0.04)',
                  // 라이트 모드(기본 / 크림 등 밝은 배경)에서만 그라디언트 텍스트 적용
                  background: isLightText
                    ? undefined
                    : 'linear-gradient(135deg, #1D4ED8 0%, #4338CA 60%, #7C3AED 100%)',
                  WebkitBackgroundClip: isLightText ? undefined : 'text',
                  WebkitTextFillColor: isLightText ? undefined : 'transparent',
                  backgroundClip: isLightText ? undefined : 'text',
                }}
              >
                {current?.content}
              </div>
            </motion.div>
          </AnimatePresence>

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
