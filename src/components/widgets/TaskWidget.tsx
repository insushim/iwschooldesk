import { useState, useEffect, useMemo } from 'react'
import { Plus, Check, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Task } from '../../types/task.types'
import { PRIORITY_COLORS } from '../../types/task.types'
import { getDDayText, formatDate } from '../../lib/date-utils'
import { useDataChange } from '../../hooks/useDataChange'

type FilterType = 'all' | 'today' | 'week' | 'overdue'

const FILTERS: { key: FilterType; label: string; color: string }[] = [
  { key: 'all',     label: '전체',   color: 'var(--text-secondary)' },
  { key: 'today',   label: '오늘',   color: '#2563EB' },
  { key: 'week',    label: '이번주', color: '#10B981' },
  { key: 'overdue', label: '지남',   color: '#EF4444' },
]

export function TaskWidget() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<FilterType>('today')
  const [newTitle, setNewTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const loadTasks = async () => {
    const data = await window.api.task.list()
    setTasks(data.filter((t) => t.status !== 'archived'))
  }

  useEffect(() => { loadTasks() }, [])
  useDataChange('task', loadTasks)

  // 각 필터별 활성 할일 수 (완료 제외)
  const counts = useMemo(() => {
    const today = formatDate(new Date(), 'yyyy-MM-dd')
    const weekEnd = new Date()
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndStr = formatDate(weekEnd, 'yyyy-MM-dd')
    const active = tasks.filter((t) => !t.is_completed)
    return {
      all: active.length,
      today: active.filter((t) => t.due_date === today || !t.due_date).length,
      week: active.filter((t) => !t.due_date || (t.due_date >= today && t.due_date <= weekEndStr)).length,
      overdue: active.filter((t) => t.due_date !== null && t.due_date < today).length,
    }
  }, [tasks])

  const filteredTasks = useMemo(() => {
    const today = formatDate(new Date(), 'yyyy-MM-dd')
    const weekEnd = new Date()
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndStr = formatDate(weekEnd, 'yyyy-MM-dd')
    return tasks.filter((t) => {
      if (t.is_completed) return false
      switch (filter) {
        case 'today':   return t.due_date === today || !t.due_date
        case 'week':    return !t.due_date || (t.due_date >= today && t.due_date <= weekEndStr)
        case 'overdue': return t.due_date !== null && t.due_date < today
        default:        return true
      }
    }).sort((a, b) => b.priority - a.priority)
  }, [tasks, filter])

  const handleAdd = async () => {
    if (!newTitle.trim()) return
    await window.api.task.create({ title: newTitle.trim() })
    setNewTitle('')
    loadTasks()
  }

  const handleToggle = async (task: Task) => {
    await window.api.task.update(task.id, {
      is_completed: task.is_completed ? 0 : 1,
      status: task.is_completed ? 'todo' : 'done',
    })
    loadTasks()
  }

  const startEdit = (task: Task) => {
    setEditingId(task.id)
    setEditingTitle(task.title)
  }

  const commitEdit = async () => {
    if (!editingId) return
    const trimmed = editingTitle.trim()
    if (trimmed) {
      await window.api.task.update(editingId, { title: trimmed })
      loadTasks()
    }
    setEditingId(null)
    setEditingTitle('')
  }

  return (
    // 위젯 shell의 radius(22px)가 네 모서리 22x22 영역을 클립하므로
    // 본문 좌/우/하 padding을 inline으로 충분히 키워 모든 자식이 곡선 바깥에 위치.
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        padding: '14px 26px 28px 26px',
        background: 'radial-gradient(ellipse at 0% 0%, rgba(37,99,235,0.05) 0%, transparent 55%)',
      }}
    >
      {/* Filter cards: 전체 · 오늘 · 이번주 · 지남 — 그라디언트 active state */}
      <div className="grid grid-cols-4 gap-1.5 mb-3 shrink-0">
        {FILTERS.map((f) => {
          const active = filter === f.key
          const count = counts[f.key]
          const isOverdue = f.key === 'overdue'
          const emph = isOverdue && count > 0
          const primary = emph
            ? '#EF4444'
            : f.color === 'var(--text-secondary)' ? 'var(--accent)' : f.color
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="flex flex-col items-center justify-center transition-all hover:scale-[1.02] whitespace-nowrap"
              style={{
                padding: '7px 2px 8px',
                borderRadius: 12,
                border: active ? `1.5px solid ${primary}` : '1.5px solid transparent',
                background: active
                  ? (emph
                    ? 'linear-gradient(135deg, rgba(239,68,68,0.10), rgba(239,68,68,0.22))'
                    : `linear-gradient(135deg, ${f.color === 'var(--text-secondary)' ? 'rgba(37,99,235,0.08)' : f.color + '12'}, ${f.color === 'var(--text-secondary)' ? 'rgba(37,99,235,0.18)' : f.color + '2A'})`)
                  : 'var(--bg-secondary)',
                color: active ? primary : 'var(--text-secondary)',
                letterSpacing: '-0.3px',
                boxShadow: active ? `0 6px 14px ${primary}22` : 'none',
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, opacity: active ? 1 : 0.75 }}>
                {f.label}
              </span>
              <span
                className="tabular-nums"
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  lineHeight: 1.05,
                  marginTop: 1,
                  letterSpacing: '-0.03em',
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto space-y-0.5">
        <AnimatePresence>
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-1.5 text-[var(--text-muted)]">
              {filter === 'overdue' ? (
                <><Check size={18} strokeWidth={2.2} /><span className="text-xs">지난 할 일이 없어요</span></>
              ) : filter === 'today' ? (
                <><Check size={18} strokeWidth={2.2} /><span className="text-xs">오늘 할 일이 비어있어요</span></>
              ) : (
                <><AlertCircle size={18} strokeWidth={2.2} /><span className="text-xs">할 일이 없어요</span></>
              )}
            </div>
          ) : (
            filteredTasks.map((task) => {
              const pc = PRIORITY_COLORS[task.priority]
              return (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -60 }}
                  className="flex items-center gap-2.5 transition-all group relative"
                  style={{
                    padding: '9px 11px',
                    marginBottom: 4,
                    borderRadius: 12,
                    background: 'var(--bg-secondary)',
                    border: '1px solid transparent',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.border = `1px solid ${pc}33`
                    e.currentTarget.style.background = `linear-gradient(135deg, ${pc}0A 0%, ${pc}14 100%)`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.border = '1px solid transparent'
                    e.currentTarget.style.background = 'var(--bg-secondary)'
                  }}
                >
                  <button
                    onClick={() => handleToggle(task)}
                    className="flex items-center justify-center shrink-0 transition-all hover:scale-105"
                    style={{
                      // 학급체크와 동일한 네모진 체크박스 톤 — 22×22 + 7px radius
                      width: 22, height: 22,
                      borderRadius: 7,
                      border: task.is_completed ? 'none' : '1.8px solid var(--text-muted)',
                      background: task.is_completed
                        ? `linear-gradient(135deg, ${pc} 0%, ${pc}DD 100%)`
                        : 'transparent',
                      boxShadow: task.is_completed ? `0 3px 10px ${pc}55, inset 0 1px 0 rgba(255,255,255,0.28)` : 'none',
                    }}
                  >
                    {task.is_completed ? <Check size={14} className="text-white" strokeWidth={3.2} /> : null}
                  </button>

                  {/* 우선순위 dot — 높은 우선순위(3~4)만 명시적으로 표시 */}
                  {task.priority >= 3 && !task.is_completed && (
                    <span
                      aria-hidden
                      className="shrink-0"
                      style={{
                        width: 7, height: 7, borderRadius: 999,
                        backgroundColor: pc,
                        boxShadow: `0 0 0 2.5px ${pc}33`,
                      }}
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    {editingId === task.id ? (
                      <input
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit()
                          if (e.key === 'Escape') { setEditingId(null); setEditingTitle('') }
                        }}
                        className="w-full bg-[var(--bg-widget)] rounded px-2 py-0.5 outline-none text-[var(--text-primary)] border border-[var(--accent)]"
                        style={{ fontSize: 14, fontWeight: 700 }}
                      />
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          onDoubleClick={() => startEdit(task)}
                          title="더블클릭하여 수정"
                          className="cursor-text"
                          style={{
                            fontSize: 14,
                            letterSpacing: '-0.2px',
                            fontWeight: task.is_completed ? 500 : task.priority >= 3 ? 800 : 700,
                            lineHeight: 1.4,
                            color: task.is_completed ? 'var(--text-muted)' : 'var(--text-primary)',
                            textDecoration: task.is_completed ? 'line-through' : undefined,
                            opacity: task.is_completed ? 0.7 : 1,
                          }}
                        >
                          {task.title}
                        </span>
                        {task.due_date && (
                          <span
                            className="shrink-0 whitespace-nowrap tabular-nums"
                            style={{
                              fontSize: 10.5,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: `${pc}1A`,
                              color: pc,
                              fontWeight: 800,
                              letterSpacing: '-0.2px',
                              border: `1px solid ${pc}33`,
                            }}
                          >
                            {getDDayText(task.due_date)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>

      {/* Quick add */}
      <div className="mt-2 flex items-center gap-1 border-t border-[var(--border-widget)] pt-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="할 일 추가..."
          className="flex-1 min-w-0 text-xs bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        <button
          onClick={handleAdd}
          disabled={!newTitle.trim()}
          className="text-[var(--accent)] hover:bg-[var(--accent-light)] rounded p-1 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
