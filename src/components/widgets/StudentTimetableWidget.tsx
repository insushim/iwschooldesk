import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type {
  TimetableSlot, TimetablePeriod, TimetableOverride, DayOfWeek,
} from '../../types/timetable.types'
import { SUBJECT_COLORS, DAY_LABELS } from '../../types/timetable.types'
import { useDataChange } from '../../hooks/useDataChange'

/**
 * 학생용 시간표 위젯 (전자칠판에 띄워 학생들에게 보여줄 용도).
 *
 * 단일 포커스 뷰: "지금 어떤 시간이냐" / "다음 어떤 시간이냐" 중 하나만 거대하게.
 *  - 수업 중       → "지금 · N교시 [과목]"
 *  - 첫 교시 이전  → "다음 · 1교시 [과목]"
 *  - 쉬는 시간 중  → "다음 · N+1교시 [과목]"
 *  - 마지막 교시 끝 / 주말 → "내일(또는 다음 월요일) · 1교시 [과목]"
 *
 * 전담/강사 정보가 slot에 저장돼 있으면 함께 표시. override(대체 수업)가 있으면 우선.
 * 편집 UI 없음 — 선생님은 기존 "시간표" 메뉴에서 편집.
 */

function pad2(n: number): string { return String(n).padStart(2, '0') }

function todayStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 인자로 받은 날짜 이후의 첫 평일(월~금). 자신이 평일이어도 다음으로 이동. */
function nextWeekday(from: Date): Date {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  do { d.setDate(d.getDate() + 1) } while (d.getDay() === 0 || d.getDay() === 6)
  return d
}

function sameYMD(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from); a.setHours(0, 0, 0, 0)
  const b = new Date(to);   b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** "내일" / "모레" / "3일 뒤(월)" 등 사용자 친화 라벨. */
function humanDayLabel(now: Date, target: Date): string {
  const diff = daysBetween(now, target)
  if (diff === 0) return '오늘'
  if (diff === 1) return '내일'
  if (diff === 2) return '모레'
  const dow = target.getDay()
  if (dow >= 1 && dow <= 5) return DAY_LABELS[(dow - 1) as DayOfWeek] + '요일'
  return `${diff}일 뒤`
}

type Status =
  | { kind: 'now'; period: TimetablePeriod; slot: ResolvedSlot | null; dayLabel: string }
  | { kind: 'before-first'; period: TimetablePeriod; slot: ResolvedSlot | null; dayLabel: string }
  | { kind: 'break'; period: TimetablePeriod; slot: ResolvedSlot | null; dayLabel: string; prevPeriodNumber: number }
  | { kind: 'next-day'; period: TimetablePeriod; slot: ResolvedSlot | null; dayLabel: string; targetDate: Date }
  | { kind: 'none' }

type ResolvedSlot = {
  subject: string
  color: string
  teacher: string
  is_specialist: number
  specialist_teacher: string
  room: string
  /** override에서 온 값이면 true */
  isOverride: boolean
}

function slotFromRegular(s: TimetableSlot): ResolvedSlot {
  return {
    subject: s.subject,
    color: s.color || SUBJECT_COLORS[s.subject] || '#2563EB',
    teacher: s.teacher ?? '',
    is_specialist: s.is_specialist ?? 0,
    specialist_teacher: s.specialist_teacher ?? '',
    room: s.room ?? '',
    isOverride: false,
  }
}

function slotFromOverride(o: TimetableOverride): ResolvedSlot {
  return {
    subject: o.subject,
    color: o.color || SUBJECT_COLORS[o.subject] || '#8B5CF6',
    teacher: o.teacher ?? '',
    is_specialist: 0,
    specialist_teacher: '',
    room: o.room ?? '',
    isOverride: true,
  }
}

