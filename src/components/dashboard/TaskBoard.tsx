import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Calendar,
  Trash2,
  CheckCircle2,
  Circle,
  Inbox,
  Settings2,
  RotateCcw,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { formatDate, formatRelative, parseISO } from '../../lib/date-utils'
import { TASK_CATEGORIES, CATEGORY_COLORS } from '../../lib/constants'
import { useTasks } from '../../hooks/useTasks'
import { useSections } from '../../hooks/useSections'
import { useUIStore } from '../../stores/ui.store'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { SectionManagerDialog } from './SectionManagerDialog'
import type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskCategory,
  CreateTaskInput,
} from '../../types/task.types'
import { PRIORITY_LABELS, PRIORITY_COLORS } from '../../types/task.types'

/** DB엔 JSON stringify된 배열("[]" 또는 '["a","b"]')로 저장되므로 파싱 */
function parseTaskTags(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    }
  } catch {/* 구 데이터(콤마 문자열) 호환 */}
  return raw.split(',').map((t) => t.trim()).filter(Boolean)
}

interface ColumnConfig {
  status: TaskStatus
  label: string
  icon: typeof Inbox
  emptyMessage: string
  headerColor: string
}

const COLUMNS: ColumnConfig[] = [
  {
    status: 'todo',
    label: '할일',
    icon: Circle,
    emptyMessage: '새로운 할일을 추가해보세요',
    headerColor: '#94A3B8',
  },
  {
    status: 'done',
    label: '완료',
    icon: CheckCircle2,
    emptyMessage: '완료된 업무가 없어요',
    headerColor: '#10B981',
  },
]

interface TaskFormState {
  title: string
  description: string
  priority: TaskPriority
  category: TaskCategory
  section_id: string | null
  due_date: string
  due_time: string
  tags: string
}

const defaultFormState = (): TaskFormState => ({
  title: '',
  description: '',
  priority: 2,
  category: '일반',
  section_id: null,
  due_date: '',
  due_time: '',
  tags: '',
})

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
}

