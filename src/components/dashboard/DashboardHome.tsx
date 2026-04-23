import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays,
  CheckCircle2,
  ListTodo,
  Target,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Sparkles,
  Timer,
  Plus,
  X,
  Check,
  UserCheck,
} from 'lucide-react'
import { isSectionLine } from '../../lib/section-parser'
import { GREETING, CATEGORY_COLORS } from '../../lib/constants'
import {
  formatDate,
  getKoreanDay,
  getDDayText,
  isToday,
  parseISO,
  isSameDay,
  getCalendarDays,
  addMonths,
  subMonths,
} from '../../lib/date-utils'
import { cn } from '../../lib/utils'
import { useSchedules } from '../../hooks/useSchedules'
import { useTasks } from '../../hooks/useTasks'
import { useTimetable } from '../../hooks/useTimetable'
import { useChecklists, useChecklistItems } from '../../hooks/useChecklists'
import { useDataChange } from '../../hooks/useDataChange'
import { useAppStore } from '../../stores/app.store'
import { useUIStore } from '../../stores/ui.store'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Dialog } from '../ui/Dialog'
import type { DDayEvent } from '../../types/settings.types'
import type { TaskPriority } from '../../types/task.types'
import type { TimetableSlot, TimetablePeriod, TimetableOverride } from '../../types/timetable.types'
import { SUBJECT_COLORS } from '../../types/timetable.types'

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  0: '#94A3B8', 1: '#94A3B8', 2: '#3B82F6', 3: '#F97316', 4: '#EF4444',
}

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } },
}
const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

/* ─── 실시간 시계 (카드 스타일, 초 단위) ─── */
function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const hours24 = now.getHours()
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  const h = String(hours12).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  const ampm = hours24 < 12 ? '오전' : '오후'

  return (
    <div className="glass flex items-center gap-3 rounded-xl" style={{ padding: '10px 24px' }}>
      <span className="text-xs font-bold text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-full">{ampm}</span>
      <div className="flex items-baseline gap-0.5 tabular-nums">
        <span className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">{h}</span>
        <span className="text-2xl font-bold text-[var(--accent)] animate-pulse">:</span>
        <span className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">{m}</span>
        <span className="text-base font-semibold text-[var(--text-muted)] ml-0.5">{s}</span>
      </div>
    </div>
  )
}

/* ─── 현재 교시 표시 ─── */
function CurrentPeriod({ slots, periods }: { slots: TimetableSlot[]; periods: TimetablePeriod[] }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const dayIdx = now.getDay() - 1
  if (dayIdx < 0 || dayIdx > 4) return null

  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const classPeriods = periods.filter((p) => p.is_break === 0).sort((a, b) => a.period - b.period)
  const current = classPeriods.find((p) => timeStr >= p.start_time && timeStr < p.end_time)

  if (!current) return null

  const slot = slots.find((s) => s.day_of_week === dayIdx && s.period === current.period)
  const endParts = current.end_time.split(':')
  const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1])
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const remaining = Math.max(0, endMin - nowMin)

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-[var(--accent)]/8 border border-[var(--accent)]/15">
      <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
      <span className="text-sm font-bold text-[var(--accent)]">
        {current.period === 0 ? '아침활동' : `${current.period}교시`} {slot ? `— ${slot.subject}` : ''}
      </span>
      <span className="text-xs text-[var(--text-muted)]">({current.start_time}~{current.end_time})</span>
      <span className="text-sm font-bold text-[var(--accent)] tabular-nums ml-auto">{remaining}분 남음</span>
    </div>
  )
}