export function StudentTimetableWidget() {
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [periods, setPeriods] = useState<TimetablePeriod[]>([])
  const [todayOverrides, setTodayOverrides] = useState<TimetableOverride[]>([])
  const [tomorrowOverrides, setTomorrowOverrides] = useState<TimetableOverride[]>([])
  const [now, setNow] = useState(new Date())

  // 1초로 하면 과하고, 30초면 교시 경계에서 최대 30초 지연. 15초마다가 적정.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])

  // 오늘/다음 평일 override를 필요할 때만 fetch (날짜가 바뀔 때만 재조회)
  const todayStr_ = todayStr(now)
  const nextDay = useMemo(() => nextWeekday(now), [todayStr_]) // eslint-disable-line react-hooks/exhaustive-deps
  const nextDayStr = todayStr(nextDay)

  const reload = useCallback(async () => {
    // slots/periods뿐 아니라 오늘·다음 평일 override까지 함께 새로고침해야
    // 대시보드에서 강사 수업을 추가/삭제한 즉시 위젯에 반영된다.
    const [s, p, todayOv, tomOv] = await Promise.all([
      window.api.timetable.getSlots(),
      window.api.timetable.getPeriods(),
      window.api.timetable.getOverrides(todayStr_).catch(() => []),
      window.api.timetable.getOverrides(nextDayStr).catch(() => []),
    ])
    setSlots(s); setPeriods(p)
    setTodayOverrides(todayOv); setTomorrowOverrides(tomOv)
  }, [todayStr_, nextDayStr])

  useEffect(() => { reload() }, [reload])
  useDataChange('timetable', reload)

  const classPeriods = useMemo(
    () => periods.filter((p) => p.is_break === 0 && p.period > 0).sort((a, b) => a.period - b.period),
    [periods],
  )

  /** 주어진 요일+교시번호+날짜에 대한 ResolvedSlot 찾기 (override 우선). */
  const resolveSlot = useCallback((dow: DayOfWeek, periodNum: number, dateStr: string): ResolvedSlot | null => {
    const overrides = dateStr === todayStr_ ? todayOverrides : tomorrowOverrides
    const ov = overrides.find((o) => o.date === dateStr && o.period === periodNum)
    if (ov) return slotFromOverride(ov)
    const reg = slots.find((s) => s.day_of_week === dow && s.period === periodNum)
    return reg ? slotFromRegular(reg) : null
  }, [slots, todayOverrides, tomorrowOverrides, todayStr_])

  const status: Status = useMemo(() => {
    if (classPeriods.length === 0) return { kind: 'none' }
    const wd = now.getDay()
    const isWeekday = wd >= 1 && wd <= 5
    const tStr = hhmm(now)

    if (isWeekday) {
      const dow = ((wd - 1) as DayOfWeek)
      // 오늘 실제로 수업이 있는 교시만 사용 (빈 슬롯은 "수업" placeholder 방지 위해 제외).
      const todayActive = classPeriods.filter((p) => resolveSlot(dow, p.period, todayStr_) !== null)

      if (todayActive.length > 0) {
        // 1) 현재 수업 중
        const current = todayActive.find((p) => tStr >= p.start_time && tStr < p.end_time)
        if (current) {
          return {
            kind: 'now',
            period: current,
            slot: resolveSlot(dow, current.period, todayStr_),
            dayLabel: '오늘',
          }
        }
        // 2) 다음 교시 (오늘 안에 남아있음)
        const next = todayActive.find((p) => p.start_time > tStr)
        if (next) {
          const prev = [...todayActive].reverse().find((p) => p.end_time <= tStr)
          if (prev) {
            return {
              kind: 'break',
              period: next,
              slot: resolveSlot(dow, next.period, todayStr_),
              dayLabel: '오늘',
              prevPeriodNumber: prev.period,
            }
          }
          return {
            kind: 'before-first',
            period: next,
            slot: resolveSlot(dow, next.period, todayStr_),
            dayLabel: '오늘',
          }
        }
        // 3) 오늘 수업 모두 끝 → 다음 평일로 fallthrough
      }
      // todayActive.length === 0 → 오늘은 수업이 아예 없음(예: 수요일). 다음 평일로 fallthrough.
    }

    // 주말 or 오늘 끝/없음 → 수업이 있는 "다음 평일"의 첫 수업.
    // 다음 평일도 공강이면 그 다음 평일을 찾는다 (최대 7일 스캔).
    let target = nextWeekday(now)
    let firstActive: TimetablePeriod | null = null
    for (let i = 0; i < 7; i++) {
      const dow = ((target.getDay() - 1) as DayOfWeek)
      const firstOnDay = classPeriods.find(
        (p) => resolveSlot(dow, p.period, todayStr(target)) !== null,
      )
      if (firstOnDay) { firstActive = firstOnDay; break }
      target = nextWeekday(target)
    }
    const finalPeriod = firstActive ?? classPeriods[0]
    const finalDow = ((target.getDay() - 1) as DayOfWeek)
    return {
      kind: 'next-day',
      period: finalPeriod,
      slot: resolveSlot(finalDow, finalPeriod.period, todayStr(target)),
      dayLabel: humanDayLabel(now, target),
      targetDate: target,
    }
  }, [classPeriods, now, resolveSlot, todayStr_])

  // ───── 렌더 ─────
  if (status.kind === 'none') {
    return (
      <div className="flex items-center justify-center h-full text-center px-6">
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          시간표가 아직 없어요.<br />
          선생님이 "시간표" 메뉴에서 설정해 주세요.
        </p>
      </div>
    )
  }

  const { period, slot } = status
  const subject = slot?.subject || '수업'
  const color = slot?.color || 'var(--accent)'
  const teacher = slot?.specialist_teacher?.trim() || slot?.teacher?.trim() || ''
  const teacherLabel = slot
    ? slot.is_specialist === 1 && slot.specialist_teacher
      ? `${slot.specialist_teacher} 강사`
      : teacher
        ? `${teacher} 선생님`
        : ''
    : ''

  const badge = (() => {
    switch (status.kind) {
      case 'now': return { text: '지금', emphasis: true }
      case 'before-first': return { text: `${status.dayLabel} · 곧 시작`, emphasis: false }
      case 'break': return { text: `쉬는 시간 후`, emphasis: false }
      case 'next-day': return { text: `${status.dayLabel}`, emphasis: false }
    }
  })()

  const periodLabel = status.kind === 'break'
    ? `${status.prevPeriodNumber}교시 끝 → ${period.period}교시`
    : `${period.period}교시`

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        // 좌/우 최소 26px — shell-radius 22px 곡선 바깥 유지
        padding: 'clamp(14px, 2.4vw, 36px) clamp(26px, 2.6vw, 40px)',
      }}
    >
      {/* 배경 — 과목 색 그라디언트 + 위/아래 글로우. 시인성 ↑. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 80% 15%, ${color}30 0%, transparent 55%),
            radial-gradient(circle at 10% 95%, ${color}1A 0%, transparent 50%),
            linear-gradient(180deg, transparent 0%, ${color}08 100%)
          `,
        }}
      />

      {/* 상단: 배지 (지금/다음/쉬는시간 후/내일) + 교시 */}
      <div
        className="relative flex items-center justify-between gap-2 shrink-0"
        style={{ marginBottom: 'clamp(8px, 1.2vw, 20px)' }}
      >
        <span
          className="inline-flex items-center gap-1.5 font-bold"
          style={{
            fontSize: 'clamp(11px, 1.5vw, 20px)',
            padding: 'clamp(4px, 0.6vw, 8px) clamp(10px, 1.2vw, 18px)',
            borderRadius: 999,
            backgroundColor: badge.emphasis ? color : 'var(--bg-secondary)',
            color: badge.emphasis ? '#fff' : 'var(--text-secondary)',
            letterSpacing: '-0.3px',
            whiteSpace: 'nowrap',
          }}
        >
          {badge.emphasis && (
            <span
              aria-hidden
              className="inline-block rounded-full"
              style={{
                width: 'clamp(6px, 0.8vw, 10px)',
                height: 'clamp(6px, 0.8vw, 10px)',
                backgroundColor: '#fff',
                animation: 'pulse-dot 1.4s infinite',
              }}
            />
          )}
          {badge.text}
        </span>
        <span
          className="font-bold truncate"
          style={{
            fontSize: 'clamp(12px, 1.6vw, 22px)',
            color: 'var(--text-secondary)',
            letterSpacing: '-0.3px',
          }}
          title={periodLabel}
        >
          {periodLabel}
        </span>
      </div>

      {/* 중앙: 과목명 초대형 + 시간 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${status.kind}-${period.period}-${subject}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35 }}
          className="relative flex flex-col flex-1 min-h-0 justify-center"
          style={{ gap: 'clamp(6px, 1vw, 14px)' }}
        >
          <div
            className="flex items-end"
            style={{ gap: 'clamp(8px, 1.2vw, 18px)' }}
          >
            {/* 좌측 과목색 악센트 */}
            <span
              aria-hidden
              style={{
                width: 'clamp(4px, 0.8vw, 10px)',
                height: 'clamp(40px, 10vw, 140px)',
                minHeight: 40,
                borderRadius: 999,
                backgroundColor: color,
                flexShrink: 0,
                boxShadow: `0 4px 14px ${color}55`,
              }}
            />
            <span
              className="truncate"
              style={{
                fontSize: 'clamp(36px, 11vw, 180px)',
                fontWeight: 900,
                letterSpacing: '-0.04em',
                lineHeight: 1.05,
                wordBreak: 'keep-all',
                background: `linear-gradient(180deg, var(--text-primary) 0%, ${color} 130%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textShadow: status.kind === 'now' ? `0 6px 22px ${color}30` : 'none',
              }}
            >
              {subject}
            </span>
          </div>

          {/* 하단: 시간 범위 + 교사(전담/강사) */}
          <div
            className="flex items-center flex-wrap"
            style={{
              gap: 'clamp(8px, 1.4vw, 20px)',
              marginLeft: 'clamp(12px, 2vw, 28px)',
              fontSize: 'clamp(12px, 1.7vw, 22px)',
              color: 'var(--text-secondary)',
              fontWeight: 600,
              letterSpacing: '-0.2px',
            }}
          >
            <span className="tabular-nums">
              {period.start_time} – {period.end_time}
            </span>
            {teacherLabel && (
              <span
                className="inline-flex items-center"
                style={{
                  gap: 6,
                  padding: 'clamp(2px, 0.4vw, 6px) clamp(8px, 1vw, 14px)',
                  borderRadius: 999,
                  backgroundColor: slot?.is_specialist === 1 ? '#7C3AED22' : `${color}1F`,
                  color: slot?.is_specialist === 1 ? '#7C3AED' : color,
                  fontWeight: 700,
                }}
              >
                {teacherLabel}
              </span>
            )}
            {slot?.room && (
              <span
                style={{
                  padding: 'clamp(2px, 0.4vw, 6px) clamp(8px, 1vw, 14px)',
                  borderRadius: 999,
                  backgroundColor: 'var(--bg-secondary)',
                  fontWeight: 600,
                }}
              >
                {slot.room}
              </span>
            )}
            {slot?.isOverride && (
              <span
                style={{
                  padding: 'clamp(2px, 0.4vw, 6px) clamp(8px, 1vw, 14px)',
                  borderRadius: 999,
                  backgroundColor: '#F9731620',
                  color: '#F97316',
                  fontWeight: 700,
                }}
              >
                오늘만 변경
              </span>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  )
}