export function TaskBoard() {
  const addToast = useUIStore((s) => s.addToast)
  const { tasks, loading, create, update, remove } = useTasks()
  const { sections } = useSections()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [form, setForm] = useState<TaskFormState>(defaultFormState())
  const [quickAddValue, setQuickAddValue] = useState('')
  const [activeSectionId, setActiveSectionId] = useState<string | 'all' | 'none'>('all')
  const [sectionMgrOpen, setSectionMgrOpen] = useState(false)

  const filteredTasks = useMemo(() => {
    const visible = tasks.filter((t) => t.status !== 'archived')
    if (activeSectionId === 'all') return visible
    if (activeSectionId === 'none') return visible.filter((t) => !t.section_id)
    return visible.filter((t) => t.section_id === activeSectionId)
  }, [tasks, activeSectionId])

  const getColumnTasks = useCallback(
    (status: TaskStatus): Task[] => {
      // '할일' 컬럼은 기존 in_progress 데이터까지 흡수 (2컬럼화 후방 호환).
      const match = (t: Task) =>
        status === 'todo'
          ? t.status === 'todo' || t.status === 'in_progress'
          : t.status === status
      return filteredTasks
        .filter(match)
        .sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority
          return a.sort_order - b.sort_order
        })
    },
    [filteredTasks]
  )

  const openCreateDialog = () => {
    setEditingTask(null)
    setForm(defaultFormState())
    setDialogOpen(true)
  }

  const openEditDialog = (task: Task) => {
    setEditingTask(task)
    setForm({
      title: task.title,
      description: task.description,
      priority: task.priority,
      category: task.category,
      section_id: task.section_id ?? null,
      due_date: task.due_date || '',
      due_time: task.due_time || '',
      tags: parseTaskTags(task.tags).join(', '),
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      addToast('warning', '업무 제목을 입력해주세요')
      return
    }

    const tagsArray = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const input: CreateTaskInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      priority: form.priority,
      category: form.category,
      section_id: form.section_id,
      due_date: form.due_date || null,
      due_time: form.due_time || null,
      tags: tagsArray.length > 0 ? tagsArray : undefined,
    }

    if (editingTask) {
      await update(editingTask.id, input)
      addToast('success', '업무가 수정되었어요')
    } else {
      await create(input)
      addToast('success', '업무가 추가되었어요')
    }
    setDialogOpen(false)
  }

  const handleDelete = async () => {
    if (!editingTask) return
    await remove(editingTask.id)
    addToast('success', '업무가 삭제되었어요')
    setDialogOpen(false)
  }

  const handleQuickAdd = async () => {
    const title = quickAddValue.trim()
    if (!title) return
    const section_id =
      activeSectionId === 'all' || activeSectionId === 'none' ? null : activeSectionId
    await create({ title, status: 'todo', priority: 2, category: '일반', section_id })
    setQuickAddValue('')
    addToast('success', '할일이 추가되었어요')
  }

  const handleQuickAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleQuickAdd()
    }
  }

  const changeStatus = async (task: Task, newStatus: TaskStatus) => {
    const updateData: { status: TaskStatus; is_completed?: number; completed_at?: string | null } = {
      status: newStatus,
    }
    if (newStatus === 'done') {
      updateData.is_completed = 1
      updateData.completed_at = new Date().toISOString()
    } else {
      updateData.is_completed = 0
      updateData.completed_at = null
    }
    await update(task.id, updateData)
  }

  const updateForm = <K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 pr-10 pt-5 pb-6">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">업무 관리</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={() => setSectionMgrOpen(true)}
            style={{
              borderColor: 'rgba(15,23,42,0.12)',
              paddingLeft: '22px',
              paddingRight: '22px',
              height: '42px',
            }}
          >
            <Settings2 size={14} />
            섹션 관리
          </Button>
          <Button
            size="md"
            onClick={openCreateDialog}
            style={{
              paddingLeft: '24px',
              paddingRight: '24px',
              height: '42px',
            }}
          >
            <Plus size={16} />
            새 업무
          </Button>
        </div>
      </div>

      {/* 섹션 탭 — 모든 섹션 표시. 카운트 0은 흐리게 표현하되 클릭해서 진입 가능 */}
      {(() => {
        const visibleTasks = tasks.filter((t) => t.status !== 'archived')
        const noneCount = visibleTasks.filter((t) => !t.section_id).length
        const sectionedCount = visibleTasks.length - noneCount
        // "섹션 없음"은 섹션 분류된 task가 있을 때만 의미(없으면 전체와 중복)
        const showNone = sectionedCount > 0 || activeSectionId === 'none'
        const tabs = [
          { id: 'all' as const, name: '전체', color: 'var(--accent)', icon: '', count: visibleTasks.length },
          ...sections.map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            icon: s.icon,
            count: visibleTasks.filter((t) => t.section_id === s.id).length,
          })),
          ...(showNone ? [{ id: 'none' as const, name: '섹션 없음', color: '#94A3B8', icon: '', count: noneCount }] : []),
        ]

        return (
          <div className="flex items-center gap-1.5 px-6 pt-3 pb-4 overflow-x-auto">
            {tabs.map((tab) => {
              const active = activeSectionId === tab.id
              const isEmpty = tab.count === 0 && !active
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSectionId(tab.id)}
                  style={{
                    paddingLeft: '14px',
                    paddingRight: '14px',
                    paddingTop: '7px',
                    paddingBottom: '7px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: active ? tab.color : 'rgba(15,23,42,0.08)',
                    backgroundColor: active ? tab.color : 'var(--bg-secondary)',
                    color: active ? '#fff' : 'var(--text-primary)',
                    opacity: isEmpty ? 0.55 : 1,
                  }}
                  className="font-medium transition-all whitespace-nowrap hover:opacity-100 flex items-center gap-1.5"
                >
                  {tab.icon && <span className="text-sm">{tab.icon}</span>}
                  <span>{tab.name}</span>
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{
                      color: active ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)',
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })()}

      {/* 칸반 보드 */}
      <div className="flex-1 flex gap-4 px-6 pb-5 overflow-hidden">
        {COLUMNS.map((col) => {
          const Icon = col.icon
          const columnTasks = getColumnTasks(col.status)

          return (
            <div key={col.status} className="flex-1 flex flex-col glass overflow-hidden">
              {/* 컬럼 헤더 */}
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                <Icon size={16} style={{ color: col.headerColor }} />
                <span className="text-sm font-semibold text-[var(--text-primary)]">{col.label}</span>
                <span
                  className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${col.headerColor}20`,
                    color: col.headerColor,
                  }}
                >
                  {columnTasks.length}
                </span>
              </div>

              {/* 할일 컬럼 상단 Quick Add */}
              {col.status === 'todo' && (
                <div className="mx-3 mb-2">
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-widget)] focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:border-transparent transition-all">
                    <Plus size={15} className="text-[var(--text-muted)] shrink-0" />
                    <input
                      value={quickAddValue}
                      onChange={(e) => setQuickAddValue(e.target.value)}
                      onKeyDown={handleQuickAddKeyDown}
                      placeholder="할일 빠른 추가... (Enter)"
                      className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                    />
                    {quickAddValue.trim() && (
                      <Button
                        variant="default"
                        size="sm"
                        className="!h-7 !px-3 !text-xs"
                        onClick={handleQuickAdd}
                      >
                        추가
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* 카드 리스트 */}
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : columnTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <Inbox size={28} className="text-[var(--text-muted)] opacity-40" />
                    <p className="text-xs text-[var(--text-muted)] text-center">{col.emptyMessage}</p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onClick={() => openEditDialog(task)}
                        onChangeStatus={changeStatus}
                      />
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 업무 생성/편집 다이얼로그 */}
      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingTask ? '업무 수정' : '새 업무'}
        wide
      >
        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
          <Input
            id="task-title"
            label="업무 제목"
            placeholder="업무 제목을 입력하세요"
            value={form.title}
            onChange={(e) => updateForm('title', e.target.value)}
            autoFocus
          />

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--text-secondary)]">설명</label>
            <textarea
              className="h-24 w-full rounded-[var(--radius-xs)] border border-[var(--border-widget)] bg-[var(--bg-widget)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-none"
              placeholder="업무 설명 (선택)"
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--text-secondary)]">우선순위</label>
            <div className="flex gap-2.5">
              {([0, 1, 2, 3, 4] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => updateForm('priority', p)}
                  className={cn(
                    'flex-1 h-11 rounded-[var(--radius-xs)] text-sm font-medium transition-all border',
                    form.priority === p
                      ? 'border-transparent text-white'
                      : 'border-[var(--border-widget)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                  )}
                  style={{
                    backgroundColor: form.priority === p ? PRIORITY_COLORS[p] : undefined,
                  }}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--text-secondary)]">섹션</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => updateForm('section_id', null)}
                className={cn(
                  'px-5 py-2.5 rounded-full text-xs font-medium transition-all',
                  form.section_id === null ? 'text-white' : 'text-[var(--text-secondary)] hover:opacity-80'
                )}
                style={{
                  backgroundColor: form.section_id === null ? '#94A3B8' : '#94A3B820',
                }}
              >
                섹션 없음
              </button>
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => updateForm('section_id', s.id)}
                  className={cn(
                    'px-5 py-2.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5',
                    form.section_id === s.id ? 'text-white' : 'text-[var(--text-secondary)] hover:opacity-80'
                  )}
                  style={{
                    backgroundColor: form.section_id === s.id ? s.color : `${s.color}20`,
                  }}
                >
                  {s.icon && <span>{s.icon}</span>}
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--text-secondary)]">카테고리(보조)</label>
            <div className="flex flex-wrap gap-2">
              {TASK_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => updateForm('category', cat)}
                  className={cn(
                    'px-4 py-2 rounded-full text-xs font-medium transition-all',
                    form.category === cat
                      ? 'text-white'
                      : 'text-[var(--text-secondary)] hover:opacity-80'
                  )}
                  style={{
                    backgroundColor:
                      form.category === cat ? CATEGORY_COLORS[cat] : `${CATEGORY_COLORS[cat]}20`,
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              id="task-due-date"
              label="마감일"
              type="date"
              value={form.due_date}
              onChange={(e) => updateForm('due_date', e.target.value)}
            />
            <Input
              id="task-due-time"
              label="마감 시간"
              type="time"
              value={form.due_time}
              onChange={(e) => updateForm('due_time', e.target.value)}
            />
          </div>

          <Input
            id="task-tags"
            label="태그 (쉼표로 구분)"
            placeholder="태그1, 태그2, 태그3"
            value={form.tags}
            onChange={(e) => updateForm('tags', e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between mt-6 pt-5 border-t border-[var(--border-widget)]">
          <div>
            {editingTask && (
              <Button variant="danger" size="md" onClick={handleDelete}>
                <Trash2 size={14} />
                삭제
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="md" className="!px-8" onClick={() => setDialogOpen(false)}>
              취소
            </Button>
            <Button size="md" className="!px-8" onClick={handleSubmit}>
              {editingTask ? '수정' : '추가'}
            </Button>
          </div>
        </div>
      </Dialog>

      <SectionManagerDialog open={sectionMgrOpen} onOpenChange={setSectionMgrOpen} />
    </div>
  )
}

/* ─── TaskCard 컴포넌트 ─── */

interface TaskCardProps {
  task: Task
  onClick: () => void
  onChangeStatus: (task: Task, newStatus: TaskStatus) => Promise<void>
}

function TaskCard({ task, onClick, onChangeStatus }: TaskCardProps) {
  const tags = parseTaskTags(task.tags)
  const pc = PRIORITY_COLORS[task.priority]
  const isDone = task.status === 'done'

  // 2컬럼화: 할일/진행중 → done / done → todo
  const statusActions: { status: TaskStatus; icon: typeof CheckCircle2; tooltip: string }[] = []
  if (task.status !== 'done') {
    statusActions.push({ status: 'done', icon: CheckCircle2, tooltip: '완료' })
  } else {
    statusActions.push({ status: 'todo', icon: RotateCcw, tooltip: '다시 할일로' })
  }

  return (
    <motion.div
      layout
      variants={cardVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      className="group cursor-pointer transition-all"
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        background: 'var(--bg-secondary)',
        border: '1px solid transparent',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.border = `1px solid ${pc}33`
        e.currentTarget.style.background = `linear-gradient(135deg, ${pc}0A 0%, ${pc}14 100%)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.border = '1px solid transparent'
        e.currentTarget.style.background = 'var(--bg-secondary)'
      }}
    >
      <p
        className={cn(
          'text-sm truncate',
          isDone
            ? 'text-[var(--text-muted)] line-through font-medium'
            : 'text-[var(--text-primary)]'
        )}
        style={{
          letterSpacing: '-0.2px',
          fontWeight: isDone ? 500 : task.priority >= 3 ? 800 : 700,
          lineHeight: 1.4,
        }}
      >
        {task.title}
      </p>

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <Badge color={CATEGORY_COLORS[task.category]}>{task.category}</Badge>
        {task.due_date && (
          <span
            className="shrink-0 whitespace-nowrap tabular-nums inline-flex items-center gap-1"
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              background: `${pc}1A`,
              color: pc,
              fontWeight: 800,
              letterSpacing: '-0.2px',
              border: `1px solid ${pc}33`,
            }}
          >
            <Calendar size={10} strokeWidth={2.4} />
            {formatRelative(task.due_date)}
          </span>
        )}
        {tags.length > 0 && (
          <span className="text-xs text-[var(--text-muted)]">
            {tags.map((tag) => `#${tag}`).join(' ')}
          </span>
        )}
      </div>

      {/* 상태 변경 버튼 */}
      <div
        className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {statusActions.map(({ status, icon: ActionIcon, tooltip }) => (
          <button
            key={status}
            onClick={() => onChangeStatus(task, status)}
            title={tooltip}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-xs)] text-xs font-medium transition-all',
              status === 'done'
                ? 'bg-green-500/10 text-green-600 hover:bg-green-500/20'
                : 'bg-[var(--bg-widget)] text-[var(--text-secondary)] hover:bg-[var(--bg-widget-hover)]'
            )}
          >
            <ActionIcon size={12} />
            {tooltip}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