/* ─── 미니 달력 (카드 높이에 맞춰 자동 스케일, 스크롤 없음) ─── */
function MiniCalendar({ schedules }: { schedules: { start_date: string; color: string }[] }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const days = useMemo(() => getCalendarDays(year, month), [year, month])

  const hasSchedule = (date: Date) => {
    const ds = formatDate(date, 'yyyy-MM-dd')
    return schedules.some((s) => s.start_date.startsWith(ds))
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-muted)]">
          <ChevronLeft size={16} />
        </button>
        <span className="text-base font-bold text-[var(--text-primary)]">{year}년 {month + 1}월</span>
        <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-muted)]">
          <ChevronRight size={16} />
        </button>
      </div>
      {/* 요일 */}
      <div className="grid grid-cols-7 shrink-0 mb-1">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div key={d} className={`text-center text-xs font-semibold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-[var(--text-muted)]'}`}>{d}</div>
        ))}
      </div>
      {/* 날짜 — 카드 높이에 맞춰 6행이 균등 분배됨(auto-rows-fr) */}
      <div className="grid grid-cols-7 gap-y-0.5 flex-1 min-h-0 auto-rows-fr">
        {days.map((date, idx) => {
          const isMonth = date.getMonth() === month
          const today = isToday(date)
          const hasSch = hasSchedule(date)
          const dow = date.getDay()
          return (
            <div key={idx} className={cn(
              'relative text-center flex items-center justify-center text-sm rounded-lg mx-0.5 min-h-0',
              !isMonth && 'opacity-40',
              today && 'bg-[var(--accent)] text-white font-bold',
              !today && isMonth && dow === 0 && 'text-red-400',
              !today && isMonth && dow === 6 && 'text-blue-400',
              !today && isMonth && dow > 0 && dow < 6 && 'text-[var(--text-primary)]',
            )}>
              {date.getDate()}
              {hasSch && !today && <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent)]" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── 오늘 시간표 (컴팩트 + 임시수업 표시) ─── */
function TodayTimetable({ slots, periods, overrides, onAddOverride }: {
  slots: TimetableSlot[]
  periods: TimetablePeriod[]
  overrides: TimetableOverride[]
  onAddOverride: (period: number) => void
}) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const dayIdx = now.getDay() - 1
  if (dayIdx < 0 || dayIdx > 4) {
    return <p className="text-sm text-[var(--text-muted)] text-center py-4">주말에는 수업이 없어요</p>
  }

  const classPeriods = periods.filter((p) => p.is_break === 0).sort((a, b) => a.period - b.period)
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <div className="flex flex-col h-full min-h-0 gap-0.5">
      {classPeriods.map((p) => {
        // 임시수업이 있으면 우선, 없으면 기본 시간표
        const override = overrides.find((o) => o.period === p.period)
        const slot = slots.find((s) => s.day_of_week === dayIdx && s.period === p.period)
        const display = override ?? slot
        const isOverride = !!override
        const isSpecialist = !isOverride && !!slot?.is_specialist
        const isCurrent = currentTime >= p.start_time && currentTime < p.end_time
        const isPast = currentTime >= p.end_time

        return (
          <div
            key={p.id}
            className={cn(
              'flex items-center gap-3 px-3 rounded-lg transition-all group flex-1 min-h-0',
              isCurrent && 'bg-[var(--accent)]/8 ring-1 ring-[var(--accent)]/20',
              isPast && 'opacity-55',
            )}
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--bg-secondary)] shrink-0">
              <span className="text-xs font-bold text-[var(--text-primary)]">{p.period === 0 ? '아' : p.period}</span>
            </div>
            <span className="text-xs font-medium text-[var(--text-secondary)] w-10 shrink-0 tabular-nums">{p.start_time}</span>
            {display ? (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: display.color || SUBJECT_COLORS[display.subject] || '#94A3B8' }} />
                <span className={cn('text-sm font-medium truncate', isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>
                  {display.subject}
                </span>
                {isOverride && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-medium shrink-0">임시</span>
                )}
                {isSpecialist && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 font-medium shrink-0">전담</span>
                )}
                {isOverride && override.teacher && (
                  <span className="text-xs text-purple-400 shrink-0 ml-auto">{override.teacher}</span>
                )}
                {isSpecialist && slot?.specialist_teacher && (
                  <span className="text-xs text-violet-400 shrink-0 ml-auto">{slot.specialist_teacher}</span>
                )}
                {!isOverride && !isSpecialist && display.room && (
                  <span className="text-xs text-[var(--text-muted)] shrink-0 ml-auto">{display.room}</span>
                )}
              </div>
            ) : (
              <span className="text-sm text-[var(--text-secondary)] opacity-60 flex-1">—</span>
            )}
            {/* 임시수업 추가 버튼 (hover 시) */}
            {!isPast && (
              <button
                onClick={() => onAddOverride(p.period)}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 rounded text-[var(--text-muted)] transition-all shrink-0"
                title="임시 수업 추가"
              >
                <Plus size={12} />
              </button>
            )}
            {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />}
          </div>
        )
      })}
    </div>
  )
}

