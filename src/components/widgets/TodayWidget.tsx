import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Schedule } from '../../types/schedule.types'
import { useDataChange } from '../../hooks/useDataChange'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'

/**
 * "오늘" 위젯 — 학생 전자칠판용. 오늘의 특별 일정만 크게 보여줌.
 *
 * 설계:
 *  - 달력(schedules) 중 오늘 날짜의 all_day 일정을 리스트로 노출.
 *  - 일정 없으면 "오늘은 평범한 하루" 미니멀 상태.
 *  - 폰트는 cqmin 기반 — 위젯 창 크기에 완전히 비례. 배경 모드 전환 시 헤더 숨겨져 전체 화면으로.
 *  - 시간이 있으면 우측에 시간 뱃지.
 */

function pad2(n: number): string { return String(n).padStart(2, '0') }
function ymd(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

const KOR_DAYS = ['일', '월', '화', '수', '목', '금', '토']

export function TodayWidget() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [now, setNow] = useState(new Date())
  const todayStr = ymd(now)

  const reload = useCallback(() => {
    // 주간 단위 일정(예: "독서주간", "안전교육주간") 대응:
    // `start_date <= 오늘 <= end_date` 인 일정을 모두 포함해야 하므로
    // 과거 60일까지 넉넉히 가져와서 로컬에서 범위 필터.
    const back = new Date()
    back.setDate(back.getDate() - 60)
    const pad = (n: number): string => String(n).padStart(2, '0')
    const backStr = `${back.getFullYear()}-${pad(back.getMonth() + 1)}-${pad(back.getDate())}`
    window.api.schedule
      .list({ startDate: backStr, endDate: todayStr })
      .then((list) => {
        const filtered = list.filter((s) => {
          const s0 = (s.start_date ?? '').slice(0, 10)
          const s1 = (s.end_date ?? s.start_date ?? '').slice(0, 10)
          return s0 <= todayStr && todayStr <= s1
        })
        setSchedules(filtered)
      })
      .catch(() => setSchedules([]))
  }, [todayStr])

  useEffect(() => { reload() }, [reload])
  useDataChange('schedule', reload)
  useAutoRefresh(reload)

  // 자정 넘기면 today 갱신
  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date()
      if (ymd(n) !== todayStr) setNow(n)
    }, 60_000)
    return () => clearInterval(t)
  }, [todayStr])

  // 정렬 — 주간형(범위) 먼저, 그 다음 all_day, 마지막 시간 순.
  const todayItems = useMemo(() => {
    return [...schedules].sort((a, b) => {
      // 범위 일정(start != end) 을 위로 — "~주간" 류를 먼저 보이게.
      const aRange = (a.start_date ?? '').slice(0, 10) !== (a.end_date ?? a.start_date ?? '').slice(0, 10)
      const bRange = (b.start_date ?? '').slice(0, 10) !== (b.end_date ?? b.start_date ?? '').slice(0, 10)
      if (aRange !== bRange) return aRange ? -1 : 1
      if (a.all_day !== b.all_day) return (b.all_day ?? 0) - (a.all_day ?? 0)
      return (a.start_date ?? '').localeCompare(b.start_date ?? '')
    })
  }, [schedules])

  const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일`
  const dayLabel = KOR_DAYS[now.getDay()]

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        containerType: 'size',
        padding: 'clamp(14px, 3.5cqmin, 36px) clamp(18px, 4cqmin, 42px) clamp(20px, 4.5cqmin, 44px)',
        background:
          'radial-gradient(ellipse at 85% 0%, rgba(245,158,11,0.10) 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(244,114,182,0.08) 0%, transparent 50%)',
      }}
    >
      {/* Header — 아이콘 칩 + "오늘" 그라디언트 + 날짜 pill */}
      <div
        className="flex items-center shrink-0"
        style={{ gap: 'clamp(8px, 2cqmin, 16px)', marginBottom: 'clamp(10px, 2.4cqmin, 22px)' }}
      >
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 'clamp(34px, 8cqmin, 68px)',
            height: 'clamp(34px, 8cqmin, 68px)',
            borderRadius: 'clamp(10px, 2cqmin, 18px)',
            background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            color: '#fff',
            boxShadow: '0 6px 18px rgba(245,158,11,0.38), inset 0 1px 0 rgba(255,255,255,0.35)',
          }}
        >
          <CalendarCheck strokeWidth={2.4} style={{ width: '58%', height: '58%' }} />
        </span>

        <span
          className="flex-1 min-w-0 truncate"
          style={{
            fontSize: 'clamp(20px, 5.2cqmin, 52px)',
            fontWeight: 900,
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
            background: 'linear-gradient(180deg, var(--text-primary) 0%, #D97706 130%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          오늘
        </span>

        <span
          className="inline-flex items-center tabular-nums shrink-0"
          style={{
            gap: 'clamp(4px, 0.8cqmin, 8px)',
            fontSize: 'clamp(11px, 2.6cqmin, 22px)',
            fontWeight: 800,
            padding: 'clamp(5px, 1.2cqmin, 10px) clamp(10px, 2cqmin, 18px)',
            borderRadius: 999,
            background: 'linear-gradient(135deg, rgba(245,158,11,0.16), rgba(245,158,11,0.28))',
            color: '#B45309',
            border: '1px solid rgba(245,158,11,0.32)',
            letterSpacing: '-0.3px',
          }}
        >
          {dateLabel} · {dayLabel}
        </span>
      </div>

      {/* 본문 — 일정 리스트 or 빈 상태 */}
      <div className="flex-1 overflow-y-auto">
        {todayItems.length === 0 ? (
          <div
            className="h-full flex flex-col items-center justify-center gap-3 text-center"
            style={{ padding: 'clamp(10px, 2.4cqmin, 24px)' }}
          >
            <div
              className="flex items-center justify-center"
              style={{
                width: 'clamp(48px, 11cqmin, 96px)',
                height: 'clamp(48px, 11cqmin, 96px)',
                borderRadius: 'clamp(14px, 3cqmin, 26px)',
                background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(217,119,6,0.22))',
                color: '#D97706',
                border: '1.5px solid rgba(245,158,11,0.22)',
              }}
            >
              <Sparkles strokeWidth={2.2} style={{ width: '54%', height: '54%' }} />
            </div>
            <p
              style={{
                fontSize: 'clamp(14px, 3.4cqmin, 32px)',
                fontWeight: 800,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              오늘은 평범한 하루!
            </p>
            <p
              style={{
                fontSize: 'clamp(11px, 2.4cqmin, 20px)',
                color: 'var(--text-muted)',
                fontWeight: 500,
                letterSpacing: '-0.2px',
              }}
            >
              특별한 일정이 없어요
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'clamp(6px, 1.4cqmin, 14px)',
            }}
          >
            <AnimatePresence>
              {todayItems.map((item, idx) => {
                const color = item.color ?? '#F59E0B'
                const startTime = item.all_day ? null : (item.start_date ?? '').slice(11, 16)
                // 범위 일정(주간 등) — 오늘이 N일차인지 계산.
                // 제목에 "주간" 이 들어가면 학교 주간 의미로 주말(토·일) 제외 평일 수로 계산.
                //   ex) 월~금 독서주간 → 5일차 표기, "5/5" 로 표시됨.
                // 기존 데이터는 end_date 가 7일(월~일) 로 저장된 것도 있어 이 보정으로 자연스럽게 5일차로 보임.
                const s0 = (item.start_date ?? '').slice(0, 10)
                const s1 = (item.end_date ?? item.start_date ?? '').slice(0, 10)
                const isRange = s0 !== s1
                let dayN = 0
                let dayTotal = 0
                if (isRange) {
                  const start = new Date(s0 + 'T00:00:00')
                  const end = new Date(s1 + 'T00:00:00')
                  const today0 = new Date(todayStr + 'T00:00:00')
                  const isWeekly = /주간/.test(item.title)
                  if (isWeekly) {
                    // 평일만 센다(월~금). 카운트가 커지지 않도록 최대 60일 제한.
                    let total = 0
                    let n = 0
                    const cur = new Date(start)
                    for (let i = 0; i < 60 && cur.getTime() <= end.getTime(); i++) {
                      const dow = cur.getDay()
                      const isWeekday = dow !== 0 && dow !== 6
                      if (isWeekday) {
                        total++
                        if (cur.getTime() <= today0.getTime()) n++
                      }
                      cur.setDate(cur.getDate() + 1)
                    }
                    dayN = n
                    dayTotal = total
                  } else {
                    dayN = Math.round((today0.getTime() - start.getTime()) / 86400000) + 1
                    dayTotal = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
                  }
                }
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ delay: idx * 0.04 }}
                    className="flex items-center relative"
                    style={{
                      gap: 'clamp(10px, 2cqmin, 18px)',
                      padding: 'clamp(10px, 2cqmin, 20px) clamp(12px, 2.2cqmin, 22px)',
                      borderRadius: 'clamp(12px, 2.2cqmin, 20px)',
                      background: `linear-gradient(135deg, ${color}12 0%, ${color}22 100%)`,
                      border: `1.5px solid ${color}33`,
                      boxShadow: `0 6px 20px ${color}18`,
                    }}
                  >
                    {/* 좌측 악센트 bar */}
                    <span
                      aria-hidden
                      className="shrink-0"
                      style={{
                        width: 'clamp(4px, 0.8cqmin, 8px)',
                        height: 'clamp(28px, 6cqmin, 54px)',
                        borderRadius: 999,
                        backgroundColor: color,
                        boxShadow: `0 3px 10px ${color}55`,
                      }}
                    />
                    {/* 번호 */}
                    <span
                      aria-hidden
                      className="tabular-nums shrink-0"
                      style={{
                        fontSize: 'clamp(12px, 2.6cqmin, 22px)',
                        fontWeight: 900,
                        color: color,
                        letterSpacing: '-0.3px',
                        opacity: 0.8,
                        minWidth: 'clamp(18px, 4cqmin, 32px)',
                      }}
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    {/* 제목 — 창이 좁아지면 줄바꿈되며 잘리지 않음 */}
                    <span
                      className="flex-1 min-w-0 content-wrap"
                      style={{
                        fontSize: 'clamp(13px, 3.2cqmin, 36px)',
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.03em',
                        lineHeight: 1.2,
                      }}
                    >
                      {item.title}
                    </span>
                    {/* 우측 뱃지: 범위 일정(주간) > 시간 > all-day 순 우선 */}
                    {isRange ? (
                      <span
                        className="tabular-nums shrink-0"
                        style={{
                          fontSize: 'clamp(11px, 2.5cqmin, 20px)',
                          fontWeight: 900,
                          color: color,
                          letterSpacing: '-0.25px',
                          padding: 'clamp(3px, 0.9cqmin, 7px) clamp(9px, 1.8cqmin, 14px)',
                          borderRadius: 999,
                          background: `linear-gradient(135deg, ${color}1A 0%, ${color}33 100%)`,
                          border: `1px solid ${color}40`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {dayN}<span style={{ opacity: 0.55, margin: '0 1px' }}>/</span>{dayTotal}일차
                      </span>
                    ) : startTime ? (
                      <span
                        className="tabular-nums shrink-0"
                        style={{
                          fontSize: 'clamp(12px, 2.8cqmin, 24px)',
                          fontWeight: 800,
                          color: color,
                          letterSpacing: '-0.3px',
                          padding: 'clamp(3px, 0.9cqmin, 7px) clamp(8px, 1.8cqmin, 14px)',
                          borderRadius: 999,
                          background: `${color}22`,
                        }}
                      >
                        {startTime}
                      </span>
                    ) : (
                      <span
                        className="shrink-0"
                        style={{
                          fontSize: 'clamp(10px, 2.2cqmin, 18px)',
                          fontWeight: 800,
                          color: color,
                          letterSpacing: '-0.2px',
                          padding: 'clamp(3px, 0.9cqmin, 7px) clamp(8px, 1.8cqmin, 14px)',
                          borderRadius: 999,
                          background: `${color}1A`,
                          border: `1px solid ${color}33`,
                        }}
                      >
                        하루 종일
                      </span>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
