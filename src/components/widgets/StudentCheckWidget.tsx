import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, Check, ChevronDown, X, Trash2, Users, Monitor, MonitorOff, FileUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Routine, RoutineItemWithStatus } from '../../types/routine.types'
import { useDataChange } from '../../hooks/useDataChange'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'
import { useIAmWallpaper } from '../../hooks/useIAmWallpaper'
import { useDisplayBg } from '../../lib/display-bg'
import { DisplayBgPicker } from '../ui/DisplayBgPicker'
import { importStudentsFile } from '../../lib/student-import'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** url hash에서 instance(=routine id) 추출. 없으면 null → 첫 번째 routine 자동 선택. */
function getInstanceIdFromHash(): string | null {
  const m = window.location.hash.match(/instance=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/** 오늘 기준 "전 수업일" — 월=금, 화=월, 수~금=전날, 주말=금요일. 학교 운영 기준. */
function previousSchoolDay(today: Date): Date {
  const d = new Date(today)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() // 0=일, 1=월, ..., 6=토
  if (dow === 1) d.setDate(d.getDate() - 3)        // 월 → 금
  else if (dow === 0) d.setDate(d.getDate() - 2)   // 일 → 금
  else if (dow === 6) d.setDate(d.getDate() - 1)   // 토 → 금
  else d.setDate(d.getDate() - 1)                  // 화~금 → 전날
  return d
}

/** 이번 주 월요일 (오늘이 일요일이면 다음 주 월요일이 아니라 지난 월요일). */
function thisMondayOf(today: Date): Date {
  const d = new Date(today)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const back = dow === 0 ? 6 : dow - 1 // 일요일이면 6일 전
  d.setDate(d.getDate() - back)
  return d
}

/**
 * 학급 공용 체크 위젯 (예: "우유 다 먹은 사람", "양치한 사람").
 *
 * 설계 원칙:
 *  - 학생 이름 카드가 메인 콘텐츠. 폰트 크기는 위젯 창 폭에 비례(`clamp(...vw...)`).
 *    교사가 창을 키우면 이름 글자와 체크박스도 자동으로 커짐.
 *  - 상단 컨트롤(드롭다운, 추가, 삭제)은 컴팩트하게 유지해서 콘텐츠 공간을 확보.
 *  - 별도 칠판 모드 없음 — 항상 콘텐츠 중심.
 *
 * 자정이 지나면 모두 미체크로 자동 초기화. routine 테이블 kind='classroom' 재사용.
 */
export function StudentCheckWidget() {
  // 위젯 창 하나에 하나의 routine만 표시한다. url hash에 instance=<routineId>가 있으면 그 routine으로 잠금;
  // 없으면 routine 목록의 첫 번째를 자동 선택. 다른 routine으로의 전환은 새 위젯 창을 spawn.
  const lockedInstanceId = useRef<string | null>(getInstanceIdFromHash()).current
  const [lists, setLists] = useState<Routine[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(lockedInstanceId)
  const [items, setItems] = useState<RoutineItemWithStatus[]>([])
  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [createMode, setCreateMode] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newEmoji, setNewEmoji] = useState('')
  // 학생 명렬표 파일 업로드
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importedNames, setImportedNames] = useState<string[] | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importFileName, setImportFileName] = useState<string>('')
  const [importBusy, setImportBusy] = useState(false)
  // 디스플레이 모드: 편집 컨트롤(드롭다운/추가/삭제)을 숨기고 제목 헤더 + 학생 카드 중심.
  // 교사가 배경색도 팔레트에서 고를 수 있어 교실 분위기에 맞게 전환.
  const [displayMode, setDisplayMode] = useState(false)
  // 배경 프리셋은 선택된 리스트(routine)마다 따로 저장 — "양치"는 하늘, "우유"는 노을처럼.
  const { preset: displayBg, setPresetId: setDisplayBgId } = useDisplayBg(
    `studentcheck:${selectedId ?? 'none'}`,
  )
  // 배경화면 모드일 때 — 컨트롤은 숨기지만 타이틀은 보여준다. 학생 카드는 세로 중앙 정렬.
  const iAmWallpaper = useIAmWallpaper('studentcheck')
  // 배경모드 진입 시 디스플레이 모드 자동 ON / 해제 시 자동 OFF.
  const prevWallpaperRef = useRef<boolean>(iAmWallpaper)
  useEffect(() => {
    if (iAmWallpaper && !prevWallpaperRef.current) setDisplayMode(true)
    else if (!iAmWallpaper && prevWallpaperRef.current) setDisplayMode(false)
    prevWallpaperRef.current = iAmWallpaper
  }, [iAmWallpaper])
  // 마스터 디스플레이 모드 브로드캐스트와 sync — "모든 위젯 통일 적용".
  useEffect(() => {
    const off = window.api.widget.onAllDisplayModeChanged?.((p) => {
      setDisplayMode(!!p.on)
    })
    return () => { if (off) off() }
  }, [])
  // 디스플레이 모드 상태를 WidgetShell 에 알려 헤더 숨김. 배경화면 모드 아니어도 풀 노출.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('widget:displayMode', { detail: { on: displayMode } }))
  }, [displayMode])
  // "컨트롤 숨김" 신호: 배경모드이거나 사용자가 수동 디스플레이 모드를 켰을 때.
  const chromeHidden = displayMode || iAmWallpaper
  // 인라인 삭제 확인 — 네이티브 confirm() 의 Windows 포그라운드 락 회피.
  const [confirmDelete, setConfirmDelete] = useState(false)

  // 카드 그리드가 스크롤 없이 모든 학생을 수용하도록 cols/rows 동적 계산.
  const gridAreaRef = useRef<HTMLDivElement>(null)
  const [gridBox, setGridBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = gridAreaRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setGridBox({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const gridLayout = useMemo(() => {
    const n = items.length
    const gap = 8
    if (n === 0 || gridBox.w < 40 || gridBox.h < 40) {
      return { cols: Math.min(n || 1, 4), rows: Math.max(1, Math.ceil((n || 1) / 4)), gap }
    }
    // 종횡비 ~2.4 (가로가 더 긴 카드) 가 읽기 좋음. 여러 (cols,rows) 조합 중 카드 면적 최대인 것 선택.
    const targetAspect = 2.4
    let best = { cols: 1, rows: n, gap, score: -1 }
    const maxCols = Math.min(n, 10)
    for (let c = 1; c <= maxCols; c++) {
      const r = Math.ceil(n / c)
      const cardW = (gridBox.w - (c - 1) * gap) / c
      const cardH = (gridBox.h - (r - 1) * gap) / r
      if (cardW <= 0 || cardH <= 0) continue
      const aspect = cardW / cardH
      // aspect 거리 페널티 + 면적 점수
      const area = cardW * cardH
      const aspectPenalty = Math.abs(Math.log(aspect / targetAspect))
      const score = area * Math.exp(-aspectPenalty * 0.9)
      if (score > best.score) best = { cols: c, rows: r, gap, score }
    }
    return best
  }, [items.length, gridBox.w, gridBox.h])
  // 카드 높이에 맞춰 폰트 자동 스케일. 스크롤 없이 맞추는 핵심.
  const cellH = gridBox.h > 0 && gridLayout.rows > 0
    ? (gridBox.h - (gridLayout.rows - 1) * gridLayout.gap) / gridLayout.rows
    : 48
  const nameFont = Math.max(10, Math.min(42, cellH * 0.46))
  const checkboxSz = Math.max(14, Math.min(34, cellH * 0.45))
  const cardPad = Math.max(4, Math.min(16, cellH * 0.18))
  const [today, setToday] = useState(todayStr())
  // 전 수업일에 완료한 itemId 집합 (다른 색으로 강조용)
  const [prevDoneIds, setPrevDoneIds] = useState<Set<string>>(new Set())
  // itemId → 이번 주(월~오늘) 누적 완료 횟수
  const [weekCounts, setWeekCounts] = useState<Map<string, number>>(new Map())
  const newTitleInputRef = useRef<HTMLInputElement>(null)

  // createMode 진입 시 입력 포커스 강제.
  // Windows에선 renderer의 window.focus()가 포그라운드 락 때문에 무시될 수 있으므로
  // main 프로세스에 focusSelf IPC를 보내 BrowserWindow.focus()로 OS-level 포커스를
  // 복원한 뒤 input에 포커스한다. `window.confirm` 이후 아예 입력이 안 되는 버그 방지.
  useEffect(() => {
    if (!createMode) return
    window.api.widget.focusSelf()
    const t = setTimeout(() => {
      newTitleInputRef.current?.focus()
    }, 80)
    return () => clearTimeout(t)
  }, [createMode])

  // 기본 체크 아이콘은 lucide Check SVG 칩으로 대체 — '✅' 이모지 tacky 문제 회피.
  // 이모지 선택 안하거나 '✅'가 저장돼 있으면 UI에서 자동으로 세련된 SVG 칩으로 렌더.
  const EMOJI_PRESETS = ['🥛', '🪥', '📚', '✏️', '🎒', '🧻', '🍚', '🧼', '👕', '📋', '🌟', '🍎']

  const reload = useCallback(async () => {
    const data = await window.api.routine.list('classroom')
    setLists(data)
    // instance로 잠긴 창: 그 routine이 아직 존재하면 유지, 삭제됐으면 닫는다(본인 창).
    if (lockedInstanceId) {
      const exists = data.some((r) => r.id === lockedInstanceId)
      if (!exists && data.length > 0) {
        // 다른 창에서 이 routine이 삭제된 경우 — 본인 창을 닫아버린다.
        setTimeout(() => { try { window.api.widget.closeSelf() } catch { /* ignore */ } }, 0)
      }
      return data
    }
    if (data.length > 0 && !selectedId) setSelectedId(data[0].id)
    return data
  }, [selectedId, lockedInstanceId])

  useEffect(() => { reload() }, [])
  useDataChange('routine', () => { reload() })
  useAutoRefresh(reload)

  useEffect(() => {
    const timer = setInterval(() => {
      const t = todayStr()
      if (t !== today) setToday(t)
    }, 60000)
    return () => clearInterval(timer)
  }, [today])

  useEffect(() => {
    if (!selectedId) { setItems([]); setPrevDoneIds(new Set()); setWeekCounts(new Map()); return }
    window.api.routine.getItems(selectedId, today).then(setItems)

    // 전 수업일 + 이번 주(월~오늘) 통계 한 번에 fetch.
    const todayD = new Date()
    const prev = ymd(previousSchoolDay(todayD))
    const monday = ymd(thisMondayOf(todayD))
    window.api.routine.completionsInRange(selectedId, monday, today)
      .then((rows) => {
        const counts = new Map<string, number>()
        const prevSet = new Set<string>()
        for (const r of rows) {
          counts.set(r.item_id, (counts.get(r.item_id) ?? 0) + 1)
          if (r.date === prev) prevSet.add(r.item_id)
        }
        setWeekCounts(counts)
        setPrevDoneIds(prevSet)
      })
      .catch(() => { setPrevDoneIds(new Set()); setWeekCounts(new Map()) })
  }, [selectedId, today])

  const selected = lists.find((r) => r.id === selectedId)
  const doneCount = items.filter((i) => i.is_completed).length
  const progress = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0
  const progressColor = progress === 100 ? '#10B981' : progress >= 50 ? '#F59E0B' : '#0EA5E9'

  const handleToggle = async (itemId: string) => {
    const { is_completed } = await window.api.routine.toggleCompletion(itemId, today)
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_completed } : i)))
    // 주간 카운트 뱃지 즉시 갱신 — 오늘이 이번 주 범위에 속하므로
    // 체크하면 +1, 해제하면 -1. 기존엔 reload 전까지 반영 안 되어 "눌러도 ×1 안 뜨는" 버그.
    setWeekCounts((prev) => {
      const next = new Map(prev)
      const cur = next.get(itemId) ?? 0
      next.set(itemId, is_completed ? cur + 1 : Math.max(0, cur - 1))
      return next
    })
  }

  const handleAdd = async () => {
    if (!newContent.trim() || !selectedId) return
    const item = await window.api.routine.addItem({ routine_id: selectedId, content: newContent.trim() })
    setItems((prev) => [...prev, { ...item, is_completed: 0 }])
    setNewContent('')
  }

  // 학생 명렬표 파일 업로드 → 이름 추출 → 미리보기 → bulk 추가
  const handleImportFile = async (file: File) => {
    setImportError(null)
    setImportedNames(null)
    setImportFileName(file.name)
    const res = await importStudentsFile(file)
    if (res.ok) {
      // 이미 등록된 이름은 기본 선택에서 제외(중복 방지)
      const exist = new Set(items.map((i) => i.content))
      const fresh = res.names.filter((n) => !exist.has(n))
      setImportedNames(fresh.length > 0 ? fresh : res.names)
    } else {
      setImportError(res.error)
    }
  }

  const confirmImport = async () => {
    if (!selectedId || !importedNames || importedNames.length === 0) return
    setImportBusy(true)
    const added: RoutineItemWithStatus[] = []
    for (const name of importedNames) {
      try {
        const item = await window.api.routine.addItem({ routine_id: selectedId, content: name })
        added.push({ ...item, is_completed: 0 })
      } catch { /* 개별 실패는 무시하고 계속 */ }
    }
    setItems((prev) => [...prev, ...added])
    setImportBusy(false)
    setImportedNames(null)
    setImportFileName('')
  }

  const handleDeleteItem = async (itemId: string) => {
    await window.api.routine.deleteItem(itemId)
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  // 휴지통 → 인라인 confirm (네이티브 confirm 안 씀)
  const requestDeleteList = (): void => {
    if (!selectedId) return
    setConfirmDelete(true)
  }

  const handleDeleteList = async (): Promise<void> => {
    if (!selectedId) return
    setConfirmDelete(false)
    await window.api.routine.delete(selectedId)
    if (lockedInstanceId && lockedInstanceId === selectedId) {
      try { window.api.widget.closeSelf() } catch { /* ignore */ }
      return
    }
    const data = await reload()
    setSelectedId(data.length > 0 ? data[0].id : null)
    setItems([])
  }

  const startEdit = (id: string, content: string) => { setEditingId(id); setEditingContent(content) }
  const commitEdit = async () => {
    if (!editingId) return
    const trimmed = editingContent.trim()
    if (trimmed) {
      const updated = await window.api.routine.updateItem(editingId, trimmed)
      setItems((prev) => prev.map((i) => (i.id === editingId ? { ...i, content: updated.content } : i)))
    }
    setEditingId(null); setEditingContent('')
  }

  const createList = async () => {
    const t = newTitle.trim() || '오늘의 체크'
    const r = await window.api.routine.create({ title: t, kind: 'classroom', icon: newEmoji })
    await reload()
    // 새 체크 리스트는 항상 새 위젯 창에서 띄운다. 본인 창의 selection은 유지.
    try { await window.api.widget.openWindow('studentcheck', { instanceId: r.id }) } catch { /* ignore */ }
    setCreateMode(false); setNewTitle(''); setNewEmoji('')
    // 처음 만든 리스트라 본인 창에 아직 선택된 게 없으면 그 리스트로 자동 선택
    if (!selectedId && !lockedInstanceId) setSelectedId(r.id)
  }

  /** 드롭다운에서 다른 routine 선택 — 본인 창은 그대로 두고 새 창을 spawn. */
  const handleSwitchRoutine = (nextId: string) => {
    if (!nextId || nextId === selectedId) return
    window.api.widget.openWindow('studentcheck', { instanceId: nextId }).catch(() => {})
  }

  // ───── 빈 상태 ─────
  if (lists.length === 0 && !createMode) {
    return (
      <div className="flex flex-col h-full" style={{ padding: '18px 18px 24px' }}>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(14,165,233,0.15)', color: '#0EA5E9' }} className="flex items-center justify-center">
            <Users size={26} strokeWidth={2.2} />
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed">
            학생들이 스스로 체크할<br/>리스트를 만들어 보세요
          </p>
          <p className="text-[10px] text-[var(--text-muted)]" style={{ letterSpacing: '-0.2px' }}>
            예: 우유 다 먹은 사람, 양치한 사람
          </p>
        </div>
        <button
          onClick={() => setCreateMode(true)}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold transition-all hover:opacity-90"
          style={{ padding: '10px 14px', borderRadius: 10, backgroundColor: '#0EA5E9', color: '#fff' }}
        >
          <Plus size={14} strokeWidth={2.6} /> 새 체크 리스트
        </button>
      </div>
    )
  }

  // ───── 생성 모드 ─────
  if (createMode) {
    return (
      <div className="flex flex-col h-full" style={{ padding: '18px 18px 24px', gap: 12 }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--text-primary)]">새 체크 리스트</span>
          <button onClick={() => { setCreateMode(false); setNewTitle('') }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={14} />
          </button>
        </div>
        <input
          ref={newTitleInputRef}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createList(); if (e.key === 'Escape') setCreateMode(false) }}
          placeholder="예: 우유 다 먹은 사람"
          className="w-full text-xs outline-none"
          style={{
            padding: '10px 12px', borderRadius: 10,
            border: '1px solid #0EA5E9',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        />

        {/* 이모지 선택 (선택) — "없음" 기본. 선택 안하면 세련된 체크 칩으로 자동 표시됨. */}
        <div>
          <span className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1.5">이모지 (선택)</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setNewEmoji('')}
              className="flex items-center justify-center transition-all"
              style={{
                width: 32, height: 32, borderRadius: 9,
                background: newEmoji === ''
                  ? 'linear-gradient(135deg, rgba(14,165,233,0.14) 0%, rgba(2,132,199,0.24) 100%)'
                  : 'var(--bg-secondary)',
                color: newEmoji === '' ? '#0284C7' : 'var(--text-muted)',
                border: newEmoji === '' ? '1.5px solid #0EA5E9' : '1px solid var(--border-widget)',
              }}
              title="기본 체크 아이콘"
            >
              <Check size={15} strokeWidth={3} />
            </button>
            {EMOJI_PRESETS.map((e) => (
              <button
                key={e}
                onClick={() => setNewEmoji(e)}
                className="flex items-center justify-center text-lg transition-all hover:scale-110"
                style={{
                  width: 32, height: 32, borderRadius: 9,
                  backgroundColor: newEmoji === e ? 'rgba(14,165,233,0.14)' : 'var(--bg-secondary)',
                  border: newEmoji === e ? '1.5px solid #0EA5E9' : '1px solid var(--border-widget)',
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={createList}
          className="text-xs font-semibold hover:opacity-90"
          style={{ padding: '10px', borderRadius: 10, backgroundColor: '#0EA5E9', color: '#fff' }}
        >
          만들기
        </button>
      </div>
    )
  }

  // ───── 메인 뷰 (콘텐츠 중심) ─────
  const isLightText = displayMode && displayBg.textMode === 'light'
  // 디스플레이 모드에서 "이번 주 × N" 배지, 미완료 카드 배경 등 대비가 바뀌는 값들
  const idleCardBg = isLightText ? 'rgba(255,255,255,0.12)' : 'var(--bg-secondary)'
  const idleCardText = isLightText ? 'rgba(255,255,255,0.92)' : 'var(--text-primary)'
  const idleCardBorder = isLightText ? '1.5px solid rgba(255,255,255,0.22)' : '1.5px solid transparent'

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        // 배경모드(헤더 없음): 상하 padding 을 대칭으로 좁혀서 "아래가 넓어 보이는" 현상 방지.
        padding: iAmWallpaper
          ? 'clamp(14px, 1.8vw, 22px) clamp(18px, 2vw, 28px)'
          : 'clamp(12px, 1.8vw, 24px) clamp(26px, 2.4vw, 32px) clamp(28px, 2.8vw, 36px)',
        background: displayMode && displayBg.bg ? displayBg.bg : undefined,
        transition: 'background 320ms ease',
      }}
    >
      {/* 디스플레이 배경 글로우 오버레이 */}
      {displayMode && displayBg.glow && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: displayBg.glow }}
        />
      )}

      {/* 우상단 컨트롤: [팔레트(display 전용)] [모드 토글] — 배경모드에선 click-through 라 숨김 */}
      {!iAmWallpaper && (
        <div
          className="absolute top-1.5 right-1.5 flex items-center gap-0.5 z-50"
          style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as React.CSSProperties}
        >
          {displayMode && (
            <DisplayBgPicker current={displayBg} onPick={setDisplayBgId} />
          )}
          <button
            onClick={() => {
              const next = !displayMode
              setDisplayMode(next)
              try { window.api.widget.setAllDisplayMode?.(next) } catch { /* noop */ }
            }}
            className="p-1 rounded-md transition-colors"
            style={{
              color: isLightText ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)',
            }}
            title={displayMode ? '디스플레이 모드 해제 (모든 위젯 동기)' : '디스플레이 모드 — 모든 위젯에 동일 적용.'}
          >
            {displayMode ? <MonitorOff size={12} strokeWidth={2.2} /> : <Monitor size={12} strokeWidth={2.2} />}
          </button>
        </div>
      )}

      {/* 세련된 타이틀 헤더 — 디스플레이 모드 또는 배경화면 모드에서 표시. */}
      {(displayMode || iAmWallpaper) && selected && (
        <div
          className="relative flex items-center shrink-0"
          style={{
            gap: 'clamp(10px, 1.4vw, 20px)',
            marginBottom: 'clamp(10px, 1.4vw, 20px)',
            paddingRight: 56, // 팔레트/토글 공간
          }}
        >
          {(() => {
            const hasCustomEmoji = selected.icon && selected.icon !== '✅' && selected.icon.trim() !== ''
            return (
              <span
                className="flex items-center justify-center shrink-0"
                style={{
                  fontSize: 'clamp(26px, 3.4vw, 56px)',
                  lineHeight: 1,
                  width: 'clamp(42px, 4.4vw, 72px)',
                  height: 'clamp(42px, 4.4vw, 72px)',
                  borderRadius: 'clamp(12px, 1.2vw, 20px)',
                  background: hasCustomEmoji
                    ? (isLightText
                      ? 'rgba(255,255,255,0.14)'
                      : 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(2,132,199,0.18))')
                    : (isLightText
                      ? 'rgba(255,255,255,0.22)'
                      : 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)'),
                  border: hasCustomEmoji
                    ? (isLightText ? '1.5px solid rgba(255,255,255,0.28)' : '1.5px solid rgba(14,165,233,0.22)')
                    : (isLightText ? '1.5px solid rgba(255,255,255,0.4)' : 'none'),
                  color: hasCustomEmoji
                    ? undefined
                    : (isLightText ? '#fff' : '#fff'),
                  boxShadow: isLightText
                    ? '0 6px 20px rgba(0,0,0,0.18)'
                    : (hasCustomEmoji
                      ? '0 4px 14px rgba(14,165,233,0.18)'
                      : '0 6px 20px rgba(14,165,233,0.42), inset 0 1px 0 rgba(255,255,255,0.3)'),
                }}
              >
                {hasCustomEmoji ? selected.icon : <Check strokeWidth={3.2} style={{ width: '60%', height: '60%' }} />}
              </span>
            )
          })()}

          <span
            className="content-wrap flex-1 min-w-0"
            title={selected.title}
            style={{
              fontSize: 'clamp(16px, 2.6vw, 48px)',
              fontWeight: 900,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              wordBreak: 'keep-all',
              color: isLightText ? '#FFFFFF' : 'var(--text-primary)',
              background: isLightText
                ? undefined
                : 'linear-gradient(180deg, var(--text-primary) 0%, #0284C7 130%)',
              WebkitBackgroundClip: isLightText ? undefined : 'text',
              WebkitTextFillColor: isLightText ? undefined : 'transparent',
              backgroundClip: isLightText ? undefined : 'text',
              textShadow: isLightText ? '0 3px 18px rgba(0,0,0,0.28)' : '0 1px 2px rgba(15,23,42,0.04)',
            }}
          >
            {selected.title}
          </span>

          {/* 진행률 배지 — 원형 pill */}
          {items.length > 0 && (
            <span
              className="inline-flex items-center tabular-nums shrink-0"
              style={{
                gap: 'clamp(4px, 0.5vw, 8px)',
                fontSize: 'clamp(13px, 1.6vw, 24px)',
                fontWeight: 800,
                padding: 'clamp(6px, 0.8vw, 12px) clamp(12px, 1.3vw, 20px)',
                borderRadius: 999,
                background: isLightText
                  ? 'rgba(255,255,255,0.18)'
                  : `linear-gradient(135deg, ${progressColor}22 0%, ${progressColor}33 100%)`,
                color: isLightText ? '#fff' : progressColor,
                border: isLightText ? '1.5px solid rgba(255,255,255,0.28)' : `1.2px solid ${progressColor}44`,
                letterSpacing: '-0.3px',
                backdropFilter: 'blur(6px)',
              }}
            >
              <span
                aria-hidden
                className="inline-block rounded-full"
                style={{
                  width: 'clamp(7px, 0.8vw, 12px)',
                  height: 'clamp(7px, 0.8vw, 12px)',
                  backgroundColor: isLightText ? '#fff' : progressColor,
                  boxShadow: isLightText ? '0 0 0 3px rgba(255,255,255,0.2)' : `0 0 0 3px ${progressColor}33`,
                }}
              />
              {doneCount}<span style={{ opacity: 0.6, margin: '0 2px' }}>/</span>{items.length}
            </span>
          )}
        </div>
      )}

      {/* ─ Normal mode 한 줄 헤더 ─ (디스플레이/배경 모드에선 숨김)
          [icon][타이틀 gradient select(클릭=다른 리스트)][진행률 pill][학생 입력 pill+▶][새 리스트][삭제] */}
      {!chromeHidden && (
      <div
        className="flex items-center shrink-0 mb-2"
        style={{ gap: 6, paddingRight: 28 }}
      >
        {/* 아이콘 칩 — '✅' 또는 비어있으면 lucide Check SVG(세련된 그라디언트 칩)로 대체 */}
        {(() => {
          const hasCustomEmoji = selected?.icon && selected.icon !== '✅' && selected.icon.trim() !== ''
          return (
            <span
              className="flex items-center justify-center shrink-0"
              style={{
                fontSize: 'clamp(16px, 1.9vw, 26px)',
                lineHeight: 1,
                width: 'clamp(30px, 3vw, 42px)',
                height: 'clamp(30px, 3vw, 42px)',
                borderRadius: 'clamp(9px, 0.9vw, 13px)',
                background: hasCustomEmoji
                  ? 'linear-gradient(135deg, rgba(14,165,233,0.14) 0%, rgba(2,132,199,0.22) 100%)'
                  : 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)',
                border: hasCustomEmoji ? '1.5px solid rgba(14,165,233,0.28)' : 'none',
                color: '#fff',
                boxShadow: hasCustomEmoji
                  ? '0 3px 10px rgba(14,165,233,0.14)'
                  : '0 4px 14px rgba(14,165,233,0.38), inset 0 1px 0 rgba(255,255,255,0.3)',
              }}
            >
              {hasCustomEmoji ? selected!.icon : <Check size={16} strokeWidth={3.2} />}
            </span>
          )
        })()}

        {/* 타이틀 — 시계 위젯과 동일 톤. `display div + 투명 select overlay`로 그라디언트 텍스트 + 드롭다운 기능 둘 다. */}
        <div className="relative shrink min-w-0" style={{ flex: '1 1 40%' }}>
          <div
            className="content-wrap w-full pointer-events-none"
            title={selected?.title}
            style={{
              // 시계 위젯의 시간 숫자 톤과 동일 — 900 weight, 엄격한 네거티브 tracking, 그라디언트 clip
              fontSize: 'clamp(14px, 1.9vw, 32px)',
              fontWeight: 900,
              letterSpacing: '-0.045em',
              lineHeight: 1.15,
              paddingRight: 18,
              fontFeatureSettings: '"ss03"',
              background: 'linear-gradient(180deg, var(--text-primary) 0%, #0284C7 130%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {selected?.title ?? '오늘의 체크'}
          </div>
          <ChevronDown
            size={13}
            strokeWidth={2.4}
            className="absolute top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
            style={{ right: 1 }}
          />
          {/* 기능 레이어 — 투명 select 가 display div 위를 덮어 클릭 시 실제 드롭다운 노출 */}
          <select
            value={selectedId ?? ''}
            onChange={(e) => handleSwitchRoutine(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            style={{ fontSize: 16 }}
            title="다른 리스트 선택 — 새 창에서 열립니다"
          >
            {lists.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        </div>

        {/* 진행률 pill */}
        {items.length > 0 && (
          <span
            className="inline-flex items-center tabular-nums shrink-0"
            style={{
              gap: 4,
              fontSize: 11.5,
              fontWeight: 800,
              padding: '3px 9px',
              borderRadius: 999,
              background: `linear-gradient(135deg, ${progressColor}22 0%, ${progressColor}33 100%)`,
              color: progressColor,
              border: `1px solid ${progressColor}44`,
              letterSpacing: '-0.2px',
            }}
          >
            <span
              aria-hidden
              className="inline-block rounded-full"
              style={{
                width: 6, height: 6,
                backgroundColor: progressColor,
                boxShadow: `0 0 0 2.5px ${progressColor}33`,
              }}
            />
            {doneCount}<span style={{ opacity: 0.55 }}>/</span>{items.length}
          </span>
        )}

        {/* 학생 이름 추가 pill + 추가 버튼 */}
        <div
          className="flex items-center shrink min-w-0"
          style={{
            flex: '1 1 30%',
            padding: '4px 4px 4px 10px',
            borderRadius: 999,
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-widget)',
          }}
        >
          <input
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="학생 이름 추가"
            className="flex-1 min-w-0 bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/70"
            style={{
              fontSize: 11.5,
              letterSpacing: '-0.2px',
              fontWeight: 500,
            }}
          />
          <button
            onClick={handleAdd}
            disabled={!newContent.trim()}
            className="shrink-0 flex items-center justify-center transition-opacity disabled:opacity-40"
            style={{
              width: 20, height: 20, borderRadius: 999,
              background: newContent.trim()
                ? 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)'
                : 'transparent',
              color: newContent.trim() ? '#fff' : 'var(--text-muted)',
              boxShadow: newContent.trim() ? '0 2px 6px rgba(14,165,233,0.35)' : 'none',
            }}
            title="학생 추가"
          >
            <Plus size={12} strokeWidth={2.8} />
          </button>
        </div>

        {/* 파일로 학생 이름 일괄 추가 (HWP/XLSX/DOCX/CSV) */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".hwp,.hwpx,.xlsx,.xls,.xlsm,.ods,.docx,.doc,.pdf,.csv,.tsv,.txt,.md"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleImportFile(f)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!selectedId}
          className="shrink-0 flex items-center justify-center hover:opacity-85 transition-opacity disabled:opacity-40"
          style={{
            width: 26, height: 26, borderRadius: 8,
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            color: '#fff',
            boxShadow: '0 3px 10px rgba(16,185,129,0.32)',
          }}
          title="학급 명렬표 파일 올리기 (HWP/Excel/DOCX/CSV)"
        >
          <FileUp size={13} strokeWidth={2.4} />
        </button>

        {/* 새 리스트 */}
        <button
          onClick={() => setCreateMode(true)}
          className="shrink-0 flex items-center justify-center hover:opacity-85 transition-opacity"
          style={{
            width: 26, height: 26, borderRadius: 8,
            background: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)',
            color: '#fff',
            boxShadow: '0 3px 10px rgba(14,165,233,0.32)',
          }}
          title="새 체크 리스트 (새 창에서 열림)"
        >
          <Plus size={13} strokeWidth={2.6} />
        </button>
        {/* 삭제 */}
        <button
          onClick={requestDeleteList}
          className="shrink-0 flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-colors text-[var(--text-muted)]/80"
          style={{
            width: 26, height: 26, borderRadius: 8,
            border: '1px solid var(--border-widget)',
          }}
          title="이 체크 리스트 삭제"
        >
          <Trash2 size={12} />
        </button>
      </div>
      )}

      {/* 진행률 바 — 그라디언트 + 글로우. 디스플레이/배경 모드에선 숨김(카드만 보이게). */}
      {!chromeHidden && items.length > 0 && (
      <div
        className="relative rounded-full overflow-hidden mb-2 shrink-0"
        style={{
          height: 4,
          backgroundColor: 'var(--bg-secondary)',
          boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.06)',
        }}
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${progressColor}, ${progressColor}CC)`,
            boxShadow: `0 0 8px ${progressColor}66`,
          }}
          animate={{ width: `${progress}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      )}

      {/* 학생 이름 그리드 — 창 크기에 맞춰 모든 카드가 다 보이도록 cols/rows 동적 계산 (스크롤 X). */}
      <div
        ref={gridAreaRef}
        className="flex-1 relative"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: chromeHidden ? 'center' : 'flex-start',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        <AnimatePresence>
          {items.length === 0 ? (
            <p
              className="text-center py-6"
              style={{
                fontSize: 'clamp(12px, 1.4vw, 18px)',
                color: isLightText ? 'rgba(255,255,255,0.78)' : 'var(--text-muted)',
                fontWeight: 600,
                letterSpacing: '-0.2px',
              }}
            >
              학생 이름을 추가해 보세요
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gridLayout.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${gridLayout.rows}, minmax(0, 1fr))`,
                gap: gridLayout.gap,
                height: '100%',
                width: '100%',
                overflow: 'hidden',
              }}
            >
              {items.map((item, idx) => {
                const done = !!item.is_completed
                const prevDone = prevDoneIds.has(item.id)
                const weekN = weekCounts.get(item.id) ?? 0
                // 색상 정책: 오늘 완료=하늘(brand), 미체크지만 전날 완료=호박(amber), 미완료=은은한 pastel tint 순환.
                const TODAY_BG = 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)'
                const PREV_BG = 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)'
                const PREV_BORDER = '#F59E0B'
                const PREV_TEXT = '#92400E'
                // 미완료 카드 은은한 pastel 팔레트 — 학생별로 구분감. 배경모드(어두운 BG)에선 글래스 톤 유지.
                const IDLE_TINTS = [
                  { bg: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', border: '#BFDBFE' }, // blue
                  { bg: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', border: '#A7F3D0' }, // emerald
                  { bg: 'linear-gradient(135deg, #FDF2F8 0%, #FCE7F3 100%)', border: '#FBCFE8' }, // pink
                  { bg: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)', border: '#FDE68A' }, // amber
                  { bg: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)', border: '#DDD6FE' }, // violet
                  { bg: 'linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 100%)', border: '#99F6E4' }, // teal
                ]
                const tint = IDLE_TINTS[idx % IDLE_TINTS.length]
                const idleBg = isLightText
                  ? 'rgba(255,255,255,0.12)'
                  : tint.bg
                const idleBorder = isLightText
                  ? '1.5px solid rgba(255,255,255,0.22)'
                  : `1.5px solid ${tint.border}`
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="group relative"
                  >
                    {editingId === item.id ? (
                      <input
                        autoFocus
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit()
                          if (e.key === 'Escape') { setEditingId(null); setEditingContent('') }
                        }}
                        className="w-full bg-[var(--bg-secondary)] rounded-md outline-none text-[var(--text-primary)] border border-[#0EA5E9]"
                        style={{
                          fontSize: 'clamp(14px, 2vw, 28px)',
                          padding: 'clamp(8px, 1vw, 14px) clamp(10px, 1.2vw, 16px)',
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => handleToggle(item.id)}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          handleToggle(item.id)
                          startEdit(item.id, item.content)
                        }}
                        className="w-full h-full flex items-center transition-all hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm"
                        title={`클릭=체크 / 더블클릭=수정${prevDone ? ' · 전날 완료' : ''}${weekN > 0 ? ` · 이번 주 ${weekN}회` : ''}`}
                        style={{
                          padding: `${cardPad * 0.7}px ${cardPad}px`,
                          gap: Math.max(4, cardPad * 0.7),
                          borderRadius: Math.max(8, cardPad * 1.2),
                          background: done ? TODAY_BG : (prevDone ? PREV_BG : idleBg),
                          color: done ? '#fff' : (prevDone ? PREV_TEXT : idleCardText),
                          border: done
                            ? '1.5px solid rgba(255,255,255,0.4)'
                            : (prevDone ? `1.8px solid ${PREV_BORDER}` : idleBorder),
                          boxShadow: done
                            ? '0 6px 18px rgba(14,165,233,0.42), inset 0 1px 0 rgba(255,255,255,0.28)'
                            : (prevDone ? '0 3px 10px rgba(245,158,11,0.22)' : (isLightText ? '0 2px 8px rgba(0,0,0,0.18)' : '0 1px 2px rgba(0,0,0,0.04)')),
                          overflow: 'hidden',
                        }}
                      >
                        <span
                          className="flex items-center justify-center shrink-0"
                          style={{
                            width: checkboxSz,
                            height: checkboxSz,
                            borderRadius: Math.max(5, checkboxSz * 0.3),
                            backgroundColor: done
                              ? 'rgba(255,255,255,0.28)'
                              : (prevDone
                                ? 'rgba(146,64,14,0.10)'
                                : (isLightText ? 'rgba(255,255,255,0.08)' : 'transparent')),
                            border: done
                              ? '1.8px solid #fff'
                              : (prevDone
                                ? `1.8px solid ${PREV_BORDER}`
                                : (isLightText ? '1.8px solid rgba(255,255,255,0.6)' : '1.8px solid var(--text-muted)')),
                          }}
                        >
                          {done && <Check size={Math.max(10, checkboxSz * 0.58)} strokeWidth={3.5} />}
                        </span>
                        <span
                          className="flex-1 text-left min-w-0"
                          style={{
                            // 카드 높이 기반 동적 폰트. 이름 길수록 단계적으로 더 축소 → "..." 없이 전체 표시.
                            fontSize: Math.max(
                              9,
                              nameFont * (
                                item.content.length >= 8 ? 0.55 :
                                item.content.length >= 6 ? 0.65 :
                                item.content.length >= 5 ? 0.78 :
                                item.content.length >= 4 ? 0.88 : 1
                              ),
                            ),
                            fontWeight: done ? 900 : 800,
                            letterSpacing: '-0.04em',
                            lineHeight: 1.08,
                            // ellipsis 금지 — WebkitLineClamp/box-orient 제거하고 자연스러운 wrap.
                            wordBreak: 'keep-all',
                            overflowWrap: 'anywhere',
                            whiteSpace: 'normal',
                            textOverflow: 'clip',
                            textShadow: done
                              ? '0 1px 3px rgba(0,0,0,0.22)'
                              : (isLightText ? '0 1px 2px rgba(0,0,0,0.22)' : 'none'),
                          }}
                        >
                          {item.content}
                        </span>
                        {/* 이번 주 누적 횟수 — 작은 chip. 0회면 숨김. */}
                        {weekN > 0 && cellH >= 36 && (
                          <span
                            className="shrink-0 tabular-nums"
                            title={`이번 주 ${weekN}회 완료`}
                            style={{
                              fontSize: Math.max(9, nameFont * 0.42),
                              fontWeight: 800,
                              padding: `${Math.max(1, cardPad * 0.2)}px ${Math.max(4, cardPad * 0.5)}px`,
                              borderRadius: 999,
                              backgroundColor: done
                                ? 'rgba(255,255,255,0.22)'
                                : (prevDone
                                  ? 'rgba(146,64,14,0.14)'
                                  : (isLightText ? 'rgba(255,255,255,0.18)' : 'rgba(14,165,233,0.12)')),
                              color: done ? '#fff' : (prevDone ? PREV_TEXT : (isLightText ? '#fff' : '#0284C7')),
                              letterSpacing: '-0.2px',
                            }}
                          >
                            ×{weekN}
                          </span>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="absolute top-1 right-1 p-0.5 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                      style={{ backgroundColor: done ? 'rgba(255,255,255,0.2)' : 'transparent' }}
                      title="삭제"
                    >
                      <X size={10} strokeWidth={2.5} color={done ? '#fff' : undefined} />
                    </button>
                  </motion.div>
                )
              })}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* 인라인 삭제 확인 오버레이 */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center"
            style={{
              background: 'rgba(15,23,42,0.45)',
              backdropFilter: 'blur(4px)',
              borderRadius: 'var(--shell-radius)',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(false) }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 6 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 6 }}
              transition={{ duration: 0.16 }}
              style={{
                padding: 18,
                maxWidth: 280,
                margin: 12,
                borderRadius: 16,
                background: 'var(--bg-widget)',
                boxShadow: '0 20px 48px rgba(15,23,42,0.32)',
                border: '1px solid rgba(15,23,42,0.08)',
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6, letterSpacing: '-0.3px' }}>
                이 체크 리스트를 삭제할까요?
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.45, letterSpacing: '-0.2px' }}>
                모든 항목과 체크 기록이 함께 지워져요.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1"
                  style={{
                    padding: '9px 12px', fontSize: 13, fontWeight: 700, borderRadius: 10,
                    backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border-widget)',
                  }}
                >
                  취소
                </button>
                <button
                  onClick={handleDeleteList}
                  className="flex-1"
                  style={{
                    padding: '9px 12px', fontSize: 13, fontWeight: 800, borderRadius: 10,
                    background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
                    color: '#fff',
                    boxShadow: '0 4px 12px rgba(239,68,68,0.38)',
                  }}
                >
                  삭제
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 학생 명렬표 import 미리보기 */}
      <AnimatePresence>
        {(importedNames !== null || importError) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center"
            style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', borderRadius: 'var(--shell-radius)' }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !importBusy) {
                setImportedNames(null); setImportError(null)
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.94, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 8 }}
              transition={{ duration: 0.16 }}
              style={{
                padding: 18, maxWidth: 360, margin: 12, borderRadius: 16,
                background: 'var(--bg-widget)',
                boxShadow: '0 20px 48px rgba(15,23,42,0.32)',
                border: '1px solid rgba(15,23,42,0.08)',
                maxHeight: '85%',
                display: 'flex', flexDirection: 'column',
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6, letterSpacing: '-0.3px' }}>
                {importError ? '⚠️ 파일 인식 실패' : `📋 ${importFileName}`}
              </p>
              {importError ? (
                <p style={{ fontSize: 12, color: '#EF4444', marginBottom: 14, lineHeight: 1.5 }}>
                  {importError}
                </p>
              ) : importedNames && (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '-0.2px' }}>
                    {importedNames.length}명의 이름을 찾았어요. 추가할까요?
                  </p>
                  <div style={{
                    flex: 1, minHeight: 0, overflowY: 'auto',
                    padding: 10, borderRadius: 10,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-widget)',
                    marginBottom: 14,
                  }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {importedNames.map((n, i) => (
                        <span key={i} style={{
                          fontSize: 12, fontWeight: 600, letterSpacing: '-0.2px',
                          padding: '4px 10px', borderRadius: 999,
                          background: 'var(--bg-widget)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-widget)',
                        }}>{n}</span>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => { if (!importBusy) { setImportedNames(null); setImportError(null) } }}
                  disabled={importBusy}
                  className="flex-1"
                  style={{
                    padding: '9px 12px', fontSize: 13, fontWeight: 700, borderRadius: 10,
                    backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border-widget)',
                  }}
                >
                  취소
                </button>
                {!importError && importedNames && importedNames.length > 0 && (
                  <button
                    onClick={confirmImport}
                    disabled={importBusy}
                    className="flex-1"
                    style={{
                      padding: '9px 12px', fontSize: 13, fontWeight: 700, borderRadius: 10,
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                      color: '#fff',
                      boxShadow: '0 4px 12px rgba(16,185,129,0.38)',
                      opacity: importBusy ? 0.7 : 1,
                    }}
                  >
                    {importBusy ? '추가 중…' : `${importedNames.length}명 추가`}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
