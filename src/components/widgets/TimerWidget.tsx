import { useRef, useState, useEffect } from 'react'
import { Play, Pause, RotateCcw, Pencil, Apple, Timer as TimerIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTimer } from '../../hooks/useTimer'
import { useAppStore } from '../../stores/app.store'

/**
 * 타이머 위젯 — 시계/학생시간표 톤에 맞춘 세련된 전자칠판 뷰.
 *
 * 반응형:
 *  - 최상위는 `container-type: size` 로 컨테이너 쿼리 단위(cqmin/cqh/cqw)를 활성화.
 *  - 원형 프로그레스는 `aspect-ratio: 1` + `max-width/height: 100%` 로 항상 정사각형 유지 & 절대 잘리지 않음.
 *  - 숫자·라벨·버튼 크기는 모두 cqmin 기반이라 창을 어느 방향으로 줄여도 비례 축소.
 *  - 세로가 너무 좁아지면 프리셋/라벨이 자연스럽게 wrap, 잘리지 않음.
 */
export function TimerWidget() {
  const settings = useAppStore((s) => s.settings)
  const timer = useTimer({
    workMinutes: settings?.pomodoro_work ?? 25,
    breakMinutes: settings?.pomodoro_break ?? 5,
    longBreakMinutes: settings?.pomodoro_long_break ?? 15,
  })

  const [editing, setEditing] = useState(false)
  const [editMin, setEditMin] = useState('')
  const [editSec, setEditSec] = useState('')
  const secRef = useRef<HTMLInputElement>(null)

  // 시계 원의 실제 가로 픽셀을 측정해서 시계 숫자·input·phase label·연필 아이콘 크기를 직접 px로 계산.
  // 이전엔 cqmin 기반(`clamp(28px, 18cqmin, 80px)` 등)이었는데, WidgetShell이 글씨 크기 배율을
  // CSS `zoom`으로 적용하면 zoom 은 visual scaling 이고 cqmin 은 raw layout 기준이라
  // 시계 영역 글자가 글씨 크기 배율을 못 따라가 안 커지던 버그. ResizeObserver 는 layout(raw) 박스를
  // 보고하므로 zoom 으로 시각만 자연 확대 → 시계 원과 함께 시계 숫자도 동일 배율로 그려진다.
  const clockBoxRef = useRef<HTMLDivElement>(null)
  const [clockPx, setClockPx] = useState(200)
  useEffect(() => {
    const el = clockBoxRef.current
    if (!el) return
    const apply = (w: number): void => {
      if (!w) return
      setClockPx((cur) => (Math.abs(cur - w) > 0.5 ? w : cur))
    }
    apply(el.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) apply(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 시계 원 width 기준 비율 — 기존 cqmin 클램프와 같은 시각 크기가 나오도록 튜닝.
  const timeFontPx     = Math.max(28, Math.min(110, clockPx * 0.26))   // 시계 숫자
  const editFontPx     = Math.max(18, Math.min(64,  clockPx * 0.16))   // 편집 input
  const pencilIconPx   = Math.max(10, Math.min(16,  clockPx * 0.045))  // 연필 아이콘
  const phaseFontPx    = Math.max(10, Math.min(16,  clockPx * 0.065))  // 일반 phase 라벨
  const phaseFontPxWp  = Math.max(14, Math.min(26,  clockPx * 0.11))   // 배경화면 모드 phase 라벨
  // 배경화면 모드 진입 시 타이머 위젯은 완전히 숨김 (자주 안 쓰는 도구라 배경에 방해만 됨).
  const [iAmWallpaper, setIAmWallpaper] = useState(false)
  const myWidgetId = useRef<string>('widget-timer')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const map = await window.api.widget.getWallpaperModeMap()
        if (!cancelled && Array.isArray(map) && map.includes(myWidgetId.current)) setIAmWallpaper(true)
      } catch { /* noop */ }
    })()
    const off = window.api.widget.onWallpaperModeChanged?.((p) => {
      if (p.widgetId === myWidgetId.current) setIAmWallpaper(p.on)
    })
    return () => { cancelled = true; if (off) off() }
  }, [])

  const canEdit = timer.mode === 'free' && timer.state === 'idle'

  const startEdit = (): void => {
    if (!canEdit) return
    setEditMin(String(timer.minutes))
    setEditSec(String(timer.seconds).padStart(2, '0'))
    setEditing(true)
  }

  const commitEdit = (): void => {
    const m = Math.max(0, Math.min(99, parseInt(editMin || '0', 10) || 0))
    const s = Math.max(0, Math.min(59, parseInt(editSec || '0', 10) || 0))
    const total = m * 60 + s
    if (total > 0) timer.setFreeTimeSeconds(total)
    setEditing(false)
  }

  const cancelEdit = (): void => setEditing(false)

  const onMinChange = (v: string): void => setEditMin(v.replace(/\D/g, '').slice(0, 2))
  const onSecChange = (v: string): void => setEditSec(v.replace(/\D/g, '').slice(0, 2))

  // phase별 컬러 팔레트 — 집중(blue) · 휴식(green) · 긴 휴식(purple)
  const palette = timer.phase === 'work'
    ? { primary: '#2563EB', dark: '#1D4ED8', light: '#3B82F6' }
    : timer.phase === 'break'
      ? { primary: '#10B981', dark: '#047857', light: '#34D399' }
      : { primary: '#8B5CF6', dark: '#6D28D9', light: '#A78BFA' }

  const phaseLabel = timer.phase === 'work' ? '집중' : timer.phase === 'break' ? '휴식' : '긴 휴식'

  const radius = 70
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (timer.progress / 100) * circumference

  return (
    <div
      className="flex flex-col items-center h-full relative overflow-hidden"
      style={{
        // `size` 로 containerType 설정 — 모든 자식이 cqmin/cqw/cqh 단위로 위젯 크기에 비례.
        containerType: 'size',
        padding: 'clamp(10px, 3cqmin, 22px) clamp(12px, 3.5cqmin, 26px) clamp(14px, 3.5cqmin, 28px)',
        gap: 'clamp(6px, 2cqmin, 14px)',
        background: `radial-gradient(ellipse at 50% 0%, ${palette.primary}10 0%, transparent 55%), radial-gradient(ellipse at 50% 100%, ${palette.primary}08 0%, transparent 45%)`,
      }}
    >
      {/* 배경화면 모드: 인터랙션 버튼은 숨기고 원형 타이머 + 시간만 보임 (사용자 요청).
          이전엔 컨텐츠 전체를 빈 div 로 가리고 있어 "흰 네모"만 보이던 버그를 수정. */}

      {/* Mode cards: 뽀모도로 / 자유 타이머 — 배경화면 모드에선 클릭 불가라 숨김 */}
      {!iAmWallpaper && (
      <div
        className="w-full shrink-0"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(120px, 100%), 1fr))',
          gap: 'clamp(5px, 1.5cqmin, 10px)',
        }}
      >
        {([
          { key: 'pomodoro', label: '뽀모도로', sub: '25분 · 5분', primary: '#EF4444', Icon: Apple },
          { key: 'free',     label: '자유 타이머', sub: '시간 직접 입력', primary: '#2563EB', Icon: TimerIcon },
        ] as const).map((m) => {
          const active = timer.mode === m.key
          return (
            <button
              key={m.key}
              onClick={() => { timer.setMode(m.key); timer.reset() }}
              className="flex flex-col items-center justify-center transition-all hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap min-w-0"
              style={{
                padding: 'clamp(5px, 1.6cqmin, 11px) clamp(4px, 1.2cqmin, 10px)',
                gap: 2,
                borderRadius: 12,
                border: active ? `1.5px solid ${m.primary}` : '1.5px solid transparent',
                background: active
                  ? `linear-gradient(135deg, ${m.primary}14 0%, ${m.primary}28 100%)`
                  : 'var(--bg-secondary)',
                color: active ? m.primary : 'var(--text-secondary)',
                letterSpacing: '-0.3px',
                boxShadow: active ? `0 6px 18px ${m.primary}22` : 'none',
              }}
            >
              <m.Icon
                strokeWidth={2.4}
                size={16}
                style={{
                  width: 'clamp(12px, 3.5cqmin, 18px)',
                  height: 'clamp(12px, 3.5cqmin, 18px)',
                }}
              />
              <span style={{ fontSize: 'clamp(10px, 2.2cqmin, 14px)', fontWeight: 800, marginTop: 2 }}>
                {m.label}
              </span>
              <span style={{ fontSize: 'clamp(8.5px, 1.7cqmin, 11.5px)', fontWeight: 500, opacity: 0.72 }}>
                {m.sub}
              </span>
            </button>
          )
        })}
      </div>
      )}

      {/* Circular timer — aspect-ratio + max 제한으로 가로/세로 중 작은 쪽에 맞춰 축소. 절대 잘리지 않음. */}
      <div
        className="flex items-center justify-center w-full"
        style={{ flex: '1 1 0', minHeight: 0 }}
      >
        <div
          ref={clockBoxRef}
          className="relative"
          style={{
            // 시계가 작아 보이던 문제 → 55 → 70cqmin 으로 확대해 가독성 향상.
            width: 'min(70cqmin, 100%)',
            aspectRatio: '1 / 1',
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        >
          {/* 바깥 은은한 글로우 */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${palette.primary}22 0%, transparent 70%)`,
              transform: 'scale(1.15)',
            }}
          />
          <svg
            viewBox="0 0 160 160"
            className="-rotate-90 relative"
            style={{ width: '100%', height: '100%', display: 'block' }}
          >
            <defs>
              <linearGradient id="timer-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={palette.primary} />
                <stop offset="100%" stopColor={palette.dark} />
              </linearGradient>
            </defs>
            {/* 트랙: bg-secondary 가 다크 테마에서 위젯 배경과 거의 같은 색이라 안 보이던 문제 →
                배경화면 모드일 땐 palette 의 옅은 알파로 고정해 어떤 바탕화면 위에서도 보이게. */}
            <circle
              cx="80" cy="80" r={radius}
              fill="none"
              stroke={iAmWallpaper ? `${palette.primary}33` : 'var(--bg-secondary)'}
              strokeWidth="7"
            />
            <motion.circle
              cx="80" cy="80" r={radius}
              fill="none" stroke="url(#timer-grad)" strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              animate={{ strokeDashoffset }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
              style={{ filter: `drop-shadow(0 0 6px ${palette.primary}66)` }}
            />
          </svg>

          {/* 시간 + 페이즈 — 원 내부 중앙에 절대 배치, cqmin 기반 스케일 */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ padding: '10%' }}
          >
            {editing ? (
              <div
                className="flex items-center tabular-nums font-bold"
                style={{
                  fontSize: editFontPx,
                  color: 'var(--text-primary)',
                  gap: 2,
                }}
              >
                <input
                  autoFocus
                  inputMode="numeric"
                  value={editMin}
                  onChange={(e) => onMinChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit()
                    else if (e.key === 'Escape') cancelEdit()
                    else if (e.key === ':' || e.key === 'ArrowRight' || e.key === 'Tab') {
                      e.preventDefault()
                      secRef.current?.focus()
                      secRef.current?.select()
                    }
                  }}
                  className="text-right bg-[var(--bg-secondary)] rounded outline-none"
                  style={{
                    width: '2.5ch',
                    padding: '0 0.2em',
                    border: `1.5px solid ${palette.primary}`,
                    font: 'inherit',
                  }}
                  placeholder="00"
                />
                <span style={{ opacity: 0.5 }}>:</span>
                <input
                  ref={secRef}
                  inputMode="numeric"
                  value={editSec}
                  onChange={(e) => onSecChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit()
                    else if (e.key === 'Escape') cancelEdit()
                  }}
                  className="text-left bg-[var(--bg-secondary)] rounded outline-none"
                  style={{
                    width: '2.5ch',
                    padding: '0 0.2em',
                    border: `1.5px solid ${palette.primary}`,
                    font: 'inherit',
                  }}
                  placeholder="00"
                />
              </div>
            ) : (
              <button
                onClick={startEdit}
                disabled={!canEdit}
                title={canEdit ? '클릭해서 시간 직접 입력' : '뽀모도로는 설정에서 조정하세요'}
                className={`flex items-center gap-1 rounded-lg transition-colors ${
                  canEdit ? 'hover:bg-[var(--bg-secondary)] cursor-text' : 'cursor-default'
                }`}
                style={{
                  WebkitAppRegion: 'no-drag',
                  padding: '2px 6px',
                } as React.CSSProperties}
              >
                <span
                  className="tabular-nums"
                  style={{
                    // 글씨 크기 배율(zoom) 호환을 위해 cqmin → ResizeObserver 측정 기반 px 로 변경.
                    fontSize: timeFontPx,
                    fontWeight: 900,
                    letterSpacing: '-0.04em',
                    lineHeight: 1,
                    background: `linear-gradient(180deg, var(--text-primary) 0%, ${palette.dark} 140%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {timer.display}
                </span>
                {canEdit && (
                  <Pencil
                    strokeWidth={2.2}
                    size={12}
                    className="text-[var(--text-muted)] shrink-0"
                    style={{
                      width: pencilIconPx,
                      height: pencilIconPx,
                    }}
                  />
                )}
              </button>
            )}
            {timer.mode === 'pomodoro' && (
              <span
                className="inline-flex items-center tabular-nums"
                style={{
                  gap: 4,
                  // 글씨 크기 배율(zoom) 호환을 위해 cqmin → ResizeObserver 측정 기반 px 로 변경.
                  fontSize: iAmWallpaper ? phaseFontPxWp : phaseFontPx,
                  fontWeight: 800,
                  marginTop: Math.max(2, Math.min(6, clockPx * 0.012)),
                  padding: iAmWallpaper
                    ? `${Math.max(4, Math.min(8, clockPx * 0.022))}px ${Math.max(10, Math.min(16, clockPx * 0.045))}px`
                    : `${Math.max(2, Math.min(4, clockPx * 0.011))}px ${Math.max(6, Math.min(10, clockPx * 0.028))}px`,
                  borderRadius: 999,
                  backgroundColor: `${palette.primary}18`,
                  color: palette.dark,
                  letterSpacing: '-0.2px',
                  whiteSpace: 'nowrap',
                }}
              >
                {phaseLabel}
                {timer.pomodoroCount > 0 && (
                  <span style={{ opacity: 0.7 }}>· {timer.pomodoroCount}/4</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Free timer quick presets — flex-wrap으로 자연스럽게 여러 줄. 배경화면 모드에선 클릭 불가라 숨김. */}
      {!iAmWallpaper && timer.mode === 'free' && timer.state === 'idle' && (
        <div
          className="flex flex-wrap justify-center shrink-0 w-full"
          style={{ gap: 'clamp(3px, 1cqmin, 6px)' }}
        >
          {[5, 10, 15, 30, 45, 60].map((min) => (
            <button
              key={min}
              onClick={() => timer.setFreeTime(min)}
              className="transition-colors hover:scale-105"
              style={{
                padding: 'clamp(3px, 1cqmin, 5px) clamp(7px, 2cqmin, 12px)',
                borderRadius: 999,
                fontSize: 'clamp(9.5px, 2cqmin, 12px)',
                fontWeight: 700,
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                letterSpacing: '-0.2px',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `${palette.primary}18`
                e.currentTarget.style.color = palette.dark
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              {min}분
            </button>
          ))}
        </div>
      )}

      {/* Controls — Play 버튼이 위젯 정중앙에 오도록 reset(왼쪽) + spacer(같은 크기, 오른쪽) 로 대칭.
          기존엔 reset + play 만 있어 큰 play 가 시각적으로 중심을 오른쪽으로 밀었음 → 가운데 안 맞아 보임. */}
      {!iAmWallpaper && (
      <div
        className="flex items-center justify-center shrink-0"
        style={{ gap: 'clamp(8px, 2.5cqmin, 16px)' }}
      >
        <button
          onClick={timer.reset}
          className="rounded-full flex items-center justify-center transition-colors shrink-0"
          style={{
            width: 'clamp(30px, 8cqmin, 44px)',
            height: 'clamp(30px, 8cqmin, 44px)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-muted)',
          }}
          title="리셋"
        >
          <RotateCcw
            strokeWidth={2.2}
            size={16}
            style={{
              width: 'clamp(13px, 3.8cqmin, 20px)',
              height: 'clamp(13px, 3.8cqmin, 20px)',
            }}
          />
        </button>
        <button
          onClick={timer.state === 'running' ? timer.pause : timer.start}
          className="rounded-full flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95 shrink-0"
          style={{
            width: 'clamp(42px, 11cqmin, 60px)',
            height: 'clamp(42px, 11cqmin, 60px)',
            background: `linear-gradient(135deg, ${palette.primary} 0%, ${palette.dark} 100%)`,
            boxShadow: `0 10px 24px ${palette.primary}55`,
          }}
          title={timer.state === 'running' ? '일시정지' : '시작'}
        >
          {timer.state === 'running' ? (
            <Pause
              strokeWidth={2.2}
              size={22}
              style={{
                width: 'clamp(16px, 5cqmin, 26px)',
                height: 'clamp(16px, 5cqmin, 26px)',
              }}
            />
          ) : (
            <Play
              strokeWidth={2.2}
              size={22}
              className="ml-[3%]"
              style={{
                width: 'clamp(16px, 5cqmin, 26px)',
                height: 'clamp(16px, 5cqmin, 26px)',
              }}
            />
          )}
        </button>
        {/* 오른쪽 spacer — reset 버튼과 같은 크기로 좌우 대칭 보장 (play 가 정확히 중앙). */}
        <div
          aria-hidden
          style={{
            width: 'clamp(30px, 8cqmin, 44px)',
            height: 'clamp(30px, 8cqmin, 44px)',
          }}
        />
      </div>
      )}
    </div>
  )
}
