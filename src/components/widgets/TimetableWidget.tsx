import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import type { TimetableSlot, TimetablePeriod, TimetableOverride, DayOfWeek } from '../../types/timetable.types'
import { DAY_LABELS } from '../../types/timetable.types'
import { useDataChange } from '../../hooks/useDataChange'

function pad2(n: number): string { return String(n).padStart(2, '0') }
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const DAYS: DayOfWeek[] = [0, 1, 2, 3, 4]

// 초등 교사가 실제로 쓰는 관용 축약. 4글자 이상인 과목만 축약, 3글자 이하는 원본 유지.
const SUBJECT_SHORT: Record<string, string> = {
  '바른생활': '바생',
  '슬기로운생활': '슬생',
  '즐거운생활': '즐생',
  '안전한생활': '안생',
  '방과후': '방후',
}

function shortSubject(s: string): string {
  if (!s) return ''
  if (s.length <= 3) return s // "동아리", "바른", "국어" 등 모두 그대로
  return SUBJECT_SHORT[s] ?? s.slice(0, 3)
}

export function TimetableWidget() {
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [periods, setPeriods] = useState<TimetablePeriod[]>([])
  const [todayOverrides, setTodayOverrides] = useState<TimetableOverride[]>([])
  const [now, setNow] = useState(new Date())
  const todayStr_ = ymd(now)

  const reload = useCallback(() => {
    Promise.all([
      window.api.timetable.getSlots(),
      window.api.timetable.getPeriods(),
      window.api.timetable.getOverrides(ymd(new Date())),
    ]).then(([s, p, o]) => { setSlots(s); setPeriods(p); setTodayOverrides(o) })
  }, [])

  useEffect(() => { reload() }, [reload])
  // 자정을 넘기면 오늘 override를 새로 가져온다
  useEffect(() => {
    window.api.timetable.getOverrides(todayStr_).then(setTodayOverrides).catch(() => setTodayOverrides([]))
  }, [todayStr_])
  // 메인 대시보드에서 시간표/강사 수업 편집 시 위젯 자동 갱신 (slots·periods·오늘 override까지)
  useDataChange('timetable', reload)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const classPeriods = useMemo(() =>
    // 0교시(아침활동) 제외 + 쉬는시간/점심 제외 + period 오름차순
    periods.filter((p) => p.is_break === 0 && p.period > 0).sort((a, b) => a.period - b.period),
    [periods]
  )

  const todayIdx: DayOfWeek | -1 = useMemo(() => {
    const d = now.getDay()
    return d >= 1 && d <= 5 ? ((d - 1) as DayOfWeek) : -1
  }, [now])

  const currentPeriod = useMemo(() => {
    if (todayIdx === -1) return null
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    return classPeriods.find((p) => timeStr >= p.start_time && timeStr < p.end_time) ?? null
  }, [todayIdx, now, classPeriods])

  const slotMap = useMemo(() => {
    const m = new Map<string, TimetableSlot>()
    for (const s of slots) m.set(`${s.day_of_week}-${s.period}`, s)
    // 오늘 컬럼에 한해 override 우선 적용 — 강사 수업이 추가되면 즉시 반영.
    if (todayIdx !== -1 && todayOverrides.length > 0) {
      for (const o of todayOverrides) {
        if (o.date !== todayStr_) continue
        m.set(`${todayIdx}-${o.period}`, {
          id: `override-${o.id}`,
          day_of_week: todayIdx,
          period: o.period,
          subject: o.subject,
          class_name: '',
          teacher: o.teacher ?? '',
          room: o.room ?? '',
          color: o.color || '#8B5CF6',
          memo: o.memo ?? '',
          semester: '',
          timetable_set: 'default',
          is_specialist: 1,
          specialist_teacher: o.teacher ?? '',
          created_at: o.created_at,
          updated_at: o.created_at,
        })
      }
    }
    return m
  }, [slots, todayOverrides, todayIdx, todayStr_])

  // 교사용 주간 격자 — StudentTimetable 의 거대한 단일뷰와 달리, 한눈에 주간 전체를 본다.
  // 학생체크 / 학생시간표의 톤과 맞추기: cqmin 기반 유동 스케일, 날짜·교시 헤더는 미니멀한 pill,
  // 전담 표시는 좌측 bar + "T" 대신 우상단 컬러 dot(halo) 하나로 정리, 현재 교시는 맥동 dot + 색 링.
  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        containerType: 'size',
        padding: 'clamp(12px, 2.8cqmin, 22px) clamp(16px, 3.6cqmin, 28px) clamp(18px, 4cqmin, 32px)',
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"tnum", "ss03"',
        background: 'radial-gradient(ellipse at 100% 0%, rgba(37,99,235,0.05) 0%, transparent 55%)',
      }}
    >
      {todayIdx === -1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: 'clamp(4px, 1cqmin, 8px)',
          }}
        >
          <span
            style={{
              fontSize: 'clamp(10px, 1.6cqmin, 13px)',
              fontWeight: 800,
              color: 'var(--accent)',
              backgroundColor: 'var(--accent-light)',
              padding: 'clamp(2px, 0.6cqmin, 4px) clamp(8px, 1.4cqmin, 12px)',
              borderRadius: 999,
              letterSpacing: '-0.2px',
            }}
          >
            다음 주
          </span>
        </div>
      )}

      <div
        className="flex-1 min-h-0"
        style={{
          display: 'grid',
          gridTemplateColumns: 'clamp(26px, 5.5cqmin, 44px) repeat(5, 1fr)',
          gridTemplateRows: `clamp(24px, 5cqmin, 38px) repeat(${classPeriods.length}, 1fr)`,
          gap: 'clamp(3px, 0.8cqmin, 6px)',
        }}
      >
        <div />
        {DAYS.map((d) => {
          const isToday = todayIdx === d
          return (
            <div
              key={d}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'clamp(3px, 0.7cqmin, 6px)',
                fontSize: 'clamp(11px, 2.3cqmin, 17px)',
                fontWeight: isToday ? 900 : 700,
                color: isToday ? 'var(--accent)' : 'var(--text-muted)',
                letterSpacing: '-0.3px',
              }}
            >
              {DAY_LABELS[d]}
              {isToday && (
                <span
                  aria-hidden
                  style={{
                    width: 'clamp(4px, 0.9cqmin, 6px)',
                    height: 'clamp(4px, 0.9cqmin, 6px)',
                    borderRadius: 999,
                    backgroundColor: 'var(--accent)',
                    boxShadow: '0 0 0 2px rgba(37,99,235,0.18)',
                  }}
                />
              )}
            </div>
          )
        })}

        {classPeriods.map((period) => (
          <Fragment key={period.id}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                gap: 'clamp(1px, 0.3cqmin, 3px)',
              }}
              title={period.start_time}
            >
              <span
                style={{
                  fontSize: 'clamp(13px, 2.8cqmin, 20px)',
                  fontWeight: 900,
                  color: 'var(--text-secondary)',
                  letterSpacing: '-0.3px',
                }}
              >
                {period.period}
              </span>
              <span
                style={{
                  fontSize: 'clamp(8px, 1.4cqmin, 10px)',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  opacity: 0.65,
                  letterSpacing: '-0.2px',
                }}
              >
                {period.start_time.slice(0, 5)}
              </span>
            </div>

            {DAYS.map((d) => {
              const slot = slotMap.get(`${d}-${period.period}`)
              if (!slot) {
                const isTodayCol = todayIdx === d
                return (
                  <div
                    key={d}
                    style={{
                      borderRadius: 'clamp(6px, 1.4cqmin, 10px)',
                      background: isTodayCol ? 'rgba(37,99,235,0.04)' : 'transparent',
                    }}
                  />
                )
              }

              const isTodayCol = todayIdx === d
              const isNow = isTodayCol && currentPeriod?.period === period.period
              const color = slot.color ?? '#CBD5E1'
              const isSpecialist = slot.is_specialist === 1

              const bg = isSpecialist
                ? (isTodayCol
                  ? `linear-gradient(135deg, ${color}30 0%, ${color}1A 100%)`
                  : `linear-gradient(135deg, ${color}1E 0%, ${color}10 100%)`)
                : (isTodayCol
                  ? 'linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(37,99,235,0.05) 100%)'
                  : 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(100,116,139,0.04) 100%)')

              const cardBorder = isSpecialist
                ? `1px solid ${color}32`
                : (isTodayCol ? '1px solid rgba(37,99,235,0.18)' : '1px solid rgba(15,23,42,0.04)')

              const cardShadow = isNow
                ? `inset 0 1px 0 rgba(255,255,255,0.55), 0 0 0 2px ${color}, 0 6px 20px ${color}55`
                : isSpecialist
                  ? `inset 0 1px 0 rgba(255,255,255,0.42), 0 2px 8px ${color}14`
                  : (isTodayCol
                    ? 'inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 6px rgba(37,99,235,0.10)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.42), 0 1px 2px rgba(15,23,42,0.03)')

              const textColor = isSpecialist
                ? `color-mix(in srgb, ${color} 62%, #000)`
                : 'var(--text-primary)'

              return (
                <div
                  key={d}
                  title={[
                    slot.subject,
                    slot.specialist_teacher && `${slot.specialist_teacher} 선생님`,
                    slot.room,
                  ].filter(Boolean).join(' · ')}
                  style={{
                    position: 'relative',
                    fontSize: 'clamp(12px, 2.8cqmin, 19px)',
                    fontWeight: isTodayCol ? 800 : 700,
                    color: textColor,
                    background: bg,
                    borderRadius: 'clamp(6px, 1.4cqmin, 10px)',
                    padding: '0 clamp(3px, 0.8cqmin, 6px)',
                    textAlign: 'center',
                    letterSpacing: '-0.5px',
                    lineHeight: 1.15,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    border: cardBorder,
                    boxShadow: cardShadow,
                    transition: 'background 150ms ease, box-shadow 200ms ease',
                  }}
                >
                  {isNow && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        top: 'clamp(3px, 0.8cqmin, 5px)',
                        left: 'clamp(3px, 0.8cqmin, 5px)',
                        width: 'clamp(5px, 1.2cqmin, 7px)',
                        height: 'clamp(5px, 1.2cqmin, 7px)',
                        borderRadius: 999,
                        backgroundColor: color,
                        boxShadow: `0 0 0 2px rgba(255,255,255,0.6)`,
                        animation: 'tt-pulse 1.4s infinite',
                      }}
                    />
                  )}
                  {isSpecialist && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        top: 'clamp(3px, 0.8cqmin, 5px)',
                        right: 'clamp(3px, 0.8cqmin, 5px)',
                        width: 'clamp(5px, 1.2cqmin, 7px)',
                        height: 'clamp(5px, 1.2cqmin, 7px)',
                        borderRadius: 999,
                        backgroundColor: color,
                        boxShadow: `0 0 0 2px ${color}33`,
                        opacity: 0.95,
                      }}
                    />
                  )}
                  <span
                    style={{
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {shortSubject(slot.subject)}
                  </span>
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>

      <div
        style={{
          marginTop: 'clamp(5px, 1cqmin, 9px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 'clamp(5px, 1.2cqmin, 9px)',
          fontSize: 'clamp(10px, 1.6cqmin, 13px)',
          color: 'var(--text-muted)',
          letterSpacing: '-0.2px',
          fontWeight: 700,
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 'clamp(5px, 1.1cqmin, 7px)',
            height: 'clamp(5px, 1.1cqmin, 7px)',
            borderRadius: 999,
            backgroundColor: '#8B5CF6',
            boxShadow: '0 0 0 2px rgba(139,92,246,0.22)',
          }}
        />
        전담 수업
      </div>

      <style>{`
        @keyframes tt-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.7); opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
