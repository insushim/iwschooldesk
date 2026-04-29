import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Check, ChevronDown, Flame, X, Trash2, Repeat } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Routine, RoutineItemWithStatus } from '../../types/routine.types'
import { useDataChange } from '../../hooks/useDataChange'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** url hash 에서 instance(=routine id) 추출. 기본 창은 null → 첫 루틴 자동 선택. */
function getInstanceIdFromHash(): string | null {
  const m = window.location.hash.match(/instance=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

export function RoutineWidget() {
  // instance 잠금: hash에 instance=<id> 가 있으면 그 루틴 고정. 다른 루틴 전환은 새 창 spawn.
  const lockedInstanceId = useRef<string | null>(getInstanceIdFromHash()).current

  const [routines, setRoutines] = useState<Routine[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(lockedInstanceId)
  const [items, setItems] = useState<RoutineItemWithStatus[]>([])
  const [dayNumber, setDayNumber] = useState<number>(1)
  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [createMode, setCreateMode] = useState(false)
  const [newRoutineTitle, setNewRoutineTitle] = useState('')
  const [today, setToday] = useState(todayStr())
  const newRoutineInputRef = useRef<HTMLInputElement>(null)
  // 인라인 삭제 확인 — window.confirm() 의 Windows 포그라운드 락으로 인한 입력 불가 버그 회피.
  const [confirmDelete, setConfirmDelete] = useState(false)

  // createMode 진입 시 입력 포커스 강제 — Windows 포그라운드 락(window.confirm 이후) 우회.
  // 다중 타이머로 한 번 놓쳐도 다시 시도 — "만들기→삭제→재생성" 연쇄 시 입력 불가 버그 방지.
  useEffect(() => {
    if (!createMode) return
    window.api.widget.focusSelf()
    const timers = [40, 120, 280].map((ms) =>
      setTimeout(() => {
        try {
          window.api.widget.focusSelf()
          newRoutineInputRef.current?.focus()
          newRoutineInputRef.current?.select()
        } catch { /* ignore */ }
      }, ms),
    )
    return () => { for (const t of timers) clearTimeout(t) }
  }, [createMode])

  const reloadRoutines = useCallback(async () => {
    const data = await window.api.routine.list('personal')
    setRoutines(data)
    // instance로 잠긴 창: 그 루틴이 사라졌으면 창 자신을 닫는다.
    if (lockedInstanceId) {
      const exists = data.some((r) => r.id === lockedInstanceId)
      if (!exists && data.length > 0) {
        setTimeout(() => { try { window.api.widget.closeSelf() } catch { /* ignore */ } }, 0)
      }
      return data
    }
    if (data.length > 0 && !selectedId) setSelectedId(data[0].id)
    return data
  }, [selectedId, lockedInstanceId])

  useEffect(() => { reloadRoutines() }, [])
  useDataChange('routine', () => { reloadRoutines() })
  useAutoRefresh(reloadRoutines)

  // 자정 지나면 today 자동 갱신 → 체크 초기화
  useEffect(() => {
    const timer = setInterval(() => {
      const t = todayStr()
      if (t !== today) setToday(t)
    }, 60000)
    return () => clearInterval(timer)
  }, [today])

  // 선택된 루틴 / today 변경 시 items + dayNumber 재조회.
  // 선택 없으면 dayNumber 도 1 로 초기화 — 이전 루틴 잔여값(예: 4일차)이 남는 버그 방지.
  useEffect(() => {
    if (!selectedId) {
      setItems([])
      setDayNumber(1)
      return
    }
    window.api.routine.getItems(selectedId, today).then(setItems)
    const r = routines.find((x) => x.id === selectedId)
    if (r) {
      window.api.routine.dayNumber(r.start_date, today).then(setDayNumber)
    } else {
      setDayNumber(1)  // routines 목록에서 사라진 경우(삭제 직후)도 초기화
    }
  }, [selectedId, today, routines])

  const selected = routines.find((r) => r.id === selectedId)
  const doneCount = items.filter((i) => i.is_completed).length
  const progress = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0
  const progressColor = progress === 100 ? '#10B981' : progress >= 50 ? '#F59E0B' : '#8B5CF6'

  const handleToggle = async (itemId: string) => {
    const { is_completed } = await window.api.routine.toggleCompletion(itemId, today)
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_completed } : i)))
  }

  const handleAdd = async () => {
    if (!newContent.trim() || !selectedId) return
    const item = await window.api.routine.addItem({ routine_id: selectedId, content: newContent.trim() })
    setItems((prev) => [...prev, { ...item, is_completed: 0 }])
    setNewContent('')
  }

  const handleDeleteItem = async (itemId: string) => {
    await window.api.routine.deleteItem(itemId)
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  // 휴지통 버튼 → 인라인 confirm 오버레이 노출 (네이티브 confirm 안 씀).
  const requestDeleteRoutine = (): void => {
    if (!selectedId) return
    setConfirmDelete(true)
  }

  const handleDeleteRoutine = async (): Promise<void> => {
    if (!selectedId) return
    setConfirmDelete(false)
    await window.api.routine.delete(selectedId)
    if (lockedInstanceId && lockedInstanceId === selectedId) {
      try { window.api.widget.closeSelf() } catch { /* ignore */ }
      return
    }
    const data = await reloadRoutines()
    setSelectedId(data.length > 0 ? data[0].id : null)
    setItems([])
  }

  const startEdit = (id: string, content: string) => {
    setEditingId(id); setEditingContent(content)
  }
  const commitEdit = async () => {
    if (!editingId) return
    const trimmed = editingContent.trim()
    if (trimmed) {
      const updated = await window.api.routine.updateItem(editingId, trimmed)
      setItems((prev) => prev.map((i) => (i.id === editingId ? { ...i, content: updated.content } : i)))
    }
    setEditingId(null); setEditingContent('')
  }

  const createRoutine = async () => {
    const t = newRoutineTitle.trim() || '내 루틴'
    // icon은 빈 문자열로 — 루틴에서 이모지 기능 제거. DB default(🔁)도 덮어쓴다.
    const r = await window.api.routine.create({ title: t, icon: '' })
    const data = await reloadRoutines()
    setCreateMode(false); setNewRoutineTitle('')

    // 생성 후 창 배치 규칙:
    //  1) 잠긴 창에서 만든 경우 → 새 창 spawn (본 창은 자기 루틴 유지)
    //  2) 기본(미잠금) 창에서 첫 루틴(0→1) → 자기 창에서 그대로 표시, 새 창 X
    //  3) 기본 창에서 2번째 이상 → 새 창 spawn
    if (lockedInstanceId) {
      try { await window.api.widget.openWindow('routine', { instanceId: r.id }) } catch { /* ignore */ }
      return
    }
    // 미잠금 창
    if (data.length === 1) {
      setSelectedId(r.id)
      return
    }
    // 이미 루틴이 있었던 상태에서 추가 → 새 루틴 창
    try { await window.api.widget.openWindow('routine', { instanceId: r.id }) } catch { /* ignore */ }
  }

  /** 드롭다운에서 다른 루틴 선택 — 본인 창은 그대로 두고 새 창 spawn. */
  const handleSwitchRoutine = (nextId: string) => {
    if (!nextId || nextId === selectedId) return
    window.api.widget.openWindow('routine', { instanceId: nextId }).catch(() => {})
  }

  // ───── 빈 상태 ─────
  if (routines.length === 0 && !createMode) {
    return (
      <div className="flex flex-col h-full" style={{ padding: '18px 18px 24px' }}>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div
            style={{
              width: 56, height: 56, borderRadius: 16,
              background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
              color: '#fff',
              boxShadow: '0 10px 28px rgba(139,92,246,0.42)',
            }}
            className="flex items-center justify-center"
          >
            <Repeat size={26} strokeWidth={2.4} />
          </div>
          <p className="text-[13px] text-[var(--text-secondary)] font-medium">매일 반복할 루틴을 만들어 보세요</p>
        </div>
        <button
          onClick={() => setCreateMode(true)}
          className="flex items-center justify-center gap-1.5 font-semibold transition-all hover:opacity-90"
          style={{
            fontSize: 13,
            padding: '11px 16px', borderRadius: 12,
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(139,92,246,0.35)',
          }}
        >
          <Plus size={15} strokeWidth={2.6} /> 새 루틴
        </button>
      </div>
    )
  }

  // ───── 새 루틴 ─────
  if (createMode) {
    return (
      <div className="flex flex-col h-full" style={{ padding: '18px 18px 24px', gap: 14 }}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">새 루틴</span>
          <button onClick={() => { setCreateMode(false); setNewRoutineTitle('') }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={15} />
          </button>
        </div>

        <input
          ref={newRoutineInputRef}
          value={newRoutineTitle}
          onChange={(e) => setNewRoutineTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createRoutine(); if (e.key === 'Escape') setCreateMode(false) }}
          placeholder="루틴 이름 (예: 아침 준비)"
          className="w-full outline-none"
          style={{
            fontSize: 13,
            padding: '11px 14px', borderRadius: 12,
            border: '1.5px solid #8B5CF6',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        />

        <button
          onClick={createRoutine}
          className="font-semibold hover:opacity-90 transition-opacity"
          style={{
            fontSize: 13,
            padding: '11px', borderRadius: 12,
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(139,92,246,0.4)',
          }}
        >
          만들기
        </button>
      </div>
    )
  }

  // ───── 메인 뷰 ─────
  return (
    // shell-radius 22px 곡선 바깥으로 콘텐츠 확보 (좌/우 26px + 하단 28px)
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        padding: '14px 26px 28px 26px',
        background: 'radial-gradient(ellipse at 100% 0%, rgba(139,92,246,0.07) 0%, transparent 55%)',
      }}
    >
      {/* 한 줄 헤더 — [Repeat SVG 칩][select-as-title(큰 그라디언트)][일차 pill][+새 루틴][🗑] */}
      <div className="flex items-center shrink-0 mb-3" style={{ gap: 8 }}>
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 'clamp(30px, 3vw, 42px)',
            height: 'clamp(30px, 3vw, 42px)',
            borderRadius: 'clamp(9px, 0.9vw, 13px)',
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(139,92,246,0.38), inset 0 1px 0 rgba(255,255,255,0.3)',
          }}
        >
          <Repeat strokeWidth={2.4} style={{ width: '58%', height: '58%' }} />
        </span>

        {/* 타이틀 = select — 클릭하면 다른 루틴으로 전환(새 창 spawn) */}
        <div className="relative shrink min-w-0" style={{ flex: '1 1 auto' }}>
          <select
            value={selectedId ?? ''}
            onChange={(e) => handleSwitchRoutine(e.target.value)}
            className="w-full bg-transparent border-none outline-none appearance-none cursor-pointer truncate"
            style={{
              fontSize: 'clamp(14px, 1.7vw, 22px)',
              fontWeight: 900,
              letterSpacing: '-0.035em',
              padding: '0 16px 0 0',
              color: 'var(--text-primary)',
              lineHeight: 1.1,
            }}
            title="다른 루틴 선택 — 새 창에서 열립니다"
          >
            {routines.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
          <ChevronDown
            size={12}
            strokeWidth={2.4}
            className="absolute top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
            style={{ right: 1 }}
          />
        </div>

        {/* N일차 pill — 선택된 루틴이 있을 때만. 루틴 없으면 의미가 없으니 숨김. */}
        {selected && (
        <span
          className="inline-flex items-center gap-1 tabular-nums shrink-0"
          style={{
            fontSize: 11,
            fontWeight: 800,
            padding: '3px 9px',
            borderRadius: 999,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.14) 0%, rgba(139,92,246,0.26) 100%)',
            color: '#6D28D9',
            border: '1px solid rgba(139,92,246,0.28)',
            letterSpacing: '-0.3px',
            boxShadow: '0 2px 6px rgba(139,92,246,0.18)',
          }}
        >
          <Flame size={11} strokeWidth={2.6} />
          {dayNumber}일차
        </span>
        )}

        <button
          onClick={() => setCreateMode(true)}
          className="shrink-0 flex items-center justify-center hover:opacity-85 transition-opacity"
          style={{
            width: 26, height: 26, borderRadius: 8,
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            color: '#fff',
            boxShadow: '0 3px 10px rgba(139,92,246,0.32)',
          }}
          title="새 루틴 (새 창에서 열림)"
        >
          <Plus size={13} strokeWidth={2.6} />
        </button>
        <button
          onClick={requestDeleteRoutine}
          className="shrink-0 flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-colors text-[var(--text-muted)]"
          style={{
            width: 26, height: 26, borderRadius: 8,
            border: '1px solid var(--border-widget)',
          }}
          title="이 루틴 삭제"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* 인라인 삭제 확인 오버레이 — 네이티브 confirm 대신 */}
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
                maxWidth: 260,
                margin: 12,
                borderRadius: 16,
                background: 'var(--bg-widget)',
                boxShadow: '0 20px 48px rgba(15,23,42,0.32)',
                border: '1px solid rgba(15,23,42,0.08)',
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  marginBottom: 6,
                  letterSpacing: '-0.3px',
                }}
              >
                이 루틴을 삭제할까요?
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  marginBottom: 14,
                  lineHeight: 1.45,
                  letterSpacing: '-0.2px',
                }}
              >
                모든 항목과 체크 기록이 함께 지워져요.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1"
                  style={{
                    padding: '9px 12px',
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 10,
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-widget)',
                  }}
                >
                  취소
                </button>
                <button
                  onClick={handleDeleteRoutine}
                  className="flex-1"
                  style={{
                    padding: '9px 12px',
                    fontSize: 13,
                    fontWeight: 800,
                    borderRadius: 10,
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

      {/* 진행률 바 — 그라디언트 + 글로우 */}
      <div className="mb-3 shrink-0">
        <div
          className="relative rounded-full overflow-hidden"
          style={{
            height: 8,
            backgroundColor: 'var(--bg-secondary)',
            boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.06)',
          }}
        >
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${progressColor}, ${progressColor}DD)`,
              boxShadow: `0 0 12px ${progressColor}66`,
            }}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between" style={{ padding: '0 2px' }}>
          <span className="text-[10.5px] font-semibold tabular-nums" style={{ color: 'var(--text-muted)', letterSpacing: '-0.2px' }}>
            오늘 {doneCount} / {items.length}
          </span>
          <span className="text-[12px] font-black tabular-nums" style={{ color: progressColor, letterSpacing: '-0.3px' }}>
            {progress}%
          </span>
        </div>
        <div className="mt-0.5 text-[10px] text-[var(--text-muted)] truncate" style={{ padding: '0 2px', letterSpacing: '-0.2px' }}>
          시작 {selected?.start_date}
        </div>
      </div>

      {/* 항목 리스트 */}
      <div className="flex-1 overflow-y-auto space-y-1">
        <AnimatePresence>
          {items.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-6">
              항목을 추가해 보세요
            </p>
          ) : (
            items.map((item, idx) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: 20 }}
                className="group flex items-center gap-2 transition-all"
                style={{
                  padding: '7px 10px 7px 8px',
                  borderRadius: 10,
                  borderLeft: item.is_completed
                    ? '3px solid #8B5CF6'
                    : '3px solid rgba(139,92,246,0.22)',
                  background: item.is_completed
                    ? 'linear-gradient(90deg, rgba(139,92,246,0.10) 0%, rgba(139,92,246,0.02) 70%, transparent 100%)'
                    : 'transparent',
                  marginLeft: 2,
                }}
                onMouseEnter={(e) => {
                  if (!item.is_completed) e.currentTarget.style.background = 'var(--bg-secondary)'
                }}
                onMouseLeave={(e) => {
                  if (!item.is_completed) e.currentTarget.style.background = 'transparent'
                }}
              >
                <button
                  onClick={() => handleToggle(item.id)}
                  className="flex items-center justify-center shrink-0 transition-all hover:scale-105"
                  style={{
                    // 네모진 체크박스 — 학급체크와 톤 통일
                    width: 22, height: 22,
                    borderRadius: 7,
                    border: item.is_completed ? 'none' : '1.8px solid var(--text-muted)',
                    background: item.is_completed
                      ? 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)'
                      : 'transparent',
                    boxShadow: item.is_completed ? '0 3px 10px rgba(139,92,246,0.42), inset 0 1px 0 rgba(255,255,255,0.28)' : 'none',
                  }}
                >
                  {item.is_completed ? <Check size={14} className="text-white" strokeWidth={3.2} /> : null}
                </button>
                {/* 번호 pill — 시각적 순서감 */}
                <span
                  aria-hidden
                  className="tabular-nums shrink-0"
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    minWidth: 18,
                    textAlign: 'center',
                    color: item.is_completed ? '#6D28D9' : 'var(--text-muted)',
                    opacity: item.is_completed ? 0.9 : 0.55,
                    letterSpacing: '-0.2px',
                  }}
                >
                  {String(idx + 1).padStart(2, '0')}
                </span>
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
                    className="flex-1 text-xs bg-[var(--bg-secondary)] rounded px-1.5 py-0.5 outline-none text-[var(--text-primary)] border border-[#8B5CF6]"
                  />
                ) : (
                  <span
                    onDoubleClick={() => startEdit(item.id, item.content)}
                    title="더블클릭하여 수정"
                    className="flex-1 cursor-text"
                    style={{
                      fontSize: 14.5,
                      lineHeight: 1.4,
                      letterSpacing: '-0.2px',
                      fontWeight: item.is_completed ? 600 : 700,
                      color: item.is_completed ? '#6D28D9' : 'var(--text-primary)',
                      textDecoration: item.is_completed ? 'line-through' : undefined,
                      textDecorationColor: item.is_completed ? 'rgba(109,40,217,0.6)' : undefined,
                      textDecorationThickness: item.is_completed ? 2 : undefined,
                      opacity: item.is_completed ? 0.85 : 1,
                    }}
                  >
                    {item.content}
                  </span>
                )}
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="shrink-0 p-0.5 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                  title="항목 삭제"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* 빠른 추가 */}
      <div className="mt-2 flex items-center gap-1 border-t border-[var(--border-widget)] pt-2">
        <input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="루틴 항목 추가..."
          className="flex-1 text-xs bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        <button
          onClick={handleAdd}
          disabled={!newContent.trim()}
          className="text-[#8B5CF6] hover:bg-[rgba(139,92,246,0.13)] rounded p-1 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
