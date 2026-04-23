import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Plus, Clock, BookOpen, UserCheck, Trash2, CalendarPlus, Bell, BellOff, Settings2, X } from 'lucide-react'
import { useTimetable } from '../../hooks/useTimetable'
import { useUIStore } from '../../stores/ui.store'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { formatDate } from '../../lib/date-utils'
import { cn } from '../../lib/utils'
import { playSchoolBell } from '../../lib/school-bell'
import type { DayOfWeek, CreateSlotInput, TimetableSlot, TimetableOverride, TimetablePeriod, OverrideKind } from '../../types/timetable.types'
import { DAY_LABELS, SUBJECT_COLORS, SUBJECTS_BY_GRADE } from '../../types/timetable.types'

const DAYS: DayOfWeek[] = [0, 1, 2, 3, 4]

const COLOR_PALETTE = [
  '#EF4444', '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981',
  '#EC4899', '#F97316', '#06B6D4', '#6366F1', '#84CC16',
  '#14B8A6', '#A855F7', '#78716C', '#E11D48',
]

const SPECIALIST_COLOR = '#7C3AED'

/* 시간 입력 컴포넌트 (네이티브 time picker 대신 텍스트 입력) */
function TimeInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/[^0-9:]/g, '')
    // 자동 콜론 삽입: 2자리 입력 후 자동 ":"
    if (v.length === 2 && !v.includes(':')) v = v + ':'
    if (v.length > 5) v = v.slice(0, 5)
    onChange(v)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={handleChange}
      placeholder="00:00"
      maxLength={5}
      className={className}
    />
  )
}

function getSubjectColor(subject: string): string {
  if (!subject) return '#94A3B8'
  if (SUBJECT_COLORS[subject]) return SUBJECT_COLORS[subject]
  let hash = 0
  for (let i = 0; i < subject.length; i++) hash = subject.charCodeAt(i) + ((hash << 5) - hash)
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length]
}

function isCurrentPeriod(startTime: string, endTime: string): boolean {
  const now = new Date()
  if (now.getDay() < 1 || now.getDay() > 5) return false
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const [sH, sM] = startTime.split(':').map(Number)
  const [eH, eM] = endTime.split(':').map(Number)
  return nowMin >= sH * 60 + sM && nowMin < eH * 60 + eM
}

function getTodayDayOfWeek(): DayOfWeek | null {
  const d = new Date().getDay()
  return d >= 1 && d <= 5 ? (d - 1) as DayOfWeek : null
}

interface SlotForm {
  subject: string
  class_name: string
  room: string
  color: string
  memo: string
  is_specialist: boolean
  specialist_teacher: string
}

const emptyForm: SlotForm = { subject: '', class_name: '', room: '', color: '', memo: '', is_specialist: false, specialist_teacher: '' }

type TabType = 'regular' | 'extracurricular' | 'override' | 'periods'