/* ─── 임시수업 추가 다이얼로그 ─── */
function OverrideDialog({ open, onOpenChange, period, date, onSave }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  period: number
  date: string
  onSave: () => void
}) {
  const [subject, setSubject] = useState('')
  const [teacher, setTeacher] = useState('')
  const [room, setRoom] = useState('')

  const handleSave = async () => {
    if (!subject.trim()) return
    await window.api.timetable.createOverride({
      date,
      period,
      subject: subject.trim(),
      teacher: teacher.trim(),
      room: room.trim(),
      color: '#8B5CF6',
    })
    setSubject('')
    setTeacher('')
    setRoom('')
    onOpenChange(false)
    onSave()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`${period}교시 — 임시 수업 추가`}>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        {date} 에만 적용되는 임시 수업입니다 (강사 수업 등)
      </p>
      <div className="space-y-3">
        <Input label="과목명" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="예: 영어회화" />
        <Input label="강사/교사명" value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="예: 김영어 강사" />
        <Input label="교실" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="예: 영어실" />
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={() => onOpenChange(false)} style={{ paddingLeft: 28, paddingRight: 28 }}>취소</Button>
        <Button onClick={handleSave} style={{ paddingLeft: 28, paddingRight: 28 }}>추가</Button>
      </div>
    </Dialog>
  )
}

