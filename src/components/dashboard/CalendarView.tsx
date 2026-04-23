import { useState, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  MapPin,
  Clock,
  Trash2,
  FileUp,
} from 'lucide-react'
import { importScheduleFile } from '../../lib/schedule-import'
import { cn } from '../../lib/utils'
import {
  formatDate,
  getCalendarDays,
  isToday,
  isSameDay,
  addMonths,
  subMonths,
  getKoreanDay,
  parseISO,
} from '../../lib/date-utils'
import { SCHEDULE_CATEGORIES, CATEGORY_COLORS } from '../../lib/constants'
import { useSchedules } from '../../hooks/useSchedules'
import { useUIStore } from '../../stores/ui.store'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import type { Schedule, ScheduleCategory, CreateScheduleInput } from '../../types/schedule.types'

const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토']

const PRESET_COLORS = [
  '#2563EB', '#EF4444', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#F97316', '#14B8A6',
]

const REMINDER_OPTIONS = [
  { value: 0, label: '없음' },
  { value: 5, label: '5분 전' },
  { value: 10, label: '10분 전' },
  { value: 15, label: '15분 전' },
  { value: 30, label: '30분 전' },
  { value: 60, label: '1시간 전' },
  { value: 1440, label: '1일 전' },
]

interface ScheduleFormState {
  title: string
  description: string
  start_date: string
  start_time: string
  end_date: string
  end_time: string
  all_day: boolean
  category: ScheduleCategory
  color: string
  location: string
  reminder_minutes: number
}

const defaultFormState = (date?: Date): ScheduleFormState => ({
  title: '',
  description: '',
  start_date: formatDate(date ?? new Date(), 'yyyy-MM-dd'),
  start_time: '09:00',
  end_date: formatDate(date ?? new Date(), 'yyyy-MM-dd'),
  end_time: '10:00',
  all_day: false,
  category: '일반',
  color: '#2563EB',
  location: '',
  reminder_minutes: 0,
})