/* ═══════════════════════════════ MAIN ═══════════════════════════════ */
export function TimetableEditor() {
  const { slots, loading, setSlot, deleteSlot, getSlotFor, getClassPeriods, periods, refresh } = useTimetable()
  const addToast = useUIStore((s) => s.addToast)
  const [activeTab, setActiveTab] = useState<TabType>('regular')

  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<{ day: DayOfWeek; period: number } | null>(null)
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null)
  const [form, setForm] = useState<SlotForm>(emptyForm)
  const [grade, setGrade] = useState<number>(() => {
    const saved = localStorage.getItem('timetable_grade')
    return saved ? Number(saved) : 3
  })
  const [draggedSubject, setDraggedSubject] = useState<string | null>(null)
  const [dragOverCell, setDragOverCell] = useState<string | null>(null)
  const [customSubjects, setCustomSubjects] = useState<{ name: string; color: string }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('custom_subjects') || '[]')
    } catch {
      return []
    }
  })
  const [newSubjectName, setNewSubjectName] = useState('')
  const [newSubjectColor, setNewSubjectColor] = useState(COLOR_PALETTE[0])

  useEffect(() => {
    localStorage.setItem('timetable_grade', String(grade))
  }, [grade])

  useEffect(() => {
    localStorage.setItem('custom_subjects', JSON.stringify(customSubjects))
  }, [customSubjects])

  const classPeriods = useMemo(() => getClassPeriods(), [slots, getClassPeriods])
  const todayDay = getTodayDayOfWeek()
  const gradeSubjects = SUBJECTS_BY_GRADE[grade] ?? []

  const allSubjects = useMemo(() => {
    const merged: { name: string; color: string; custom: boolean }[] = []
    for (const s of gradeSubjects) {
      merged.push({ name: s, color: getSubjectColor(s), custom: false })
    }
    for (const c of customSubjects) {
      if (!merged.find((m) => m.name === c.name)) {
        merged.push({ name: c.name, color: c.color, custom: true })
      }
    }
    return merged
  }, [gradeSubjects, customSubjects])

  const handleAddCustomSubject = () => {
    const name = newSubjectName.trim()
    if (!name) return
    if (customSubjects.find((c) => c.name === name) || gradeSubjects.includes(name)) {
      addToast('warning', '이미 있는 과목이에요')
      return
    }
    setCustomSubjects((prev) => [...prev, { name, color: newSubjectColor }])
    setNewSubjectName('')
    addToast('success', `"${name}" 과목 추가`)
  }

  const handleRemoveCustomSubject = (name: string) => {
    setCustomSubjects((prev) => prev.filter((c) => c.name !== name))
  }

  const handleDropSubject = async (day: DayOfWeek, period: number, subject: string) => {
    const custom = customSubjects.find((c) => c.name === subject)
    const color = custom?.color ?? getSubjectColor(subject)
    await setSlot({
      day_of_week: day,
      period,
      subject,
      color,
      is_specialist: 0,
    })
    addToast('success', `${DAY_LABELS[day]}요일 ${period}교시에 ${subject} 추가`)
  }

  const handleCellClick = (day: DayOfWeek, period: number) => {
    const existing = getSlotFor(day, period)
    setEditTarget({ day, period })
    if (existing) {
      setEditingSlot(existing)
      setForm({
        subject: existing.subject,
        class_name: existing.class_name || '',
        room: existing.room || '',
        color: existing.color || getSubjectColor(existing.subject),
        memo: existing.memo || '',
        is_specialist: !!existing.is_specialist,
        specialist_teacher: existing.specialist_teacher || '',
      })
    } else {
      setEditingSlot(null)
      setForm(emptyForm)
    }
    setEditOpen(true)
  }

  // 전담 토글 (우클릭)
  const handleCellRightClick = async (e: React.MouseEvent, day: DayOfWeek, period: number) => {
    e.preventDefault()
    const existing = getSlotFor(day, period)
    if (!existing) return
    await setSlot({
      day_of_week: day,
      period: period,
      subject: existing.subject,
      class_name: existing.class_name,
      room: existing.room,
      color: !existing.is_specialist ? SPECIALIST_COLOR : getSubjectColor(existing.subject),
      memo: existing.memo,
      is_specialist: existing.is_specialist ? 0 : 1,
      specialist_teacher: existing.specialist_teacher,
    })
    addToast('info', existing.is_specialist ? '전담 해제됨' : '전담으로 지정됨')
  }

  const handleSave = async () => {
    if (!editTarget || !form.subject.trim()) {
      addToast('warning', '과목명을 입력해주세요.')
      return
    }
    const color = form.is_specialist ? (form.color || SPECIALIST_COLOR) : (form.color || getSubjectColor(form.subject))
    await setSlot({
      day_of_week: editTarget.day, period: editTarget.period,
      subject: form.subject.trim(), class_name: form.class_name.trim() || undefined,
      room: form.room.trim() || undefined, color,
      memo: form.memo.trim() || undefined,
      is_specialist: form.is_specialist ? 1 : 0,
      specialist_teacher: form.specialist_teacher.trim() || undefined,
    })
    addToast('success', '시간표가 저장되었습니다.')
    setEditOpen(false)
  }

  const handleDelete = async () => {
    if (!editingSlot) return
    await deleteSlot(editingSlot.id)
    addToast('success', '시간표가 삭제되었습니다.')
    setEditOpen(false)
  }

  const handleSubjectChange = (value: string) => {
    setForm((f) => ({ ...f, subject: value, color: f.is_specialist ? SPECIALIST_COLOR : (f.color || getSubjectColor(value)) }))
  }

  const uniqueSubjects = useMemo(() => {
    const map = new Map<string, { color: string; isSpecialist: boolean }>()
    for (const s of slots) {
      if (s.subject && !map.has(s.subject)) {
        map.set(s.subject, { color: s.color || getSubjectColor(s.subject), isSpecialist: !!s.is_specialist })
      }
    }
    return Array.from(map.entries())
  }, [slots])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full px-5 py-5 sm:px-7 lg:px-9 lg:py-6">
      {/* 탭 */}
      <div className="flex items-center gap-2 mb-5 shrink-0">
        {([
          { id: 'regular' as TabType, icon: Clock, label: '기본 시간표', color: 'blue' },
          { id: 'extracurricular' as TabType, icon: BookOpen, label: '비교과 수업', color: 'emerald' },
          { id: 'override' as TabType, icon: UserCheck, label: '강사 수업 관리', color: 'purple' },
          { id: 'periods' as TabType, icon: Settings2, label: '교시 시간 · 종소리', color: 'amber' },
        ]).map((tab) => {
          const isActive = activeTab === tab.id
          const activeCls = tab.color === 'purple'
            ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20 border-purple-500'
            : tab.color === 'emerald'
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 border-emerald-500'
              : tab.color === 'amber'
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 border-amber-500'
                : 'bg-[var(--accent)] text-white shadow-lg shadow-blue-500/20 border-[var(--accent)]'
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl font-semibold transition-all border ${
                isActive
                  ? activeCls
                  : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-widget-hover)]'
              }`}
              style={{
                padding: '12px 24px',
                fontSize: '15px',
                ...(isActive ? {} : { borderColor: 'rgba(15,23,42,0.12)' }),
              }}
            >
              <div className="flex items-center gap-2"><tab.icon size={16} />{tab.label}</div>
            </button>
          )
        })}
      </div>

      {activeTab === 'override' ? (
        <OverrideManager kind="instructor" />
      ) : activeTab === 'extracurricular' ? (
        <OverrideManager kind="extracurricular" />
      ) : activeTab === 'periods' ? (
        <PeriodTimeEditor periods={periods} onSave={refresh} />
      ) : (
        <div className="flex flex-col gap-5 flex-1 overflow-y-auto">
          {/* 학년 선택 + 안내 */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-[var(--text-muted)] px-1">
              셀을 클릭해서 과목을 입력하거나, <span className="text-[var(--accent)] font-medium">아래 과목 칩을 드래그</span>해서 놓으세요. <span className="text-purple-400 font-medium">우클릭</span>하면 전담 수업으로 지정/해제됩니다.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--text-secondary)]">학년</span>
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <button
                  key={g}
                  onClick={() => setGrade(g)}
                  style={{
                    width: '40px',
                    height: '36px',
                    fontSize: '14px',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: grade === g ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                    backgroundColor: grade === g ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: grade === g ? '#fff' : 'var(--text-secondary)',
                  }}
                  className="font-semibold transition-all hover:opacity-90"
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* 시간표 그리드 */}
          <div className="overflow-x-auto rounded-2xl border border-[var(--border-widget)]">
            <table className="w-full border-collapse" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th className="w-24 p-3 text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-secondary)] border-b border-r border-[var(--border-widget)]">
                    <Clock size={14} className="mx-auto opacity-50" />
                  </th>
                  {DAYS.map((day) => (
                    <th key={day} className="p-3 text-sm font-semibold border-b border-r border-[var(--border-widget)] last:border-r-0"
                      style={{
                        backgroundColor: todayDay === day ? 'var(--accent-light, rgba(99,102,241,0.08))' : 'var(--bg-secondary)',
                        color: todayDay === day ? 'var(--accent)' : 'var(--text-primary)',
                      }}>
                      {DAY_LABELS[day]}요일
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classPeriods.map((pInfo) => {
                  const isCurrent = todayDay !== null && isCurrentPeriod(pInfo.start_time, pInfo.end_time)
                  return (
                    <tr key={pInfo.period}>
                      <td className="px-4 py-3 text-center border-b border-r border-[var(--border-widget)] bg-[var(--bg-secondary)] whitespace-nowrap"
                        style={{ backgroundColor: isCurrent ? 'var(--accent-light, rgba(99,102,241,0.08))' : undefined }}>
                        <div className="text-xs font-bold text-[var(--text-primary)]">{pInfo.label || `${pInfo.period}교시`}</div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-1">{pInfo.start_time} ~ {pInfo.end_time}</div>
                      </td>
                      {DAYS.map((day) => {
                        const slot = getSlotFor(day, pInfo.period)
                        const isHL = todayDay === day && isCurrent
                        const cellKey = `${day}-${pInfo.period}`
                        const isDragOver = dragOverCell === cellKey
                        return (
                          <td key={day}
                            className="border-b border-r border-[var(--border-widget)] last:border-r-0 p-0 transition-colors"
                            style={{
                              height: 82,
                              minWidth: 100,
                              backgroundColor: isDragOver ? 'rgba(99,102,241,0.15)' : undefined,
                              outline: isDragOver ? '2px dashed var(--accent)' : undefined,
                              outlineOffset: '-2px',
                            }}
                            onContextMenu={(e) => handleCellRightClick(e, day, pInfo.period)}
                            onDragOver={(e) => {
                              if (draggedSubject) {
                                e.preventDefault()
                                e.dataTransfer.dropEffect = 'copy'
                                setDragOverCell(cellKey)
                              }
                            }}
                            onDragLeave={() => {
                              if (dragOverCell === cellKey) setDragOverCell(null)
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              const subject = e.dataTransfer.getData('text/subject') || draggedSubject
                              setDragOverCell(null)
                              setDraggedSubject(null)
                              if (subject) handleDropSubject(day, pInfo.period, subject)
                            }}
                          >
                            <CellButton slot={slot} isHighlighted={isHL} onClick={() => handleCellClick(day, pInfo.period)} />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 과목 팔레트 (드래그) */}
          <div className="rounded-2xl border border-[var(--border-widget)] bg-[var(--bg-secondary)]/30 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BookOpen size={15} className="text-[var(--accent)]" />
                <span className="text-sm font-bold text-[var(--text-primary)]">{grade}학년 과목</span>
                <span className="text-xs text-[var(--text-muted)]">· 드래그해서 시간표에 놓으세요</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5 mb-4">
              {allSubjects.map(({ name: subj, color, custom }) => {
                const isDragging = draggedSubject === subj
                return (
                  <div
                    key={subj}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'copy'
                      e.dataTransfer.setData('text/subject', subj)
                      setDraggedSubject(subj)
                    }}
                    onDragEnd={() => {
                      setDraggedSubject(null)
                      setDragOverCell(null)
                    }}
                    style={{
                      paddingLeft: '18px',
                      paddingRight: custom ? '8px' : '18px',
                      paddingTop: '10px',
                      paddingBottom: '10px',
                      fontSize: '14px',
                      borderRadius: '10px',
                      border: `1.5px solid ${color}`,
                      backgroundColor: `${color}20`,
                      color,
                      cursor: 'grab',
                      opacity: isDragging ? 0.5 : 1,
                      userSelect: 'none',
                    }}
                    className="font-semibold transition-all hover:scale-105 active:cursor-grabbing active:scale-95 inline-flex items-center gap-2 group"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    {subj}
                    {custom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveCustomSubject(subj)
                        }}
                        className="ml-1 p-0.5 rounded-full hover:bg-red-500/20 opacity-60 hover:opacity-100"
                        title="커스텀 과목 삭제"
                        style={{ color }}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 커스텀 과목 추가 */}
            <div className="flex items-center gap-2 pt-4 border-t border-dashed border-[var(--border-widget)]">
              <span className="text-xs font-medium text-[var(--text-muted)] shrink-0">+ 과목 추가</span>
              <input
                type="text"
                placeholder="예: 클럽활동, 자치, 독서"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    handleAddCustomSubject()
                  }
                }}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--border-widget)] bg-[var(--bg-widget)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <div className="flex items-center gap-1">
                {COLOR_PALETTE.slice(0, 10).map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewSubjectColor(c)}
                    className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      outline: newSubjectColor === c ? '2px solid var(--text-primary)' : 'none',
                      outlineOffset: 2,
                    }}
                    title={c}
                  />
                ))}
              </div>
              <Button size="sm" onClick={handleAddCustomSubject} disabled={!newSubjectName.trim()}>
                <Plus size={14} /> 추가
              </Button>
            </div>
          </div>

          {/* 사용 중인 과목 범례 */}
          {uniqueSubjects.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap px-2">
              <span className="text-xs text-[var(--text-muted)]">사용 중:</span>
              {uniqueSubjects.map(([subj, info]) => (
                <span key={subj} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: info.color }} />
                  {subj}
                  {info.isSpecialist && <span className="text-xs px-1 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">전담</span>}
                </span>
              ))}
            </div>
          )}

          {/* 편집 다이얼로그 */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}
            title={editTarget ? `${DAY_LABELS[editTarget.day]}요일 ${editTarget.period === 0 ? '아침활동' : `${editTarget.period}교시`}` : '시간표 편집'}>
            <div className="flex flex-col gap-4">
              {/* 전담 토글 */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-purple-500/5 border border-purple-500/10">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">전담 수업</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">전담 교사가 들어오는 수업</p>
                </div>
                <button onClick={() => setForm((f) => ({
                  ...f, is_specialist: !f.is_specialist,
                  color: !f.is_specialist ? SPECIALIST_COLOR : getSubjectColor(f.subject),
                }))}
                  className={`w-11 h-6 rounded-full transition-all relative ${form.is_specialist ? 'bg-purple-500' : 'bg-[var(--text-muted)]/30'}`}>
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 shadow transition-all" style={{ left: form.is_specialist ? 22 : 2 }} />
                </button>
              </div>

              <Input label="과목명" placeholder="예: 국어, 수학, 영어" value={form.subject}
                onChange={(e) => handleSubjectChange(e.target.value)} list="subject-suggestions" />
              <datalist id="subject-suggestions">
                {Object.keys(SUBJECT_COLORS).map((s) => <option key={s} value={s} />)}
              </datalist>

              {form.is_specialist && (
                <Input label="전담 교사명" placeholder="예: 김영어 선생님" value={form.specialist_teacher}
                  onChange={(e) => setForm((f) => ({ ...f, specialist_teacher: e.target.value }))} />
              )}

              <div className="grid grid-cols-2 gap-3">
                <Input label="학급/반" placeholder="예: 5-3" value={form.class_name}
                  onChange={(e) => setForm((f) => ({ ...f, class_name: e.target.value }))} />
                <Input label="교실" placeholder="예: 영어실" value={form.room}
                  onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-[var(--text-secondary)]">색상</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_PALETTE.map((c) => (
                    <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))}
                      className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                      style={{ backgroundColor: c, borderColor: form.color === c ? 'var(--text-primary)' : 'transparent' }} />
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">메모</label>
                <textarea rows={2} placeholder="수업 관련 메모..." value={form.memo}
                  onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                  className="w-full rounded-[var(--radius-xs)] border border-[var(--border-widget)] bg-[var(--bg-widget)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none" />
              </div>

              <div className="flex justify-between pt-2">
                <div>{editingSlot && <Button variant="danger" size="sm" onClick={handleDelete} style={{ paddingLeft: 24, paddingRight: 24 }}>삭제</Button>}</div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditOpen(false)} style={{ paddingLeft: 24, paddingRight: 24 }}>취소</Button>
                  <Button size="sm" onClick={handleSave} style={{ paddingLeft: 24, paddingRight: 24 }}>저장</Button>
                </div>
              </div>
            </div>
          </Dialog>
        </div>
      )}
    </div>
  )
}

/* ═══════════ 교시 시간 · 종소리 설정 ═══════════ */
function PeriodTimeEditor({ periods: initialPeriods, onSave }: { periods: TimetablePeriod[]; onSave: () => void }) {
  const addToast = useUIStore((s) => s.addToast)
  const [editPeriods, setEditPeriods] = useState<TimetablePeriod[]>([])
  const [bellSettings, setBellSettings] = useState<Record<string, { startBell: boolean; endBell: boolean }>>({})

  useEffect(() => {
    const sorted = [...initialPeriods].sort((a, b) => a.period - b.period)
    setEditPeriods(sorted)

    // 종소리 설정 로드 — 저장값 없으면 수업 교시 전부 ON을 기본값으로
    window.api.settings.get('bell_settings' as 'theme').then((val) => {
      if (val && typeof val === 'object' && Object.keys(val).length > 0) {
        setBellSettings(val as Record<string, { startBell: boolean; endBell: boolean }>)
      } else {
        const defaults: Record<string, { startBell: boolean; endBell: boolean }> = {}
        for (const p of sorted) {
          if (!p.is_break) defaults[p.id] = { startBell: true, endBell: true }
        }
        setBellSettings(defaults)
      }
    }).catch(() => {})
  }, [initialPeriods])

  const handleTimeChange = (id: string, field: 'start_time' | 'end_time', value: string) => {
    setEditPeriods((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p))
  }

  const handleLabelChange = (id: string, value: string) => {
    setEditPeriods((prev) => prev.map((p) => p.id === id ? { ...p, label: value } : p))
  }

  const handleBellToggle = (periodId: string, type: 'startBell' | 'endBell') => {
    setBellSettings((prev) => {
      const cur = prev[periodId] ?? { startBell: true, endBell: true }
      return { ...prev, [periodId]: { ...cur, [type]: !cur[type] } }
    })
  }

  const handleSaveAll = async () => {
    // 교시 시간 저장
    await window.api.timetable.updatePeriods(editPeriods)

    // 종소리 설정 저장
    await window.api.settings.set('bell_settings' as 'theme', bellSettings as unknown as string)

    onSave()
    addToast('success', '교시 시간과 종소리 설정이 저장되었습니다.')
  }

  const handleTestBell = (type: 'start' | 'end') => {
    playSchoolBell(type)
    addToast('info', type === 'start' ? '수업 시작 종소리 미리듣기' : '수업 끝 종소리 미리듣기')
  }

  const classP = editPeriods.filter((p) => !p.is_break)
  const breakP = editPeriods.filter((p) => p.is_break)

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-5">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)]">교시 시간 · 종소리 설정</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">각 교시의 시작/종료 시간을 변경하고, 종소리를 설정하세요</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => handleTestBell('start')} size="sm">
            <Bell size={14} /> 시작종 미리듣기
          </Button>
          <Button variant="secondary" onClick={() => handleTestBell('end')} size="sm">
            <Bell size={14} /> 끝종 미리듣기
          </Button>
          <Button onClick={handleSaveAll}>저장</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl space-y-2">
          {/* 헤더 */}
          <div className="grid grid-cols-[1fr_120px_120px_80px_80px] gap-3 px-5 py-2 text-xs font-semibold text-[var(--text-muted)]">
            <span>교시</span>
            <span className="text-center">시작 시간</span>
            <span className="text-center">종료 시간</span>
            <span className="text-center">시작종</span>
            <span className="text-center">끝종</span>
          </div>

          {classP.map((p) => {
            const bell = bellSettings[p.id] ?? { startBell: true, endBell: true }
            return (
              <div key={p.id} className="grid grid-cols-[1fr_120px_120px_80px_80px] gap-3 items-center px-5 py-3.5 rounded-xl bg-[var(--bg-widget)] border border-[var(--border-widget)] hover:border-[var(--accent)]/30 transition-all shadow-sm hover:shadow-md">
                <div>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{p.label}</span>
                  {p.period === 0 && <span className="text-xs text-[var(--text-muted)] ml-2">아침활동</span>}
                </div>
                <TimeInput
                  value={p.start_time}
                  onChange={(v) => handleTimeChange(p.id, 'start_time', v)}
                  className="h-10 px-3 rounded-lg border border-[var(--border-widget)] bg-[var(--bg-widget)] text-sm text-[var(--text-primary)] text-center outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <TimeInput
                  value={p.end_time}
                  onChange={(v) => handleTimeChange(p.id, 'end_time', v)}
                  className="h-10 px-3 rounded-lg border border-[var(--border-widget)] bg-[var(--bg-widget)] text-sm text-[var(--text-primary)] text-center outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <div className="flex justify-center">
                  <button onClick={() => handleBellToggle(p.id, 'startBell')}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${bell.startBell ? 'bg-emerald-500/15 text-emerald-500' : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]'}`}>
                    {bell.startBell ? <Bell size={16} /> : <BellOff size={16} />}
                  </button>
                </div>
                <div className="flex justify-center">
                  <button onClick={() => handleBellToggle(p.id, 'endBell')}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${bell.endBell ? 'bg-amber-500/15 text-amber-500' : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]'}`}>
                    {bell.endBell ? <Bell size={16} /> : <BellOff size={16} />}
                  </button>
                </div>
              </div>
            )
          })}

          {/* 쉬는시간/점심 — 이름은 자유롭게 수정 가능 */}
          {breakP.length > 0 && (
            <>
              <div className="pt-4 pb-1 px-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-muted)]">쉬는 시간 · 식사 시간 (이름 수정 가능)</span>
              </div>
              {breakP.map((p) => (
                <div key={p.id} className="grid grid-cols-[1fr_120px_120px_80px_80px] gap-3 items-center px-5 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-widget)] hover:border-[var(--accent)]/20 transition-all">
                  <input
                    type="text"
                    value={p.label}
                    onChange={(e) => handleLabelChange(p.id, e.target.value)}
                    placeholder="예: 점심시간, 1-2교시 쉬는시간"
                    className="h-10 px-3 rounded-lg border border-[var(--border-widget)] bg-[var(--bg-widget)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  <TimeInput value={p.start_time}
                    onChange={(v) => handleTimeChange(p.id, 'start_time', v)}
                    className="h-10 px-3 rounded-lg border border-[var(--border-widget)] bg-[var(--bg-widget)] text-sm text-[var(--text-primary)] text-center outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                  <TimeInput value={p.end_time}
                    onChange={(v) => handleTimeChange(p.id, 'end_time', v)}
                    className="h-10 px-3 rounded-lg border border-[var(--border-widget)] bg-[var(--bg-widget)] text-sm text-[var(--text-primary)] text-center outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                  <div />
                  <div />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── 셀 버튼 ─── */
function CellButton({ slot, isHighlighted, onClick }: { slot: TimetableSlot | undefined; isHighlighted: boolean; onClick: () => void }) {
  if (!slot) {
    return (
      <motion.button onClick={onClick}
        className="w-full h-full flex items-center justify-center group/c cursor-pointer transition-colors"
        style={{ backgroundColor: isHighlighted ? 'var(--accent-light, rgba(99,102,241,0.04))' : 'transparent' }}
        whileHover={{ backgroundColor: 'var(--bg-secondary)' }}>
        <Plus size={16} className="text-[var(--text-muted)] opacity-0 group-hover/c:opacity-40 transition-opacity" />
      </motion.button>
    )
  }

  const color = slot.color || getSubjectColor(slot.subject)
  const isSpec = !!slot.is_specialist

  return (
    <motion.button onClick={onClick}
      className="w-full h-full flex flex-col items-center justify-center gap-1 cursor-pointer relative overflow-hidden px-2 py-2"
      style={{
        backgroundColor: `${color}${isSpec ? '12' : '18'}`,
        borderLeft: isHighlighted ? '3px solid var(--accent)' : `3px solid ${color}`,
        borderTop: isSpec ? `2px dashed ${color}50` : 'none',
      }}
      whileHover={{ scale: 1.02 }} transition={{ duration: 0.15 }}>
      {isHighlighted && (
        <motion.div className="absolute inset-0 pointer-events-none"
          style={{ background: `linear-gradient(135deg, transparent 50%, ${color}10 100%)` }}
          animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} />
      )}
      {isSpec && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-bold relative z-10">전담</span>}
      <span className="text-xs font-semibold leading-tight relative z-10" style={{ color }}>{slot.subject}</span>
      {(slot.specialist_teacher || slot.room) && (
        <span className="text-xs text-[var(--text-muted)] relative z-10">
          {isSpec && slot.specialist_teacher ? slot.specialist_teacher : slot.room}
        </span>
      )}
    </motion.button>
  )
}

/* ═══════════ 시간표 Override 관리 (강사수업·비교과 공용) ═══════════ */
function OverrideManager({ kind }: { kind: OverrideKind }) {
  const isExtra = kind === 'extracurricular'
  const label = {
    title: isExtra ? '비교과 수업 관리' : '강사 수업 관리',
    desc: isExtra
      ? '보건·상담·영양·안전 등 일회성·간헐 수업을 등록하세요 (내부 선생님이 진행)'
      : '특정 날짜에만 적용되는 외부 강사 수업, 대체 수업 등을 등록하세요',
    addBtn: isExtra ? '비교과 수업 추가' : '강사 수업 추가',
    dialogTitle: isExtra ? '비교과 수업' : '강사 수업',
    teacherLabel: isExtra ? '담당 선생님' : '강사/교사명',
    teacherPh: isExtra ? '예: 보건 김선생' : '예: 김영어 강사',
    subjectPh: isExtra ? '예: 보건 · 상담 · 영양' : '예: 영어회화',
    emptyIcon: isExtra ? BookOpen : UserCheck,
    emptyMsg: isExtra ? '등록된 비교과 수업이 없습니다' : '등록된 강사 수업이 없습니다',
    emptyHint: isExtra ? '보건·상담·영양 등 비교과 수업을 미리 등록해보세요' : '강사 수업이나 대체 수업을 미리 등록해보세요',
  }
  const defaultColor = isExtra ? '#10B981' : '#8B5CF6'
  const accentTint = isExtra ? 'emerald' : 'purple'

  const addToast = useUIStore((s) => s.addToast)
  const [overrides, setOverrides] = useState<TimetableOverride[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [periods, setPeriods] = useState<{ period: number; label: string; start_time: string }[]>([])

  const [formDate, setFormDate] = useState(formatDate(new Date(), 'yyyy-MM-dd'))
  const [formPeriod, setFormPeriod] = useState(1)
  const [formSubject, setFormSubject] = useState('')
  const [formTeacher, setFormTeacher] = useState('')
  const [formRoom, setFormRoom] = useState('')
  const [formMemo, setFormMemo] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const [filterFrom, setFilterFrom] = useState(() => formatDate(new Date(), 'yyyy-MM-dd'))
  const [filterTo, setFilterTo] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30)
    return formatDate(d, 'yyyy-MM-dd')
  })

  const loadOverrides = async () => {
    const all: TimetableOverride[] = []
    const start = new Date(filterFrom)
    const end = new Date(filterTo)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const r = await window.api.timetable.getOverrides(formatDate(d, 'yyyy-MM-dd'))
      all.push(...r)
    }
    // 기존 데이터는 kind가 null일 수 있으므로 instructor로 간주
    const filtered = all.filter((o) => (o.kind ?? 'instructor') === kind)
    setOverrides(filtered.sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period))
  }

  useEffect(() => {
    loadOverrides()
    window.api.timetable.getPeriods().then((p) =>
      setPeriods(p.filter((x) => x.is_break === 0 && x.period >= 1).sort((a, b) => a.period - b.period))
    )

  }, [filterFrom, filterTo, kind])

  const resetForm = () => { setFormDate(formatDate(new Date(), 'yyyy-MM-dd')); setFormPeriod(1); setFormSubject(''); setFormTeacher(''); setFormRoom(''); setFormMemo(''); setEditingId(null) }
  const handleEdit = (ov: TimetableOverride) => { setEditingId(ov.id); setFormDate(ov.date); setFormPeriod(ov.period); setFormSubject(ov.subject); setFormTeacher(ov.teacher); setFormRoom(ov.room); setFormMemo(ov.memo); setDialogOpen(true) }

  const handleSave = async () => {
    if (!formSubject.trim()) { addToast('warning', '과목명을 입력해주세요.'); return }
    await window.api.timetable.createOverride({
      date: formDate, period: formPeriod,
      subject: formSubject.trim(), teacher: formTeacher.trim(),
      room: formRoom.trim(), color: defaultColor, memo: formMemo.trim(),
      kind,
    })
    addToast('success', editingId ? `${label.dialogTitle}이(가) 수정되었습니다.` : `${label.dialogTitle}이(가) 추가되었습니다.`)
    setDialogOpen(false); resetForm(); loadOverrides()
  }

  const handleDelete = async (id: string) => {
    await window.api.timetable.deleteOverride(id)
    addToast('success', `${label.dialogTitle}이(가) 삭제되었습니다.`)
    loadOverrides()
  }

  const grouped = useMemo(() => {
    const m = new Map<string, TimetableOverride[]>()
    for (const o of overrides) { const l = m.get(o.date) ?? []; l.push(o); m.set(o.date, l) }
    return Array.from(m.entries())
  }, [overrides])

  const getDayLabel = (ds: string) => ['일', '월', '화', '수', '목', '금', '토'][new Date(ds).getDay()]
  const getPeriodTime = (p: number) => periods.find((x) => x.period === p)?.start_time ?? ''

  const EmptyIcon = label.emptyIcon
  const badgeCls = accentTint === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-purple-500/10 text-purple-400'
  const chipCls = accentTint === 'emerald' ? 'bg-emerald-500/10' : 'bg-purple-500/10'
  const chipText = accentTint === 'emerald' ? 'text-emerald-400' : 'text-purple-400'

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-5">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)]">{label.title}</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">{label.desc}</p>
        </div>
        <Button
          size="sm"
          onClick={() => { resetForm(); setDialogOpen(true) }}
          className="whitespace-nowrap shrink-0"
          style={{ padding: '11px 22px', fontSize: 13, gap: 8 }}
        >
          <CalendarPlus size={15} strokeWidth={2.4} />
          <span className="whitespace-nowrap">{label.addBtn}</span>
        </Button>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <Input label="시작일" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="w-44" />
        <span className="text-[var(--text-muted)] mt-5">~</span>
        <Input label="종료일" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="w-44" />
        <span className="text-xs text-[var(--text-muted)] mt-5">총 {overrides.length}건</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {overrides.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <EmptyIcon size={40} strokeWidth={1.2} className="mb-3 opacity-25" />
            <p className="text-sm">{label.emptyMsg}</p>
            <p className="text-xs mt-1">{label.emptyHint}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([date, items]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-2.5 sticky top-0 bg-[var(--bg-primary)] py-1.5 z-10">
                  <span className="text-sm font-bold text-[var(--text-primary)]">{formatDate(date, 'M월 d일')}</span>
                  <span className="text-xs text-[var(--text-muted)]">({getDayLabel(date)})</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badgeCls)}>{items.length}건</span>
                </div>
                <div className="space-y-2">
                  {items.map((ov) => (
                    <div key={ov.id} className="flex items-center gap-4 px-5 py-3.5 rounded-xl bg-[var(--bg-widget)] border border-[var(--border-widget)] hover:border-[var(--accent)]/30 transition-all shadow-sm hover:shadow-md group">
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', chipCls)}>
                        <span className={cn('text-xs font-bold', chipText)}>{ov.period}</span>
                      </div>
                      <span className="text-xs text-[var(--text-muted)] w-12 shrink-0">{getPeriodTime(ov.period)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">{ov.subject}</span>
                          {ov.teacher && <span className={cn('text-xs', chipText)}>{ov.teacher}</span>}
                        </div>
                        {(ov.room || ov.memo) && <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{[ov.room, ov.memo].filter(Boolean).join(' · ')}</p>}
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(ov)} className="px-2.5 py-1 rounded-lg text-xs hover:bg-[var(--bg-widget)] text-[var(--text-muted)] hover:text-[var(--accent)]">편집</button>
                        <button onClick={() => handleDelete(ov.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title={editingId ? `${label.dialogTitle} 수정` : `${label.dialogTitle} 추가`}>
        <p className="text-xs text-[var(--text-muted)] mb-4">해당 날짜에만 기본 시간표 대신 적용됩니다</p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="날짜" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">교시</label>
              <select value={formPeriod} onChange={(e) => setFormPeriod(Number(e.target.value))}
                className="h-9 w-full rounded-[var(--radius-xs)] border border-[var(--border-widget)] bg-[var(--bg-widget)] px-3 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]">
                {periods.map((p) => <option key={p.period} value={p.period}>{p.period}교시 ({p.start_time})</option>)}
              </select>
            </div>
          </div>
          {isExtra ? (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-[var(--text-secondary)]">과목</label>
              <div className="flex flex-wrap gap-2">
                {['보건', '상담', '영양', '사서'].map((s) => {
                  const active = formSubject === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormSubject(s)}
                      className={cn(
                        'px-5 py-2.5 rounded-full text-sm font-medium transition-all border',
                        active
                          ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                          : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-widget)] hover:bg-[var(--bg-widget-hover)]'
                      )}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
              <Input
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                placeholder="또는 직접 입력 (예: 안전, 환경, …)"
              />
            </div>
          ) : (
            <Input label="과목명" value={formSubject} onChange={(e) => setFormSubject(e.target.value)} placeholder={label.subjectPh} />
          )}
          <Input label={label.teacherLabel} value={formTeacher} onChange={(e) => setFormTeacher(e.target.value)} placeholder={label.teacherPh} />
          <Input label="교실" value={formRoom} onChange={(e) => setFormRoom(e.target.value)} placeholder="예: 보건실" />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">메모</label>
            <textarea rows={2} value={formMemo} onChange={(e) => setFormMemo(e.target.value)} placeholder="참고 사항..."
              className="w-full rounded-[var(--radius-xs)] border border-[var(--border-widget)] bg-[var(--bg-widget)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setDialogOpen(false)} style={{ paddingLeft: 28, paddingRight: 28 }}>취소</Button>
          <Button onClick={handleSave} style={{ paddingLeft: 28, paddingRight: 28 }}>{editingId ? '수정' : '추가'}</Button>
        </div>
      </Dialog>
    </div>
  )
}
