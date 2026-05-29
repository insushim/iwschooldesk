import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Trash2, Flame, Check, Pencil } from 'lucide-react'
import type { Habit, HabitStats } from '../../types/habit.types'
import { cn } from '../../lib/utils'

const ACCENT = '#F97316'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function ymdAddDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 습관 관리 대시보드.
 *  좌측: 습관 리스트
 *  우측: 큰 stats(streak/누적/최장) + 90일 contribution graph (GitHub 스타일) */
export function HabitManager(): React.ReactElement {
  const [habits, setHabits] = useState<Habit[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [stats, setStats] = useState<HabitStats | null>(null)
  const [completions, setCompletions] = useState<{ date: string }[]>([])

  const [newTitle, setNewTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const today = todayStr()
  // 90일 = 약 13주. GitHub 스타일 7x13 그리드.
  const days90 = useMemo(() => {
    const arr: string[] = []
    for (let i = 89; i >= 0; i--) arr.push(ymdAddDays(today, -i))
    return arr
  }, [today])

  const reloadHabits = useCallback(() => {
    window.api.habit.list().then((rs) => {
      setHabits(rs)
      setSelectedId((cur) => cur ?? rs[0]?.id ?? null)
    })
  }, [])
  useEffect(() => { reloadHabits() }, [reloadHabits])

  useEffect(() => {
    if (!selectedId) { setStats(null); setCompletions([]); return }
    window.api.habit.stats(selectedId, today).then(setStats)
    window.api.habit.completionsInRange(selectedId, days90[0], today).then(setCompletions)
  }, [selectedId, today, days90])

  const reloadDetails = useCallback(async () => {
    if (!selectedId) return
    const [s, comps] = await Promise.all([
      window.api.habit.stats(selectedId, today),
      window.api.habit.completionsInRange(selectedId, days90[0], today),
    ])
    setStats(s)
    setCompletions(comps)
  }, [selectedId, today, days90])

  const selected = habits.find((h) => h.id === selectedId) ?? null
  const doneSet = useMemo(() => new Set(completions.map((c) => c.date)), [completions])

  const addHabit = async () => {
    const t = newTitle.trim()
    if (!t) return
    const r = await window.api.habit.create({ title: t })
    setNewTitle('')
    setHabits((prev) => [...prev, r])
    setSelectedId(r.id)
  }
  const deleteHabit = async (id: string) => {
    if (!confirm('이 습관과 모든 체크 기록을 삭제할까요?')) return
    await window.api.habit.delete(id)
    setHabits((prev) => prev.filter((h) => h.id !== id))
    if (selectedId === id) setSelectedId(null)
  }
  const saveTitle = async () => {
    if (!editingId) return
    const t = editDraft.trim()
    if (t) await window.api.habit.update(editingId, { title: t })
    setEditingId(null)
    reloadHabits()
  }
  const toggleToday = async () => {
    if (!selectedId) return
    await window.api.habit.toggleToday(selectedId, today)
    reloadDetails()
  }

  // 최근 3개월 달력 — 월별 미니 캘린더 (일~토 7열)
  const months = useMemo(() => {
    const todayD = new Date(today + 'T00:00:00')
    const result: { year: number; month: number; cells: ({ day: number; date: string; done: boolean; isToday: boolean } | null)[] }[] = []
    for (let i = 2; i >= 0; i--) {
      const target = new Date(todayD.getFullYear(), todayD.getMonth() - i, 1)
      const year = target.getFullYear()
      const monthIdx = target.getMonth()
      const firstDow = target.getDay()
      const lastDay = new Date(year, monthIdx + 1, 0).getDate()
      const cells: ({ day: number; date: string; done: boolean; isToday: boolean } | null)[] = []
      for (let p = 0; p < firstDow; p++) cells.push(null)
      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        cells.push({ day: d, date: dateStr, done: doneSet.has(dateStr), isToday: dateStr === today })
      }
      result.push({ year, month: monthIdx + 1, cells })
    }
    return result
  }, [today, doneSet])

  return (
    <div className="flex h-full overflow-hidden">
      {/* 좌측 — 습관 리스트 */}
      <div className="shrink-0 flex flex-col" style={{ width: 280, borderRight: '1px solid var(--border-widget)', padding: 16 }}>
        <div className="flex items-center gap-2 mb-3">
          <Flame size={16} strokeWidth={2.4} style={{ color: ACCENT }} />
          <h2 className="font-bold text-[var(--text-primary)]" style={{ fontSize: 14 }}>습관 목록</h2>
        </div>
        <div className="flex gap-1.5 mb-3">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addHabit() }}
            placeholder="새 습관 (예: 물 8잔)"
            className="flex-1 h-8 rounded-md border border-[var(--border-widget)] bg-[var(--bg-widget)] px-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button
            onClick={addHabit}
            disabled={!newTitle.trim()}
            className="shrink-0 rounded-md disabled:opacity-30 hover:scale-105 transition-transform"
            style={{
              width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${ACCENT}, #C2410C)`, color: '#fff',
              boxShadow: '0 2px 6px rgba(249,115,22,0.3)',
            }}
          ><Plus size={14} strokeWidth={2.6} /></button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {habits.length === 0 && (
            <div className="text-xs text-[var(--text-muted)] p-3 text-center">습관이 없습니다</div>
          )}
          {habits.map((h) => {
            const active = h.id === selectedId
            const isEditing = editingId === h.id
            return (
              <div
                key={h.id}
                onClick={() => setSelectedId(h.id)}
                className={cn(
                  'group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors',
                  active ? 'bg-orange-500/10' : 'hover:bg-[var(--bg-secondary)]',
                )}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>{h.icon}</span>
                {isEditing ? (
                  <input
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); saveTitle() }
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-semibold text-[var(--text-primary)]"
                  />
                ) : (
                  <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: 'var(--text-primary)' }}>
                    {h.title}
                  </span>
                )}
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingId(h.id); setEditDraft(h.title) }}
                    className="p-1 rounded hover:bg-orange-500/10 text-[var(--text-muted)]"
                    style={{ color: 'var(--text-muted)' }}
                    title="이름 수정"
                  ><Pencil size={11} strokeWidth={2.4} /></button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteHabit(h.id) }}
                    className="p-1 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-600"
                    title="삭제"
                  ><Trash2 size={11} strokeWidth={2.4} /></button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 우측 — 디테일 */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ padding: 20 }}>
        {!selected || !stats ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-[var(--text-muted)]">
            <Flame size={40} strokeWidth={1.2} className="opacity-25" />
            <p className="text-sm">왼쪽에서 습관을 선택하거나 새로 추가하세요</p>
          </div>
        ) : (
          <>
            {/* 헤더 — 제목 + 오늘 토글 큰 버튼 */}
            <div className="shrink-0 mb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span style={{ fontSize: 24, lineHeight: 1 }}>{selected.icon}</span>
                <h1 className="font-bold text-[var(--text-primary)] truncate" style={{ fontSize: 22, letterSpacing: '-0.3px' }}>
                  {selected.title}
                </h1>
              </div>
              <button
                onClick={toggleToday}
                className="shrink-0 hover:scale-105 transition-transform"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', borderRadius: 999,
                  background: stats.today_done
                    ? `linear-gradient(135deg, ${ACCENT} 0%, #C2410C 100%)`
                    : 'var(--bg-secondary)',
                  color: stats.today_done ? '#fff' : 'var(--text-secondary)',
                  border: stats.today_done ? 'none' : '1.5px dashed rgba(249,115,22,0.45)',
                  boxShadow: stats.today_done ? '0 6px 20px rgba(249,115,22,0.35)' : 'none',
                  fontWeight: 900, fontSize: 13, letterSpacing: '-0.2px',
                  cursor: 'pointer',
                }}
              >
                <Check size={15} strokeWidth={3} />
                {stats.today_done ? '오늘 완료' : '오늘 ✓'}
              </button>
            </div>

            {/* 큰 stats 카드 — streak / 누적 / 최장 + 이번 주 / 이번 달 (5칸 그리드, 큰 화면 활용) */}
            {(() => {
              const todayD = new Date()
              const ymPrefix = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, '0')}`
              const thisMonthCount = Array.from(doneSet).filter((d) => d.startsWith(ymPrefix)).length
              const monthDays = new Date(todayD.getFullYear(), todayD.getMonth() + 1, 0).getDate()
              // 이번 주 = 일~토 7일 중 doneSet 포함 일수
              const weekDates: string[] = []
              const sunday = new Date(todayD); sunday.setDate(todayD.getDate() - todayD.getDay())
              for (let i = 0; i < 7; i++) {
                const d = new Date(sunday); d.setDate(sunday.getDate() + i)
                weekDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
              }
              const thisWeekCount = weekDates.filter((d) => doneSet.has(d)).length
              return (
                <div className="shrink-0 grid grid-cols-5 gap-3 mb-6">
                  <BigStat label="현재 연속" value={stats.streak_current} suffix="일째" accent={ACCENT} icon={<Flame size={18} strokeWidth={2.4} style={{ color: ACCENT }} />} />
                  <BigStat label="역대 최장" value={stats.streak_longest} suffix="일" accent={ACCENT} />
                  <BigStat label="이번 주" value={thisWeekCount} suffix="/7일" accent={ACCENT} />
                  <BigStat label={`이번 달 (${monthDays}일 중)`} value={thisMonthCount} suffix="일" accent={ACCENT} />
                  <BigStat label="누적 체크" value={stats.total_days} suffix="일" accent={ACCENT} />
                </div>
              )
            })()}

            {/* 월별 달력 — 최근 3개월 */}
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-bold text-[var(--text-primary)]" style={{ fontSize: 13 }}>
                  최근 3개월
                </h3>
                <span className="text-xs text-[var(--text-muted)]" style={{ fontWeight: 600 }}>
                  · {stats.total_days > 0 ? `완수율 ${Math.round((doneSet.size / 90) * 100)}%` : '데이터 없음'}
                </span>
                <span className="ml-auto text-[10px] text-[var(--text-muted)]" style={{ fontWeight: 700 }}>
                  시작일: {selected.start_date}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                {months.map((m) => (
                  <div
                    key={`${m.year}-${m.month}`}
                    className="rounded-xl"
                    style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-widget)', padding: 12 }}
                  >
                    <div className="font-bold mb-2" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                      {m.year}년 {m.month}월
                    </div>
                    <div className="grid grid-cols-7 gap-1 mb-1" style={{ fontSize: 10, fontWeight: 800, textAlign: 'center' }}>
                      {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                        <div
                          key={d}
                          style={{ color: i === 0 ? '#EF4444' : i === 6 ? '#3B82F6' : 'var(--text-muted)' }}
                        >{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {m.cells.map((cell, idx) => {
                        if (!cell) return <span key={idx} />
                        return (
                          <span
                            key={idx}
                            title={`${cell.date}${cell.done ? ' ✓' : ''}`}
                            style={{
                              aspectRatio: '1/1',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              borderRadius: 5,
                              fontSize: 11, fontWeight: cell.done ? 800 : 600,
                              color: cell.done ? '#fff' : 'var(--text-secondary)',
                              background: cell.done
                                ? `linear-gradient(135deg, ${ACCENT}, #C2410C)`
                                : 'rgba(15,23,42,0.04)',
                              outline: cell.isToday ? `1.5px solid ${ACCENT}` : undefined,
                              outlineOffset: -1,
                            }}
                          >{cell.day}</span>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function BigStat({ label, value, suffix, accent, icon }: {
  label: string; value: number; suffix: string; accent: string; icon?: React.ReactNode
}): React.ReactElement {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-widget)' }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
        {icon}{label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="tabular-nums font-black" style={{ fontSize: 36, color: accent, letterSpacing: '-0.04em', lineHeight: 1 }}>
          {value}
        </span>
        <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>{suffix}</span>
      </div>
    </div>
  )
}
