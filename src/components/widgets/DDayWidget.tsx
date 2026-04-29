import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, X, CalendarClock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getDDayText } from '../../lib/date-utils'
import type { DDayEvent } from '../../types/settings.types'
import type { Schedule } from '../../types/schedule.types'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useDataChange } from '../../hooks/useDataChange'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'

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
    // 달력 일정 중 "오늘 ~ 오늘+7일" 범위의 일정을 D-Day 리스트에 자동 합침.
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
  useAutoRefresh(reload)

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

  // 미래(D-N 또는 D-Day)만 표시. 지나간 D+N 은 감춘다 — 오늘 위젯이 당일 담당과 동일 원칙.
  // 임박도순(오늘·내일 먼저, 그 뒤로).
  const sorted = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return merged
      .filter((e) => daysDiff(today, e.target_date) >= 0)
      .sort((a, b) => daysDiff(today, a.target_date) - daysDiff(today, b.target_date))
  }, [merged])

  // 첫 번째 항목(가장 임박)의 urgency — 위젯 루트 배경 글로우에 사용.
  const firstUrgency = useMemo(() => {
    if (sorted.length === 0) return null
    return urgencyOf(sorted[0].target_date)
  }, [sorted])

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
    const n = sorted.length
    if (n === 0 || restBoxH < 20) return { rowH: 36, titleFont: 18, countFont: 20, padY: 7, padX: 12 }
    const gap = 5
    const available = Math.max(0, restBoxH - (n - 1) * gap)
    const rowH = Math.max(18, Math.floor(available / n))
    // 날짜 라인 제거 — 한 행에 제목 + D-N 만 표시. 글자 크기 대폭 증가.
    const titleFont = Math.max(11, Math.min(30, rowH * 0.55))
    const countFont = Math.max(13, Math.min(34, rowH * 0.62))
    const padY = Math.max(2, Math.min(8, rowH * 0.15))
    const padX = Math.max(6, Math.min(14, rowH * 0.3))
    return { rowH, titleFont, countFont, padY, padX }
  }, [sorted.length, restBoxH])

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        // containerType: size → 모든 하위 cqmin/cqw 단위가 이 위젯 크기 기준으로 동작.
        containerType: 'size',
        padding: 'clamp(10px, 3cqmin, 28px) clamp(18px, 5cqmin, 36px) clamp(18px, 5cqmin, 36px)',
        background: firstUrgency
          ? `radial-gradient(ellipse at 85% 0%, ${firstUrgency.color}18 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, ${firstUrgency.color}10 0%, transparent 45%)`
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

      {sorted.length === 0 ? (
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
          {/* 히어로와 rest 를 하나의 리스트로 통합 — 모든 항목이 같은 폰트·같은 높이·같은 padding 으로
              완벽한 좌우·상하 정렬. 첫 번째 항목(가장 임박)만 urgency 색으로 배경/테두리 강조. */}
          <div
            ref={restAreaRef}
            className="flex-1 overflow-hidden"
            style={{ display: 'flex', flexDirection: 'column', gap: 5, minHeight: 0 }}
          >
            <AnimatePresence>
              {sorted.map((event, idx) => {
                const isHero = idx === 0
                const u = urgencyOf(event.target_date)
                const ddayText = getDDayText(event.target_date)
                const neutralBorder = 'rgba(148,163,184,0.55)'
                const neutralCount = 'var(--text-secondary)'
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
                      // 제목↔D-N 간격 축소 — 기존 padX*0.6(최대 8.4px) → padX*0.3(최대 4.2px).
                      // 여백 줄이면 제목이 한 줄에 더 많이 들어가 줄바꿈 감소.
                      gap: Math.max(3, restLayout.padX * 0.3),
                      padding: `${restLayout.padY}px ${restLayout.padX}px`,
                      borderRadius: Math.max(7, restLayout.padX * 0.7),
                      background: isHero
                        ? `linear-gradient(135deg, ${u.color}14 0%, ${u.color}30 100%)`
                        : 'var(--bg-secondary)',
                      borderLeft: `3px solid ${isHero ? u.color : neutralBorder}`,
                      boxShadow: isHero ? `0 4px 14px ${u.color}22` : undefined,
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {/* 제목 — 모든 항목 동일한 폰트/lineHeight/margin 으로 수직 정렬. */}
                    <div
                      className="flex-1 min-w-0 content-wrap"
                      style={{
                        fontSize: restLayout.titleFont,
                        fontWeight: isHero ? 900 : 800,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.3px',
                        lineHeight: 1,
                        margin: 0,
                      }}
                    >
                      {event.title}
                    </div>
                    {/* D-N — 같은 폰트, 같은 minWidth, 같은 lineHeight → 모든 카드에서 세로줄 정렬.
                        minWidth 를 3.4 → 2.3 으로 축소해 제목 영역을 더 확보 (줄바꿈 감소). */}
                    <div
                      className="tabular-nums shrink-0 text-right"
                      style={{
                        fontSize: restLayout.countFont,
                        fontWeight: 900,
                        color: isHero ? u.color : neutralCount,
                        letterSpacing: '-0.03em',
                        minWidth: restLayout.countFont * 2.3,
                        lineHeight: 1,
                        margin: 0,
                        animation: isHero && u.key === 'today' ? 'dday-pulse 1.4s ease-in-out infinite' : undefined,
                      }}
                    >
                      {ddayText}
                    </div>
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
          <style>{`
            @keyframes dday-pulse {
              0%, 100% { opacity: 1; }
              50%      { opacity: 0.55; }
            }
          `}</style>
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