export function CalendarView() {
  const addToast = useUIStore((s) => s.addToast)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [form, setForm] = useState<ScheduleFormState>(defaultFormState())
  const [activeCategory, setActiveCategory] = useState<ScheduleCategory | '전체'>('전체')
  const [importToast, setImportToast] = useState<string | null>(null)
  const [showImportHint, setShowImportHint] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const monthFilter = useMemo(() => {
    const start = formatDate(new Date(year, month, 1), 'yyyy-MM-dd')
    const lastDay = new Date(year, month + 1, 0).getDate()
    const end = formatDate(new Date(year, month, lastDay), 'yyyy-MM-dd')
    return { startDate: start, endDate: end }
  }, [year, month])

  const { schedules, loading, create, update, remove } = useSchedules(monthFilter)

  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month])

  const schedulesForDate = useCallback(
    (date: Date): Schedule[] => {
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59)
      const dow = date.getDay() // 0=일, 6=토 — "주간" 일정은 주말 제외
      return schedules.filter((s) => {
        const start = parseISO(s.start_date)
        const end = s.end_date ? parseISO(s.end_date) : start
        if (!(start <= dayEnd && end >= dayStart)) return false
        if (/주간/.test(s.title) && (dow === 0 || dow === 6)) return false
        return true
      })
    },
    [schedules]
  )

  const selectedSchedules = useMemo(() => {
    const list = schedulesForDate(selectedDate)
    if (activeCategory === '전체') return list
    return list.filter((s) => s.category === activeCategory)
  }, [selectedDate, schedulesForDate, activeCategory])

  const goToPrevMonth = () => setCurrentDate((d) => subMonths(d, 1))
  const goToNextMonth = () => setCurrentDate((d) => addMonths(d, 1))
  const goToToday = () => {
    const now = new Date()
    setCurrentDate(now)
    setSelectedDate(now)
  }

  const openCreateDialog = (date?: Date) => {
    setEditingSchedule(null)
    setForm(defaultFormState(date ?? selectedDate))
    setDialogOpen(true)
  }

  const openEditDialog = (schedule: Schedule) => {
    setEditingSchedule(schedule)
    const startParts = schedule.start_date.split('T')
    const endParts = schedule.end_date?.split('T')
    setForm({
      title: schedule.title,
      description: schedule.description,
      start_date: startParts[0],
      start_time: startParts[1]?.slice(0, 5) || '09:00',
      end_date: endParts ? endParts[0] : startParts[0],
      end_time: endParts ? endParts[1]?.slice(0, 5) || '10:00' : '10:00',
      all_day: schedule.all_day === 1,
      category: schedule.category,
      color: schedule.color || '#2563EB',
      location: schedule.location,
      reminder_minutes: schedule.reminder_minutes,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      addToast('warning', '일정 제목을 입력해주세요')
      return
    }

    const startDateStr = form.all_day
      ? `${form.start_date}T00:00:00`
      : `${form.start_date}T${form.start_time}:00`
    const endDateStr = form.all_day
      ? `${form.end_date}T23:59:59`
      : `${form.end_date}T${form.end_time}:00`

    const input: CreateScheduleInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      start_date: startDateStr,
      end_date: endDateStr,
      all_day: form.all_day ? 1 : 0,
      category: form.category,
      color: form.color,
      location: form.location.trim(),
      reminder_minutes: form.reminder_minutes,
    }

    if (editingSchedule) {
      await update(editingSchedule.id, input)
      addToast('success', '일정이 수정되었어요')
    } else {
      await create(input)
      addToast('success', '일정이 추가되었어요')
    }
    setDialogOpen(false)
  }

  const handleDelete = async () => {
    if (!editingSchedule) return
    await remove(editingSchedule.id)
    addToast('success', '일정이 삭제되었어요')
    setDialogOpen(false)
  }

  const updateForm = <K extends keyof ScheduleFormState>(key: K, value: ScheduleFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-8 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            {year}년 {month + 1}월
          </h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={goToPrevMonth}>
              <ChevronLeft size={20} />
            </Button>
            <Button variant="secondary" size="sm" onClick={goToToday}>
              오늘
            </Button>
            <Button variant="ghost" size="icon" onClick={goToNextMonth}>
              <ChevronRight size={20} />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowImportHint(true)}
            className="whitespace-nowrap"
            style={{ padding: '11px 18px', fontSize: 14, gap: 8 }}
            title="학사일정·교육과정 파일 업로드"
          >
            <FileUp size={15} strokeWidth={2.4} />
            <span className="whitespace-nowrap">학사일정 파일 올리기</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.ics,.xlsx,.xls,.docx,.doc,.hwp,.hwpx"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              setImportToast('파일을 읽는 중...')
              const result = await importScheduleFile(f)
              if (result.ok) {
                setImportToast(`${result.count}개 일정이 추가됐어요`)
              } else {
                setImportToast(result.error)
              }
              setTimeout(() => setImportToast(null), 5000)
            }}
          />
          <Button
            size="sm"
            onClick={() => openCreateDialog()}
            className="whitespace-nowrap"
            style={{ padding: '11px 22px', fontSize: 14, gap: 8 }}
          >
            <Plus size={15} strokeWidth={2.4} />
            <span className="whitespace-nowrap">일정 추가</span>
          </Button>
        </div>
      </div>

      {importToast && (
        <div className="px-8 pb-2">
          <div
            className="inline-flex items-center"
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              backgroundColor: importToast.includes('오류') || importToast.includes('못') || importToast.includes('안 돼')
                ? 'rgba(239,68,68,0.12)'
                : 'rgba(16,185,129,0.14)',
              color: importToast.includes('오류') || importToast.includes('못') || importToast.includes('안 돼')
                ? '#B91C1C'
                : '#047857',
              letterSpacing: '-0.2px',
            }}
          >
            {importToast}
          </div>
        </div>
      )}

      {/* 카테고리 탭 */}
      <div className="flex items-center gap-2 px-8 pb-4 overflow-x-auto">
        <button
          onClick={() => setActiveCategory('전체')}
          style={{
            paddingLeft: '24px',
            paddingRight: '24px',
            paddingTop: '10px',
            paddingBottom: '10px',
            fontSize: '15px',
            borderRadius: '10px',
            border: '1px solid',
            borderColor:
              activeCategory === '전체'
                ? 'var(--accent)'
                : 'rgba(255,255,255,0.08)',
            backgroundColor:
              activeCategory === '전체'
                ? 'var(--accent)'
                : 'var(--bg-secondary)',
            color: activeCategory === '전체' ? '#fff' : 'var(--text-secondary)',
          }}
          className="font-semibold transition-all whitespace-nowrap hover:opacity-90"
        >
          전체
        </button>
        {SCHEDULE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              paddingLeft: '24px',
              paddingRight: '24px',
              paddingTop: '10px',
              paddingBottom: '10px',
              fontSize: '15px',
              borderRadius: '10px',
              border: '1px solid',
              borderColor:
                activeCategory === cat
                  ? CATEGORY_COLORS[cat]
                  : 'rgba(255,255,255,0.08)',
              backgroundColor:
                activeCategory === cat
                  ? CATEGORY_COLORS[cat]
                  : 'var(--bg-secondary)',
              color: activeCategory === cat ? '#fff' : 'var(--text-secondary)',
            }}
            className="font-semibold transition-all whitespace-nowrap hover:opacity-90"
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex-1 flex overflow-hidden px-8 pb-5 gap-4">
        {/* 달력 그리드 */}
        <div className="flex-1 flex flex-col glass p-4 overflow-hidden">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 mb-1.5 border-b border-[var(--border-widget)]/40">
            {DAY_HEADERS.map((d, i) => (
              <div
                key={d}
                className={cn(
                  'text-center text-base font-semibold py-2.5',
                  i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-[var(--text-muted)]'
                )}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 셀 */}
          <div className="grid grid-cols-7 grid-rows-6 flex-1">
            {calendarDays.map((day, idx) => {
              const isCurrentMonth = day.getMonth() === month
              const isSelected = isSameDay(day, selectedDate)
              const isTodayDate = isToday(day)
              const daySchedules = schedulesForDate(day)
              const dayOfWeek = day.getDay()
              const col = idx % 7
              const row = Math.floor(idx / 7)

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(day)}
                  onDoubleClick={() => openCreateDialog(day)}
                  className={cn(
                    'relative flex flex-col items-center pt-2 pb-1 transition-all hover:bg-[var(--bg-secondary)] overflow-hidden',
                    col < 6 && 'border-r border-[var(--border-widget)]/30',
                    row < 5 && 'border-b border-[var(--border-widget)]/30',
                    isSelected && 'bg-[var(--bg-secondary)]',
                    !isCurrentMonth && 'opacity-35'
                  )}
                >
                  <span
                    className={cn(
                      'text-base font-semibold w-8 h-8 flex items-center justify-center rounded-full shrink-0',
                      isTodayDate && 'bg-[var(--accent)] text-white',
                      !isTodayDate && dayOfWeek === 0 && 'text-red-400',
                      !isTodayDate && dayOfWeek === 6 && 'text-blue-400',
                      !isTodayDate && dayOfWeek !== 0 && dayOfWeek !== 6 && 'text-[var(--text-primary)]'
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {daySchedules.length > 0 && (
                    <div
                      className="w-full flex flex-col mt-1 px-1.5 overflow-hidden"
                      style={{ gap: 2, minHeight: 0 }}
                    >
                      {daySchedules.slice(0, 5).map((s) => {
                        const sc = s.color || CATEGORY_COLORS[s.category] || 'var(--accent)'
                        return (
                          <div
                            key={s.id}
                            title={s.title}
                            style={{
                              fontSize: 9.5,
                              fontWeight: 600,
                              lineHeight: 1.18,
                              color: `color-mix(in srgb, ${sc} 58%, #000)`,
                              background: `color-mix(in srgb, ${sc} 14%, transparent)`,
                              padding: '1px 4px',
                              borderRadius: 3,
                              textAlign: 'center',
                              whiteSpace: 'normal',
                              wordBreak: 'keep-all',
                              overflowWrap: 'anywhere',
                              letterSpacing: '-0.3px',
                            }}
                          >
                            {s.title}
                          </div>
                        )
                      })}
                      {daySchedules.length > 5 && (
                        <span
                          className="text-[var(--text-muted)] text-center"
                          style={{ fontSize: 9, fontWeight: 700, letterSpacing: '-0.2px' }}
                        >
                          +{daySchedules.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* 선택 날짜 일정 패널 */}
        <div className="w-[300px] glass p-5 flex flex-col overflow-hidden shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {formatDate(selectedDate, 'M월 d일')} ({getKoreanDay(selectedDate)})
              </h2>
              {isToday(selectedDate) && (
                <span className="text-xs text-[var(--accent)]">오늘</span>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => openCreateDialog()}>
              <Plus size={18} />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            <AnimatePresence mode="popLayout">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : selectedSchedules.length === 0 ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-[var(--text-muted)] py-8 text-center"
                >
                  이 날의 일정이 없어요
                </motion.p>
              ) : (
                selectedSchedules.map((s) => (
                  <motion.button
                    key={s.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    onClick={() => openEditDialog(s)}
                    className="w-full text-left p-3 rounded-[var(--radius-xs)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-widget-hover)] transition-colors"
                    style={{ borderLeft: `3px solid ${s.color || CATEGORY_COLORS[s.category] || 'var(--accent)'}` }}
                  >
                    <p className="text-base font-medium text-[var(--text-primary)] truncate">{s.title}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {s.all_day ? (
                        <span className="text-xs text-[var(--text-muted)] flex items-center gap-0.5">
                          <Clock size={12} />
                          종일
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)] flex items-center gap-0.5">
                          <Clock size={12} />
                          {formatDate(s.start_date, 'HH:mm')}
                          {s.end_date ? ` ~ ${formatDate(s.end_date, 'HH:mm')}` : ''}
                        </span>
                      )}
                      {s.location && (
                        <span className="text-xs text-[var(--text-muted)] flex items-center gap-0.5">
                          <MapPin size={12} />
                          {s.location}
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      <Badge color={CATEGORY_COLORS[s.category]}>{s.category}</Badge>
                    </div>
                  </motion.button>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 일정 생성/편집 다이얼로그 */}
      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingSchedule ? '일정 수정' : '새 일정'}
        wide
      >
        <div className="space-y-5">
          <Input
            id="schedule-title"
            label="일정 제목"
            placeholder="일정 제목을 입력하세요"
            value={form.title}
            onChange={(e) => updateForm('title', e.target.value)}
            autoFocus
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">설명</label>
            <textarea
              className="h-20 w-full rounded-[var(--radius-xs)] border border-[var(--border-widget)] bg-[var(--bg-widget)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-none"
              placeholder="일정 설명 (선택)"
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.all_day}
                onChange={(e) => updateForm('all_day', e.target.checked)}
                className="accent-[var(--accent)] w-4 h-4"
              />
              <span className="text-xs font-medium text-[var(--text-secondary)]">종일</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="schedule-start-date"
              label="시작일"
              type="date"
              value={form.start_date}
              onChange={(e) => updateForm('start_date', e.target.value)}
            />
            {!form.all_day && (
              <Input
                id="schedule-start-time"
                label="시작 시간"
                type="time"
                value={form.start_time}
                onChange={(e) => updateForm('start_time', e.target.value)}
              />
            )}
            <Input
              id="schedule-end-date"
              label="종료일"
              type="date"
              value={form.end_date}
              onChange={(e) => updateForm('end_date', e.target.value)}
            />
            {!form.all_day && (
              <Input
                id="schedule-end-time"
                label="종료 시간"
                type="time"
                value={form.end_time}
                onChange={(e) => updateForm('end_time', e.target.value)}
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">카테고리</label>
            <div className="flex flex-wrap gap-1.5">
              {SCHEDULE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => updateForm('category', cat)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium transition-all',
                    form.category === cat
                      ? 'text-white'
                      : 'text-[var(--text-secondary)] hover:opacity-80'
                  )}
                  style={{
                    backgroundColor:
                      form.category === cat
                        ? CATEGORY_COLORS[cat]
                        : `${CATEGORY_COLORS[cat]}20`,
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">색상</label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => updateForm('color', c)}
                  className={cn(
                    'w-6 h-6 rounded-full transition-all',
                    form.color === c && 'ring-2 ring-offset-2 ring-[var(--accent)]'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <Input
            id="schedule-location"
            label="장소"
            placeholder="장소 (선택)"
            value={form.location}
            onChange={(e) => updateForm('location', e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">알림</label>
            <select
              value={form.reminder_minutes}
              onChange={(e) => updateForm('reminder_minutes', Number(e.target.value))}
              className="h-9 w-full rounded-[var(--radius-xs)] border border-[var(--border-widget)] bg-[var(--bg-widget)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
            >
              {REMINDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between mt-6 pt-5 border-t border-[var(--border-widget)]">
          <div>
            {editingSchedule && (
              <Button variant="danger" size="md" onClick={handleDelete}>
                <Trash2 size={14} />
                삭제
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="md" onClick={() => setDialogOpen(false)}>
              취소
            </Button>
            <Button size="md" onClick={handleSubmit}>
              {editingSchedule ? '수정' : '추가'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 파일 가져오기 안내 Dialog — 어떤 파일을 올려야 하는지 먼저 알려주고 파일 피커 실행 */}
      <Dialog
        open={showImportHint}
        onOpenChange={setShowImportHint}
        title="학사일정 · 교육과정 파일 올리기"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span
              className="flex items-center justify-center shrink-0"
              style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
                color: '#fff',
                boxShadow: '0 4px 14px rgba(16,185,129,0.34)',
              }}
            >
              <FileUp size={20} strokeWidth={2.5} />
            </span>
            <p
              className="flex-1"
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                letterSpacing: '-0.2px',
                fontWeight: 600,
              }}
            >
              학교에서 받은 <b style={{ color: 'var(--text-primary)' }}>학사일정표·교육과정 파일</b>을 올리면
              날짜와 행사명을 자동으로 읽어 달력에 추가합니다.
            </p>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(16,185,129,0.10)',
              border: '1px solid rgba(16,185,129,0.25)',
              color: '#047857',
              fontSize: 13,
              lineHeight: 1.55,
              fontWeight: 700,
              letterSpacing: '-0.2px',
            }}
          >
            <div>
              지원 형식 · <span className="tabular-nums">.hwp · .xlsx · .docx · .csv · .ics</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: '#059669', fontWeight: 600 }}>
              제목에 "주간"이 들어간 행사는 자동으로 1주일(월~금) 일정으로 펼쳐집니다.
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end pt-2">
            <Button variant="secondary" size="md" onClick={() => setShowImportHint(false)}>
              취소
            </Button>
            <Button
              size="md"
              onClick={() => {
                setShowImportHint(false)
                setTimeout(() => fileInputRef.current?.click(), 120)
              }}
            >
              <FileUp size={14} strokeWidth={2.5} />
              파일 선택
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
