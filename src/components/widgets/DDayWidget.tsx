import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, X, CalendarClock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getDDayText, formatDate } from '../../lib/date-utils'
import type { DDayEvent } from '../../types/settings.types'
import type { Schedule } from '../../types/schedule.types'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useDataChange } from '../../hooks/useDataChange'

/**
 * 통합 이벤트 — DDayEvent 원본 + 달력에서 가져온 임박 일정(D-7 이내).
 * `source === 'schedule'` 이면 DDay DB에 없는 것이므로 delete 버튼 숨김(원본은 달력이므로).
 */
type UnifiedEvent = DDayEvent & {
  source?: 'dday' | 'schedule'
}

/**
 * D-Day 위젯 — 시계/학생시간표 톤과 동일한 "세련된 전자칠판" 비주얼.
 *
 * 설계:
 *  - 맨 위 이벤트 하나만 히어로로 강조(가장 임박한 것). 거대 카운트 + 그라디언트.
 *  - 나머지는 아래 컴팩트한 칩 리스트.
 *  - 글자 크기는 위젯 창 폭에 비례(`clamp(...vw...)`).
 */
export function DDayWidget() {
  const [events, setEvents] = useState<DDayEvent[]>([])
  const [upcomingSchedules, setUpcomingSchedules] = useState<Schedule[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newEmoji, setNewEmoji] = useState('📅')

  const reload = useCallback(() => {
    window.api.dday.list().then(setEvents)
    // 달력 일정 중 "오늘 ~ 오늘+7일" 범위의 all_day 또는 시작 일정을 D-Day 리스트에 합친다.
    // 달력에서 일정 추가하면 D-7 부터 자동 노출.
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7)
    const pad2 = (n: number): string => String(n).padStart(2, '0')
    const ymd = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    window.api.schedule
      .list({ startDate: ymd(today), endDate: ymd(in7) })
      .then(setUpcomingSchedules)
      .catch(() => setUpcomingSchedules([]))
  }, [])
  useEffect(() => { reload() }, [reload])
  useDataChange('dday', reload)
  useDataChange('schedule', reload)

  const handleAdd = async (): Promise<void> => {
    if (!newTitle.trim() || !newDate) return
    await window.api.dday.create({
      title: newTitle.trim(),
      target_date: newDate,
      emoji: newEmoji,
    })
    const updated = await window.api.dday.list()
    setEvents(updated)
    setDialogOpen(false)
    setNewTitle('')
    setNewDate('')
    setNewEmoji('📅')
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (id.startsWith('sched-')) {
      // 달력에서 유입된 항목은 schedules 테이블에서 삭제 → DDay 위젯도 자동 갱신.
      const realId = id.slice('sched-'.length)
      try { await window.api.schedule.delete(realId) } catch { /* ignore */ }
      reload()
      return
    }
    await window.api.dday.delete(id)
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  const emojis = ['📅', '📝', '🎒', '🏫', '🎓', '✈️', '🎄', '🌸', '⭐', '🎉']

  // 이벤트 + 임박 일정(D-7) 통합. 같은 날짜+제목이 중복되면 DDay 것을 우선.
  // 오늘 날짜의 달력 일정은 "오늘의 할일" 위젯이 담당하므로 DDay 에선 제외(중복 방지).
  const merged = useMemo<UnifiedEvent[]>(() => {
    const list: UnifiedEvent[] = events.map((e) => ({ ...e, source: 'dday' as const }))
    const existKey = new Set(list.map((e) => `${e.target_date}|${e.title}`))
    const todayD = new Date(); todayD.setHours(0, 0, 0, 0)
    const pad2 = (n: number): string => String(n).padStart(2, '0')
    const todayStr = `${todayD.getFullYear()}-${pad2(todayD.getMonth() + 1)}-${pad2(todayD.getDate())}`
    for (const s of upcomingSchedules) {
      const date = (s.start_date ?? '').slice(0, 10)
      if (!date) continue
      if (date === todayStr) continue // 오늘 일정은 오늘 위젯 담당
      const key = `${date}|${s.title}`
      if (existKey.has(key)) continue
      list.push({
        id: `sched-${s.id}`,
        title: s.title,
        target_date: date,
        color: s.color ?? '#10B981',
        emoji: '📅',
        is_active: 1,
        created_at: s.created_at ?? '',
        source: 'schedule',
      } as UnifiedEvent)
      existKey.add(key)
    }
    return list
  }, [events, upcomingSchedules])

  // 남은 일수 기준으로 정렬 — 과거(지남)는 뒤로, 임박한 미래가 앞.
  const sorted = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return [...merged].sort((a, b) => {
      const da = daysDiff(today, a.target_date)
      const db = daysDiff(today, b.target_date)
      const aFuture = da >= 0
      const bFuture = db >= 0
      if (aFuture !== bFuture) return aFuture ? -1 : 1
      return Math.abs(da) - Math.abs(db)
    })
  }, [merged])

  const hero = sorted[0]
  const rest = sorted.slice(1)

  // 히어로 카드 컬러 — 임박도(urgency)에 따라 톤이 달라짐.
  const heroUrgency = useMemo(() => {
    if (!hero) return null
    return urgencyOf(hero.target_date)
  }, [hero])

  // 나머지 칩 영역 동적 사이즈 — 스크롤 없이 모든 아이템 수용.
  const restAreaRef = useRef<HTMLDivElement>(null)
  const [restBoxH, setRestBoxH] = useState(0)
  useEffect(() => {
    const el = restAreaRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setRestBoxH(r.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const restLayout = useMemo(() => {
    const n = rest.length
    if (n === 0 || restBoxH < 20) return { rowH: 36, titleFont: 13, dateFont: 11, countFont: 15, showDate: true, padY: 7, padX: 12, emojiFont: 18 }
    const gap = 5
    const available = Math.max(0, restBoxH - (n - 1) * gap)
    const rowH = Math.max(18, Math.floor(available / n))
    // 행 높이별로 글자·표시를 점진 축소. 너무 좁으면 날짜 라인 제거.
    const showDate = rowH >= 38
    const titleFont = Math.max(9, Math.min(18, rowH * (showDate ? 0.38 : 0.5)))
    const dateFont = Math.max(8, Math.min(13, rowH * 0.3))
    const countFont = Math.max(10, Math.min(24, rowH * 0.58))
    const emojiFont = Math.max(12, Math.min(28, rowH * 0.55))
    const padY = Math.max(2, Math.min(8, rowH * 0.15))
    const padX = Math.max(6, Math.min(14, rowH * 0.3))
    return { rowH, titleFont, dateFont, countFont, showDate, padY, padX, emojiFont }
  }, [rest.length, restBoxH])

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        // containerType: size → 모든 하위 cqmin/cqw 단위가 이 위젯 크기 기준으로 동작.
        containerType: 'size',
        padding: 'clamp(10px, 3cqmin, 28px) clamp(18px, 5cqmin, 36px) clamp(18px, 5cqmin, 36px)',
        background: heroUrgency
          ? `radial-gradient(ellipse at 85% 0%, ${heroUrgency.color}18 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, ${heroUrgency.color}10 0%, transparent 45%)`
          : undefined,
      }}
    >
      {/* 상단: 제목 + 추가 버튼 (아이콘 없이 담백하게) */}
      <div className="flex items-center justify-between shrink-0" style={{ marginBottom: 'clamp(10px, 1.2cqmin, 20px)' }}>
        <span
          className="font-bold tracking-tight"
          style={{
            fontSize: 'clamp(13px, 1.5cqmin, 22px)',
            color: 'var(--text-primary)',
            letterSpacing: '-0.035em',
          }}
        >
          D-Day
        </span>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center justify-center hover:opacity-85 transition-opacity shrink-0"
          style={{
            width: 'clamp(26px, 2.4cqmin, 36px)',
            height: 'clamp(26px, 2.4cqmin, 36px)',
            borderRadius: 'clamp(8px, 0.8cqmin, 12px)',
            background: 'linear-gradient(135deg, #2563EB 0%, #4338CA 100%)',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(37,99,235,0.35)',
          }}
          title="D-Day 추가"
        >
          <Plus size={14} strokeWidth={2.6} />
        </button>
      </div>

      {events.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div
            className="flex items-center justify-center"
            style={{
              width: 56, height: 56, borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(37,99,235,0.10), rgba(124,58,237,0.14))',
              color: '#4338CA',
            }}
          >
            <CalendarClock size={26} strokeWidth={2.1} />
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed">
            중요한 날짜를 추가해 보세요
          </p>
          <p className="text-[10px] text-[var(--text-muted)]" style={{ letterSpacing: '-0.2px' }}>
            예: 기말고사, 현장학습, 방학
          </p>
        </div>
      ) : (
        <>
          {/* 히어로 카드 — 가장 임박한 이벤트 */}
          {hero && heroUrgency && (
            <HeroCard
              event={hero}
              urgency={heroUrgency}
              onDelete={handleDelete}
            />
          )}

          {/* 나머지 칩 리스트 — 스크롤 없이 동적 사이즈. 창 작아지면 행 높이/글씨 축소 */}
          {rest.length > 0 && (
            <div
              ref={restAreaRef}
              className="flex-1 mt-3 overflow-hidden"
              style={{ display: 'flex', flexDirection: 'column', gap: 5, minHeight: 0 }}
            >
              <AnimatePresence>
                {rest.map((event) => {
                  const u = urgencyOf(event.target_date)
                  const ddayText = getDDayText(event.target_date)
                  return (
                    <motion.div
                      key={event.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -40 }}
                      className="group flex items-center transition-all"
                      style={{
                        height: restLayout.rowH,
                        gap: Math.max(6, restLayout.padX * 0.6),
                        padding: `${restLayout.padY}px ${restLayout.padX}px`,
                        borderRadius: Math.max(7, restLayout.padX * 0.7),
                        backgroundColor: 'var(--bg-secondary)',
                        borderLeft: `3px solid ${u.color}`,
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      {event.emoji && restLayout.rowH >= 26 && (
                        <span
                          className="shrink-0"
                          style={{ fontSize: restLayout.emojiFont, lineHeight: 1 }}
                        >
                          {event.emoji}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p
                          className="truncate"
                          style={{
                            fontSize: restLayout.titleFont,
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            letterSpacing: '-0.3px',
                            lineHeight: 1.15,
                          }}
                        >
                          {event.title}
                        </p>
                        {restLayout.showDate && (
                          <p
                            className="truncate tabular-nums"
                            style={{
                              fontSize: restLayout.dateFont,
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                              letterSpacing: '-0.2px',
                              marginTop: 2,
                            }}
                          >
                            {formatDate(event.target_date, 'yyyy.MM.dd')}
                          </p>
                        )}
                      </div>
                      <span
                        className="tabular-nums shrink-0"
                        style={{
                          fontSize: restLayout.countFont,
                          fontWeight: 900,
                          color: u.color,
                          letterSpacing: '-0.03em',
                        }}
                      >
                        {ddayText}
                      </span>
                      <button
                        onClick={() => handleDelete(event.id)}
                        className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 transition-all p-0.5"
                        title="삭제"
                      >
                        <X size={11} />
                      </button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title="D-Day 추가">
        <div className="space-y-4">
          <Input label="제목" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="예: 기말고사" />
          <Input label="날짜" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">이모지 (선택)</label>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setNewEmoji('')}
                className={`w-8 h-8 rounded-md flex items-center justify-center transition-all text-[11px] font-bold ${
                  newEmoji === '' ? 'bg-[var(--accent-light)] ring-2 ring-[var(--accent)] text-[var(--accent)]' : 'hover:bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                }`}
                title="이모지 없이"
              >
                없음
              </button>
              {emojis.map((e) => (
                <button
                  key={e}
                  onClick={() => setNewEmoji(e)}
                  className={`w-8 h-8 rounded-md text-lg flex items-center justify-center transition-all ${
                    newEmoji === e ? 'bg-[var(--accent-light)] ring-2 ring-[var(--accent)]' : 'hover:bg-[var(--bg-secondary)]'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleAdd}>추가</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// 히어로 카드

function HeroCard({
  event, urgency, onDelete,
}: {
  event: DDayEvent
  urgency: Urgency
  onDelete: (id: string) => void
}) {
  const ddayText = getDDayText(event.target_date)
  // "D-12" 같은 숫자 부분만 분리해서 크게. 부호/접두 "D-/D+/D-Day"도 같이 스타일링.
  const match = ddayText.match(/^(D[-+]?)(\d+)?(.*)$/)
  const prefix = match?.[1] ?? ddayText
  const num = match?.[2] ?? ''
  const tail = match?.[3] ?? ''

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative group shrink-0"
      style={{
        padding: 'clamp(14px, 1.8cqmin, 24px) clamp(16px, 2cqmin, 26px)',
        borderRadius: 'clamp(16px, 1.4cqmin, 24px)',
        background: `linear-gradient(135deg, ${urgency.color}10 0%, ${urgency.color}24 100%)`,
        border: `1.5px solid ${urgency.color}30`,
        boxShadow: `0 10px 30px ${urgency.color}18`,
        overflow: 'hidden',
      }}
    >
      {/* 배경 광선 효과 */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 90% 10%, ${urgency.color}30 0%, transparent 55%)`,
        }}
      />

      <div className="relative flex items-center" style={{ gap: 'clamp(6px, 1.4cqmin, 22px)' }}>
        {/* 이모지 뱃지 — 이모지가 있을 때만 렌더 */}
        {event.emoji && (
          <span
            className="flex items-center justify-center shrink-0"
            style={{
              fontSize: 'clamp(18px, 4cqmin, 70px)',
              width: 'clamp(32px, 5.6cqmin, 96px)',
              height: 'clamp(32px, 5.6cqmin, 96px)',
              borderRadius: 'clamp(8px, 1.4cqmin, 24px)',
              background: 'rgba(255,255,255,0.55)',
              border: `1.5px solid ${urgency.color}40`,
              boxShadow: `0 4px 14px ${urgency.color}22`,
            }}
          >
            {event.emoji}
          </span>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap" style={{ gap: 'clamp(3px, 0.6cqmin, 10px)', marginBottom: 'clamp(1px, 0.3cqmin, 6px)' }}>
            <span
              className="inline-flex items-center font-bold"
              style={{
                fontSize: 'clamp(9px, 1.15cqmin, 16px)',
                padding: 'clamp(1px, 0.35cqmin, 5px) clamp(5px, 1cqmin, 14px)',
                borderRadius: 999,
                backgroundColor: urgency.color,
                color: '#fff',
                letterSpacing: '-0.2px',
                boxShadow: `0 2px 8px ${urgency.color}55`,
              }}
            >
              {urgency.label}
            </span>
            <span
              className="tabular-nums"
              style={{
                fontSize: 'clamp(9px, 1.1cqmin, 15px)',
                color: 'var(--text-muted)',
                fontWeight: 600,
                letterSpacing: '-0.2px',
              }}
            >
              {formatDate(event.target_date, 'yyyy.MM.dd')}
            </span>
          </div>
          <p
            className="truncate"
            title={event.title}
            style={{
              fontSize: 'clamp(12px, 2cqmin, 34px)',
              fontWeight: 900,
              color: 'var(--text-primary)',
              letterSpacing: '-0.035em',
              lineHeight: 1.12,
            }}
          >
            {event.title}
          </p>
        </div>

        {/* 거대 D-Day 카운트 — 창이 작으면 더 작아짐 */}
        <div
          className="shrink-0 flex items-baseline tabular-nums"
          style={{ color: urgency.color, minWidth: 0 }}
        >
          <span
            style={{
              fontSize: 'clamp(18px, 5.2cqmin, 88px)',
              fontWeight: 900,
              marginRight: 'clamp(1px, 0.5cqmin, 4px)',
              letterSpacing: '-0.04em',
              lineHeight: 0.9,
              opacity: 0.92,
            }}
          >
            {prefix}
          </span>
          <span
            style={{
              fontSize: 'clamp(22px, 6.5cqmin, 110px)',
              fontWeight: 900,
              lineHeight: 0.9,
              letterSpacing: '-0.04em',
              background: `linear-gradient(180deg, ${urgency.color} 0%, ${urgency.colorDark} 130%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: urgency.key === 'today' ? 'dday-pulse 1.4s ease-in-out infinite' : undefined,
            }}
          >
            {num || tail || ''}
          </span>
        </div>
      </div>

      <button
        onClick={() => onDelete(event.id)}
        className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-all"
        title="삭제"
      >
        <X size={11} />
      </button>

      <style>{`
        @keyframes dday-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.55; }
        }
      `}</style>
    </motion.div>
  )
}

// ──────────────────────────────────────────────────────────────
// urgency 계산

type UrgencyKey = 'today' | 'imminent' | 'soon' | 'later' | 'past'

type Urgency = {
  key: UrgencyKey
  label: string
  color: string
  colorDark: string
}

function urgencyOf(targetDate: string): Urgency {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = daysDiff(today, targetDate)
  if (diff === 0) return { key: 'today', label: '오늘', color: '#EF4444', colorDark: '#B91C1C' }
  if (diff < 0) return { key: 'past', label: '지남', color: '#94A3B8', colorDark: '#475569' }
  if (diff <= 3) return { key: 'imminent', label: '임박', color: '#F97316', colorDark: '#C2410C' }
  if (diff <= 14) return { key: 'soon', label: '곧', color: '#F59E0B', colorDark: '#B45309' }
  return { key: 'later', label: '예정', color: '#2563EB', colorDark: '#1E40AF' }
}

function daysDiff(from: Date, to: string): number {
  const target = new Date(to + 'T00:00:00')
  return Math.round((target.getTime() - from.getTime()) / 86400000)
}
