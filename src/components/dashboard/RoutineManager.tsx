import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Trash2, Repeat, Flame, Check, Pencil, X as XIcon } from 'lucide-react'
import type { Routine, RoutineItemWithStatus, RoutineKind } from '../../types/routine.types'
import { cn } from '../../lib/utils'

const ACCENT = '#8B5CF6'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
function ymdAddDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 루틴 관리 대시보드.
 *  좌측: 루틴 리스트 (선택)
 *  우측: 선택 루틴의 항목 관리 + 30일 히트맵 + 통계
 *
 *  kind prop으로 personal(개인 루틴) / classroom(학급 체크) 분기.
 *  사이드바에서 '루틴' 메뉴는 personal, '학급 체크' 메뉴는 classroom 으로 들어옴.
 */
export function RoutineManager({ kind = 'personal' }: { kind?: RoutineKind } = {}): React.ReactElement {
  const isClassroom = kind === 'classroom'
  const labels = isClassroom
    ? { plural: '학급 체크', singular: '체크', placeholder: '새 학급 체크 (예: 아침 출석)', itemPlaceholder: '새 학생/항목 (예: 김민준)' }
    : { plural: '루틴', singular: '루틴', placeholder: '새 루틴 (예: 양치 한 사람)', itemPlaceholder: '새 항목 (예: 책상 정리)' }

  const [routines, setRoutines] = useState<Routine[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<RoutineItemWithStatus[]>([])
  // 30일 히트맵: 각 (item_id, date) → done?
  const [completions, setCompletions] = useState<Array<{ item_id: string; date: string }>>([])

  const [newRoutineTitle, setNewRoutineTitle] = useState('')
  const [newItemContent, setNewItemContent] = useState('')
  const [editingRoutineTitle, setEditingRoutineTitle] = useState<string | null>(null)
  const [editTitleDraft, setEditTitleDraft] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editItemDraft, setEditItemDraft] = useState('')

  const today = todayStr()
  const days30 = useMemo(() => {
    const arr: string[] = []
    for (let i = 29; i >= 0; i--) arr.push(ymdAddDays(today, -i))
    return arr
  }, [today])

  const reloadRoutines = useCallback(() => {
    window.api.routine.list(kind).then((rs) => {
      setRoutines(rs)
      setSelectedId((cur) => cur ?? rs[0]?.id ?? null)
    })
  }, [kind])
  useEffect(() => {
    // kind 변경 시 선택 초기화 + 재로드
    setSelectedId(null)
    reloadRoutines()
  }, [kind, reloadRoutines])

  // 선택 변경 시 items + 30일 completions 재조회
  useEffect(() => {
    if (!selectedId) { setItems([]); setCompletions([]); return }
    window.api.routine.getItems(selectedId, today).then(setItems)
    window.api.routine.completionsInRange(selectedId, days30[0], today).then(setCompletions)
  }, [selectedId, today, days30])

  const reloadDetails = useCallback(async () => {
    if (!selectedId) return
    const [it, comps] = await Promise.all([
      window.api.routine.getItems(selectedId, today),
      window.api.routine.completionsInRange(selectedId, days30[0], today),
    ])
    setItems(it)
    setCompletions(comps)
  }, [selectedId, today, days30])

  const selected = routines.find((r) => r.id === selectedId) ?? null

  // 통계
  const totalCompletions = completions.length
  const bestItem = useMemo(() => {
    if (items.length === 0) return null
    const sorted = [...items].sort((a, b) => (b.completion_count ?? 0) - (a.completion_count ?? 0))
    return sorted[0]
  }, [items])
  const perItemCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of completions) map.set(c.item_id, (map.get(c.item_id) ?? 0) + 1)
    return map
  }, [completions])

  // 루틴 추가/삭제/이름수정
  const addRoutine = async () => {
    const t = newRoutineTitle.trim()
    if (!t) return
    const r = await window.api.routine.create({ title: t, kind })
    setNewRoutineTitle('')
    setRoutines((prev) => [...prev, r])
    setSelectedId(r.id)
  }
  const deleteRoutine = async (id: string) => {
    if (!confirm('이 루틴과 모든 항목/체크 기록을 삭제할까요?')) return
    await window.api.routine.delete(id)
    setRoutines((prev) => prev.filter((r) => r.id !== id))
    if (selectedId === id) setSelectedId(null)
  }
  const saveRoutineTitle = async () => {
    if (!editingRoutineTitle) return
    const t = editTitleDraft.trim()
    if (t) await window.api.routine.update(editingRoutineTitle, { title: t })
    setEditingRoutineTitle(null)
    reloadRoutines()
  }

  // 항목 추가/삭제/수정/체크
  const addItem = async () => {
    if (!selectedId) return
    const c = newItemContent.trim()
    if (!c) return
    await window.api.routine.addItem({ routine_id: selectedId, content: c })
    setNewItemContent('')
    reloadDetails()
  }
  const deleteItem = async (id: string) => {
    await window.api.routine.deleteItem(id)
    reloadDetails()
  }
  const saveItem = async () => {
    if (!editingItemId) return
    const c = editItemDraft.trim()
    if (c) await window.api.routine.updateItem(editingItemId, c)
    setEditingItemId(null)
    reloadDetails()
  }
  const toggleItem = async (id: string) => {
    await window.api.routine.toggleCompletion(id, today)
    reloadDetails()
  }

  return (
    <div className="flex h-full overflow-hidden max-w-[1400px] mx-auto w-full">
      {/* 좌측 — 루틴 리스트 */}
      <div className="shrink-0 flex flex-col" style={{ width: 280, borderRight: '1px solid var(--border-widget)', padding: 16 }}>
        <div className="flex items-center gap-2 mb-3">
          <Repeat size={16} strokeWidth={2.4} style={{ color: ACCENT }} />
          <h2 className="font-bold text-[var(--text-primary)]" style={{ fontSize: 14 }}>{labels.plural} 목록</h2>
        </div>
        <div className="flex gap-1.5 mb-3">
          <input
            value={newRoutineTitle}
            onChange={(e) => setNewRoutineTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addRoutine() }}
            placeholder={labels.placeholder}
            className="flex-1 h-8 rounded-md border border-[var(--border-widget)] bg-[var(--bg-widget)] px-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button
            onClick={addRoutine}
            disabled={!newRoutineTitle.trim()}
            className="shrink-0 rounded-md disabled:opacity-30 hover:scale-105 transition-transform"
            style={{
              width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${ACCENT}, #6D28D9)`, color: '#fff',
              boxShadow: '0 2px 6px rgba(139,92,246,0.3)',
            }}
          ><Plus size={14} strokeWidth={2.6} /></button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {routines.length === 0 && (
            <div className="text-xs text-[var(--text-muted)] p-3 text-center">루틴이 없습니다</div>
          )}
          {routines.map((r) => {
            const active = r.id === selectedId
            const isEditing = editingRoutineTitle === r.id
            return (
              <div
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  'group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors',
                  active ? 'bg-[var(--accent-light)]' : 'hover:bg-[var(--bg-secondary)]',
                )}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>{r.icon}</span>
                {isEditing ? (
                  <input
                    autoFocus
                    value={editTitleDraft}
                    onChange={(e) => setEditTitleDraft(e.target.value)}
                    onBlur={saveRoutineTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); saveRoutineTitle() }
                      if (e.key === 'Escape') setEditingRoutineTitle(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-semibold text-[var(--text-primary)]"
                  />
                ) : (
                  <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: 'var(--text-primary)' }}>
                    {r.title}
                  </span>
                )}
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingRoutineTitle(r.id); setEditTitleDraft(r.title) }}
                    className="p-1 rounded hover:bg-[var(--accent-light)] text-[var(--text-muted)] hover:text-[var(--accent)]"
                    title="이름 수정"
                  ><Pencil size={11} strokeWidth={2.4} /></button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteRoutine(r.id) }}
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
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-[var(--text-muted)]">
            <Repeat size={40} strokeWidth={1.2} className="opacity-25" />
            <p className="text-sm">왼쪽에서 루틴을 선택하거나 새로 추가하세요</p>
          </div>
        ) : (
          <>
            {/* 헤더 — 제목 + 통계 카드들 */}
            <div className="shrink-0 mb-5">
              <div className="flex items-center gap-3 mb-4">
                <span style={{ fontSize: 24, lineHeight: 1 }}>{selected.icon}</span>
                <h1 className="font-bold text-[var(--text-primary)]" style={{ fontSize: 22, letterSpacing: '-0.3px' }}>
                  {selected.title}
                </h1>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="항목 수" value={items.length} accent={ACCENT} />
                <StatCard label="30일 체크" value={totalCompletions} accent={ACCENT} />
                <StatCard label="가장 잘 지킨 항목" value={bestItem?.content?.slice(0, 8) ?? '—'} accent={ACCENT} isText />
                <StatCard label="시작일" value={selected.start_date} accent={ACCENT} isText />
              </div>
            </div>

            {/* 항목 리스트 + 30일 히트맵 한 그리드 */}
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center gap-2 mb-2">
                <Flame size={14} strokeWidth={2.4} style={{ color: ACCENT }} />
                <h3 className="font-bold text-[var(--text-primary)]" style={{ fontSize: 13 }}>
                  항목 · 30일 히트맵
                </h3>
              </div>

              {/* 항목 추가 */}
              <div className="flex gap-1.5 mb-3">
                <input
                  value={newItemContent}
                  onChange={(e) => setNewItemContent(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addItem() }}
                  placeholder={labels.itemPlaceholder}
                  className="flex-1 h-9 rounded-md border border-[var(--border-widget)] bg-[var(--bg-widget)] px-3 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <button
                  onClick={addItem}
                  disabled={!newItemContent.trim()}
                  className="shrink-0 rounded-md disabled:opacity-30 hover:scale-105 transition-transform px-3"
                  style={{
                    height: 36, display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: `linear-gradient(135deg, ${ACCENT}, #6D28D9)`, color: '#fff',
                    fontSize: 12, fontWeight: 800,
                    boxShadow: '0 2px 6px rgba(139,92,246,0.3)',
                  }}
                ><Plus size={13} strokeWidth={2.6} /> 항목 추가</button>
              </div>

              {items.length === 0 ? (
                <div className="text-sm text-[var(--text-muted)] py-8 text-center">아직 항목이 없어요</div>
              ) : (
                <div className="rounded-lg border border-[var(--border-widget)] overflow-hidden">
                  {/* 헤더: 날짜 축 */}
                  <div className="flex items-center" style={{ background: 'var(--bg-secondary)', padding: '8px 12px', borderBottom: '1px solid var(--border-widget)' }}>
                    <div style={{ width: 240, fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>항목</div>
                    <div className="flex-1 flex items-center gap-0.5 justify-end">
                      {days30.map((d, i) => (
                        <span
                          key={d}
                          title={d}
                          style={{
                            width: 12,
                            fontSize: 8,
                            fontWeight: 700,
                            color: d === today ? ACCENT : 'var(--text-muted)',
                            textAlign: 'center',
                            display: 'inline-block',
                          }}
                        >{i % 5 === 0 ? new Date(d).getDate() : ''}</span>
                      ))}
                    </div>
                    <div style={{ width: 56, textAlign: 'right', fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>30일</div>
                  </div>
                  {items.map((it) => {
                    const isEditing = editingItemId === it.id
                    const completedDates = new Set(completions.filter((c) => c.item_id === it.id).map((c) => c.date))
                    return (
                      <div
                        key={it.id}
                        className="group flex items-center hover:bg-[var(--bg-secondary)]/40"
                        style={{ padding: '6px 12px', borderTop: '1px solid var(--border-widget)' }}
                      >
                        <button
                          onClick={() => toggleItem(it.id)}
                          className="shrink-0 mr-2 hover:scale-110 transition-transform"
                          style={{
                            width: 18, height: 18, borderRadius: 5,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: it.is_completed ? `linear-gradient(135deg, ${ACCENT}, #6D28D9)` : 'transparent',
                            border: it.is_completed ? 'none' : '1.6px solid var(--text-muted)',
                            color: '#fff', cursor: 'pointer',
                          }}
                          title="오늘 체크"
                        >{it.is_completed ? <Check size={11} strokeWidth={3} /> : null}</button>
                        <div style={{ width: 220, minWidth: 0 }}>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                value={editItemDraft}
                                onChange={(e) => setEditItemDraft(e.target.value)}
                                onBlur={saveItem}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); saveItem() }
                                  if (e.key === 'Escape') setEditingItemId(null)
                                }}
                                className="flex-1 min-w-0 h-6 bg-transparent outline-none text-sm font-semibold text-[var(--text-primary)] border-b border-[var(--accent)]"
                              />
                            </div>
                          ) : (
                            <span className="text-sm font-semibold text-[var(--text-primary)] truncate block" title={it.content}>
                              {it.content}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 flex items-center gap-0.5 justify-end">
                          {days30.map((d) => {
                            const done = completedDates.has(d)
                            const isToday = d === today
                            return (
                              <span
                                key={d}
                                title={`${d}${done ? ' ✓' : ''}`}
                                style={{
                                  width: 12, height: 12, borderRadius: 3,
                                  display: 'inline-block',
                                  background: done ? `linear-gradient(135deg, ${ACCENT}, #6D28D9)` : 'rgba(15,23,42,0.08)',
                                  outline: isToday ? `1.2px solid ${ACCENT}` : 'none',
                                }}
                              />
                            )
                          })}
                        </div>
                        <div style={{ width: 56, textAlign: 'right' }}>
                          <span className="tabular-nums text-xs font-bold" style={{ color: ACCENT }}>
                            {perItemCount.get(it.id) ?? 0}
                          </span>
                        </div>
                        <div className="shrink-0 ml-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingItemId(it.id); setEditItemDraft(it.content) }}
                            className="p-1 rounded hover:bg-[var(--accent-light)] text-[var(--text-muted)] hover:text-[var(--accent)]"
                            title="이름 수정"
                          ><Pencil size={11} strokeWidth={2.4} /></button>
                          <button
                            onClick={() => deleteItem(it.id)}
                            className="p-1 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-600"
                            title="삭제"
                          ><Trash2 size={11} strokeWidth={2.4} /></button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, accent, isText }: { label: string; value: string | number; accent: string; isText?: boolean }): React.ReactElement {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg-widget)', border: '1px solid var(--border-widget)' }}>
      <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="font-black" style={{ fontSize: isText ? 14 : 24, color: accent, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  )
}