/* ─── 체크리스트 프로그레스 ─── */
function ChecklistProgress({ checklistId, title }: { checklistId: string; title: string }) {
  const { items, progress, toggleItem } = useChecklistItems(checklistId)
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) return null
  const checked = items.filter((i) => i.is_checked).length
  // 진척도에 따라 dot + progress bar 색을 단계적으로.
  const accent = progress >= 80 ? '#10B981' : progress >= 50 ? '#F59E0B' : '#2563EB'

  return (
    <div
      className="transition-all"
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        background: 'var(--bg-secondary)',
        border: `1px solid ${expanded ? `${accent}33` : 'transparent'}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left"
        title={expanded ? '접기' : '펼쳐서 체크하기'}
      >
        <div className="flex items-center" style={{ gap: 10, marginBottom: 8 }}>
          <span
            aria-hidden
            className="shrink-0"
            style={{
              width: 7, height: 7, borderRadius: 999,
              backgroundColor: accent,
              boxShadow: `0 0 0 2.5px ${accent}26`,
            }}
          />
          <span
            className="text-sm text-[var(--text-primary)] truncate flex-1"
            style={{ fontWeight: 600, letterSpacing: '-0.2px' }}
          >
            {title}
          </span>
          <span
            className="text-xs tabular-nums shrink-0"
            style={{ fontWeight: 800, color: accent, letterSpacing: '-0.2px' }}
          >
            {checked}/{items.length}
          </span>
          <ChevronDown
            size={14}
            className="shrink-0 transition-transform"
            style={{
              color: 'var(--text-muted)',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${accent}, ${accent}DD)`,
              boxShadow: `0 0 10px ${accent}55`,
            }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="cl-items"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col" style={{ gap: 4, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-widget)' }}>
              {items.map((it) => {
                const sectionTitle = isSectionLine(it.content)
                if (sectionTitle) {
                  return (
                    <div
                      key={it.id}
                      style={{
                        fontSize: 11.5, fontWeight: 900, color: 'var(--text-secondary)',
                        letterSpacing: '-0.2px', padding: '4px 4px 2px', marginTop: 2,
                      }}
                    >
                      {sectionTitle}
                    </div>
                  )
                }
                return (
                  <button
                    key={it.id}
                    onClick={() => toggleItem(it.id)}
                    className="flex items-center text-left transition-all hover:bg-[var(--bg-primary)]"
                    style={{
                      gap: 10, padding: '6px 8px', borderRadius: 8, marginLeft: 6,
                    }}
                  >
                    <span
                      className="shrink-0 flex items-center justify-center transition-all"
                      style={{
                        width: 18, height: 18, borderRadius: 5,
                        border: it.is_checked ? 'none' : `1.6px solid ${accent}`,
                        background: it.is_checked
                          ? `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`
                          : 'transparent',
                        boxShadow: it.is_checked ? `0 2px 6px ${accent}55` : 'none',
                      }}
                    >
                      {it.is_checked ? <Check size={11} strokeWidth={3.2} color="#fff" /> : null}
                    </span>
                    <span
                      className="text-sm truncate flex-1"
                      style={{
                        fontWeight: 500, letterSpacing: '-0.2px',
                        color: it.is_checked ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: it.is_checked ? 'line-through' : undefined,
                        opacity: it.is_checked ? 0.75 : 1,
                      }}
                    >
                      {it.content}
                    </span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ═══════════════════════ MAIN ═══════════════════════ */
export function DashboardHome() {
  const settings = useAppStore((s) => s.settings)
  const setView = useUIStore((s) => s.setView)
  const addToast = useUIStore((s) => s.addToast)
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])
  const today = now
  const todayStr = formatDate(today, 'yyyy-MM-dd')

  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const monthEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-31`
  const monthFilter = useMemo(() => ({ startDate: monthStart, endDate: monthEnd }), [monthStart, monthEnd])
  const { schedules: monthSchedules } = useSchedules(monthFilter)

  const todayFilter = useMemo(() => ({ startDate: todayStr, endDate: todayStr }), [todayStr])
  const { schedules } = useSchedules(todayFilter)
  const { tasks, update: updateTask } = useTasks()
  const { slots, periods } = useTimetable()
  const { checklists } = useChecklists()
  const [ddays, setDdays] = useState<DDayEvent[]>([])
  const [overrides, setOverrides] = useState<TimetableOverride[]>([])
  const [overrideDialog, setOverrideDialog] = useState<{ open: boolean; period: number }>({ open: false, period: 1 })
  const [ddayDialogOpen, setDdayDialogOpen] = useState(false)
  const [newDdayTitle, setNewDdayTitle] = useState('')
  const [newDdayDate, setNewDdayDate] = useState('')
  const [newDdayEmoji, setNewDdayEmoji] = useState('📅')

  useEffect(() => {
    window.api.dday.list().then((data) => setDdays(data.filter((d) => d.is_active)))
    window.api.timetable.getOverrides(todayStr).then(setOverrides)
  }, [todayStr])

  // 다른 창(위젯/편집기)에서 강사 수업이 추가/삭제되면 대시보드 카드도 즉시 갱신
  useDataChange('timetable', () => {
    window.api.timetable.getOverrides(todayStr).then(setOverrides).catch(() => {})
  })

  const refreshOverrides = () => {
    window.api.timetable.getOverrides(todayStr).then(setOverrides)
    addToast('success', '임시 수업이 추가되었습니다')
  }

  const handleAddDday = async () => {
    if (!newDdayTitle.trim() || !newDdayDate) return
    await window.api.dday.create({
      title: newDdayTitle.trim(),
      target_date: newDdayDate,
      emoji: newDdayEmoji,
    })
    const updated = await window.api.dday.list()
    setDdays(updated.filter((d) => d.is_active))
    setDdayDialogOpen(false)
    setNewDdayTitle('')
    setNewDdayDate('')
    setNewDdayEmoji('📅')
    addToast('success', 'D-Day가 추가되었습니다')
  }

  const handleDeleteDday = async (id: string) => {
    await window.api.dday.delete(id)
    setDdays((prev) => prev.filter((d) => d.id !== id))
  }

  const ddayEmojis = ['📅', '📝', '🎒', '🏫', '🎓', '✈️', '🎄', '🌸', '⭐', '🎉']

  const todaySchedules = schedules.filter((s) => {
    const start = parseISO(s.start_date)
    return isSameDay(start, today) || (s.end_date && parseISO(s.end_date) >= today && start <= today)
  })

  const activeTasks = tasks.filter((t) => t.status !== 'archived' && t.status !== 'done')
  const completedToday = tasks.filter((t) => t.status === 'done' && t.completed_at && isToday(parseISO(t.completed_at)))
  const teacherName = settings?.teacher_name || '선생님'

  return (
    <motion.div
      className="h-full flex flex-col gap-4"
      style={{ padding: 16 }}
      variants={stagger} initial="hidden" animate="show"
    >

      {/* ─── 헤더 ─── */}
      <motion.div variants={fadeIn} className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-sky-400 flex items-center justify-center shrink-0">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">{teacherName}, {GREETING()}</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {formatDate(today, 'yyyy년 M월 d일')} {getKoreanDay(today)}요일
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 mr-2">
          <CurrentPeriod slots={slots} periods={periods} />
          <LiveClock />
        </div>
      </motion.div>

      {/* ─── 요약 통합 바 (1줄, 컴팩트) ─── */}
      <motion.div variants={fadeIn} className="flex items-center gap-1 shrink-0 px-1">
        {([
          { icon: CalendarDays, label: '오늘 일정', value: todaySchedules.length, color: '#2563EB', onClick: () => setView('calendar') },
          { icon: ListTodo, label: '진행 업무', value: activeTasks.length, color: '#F97316', onClick: () => setView('tasks') },
          { icon: CheckCircle2, label: '오늘 완료', value: completedToday.length, color: '#10B981', onClick: undefined as (() => void) | undefined },
        ]).map((card, idx) => {
          const inner = (
            <>
              <card.icon size={14} style={{ color: card.color }} className="shrink-0" />
              <span className="text-xs text-[var(--text-muted)]">{card.label}</span>
              <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{card.value}</span>
            </>
          )
          return (
            <div key={card.label} className="flex items-center gap-1">
              {idx > 0 && <div className="w-px h-4 bg-[var(--border-widget,rgba(148,163,184,0.2))] mx-1" />}
              {card.onClick ? (
                <button
                  onClick={card.onClick}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)] cursor-pointer"
                >
                  {inner}
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5">{inner}</div>
              )}
            </div>
          )
        })}
      </motion.div>

      {/* ─── 메인 그리드 — 3x2 균일 격자 (모든 카드 같은 높이) ─── */}
      <div className="grid grid-cols-3 grid-rows-2 gap-4 flex-1 min-h-0">

        {/* [행1·열1] 오늘 시간표 */}
        <motion.div variants={fadeIn} className="glass p-4 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Timer size={15} className="text-[var(--accent)]" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">오늘 시간표</h2>
              {overrides.length > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-medium">
                  임시 {overrides.length}건
                </span>
              )}
            </div>
            <button onClick={() => setView('timetable')} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-0.5">
              편집 <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <TodayTimetable
              slots={slots}
              periods={periods}
              overrides={overrides}
              onAddOverride={(period) => setOverrideDialog({ open: true, period })}
            />
          </div>
        </motion.div>

        {/* [행1·열2] 오늘 일정 */}
        <motion.div variants={fadeIn} className="glass p-4 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <CalendarDays size={15} className="text-[var(--accent)]" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">오늘 일정</h2>
            </div>
            <button onClick={() => setView('calendar')} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-0.5">
              더보기 <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {todaySchedules.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
                <CalendarDays size={32} strokeWidth={1.2} className="mb-2 opacity-25" />
                <p className="text-sm">등록된 일정이 없어요</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todaySchedules.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-secondary)]/50">
                    <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{s.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[var(--text-muted)]">{s.all_day ? '종일' : formatDate(s.start_date, 'HH:mm')}</span>
                        <Badge color={CATEGORY_COLORS[s.category]}>{s.category}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* [행1·열3] 미니 달력 */}
        <motion.div variants={fadeIn} className="glass p-4 flex flex-col min-h-0 overflow-hidden">
          <MiniCalendar schedules={monthSchedules.map((s) => ({ start_date: s.start_date, color: s.color }))} />
        </motion.div>

        {/* [행2·열1] D-Day */}
        <motion.div variants={fadeIn} className="glass p-4 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Target size={15} style={{ color: '#EF4444' }} />
                <h2 className="text-base font-bold text-[var(--text-primary)]">D-Day</h2>
              </div>
              <button
                onClick={() => setDdayDialogOpen(true)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-0.5"
              >
                추가 <Plus size={14} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {ddays.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
                  <Target size={28} strokeWidth={1.2} className="mb-2 opacity-30" />
                  <p className="text-xs">등록된 D-Day가 없어요</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {ddays.slice(0, 5).map((d) => {
                    const ddText = getDDayText(d.target_date)
                    const isDDay = ddText === 'D-Day'
                    return (
                      <div key={d.id} className={cn(
                        'flex items-center gap-3 p-2.5 rounded-xl group',
                        isDDay ? 'bg-red-500/8 ring-1 ring-red-500/15' : 'bg-[var(--bg-secondary)]/50'
                      )}>
                        <span className="text-lg">{d.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{d.title}</p>
                          <p className="text-xs text-[var(--text-muted)]">{formatDate(d.target_date, 'M월 d일')}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={cn('text-sm font-bold tabular-nums', isDDay ? 'text-red-500' : ddText.startsWith('D+') ? 'text-[var(--text-muted)]' : 'text-[var(--accent)]')}>{ddText}</span>
                          <button
                            onClick={() => handleDeleteDday(d.id)}
                            className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 transition-all p-0.5"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
        </motion.div>

        {/* [행2·열2] 할 일 */}
        <motion.div variants={fadeIn} className="glass p-4 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <ListTodo size={15} style={{ color: '#F97316' }} />
              <h2 className="text-base font-bold text-[var(--text-primary)]">할 일</h2>
            </div>
            <button onClick={() => setView('tasks')} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-0.5">
              더보기 <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
              {activeTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
                  <ListTodo size={32} strokeWidth={1.2} className="mb-2 opacity-25" />
                  <p className="text-sm">처리할 업무가 없어요</p>
                </div>
              ) : (
                <div className="flex flex-col" style={{ gap: 6 }}>
                  {activeTasks.slice(0, 8).map((t) => {
                    const pc = PRIORITY_COLORS[t.priority]
                    const toggle = () => {
                      updateTask(t.id, {
                        is_completed: 1,
                        status: 'done',
                        completed_at: new Date().toISOString(),
                      })
                    }
                    return (
                      <button
                        key={t.id}
                        onClick={toggle}
                        title="클릭 → 완료 처리"
                        className="flex items-center transition-all group text-left"
                        style={{
                          gap: 12,
                          padding: '10px 14px',
                          borderRadius: 12,
                          background: 'var(--bg-secondary)',
                          border: '1px solid transparent',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.border = `1px solid ${pc}55`
                          e.currentTarget.style.background = `linear-gradient(135deg, ${pc}10 0%, ${pc}20 100%)`
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.border = '1px solid transparent'
                          e.currentTarget.style.background = 'var(--bg-secondary)'
                        }}
                      >
                        {/* dot → hover 시 체크박스로 바뀜(완료 의사 표시) */}
                        <span
                          aria-hidden
                          className="shrink-0 flex items-center justify-center transition-all group-hover:bg-transparent"
                          style={{
                            width: 18, height: 18, borderRadius: 999,
                            border: `1.8px solid ${pc}`,
                            background: 'transparent',
                            color: '#fff',
                          }}
                        >
                          <span
                            className="block group-hover:hidden"
                            style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: pc }}
                          />
                          <Check size={12} strokeWidth={3} className="hidden group-hover:block" style={{ color: pc }} />
                        </span>
                        <span
                          className="text-sm text-[var(--text-primary)] truncate flex-1"
                          style={{ fontWeight: t.priority >= 3 ? 700 : 500, letterSpacing: '-0.2px' }}
                        >
                          {t.title}
                        </span>
                        {t.due_date && (
                          <span className={cn('text-xs font-semibold tabular-nums shrink-0', getDDayText(t.due_date).startsWith('D+') ? 'text-red-500' : 'text-[var(--text-muted)]')}>
                            {getDDayText(t.due_date)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
        </motion.div>

        {/* [행2·열3] 체크리스트 */}
        <motion.div variants={fadeIn} className="glass p-4 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen size={15} style={{ color: '#10B981' }} />
              <h2 className="text-base font-bold text-[var(--text-primary)]">체크리스트</h2>
            </div>
            <button onClick={() => setView('checklists')} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-0.5">
              관리 <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {checklists.filter((c) => !c.is_template).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
                <BookOpen size={28} strokeWidth={1.2} className="mb-2 opacity-25" />
                <p className="text-xs">체크리스트가 없어요</p>
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: 8 }}>
                {checklists.filter((c) => !c.is_template).slice(0, 6).map((c) => (
                  <ChecklistProgress key={c.id} checklistId={c.id} title={c.title} />
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* 임시 수업 추가 다이얼로그 */}
      <OverrideDialog
        open={overrideDialog.open}
        onOpenChange={(v) => setOverrideDialog((prev) => ({ ...prev, open: v }))}
        period={overrideDialog.period}
        date={todayStr}
        onSave={refreshOverrides}
      />

      {/* D-Day 추가 다이얼로그 */}
      <Dialog open={ddayDialogOpen} onOpenChange={setDdayDialogOpen} title="D-Day 추가">
        <div className="space-y-4">
          <Input label="제목" value={newDdayTitle} onChange={(e) => setNewDdayTitle(e.target.value)} placeholder="예: 기말고사" />
          <Input label="날짜" type="date" value={newDdayDate} onChange={(e) => setNewDdayDate(e.target.value)} />
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">이모지</label>
            <div className="flex gap-1.5 flex-wrap">
              {ddayEmojis.map((e) => (
                <button
                  key={e}
                  onClick={() => setNewDdayEmoji(e)}
                  className={`w-8 h-8 rounded-md text-lg flex items-center justify-center transition-all ${
                    newDdayEmoji === e ? 'bg-[var(--accent-light)] ring-2 ring-[var(--accent)]' : 'hover:bg-[var(--bg-secondary)]'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDdayDialogOpen(false)} style={{ paddingLeft: 28, paddingRight: 28 }}>취소</Button>
            <Button onClick={handleAddDday} style={{ paddingLeft: 28, paddingRight: 28 }}>추가</Button>
          </div>
        </div>
      </Dialog>
    </motion.div>
  )
}
