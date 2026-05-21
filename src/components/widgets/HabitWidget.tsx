import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Check, Flame, Pencil, X as XIcon } from 'lucide-react'
import type { Habit, HabitStats } from '../../types/habit.types'
import { useDataChange } from '../../hooks/useDataChange'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'

type HabitWithStats = Habit & HabitStats

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

const ACCENT = '#F97316'

export function HabitWidget(): React.ReactElement {
  const [items, setItems] = useState<HabitWithStats[]>([])
  const [today, setToday] = useState(todayStr())
  // 인라인 입력 — 새 습관 / 편집 모드. mode='create' 면 추가, 'edit' 면 editingId 의 습관 수정.
  const [composer, setComposer] = useState<{ mode: 'create' | 'edit'; id?: string; title: string } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const composerInputRef = useRef<HTMLInputElement | null>(null)

  const reload = useCallback(() => {
    window.api.habit.listWithStats(todayStr()).then(setItems)
  }, [])
  useEffect(() => { reload() }, [reload])
  useDataChange('habit', reload)
  useAutoRefresh(reload)

  useEffect(() => {
    const t = setInterval(() => {
      const cur = todayStr()
      if (cur !== today) { setToday(cur); reload() }
    }, 60_000)
    return () => clearInterval(t)
  }, [today, reload])

  // composer 활성 시 input 자동 포커스
  useEffect(() => {
    if (composer) setTimeout(() => composerInputRef.current?.focus(), 0)
  }, [composer?.mode, composer?.id])

  const handleToggle = async (habit: HabitWithStats): Promise<void> => {
    const { done } = await window.api.habit.toggleToday(habit.id, today)
    setItems((prev) => prev.map((h) => {
      if (h.id !== habit.id) return h
      const delta = done ? 1 : -1
      return {
        ...h,
        today_done: done,
        total_days: Math.max(0, h.total_days + delta),
        streak_current: done ? h.streak_current + 1 : Math.max(0, h.streak_current - 1),
      }
    }))
  }

  const openCreate = (): void => setComposer({ mode: 'create', title: '' })
  const openEdit = (h: HabitWithStats): void => setComposer({ mode: 'edit', id: h.id, title: h.title })
  const cancelComposer = (): void => setComposer(null)
  const saveComposer = async (): Promise<void> => {
    if (!composer) return
    const t = composer.title.trim()
    if (!t) { setComposer(null); return }
    if (composer.mode === 'edit' && composer.id) {
      await window.api.habit.update(composer.id, { title: t })
    } else {
      await window.api.habit.create({ title: t })
    }
    setComposer(null)
  }

  const handleDelete = async (): Promise<void> => {
    if (!confirmDeleteId) return
    await window.api.habit.delete(confirmDeleteId)
    setConfirmDeleteId(null)
  }

  // 빈 상태 — 첫 습관 만들기 유도 (composer 가 활성이면 inline input 우선 노출)
  if (items.length === 0 && !composer) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4 text-center">
        <div
          className="flex items-center justify-center"
          style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(249,115,22,0.14)' }}
        >
          <Flame size={26} strokeWidth={2.2} style={{ color: ACCENT }} />
        </div>
        <p className="text-xs font-medium text-[var(--text-secondary)]">매일 ✓ 하는 습관을 추가해 보세요</p>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ padding: '8px 14px', borderRadius: 10, backgroundColor: ACCENT, color: '#fff' }}
        >
          <Plus size={13} strokeWidth={2.6} /> 습관 추가
        </button>
      </div>
    )
  }

  const doneToday = items.filter((h) => h.today_done).length

  return (
    <div className="flex flex-col h-full" style={{ padding: '10px 12px 12px' }}>
      {/* 헤더 — 진행 + 새 추가 */}
      <div className="flex items-center justify-between shrink-0" style={{ paddingRight: 80 }}>
        <div className="flex items-center gap-2 min-w-0">
          <Flame size={14} strokeWidth={2.6} style={{ color: ACCENT }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
            오늘 {doneToday}/{items.length}
          </span>
        </div>
        <button
          onClick={composer ? cancelComposer : openCreate}
          className="hover:scale-105 transition-transform shrink-0"
          style={{
            width: 22, height: 22, borderRadius: 7,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, ${ACCENT}, #C2410C)`, color: '#fff',
            boxShadow: '0 3px 8px rgba(249,115,22,0.3)',
          }}
          title={composer ? '입력 취소' : '새 습관 추가'}
        >
          {composer ? <XIcon size={12} strokeWidth={2.8} /> : <Plus size={12} strokeWidth={2.8} />}
        </button>
      </div>

      {/* 인라인 입력 카드 — 새 습관 / 이름 편집 */}
      {composer && (
        <div
          className="shrink-0 flex items-center gap-1.5"
          style={{
            marginTop: 8,
            padding: '6px 8px',
            borderRadius: 10,
            background: 'rgba(249,115,22,0.06)',
            border: '1.5px dashed rgba(249,115,22,0.45)',
          }}
        >
          <span style={{ fontSize: 13, lineHeight: 1 }}>🌱</span>
          <input
            ref={composerInputRef}
            value={composer.title}
            onChange={(e) => setComposer((c) => (c ? { ...c, title: e.target.value } : c))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); saveComposer() }
              if (e.key === 'Escape') { e.preventDefault(); cancelComposer() }
            }}
            onBlur={() => { saveComposer() }}
            placeholder={composer.mode === 'edit' ? '습관 이름' : '예: 물 8잔 마시기'}
            className="flex-1 min-w-0 bg-transparent outline-none"
            style={{
              fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)',
              letterSpacing: '-0.2px',
            }}
          />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={saveComposer}
            className="shrink-0 hover:scale-110"
            style={{
              width: 20, height: 20, borderRadius: 6,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${ACCENT}, #C2410C)`, color: '#fff',
              boxShadow: '0 2px 6px rgba(249,115,22,0.32)', cursor: 'pointer',
            }}
            title={composer.mode === 'edit' ? '저장 (Enter)' : '추가 (Enter)'}
          ><Check size={11} strokeWidth={3} /></button>
        </div>
      )}

      {/* 본문 리스트 */}
      <div className="flex-1 overflow-y-auto" style={{ marginTop: 6 }}>
        {items.map((h) => (
          <HabitRow
            key={h.id}
            habit={h}
            isDeleting={confirmDeleteId === h.id}
            onToggle={() => handleToggle(h)}
            onEdit={() => openEdit(h)}
            onDeleteRequest={() => setConfirmDeleteId(h.id)}
            onDeleteCancel={() => setConfirmDeleteId(null)}
            onDeleteConfirm={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}

function HabitRow({
  habit, isDeleting, onToggle, onEdit, onDeleteRequest, onDeleteCancel, onDeleteConfirm,
}: {
  habit: HabitWithStats
  isDeleting: boolean
  onToggle: () => void
  onEdit: () => void
  onDeleteRequest: () => void
  onDeleteCancel: () => void
  onDeleteConfirm: () => void
}): React.ReactElement {
  // 삭제 확인 인라인 — 행 자체가 빨간 톤 + ✕취소 / ✓삭제 으로 전환
  if (isDeleting) {
    return (
      <div
        className="flex items-center"
        style={{
          gap: 6, padding: '6px 8px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)',
          border: '1.5px dashed rgba(239,68,68,0.45)',
        }}
      >
        <Trash2 size={12} strokeWidth={2.6} style={{ color: '#DC2626', flexShrink: 0 }} />
        <span className="flex-1 min-w-0 truncate" style={{ fontSize: 12, fontWeight: 700, color: '#B91C1C', letterSpacing: '-0.2px' }}>
          삭제할까요? <b>{habit.title}</b>
        </span>
        <button
          onClick={onDeleteCancel}
          className="shrink-0 hover:scale-110"
          style={{
            width: 20, height: 20, borderRadius: 6,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-widget)', cursor: 'pointer',
          }}
          title="취소"
        ><XIcon size={11} strokeWidth={2.8} /></button>
        <button
          onClick={onDeleteConfirm}
          className="shrink-0 hover:scale-110"
          style={{
            width: 20, height: 20, borderRadius: 6,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #EF4444, #B91C1C)', color: '#fff',
            boxShadow: '0 2px 6px rgba(239,68,68,0.35)', cursor: 'pointer',
          }}
          title="삭제"
        ><Check size={11} strokeWidth={3} /></button>
      </div>
    )
  }

  return (
    <div
      className="group flex items-center"
      style={{
        gap: 8,
        padding: '6px 6px',
        borderRadius: 8,
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <button
        onClick={onToggle}
        className="shrink-0 transition-all hover:scale-110"
        style={{
          width: 22, height: 22, borderRadius: 7,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: habit.today_done
            ? `linear-gradient(135deg, ${ACCENT} 0%, #C2410C 100%)`
            : 'transparent',
          border: habit.today_done ? 'none' : '1.8px solid var(--text-muted)',
          color: '#fff',
          boxShadow: habit.today_done ? '0 3px 8px rgba(249,115,22,0.38)' : 'none',
          cursor: 'pointer',
        }}
        title={habit.today_done ? '오늘 체크 해제' : '오늘 ✓'}
      >
        {habit.today_done && <Check size={14} strokeWidth={3.2} />}
      </button>

      <button
        onClick={onToggle}
        className="flex-1 min-w-0 text-left flex items-center gap-1.5"
        style={{ cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
        title={habit.title}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }}>{habit.icon ?? '🌱'}</span>
        <span
          className="truncate"
          style={{
            fontSize: 12.5,
            fontWeight: habit.today_done ? 600 : 700,
            color: habit.today_done ? '#6B5841' : 'var(--text-primary)',
            opacity: habit.today_done ? 0.85 : 1,
            letterSpacing: '-0.2px',
          }}
        >
          {habit.title}
        </span>
      </button>

      <span
        className="inline-flex items-center gap-0.5 tabular-nums shrink-0"
        style={{
          fontSize: 9.5, fontWeight: 800,
          padding: '2px 6px', borderRadius: 999,
          background: habit.streak_current > 0
            ? 'linear-gradient(135deg, rgba(249,115,22,0.16) 0%, rgba(249,115,22,0.28) 100%)'
            : 'rgba(15,23,42,0.06)',
          color: habit.streak_current > 0 ? '#9A3412' : 'var(--text-muted)',
          border: habit.streak_current > 0 ? '1px solid rgba(249,115,22,0.28)' : '1px solid var(--border-widget)',
          letterSpacing: '-0.2px',
          whiteSpace: 'nowrap',
        }}
        title={`연속 ${habit.streak_current}일 · 누적 ${habit.total_days}일 · 최장 ${habit.streak_longest}일`}
      >
        <Flame size={8} strokeWidth={2.8} />
        {habit.streak_current}일
      </span>

      <div className="shrink-0 flex items-center gap-0.5">
        <button
          onClick={onEdit}
          className="hover:scale-110"
          style={{
            width: 18, height: 18, borderRadius: 5,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
          }}
          title="이름 편집"
        ><Pencil size={10} strokeWidth={2.6} /></button>
        <button
          onClick={onDeleteRequest}
          className="hover:scale-110 hover:bg-red-500/10 hover:text-red-600"
          style={{
            width: 18, height: 18, borderRadius: 5,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
          }}
          title="삭제"
        ><Trash2 size={10} strokeWidth={2.6} /></button>
      </div>
    </div>
  )
}
