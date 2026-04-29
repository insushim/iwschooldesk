import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, BellRing, Monitor, MonitorOff } from 'lucide-react'
import { formatDate, getKoreanDay } from '../../lib/date-utils'
import type { TimetablePeriod } from '../../types/timetable.types'
import { useDataChange } from '../../hooks/useDataChange'
import { useIAmWallpaper } from '../../hooks/useIAmWallpaper'
import { useDisplayBg } from '../../lib/display-bg'
import { DisplayBgPicker } from '../ui/DisplayBgPicker'

/**
 * 시계 위젯 — 전자칠판 시인성 우선.
 *
 * 디자인 원칙:
 *  - 시각(HH:MM)을 가장 크게(`clamp(...vw...)`), 위젯 폭에 비례.
 *  - 초는 작게 / AM·PM 칩 강조 / 날짜는 부드럽게.
 *  - 현재 교시는 별도 카드(브랜드 컬러 그라디언트)로 강조.
 *  - 배경에 은은한 라디얼 글로우로 글래스모피즘 느낌.
 */
export function ClockWidget() {
  const [now, setNow] = useState(new Date())
  const [periods, setPeriods] = useState<TimetablePeriod[]>([])
  // lock-screen / 절전에서 복귀 시 `WebkitBackgroundClip:text` 글자가 어그러지는 문제 — key 를 바꿔 강제 리마운트.
  const [renderKey, setRenderKey] = useState(0)
  const [displayMode, setDisplayMode] = useState(false)
  // 내 widget id — 배경화면 모드 상태 sync 용.
  const myWidgetId = useRef<string>('widget-clock')
  // 배경화면 모드: 클릭 통과 + 맨 뒤 고정 → 컨트롤 자체를 숨겨 혼란 방지.
  const iAmWallpaper = useIAmWallpaper('clock')
  // 디스플레이 모드 배경 팔레트
  const { preset: displayBg, setPresetId: setDisplayBgId } = useDisplayBg('clock')

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    window.api.timetable.getPeriods().then(setPeriods)
    return () => clearInterval(timer)
  }, [])

  // Windows lock/unlock · 절전 복귀 · 앱 창 focus 복원 시 글자 깨짐 → 시계 전체 리마운트.
  useEffect(() => {
    const bump = (): void => {
      if (document.visibilityState === 'visible') {
        setNow(new Date())
        setRenderKey((k) => k + 1)
      }
    }
    document.addEventListener('visibilitychange', bump)
    window.addEventListener('focus', bump)
    window.addEventListener('pageshow', bump)
    return () => {
      document.removeEventListener('visibilitychange', bump)
      window.removeEventListener('focus', bump)
      window.removeEventListener('pageshow', bump)
    }
  }, [])

  // 시간표(교시) 변경 시 자동 갱신
  useDataChange('timetable', () => {
    window.api.timetable.getPeriods().then(setPeriods).catch(() => {})
  })

  // 수업 시작/끝 벨 이벤트 — 듀얼 모니터 전자칠판의 시계에 시각 알림 표시.
  // 메인 창에서 brodcastBell 호출 → 메인 프로세스가 모든 창에 'school-bell' 전송.
  const [bellEvent, setBellEvent] = useState<{ kind: 'start' | 'end'; periodLabel: string; periodNumber: number; at: string } | null>(null)
  useEffect(() => {
    const handler = (...args: unknown[]): void => {
      const ev = args[0] as { kind: 'start' | 'end'; periodLabel: string; periodNumber: number; at: string } | undefined
      if (!ev || (ev.kind !== 'start' && ev.kind !== 'end')) return
      setBellEvent(ev)
      // 10초 자동 사라짐
      setTimeout(() => setBellEvent((cur) => (cur && cur.at === ev.at ? null : cur)), 10000)
    }
    window.api.on('school-bell', handler)
    return () => window.api.off('school-bell', handler)
  }, [])

  // 배경화면 모드 + 마스터 디스플레이 모드 브로드캐스트와 display 모드 sync.
  // "우리반 목표 포함 모든 위젯 디스플레이 모드 같이 적용" — 통일된 토글 상태 유지.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const map = await window.api.widget.getWallpaperModeMap()
        if (!cancelled && Array.isArray(map) && map.includes(myWidgetId.current)) {
          setDisplayMode(true)
        }
      } catch { /* noop */ }
    })()
    const offWallpaper = window.api.widget.onWallpaperModeChanged?.((p) => {
      if (p.widgetId === myWidgetId.current) setDisplayMode(p.on)
    })
    const offAll = window.api.widget.onAllDisplayModeChanged?.((p) => {
      setDisplayMode(!!p.on)
    })
    return () => {
      cancelled = true
      if (offWallpaper) offWallpaper()
      if (offAll) offAll()
    }
  }, [])

  // displayMode → WidgetShell 헤더 숨김
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('widget:displayMode', { detail: { on: displayMode } }))
  }, [displayMode])

  const currentPeriod = useMemo(() => {
    const day = now.getDay()
    if (day === 0 || day === 6) return null
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    return periods.find((p) => !p.is_break && timeStr >= p.start_time && timeStr < p.end_time) ?? null
  }, [now, periods])

  const hours24 = now.getHours()
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  const hours = String(hours12).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const ampm = hours24 < 12 ? 'AM' : 'PM'
  const ampmKor = hours24 < 12 ? '오전' : '오후'

  // 시각 색 — 오전/오후로 살짝 다르게 (시각적 단조로움 회피)
  const accent = hours24 < 12 ? '#0EA5E9' : '#7C3AED'
  const accentDark = hours24 < 12 ? '#0284C7' : '#6D28D9'

  // 디스플레이 모드일 때 사용자가 고른 배경 프리셋 적용 (지정 없으면 기존 그라디언트).
  const isLightText = displayMode && displayBg.textMode === 'light'
  const rootBg = displayMode && displayBg.bg
    ? displayBg.bg
    : `radial-gradient(ellipse at 30% 0%, ${accent}14 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, ${accent}10 0%, transparent 50%)`

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        padding: 'clamp(14px, 2vw, 28px) clamp(20px, 2.4vw, 32px) clamp(20px, 2.6vw, 32px)',
        background: rootBg,
        transition: 'background 320ms ease',
        color: isLightText ? '#fff' : undefined,
      }}
    >
      {/* 디스플레이 모드 — 레이어드 glow(은은한 빛·vignette) 오버레이. */}
      {displayMode && displayBg.glow && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: displayBg.glow }}
        />
      )}
      {/* 디스플레이 모드 토글 + 배경 팔레트 — 우상단 플로팅.
          배경화면 모드(클릭 통과)에선 어차피 누를 수 없으므로 통째로 숨김. */}
      {!iAmWallpaper && (
      <div
        className="absolute top-2 right-2 z-50 flex items-center gap-1.5"
        style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as React.CSSProperties}
      >
        {displayMode && (
          <DisplayBgPicker current={displayBg} onPick={setDisplayBgId} />
        )}
        <button
          onClick={() => {
            const next = !displayMode
            setDisplayMode(next)
            try { window.api.widget.setAllDisplayMode?.(next) } catch { /* noop */ }
          }}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-secondary)]"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-widget)' }}
          title={displayMode ? '디스플레이 모드 해제 (모든 위젯 동기)' : '디스플레이 모드 — 모든 위젯에 동일 적용.'}
        >
          {displayMode ? <MonitorOff size={13} strokeWidth={2.2} /> : <Monitor size={13} strokeWidth={2.2} />}
        </button>
      </div>
      )}

      {/* 상단: 날짜 + AM/PM 칩.
          - 일반 모드: justify-between (좌우 양 끝)
          - 디스플레이 모드: 가운데 정렬 + 좌우 동일 padding 으로 우측 컨트롤 자리만큼 좌측도 비워 시각적 대칭. */}
      <div
        className={`flex items-center shrink-0 ${displayMode ? 'justify-center' : 'justify-between'}`}
        style={{
          marginBottom: 'clamp(4px, 0.8vw, 10px)',
          gap: displayMode ? 'clamp(10px, 1.4vw, 20px)' : 0,
          paddingLeft: displayMode ? 'clamp(64px, 8vw, 96px)' : 0,
          paddingRight: displayMode ? 'clamp(64px, 8vw, 96px)' : 'clamp(30px, 3.4vw, 44px)',
        }}
      >
        <div
          className="text-[var(--text-secondary)] truncate"
          style={{
            fontSize: 'clamp(11px, 1.3vw, 18px)',
            fontWeight: 700,
            letterSpacing: '-0.3px',
          }}
        >
          {formatDate(now, 'M월 d일')} · {getKoreanDay(now)}요일
        </div>
        <span
          className="inline-flex items-center tabular-nums shrink-0"
          style={{
            fontSize: 'clamp(10px, 1.1vw, 14px)',
            fontWeight: 800,
            padding: 'clamp(3px, 0.4vw, 6px) clamp(8px, 0.9vw, 12px)',
            borderRadius: 999,
            background: `linear-gradient(135deg, ${accent} 0%, ${accentDark} 100%)`,
            color: '#fff',
            letterSpacing: 0.3,
            boxShadow: `0 4px 12px ${accent}55`,
          }}
        >
          {ampm} · {ampmKor}
        </span>
      </div>

      {/* 시각 — 메인 콘텐츠. 폭에 비례해 거대하게. */}
      <div
        className="flex-1 flex items-center justify-center min-h-0"
        style={{ marginBottom: 'clamp(4px, 0.6vw, 8px)' }}
      >
        <div
          key={renderKey}
          className="flex items-baseline tabular-nums"
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum", "ss03"',
          }}
        >
          <span
            style={{
              fontSize: 'clamp(48px, 13vw, 200px)',
              fontWeight: 900,
              lineHeight: 0.95,
              letterSpacing: '-0.05em',
              // 디스플레이 모드에서 어두운 배경을 고른 경우(light 글씨) — 그라디언트 대신 흰색으로
              // 대비를 최대화. 그 외엔 기존 브랜드 그라디언트 텍스트 유지.
              color: isLightText ? '#FFFFFF' : 'var(--text-primary)',
              background: isLightText ? 'none' : `linear-gradient(180deg, var(--text-primary) 0%, ${accentDark} 130%)`,
              WebkitBackgroundClip: isLightText ? 'border-box' : 'text',
              WebkitTextFillColor: isLightText ? '#FFFFFF' : 'transparent',
              backgroundClip: isLightText ? 'border-box' : 'text',
              textShadow: isLightText ? '0 4px 18px rgba(0,0,0,0.35)' : undefined,
            }}
          >
            {hours}
          </span>
          <span
            className="animate-pulse"
            style={{
              fontSize: 'clamp(40px, 11vw, 170px)',
              fontWeight: 800,
              lineHeight: 0.95,
              color: accent,
              margin: '0 clamp(2px, 0.3vw, 6px)',
              opacity: 0.85,
            }}
          >
            :
          </span>
          <span
            style={{
              fontSize: 'clamp(48px, 13vw, 200px)',
              fontWeight: 900,
              lineHeight: 0.95,
              letterSpacing: '-0.05em',
              // 디스플레이 모드에서 어두운 배경을 고른 경우(light 글씨) — 그라디언트 대신 흰색으로
              // 대비를 최대화. 그 외엔 기존 브랜드 그라디언트 텍스트 유지.
              color: isLightText ? '#FFFFFF' : 'var(--text-primary)',
              background: isLightText ? 'none' : `linear-gradient(180deg, var(--text-primary) 0%, ${accentDark} 130%)`,
              WebkitBackgroundClip: isLightText ? 'border-box' : 'text',
              WebkitTextFillColor: isLightText ? '#FFFFFF' : 'transparent',
              backgroundClip: isLightText ? 'border-box' : 'text',
              textShadow: isLightText ? '0 4px 18px rgba(0,0,0,0.35)' : undefined,
            }}
          >
            {minutes}
          </span>
          <span
            className="tabular-nums"
            style={{
              fontSize: 'clamp(14px, 2.2vw, 36px)',
              fontWeight: 700,
              color: 'var(--text-muted)',
              marginLeft: 'clamp(6px, 1vw, 14px)',
              alignSelf: 'baseline',
              letterSpacing: '-0.5px',
            }}
          >
            {seconds}
          </span>
        </div>
      </div>

      {/* 하단: 현재 교시 또는 비수업 시간 안내 */}
      <div className="shrink-0 flex items-center justify-center">
        {currentPeriod ? (
          <div
            className="inline-flex items-center"
            style={{
              gap: 'clamp(6px, 0.8vw, 10px)',
              padding: 'clamp(6px, 0.9vw, 12px) clamp(12px, 1.4vw, 20px)',
              borderRadius: 999,
              background: `linear-gradient(135deg, ${accent}20 0%, ${accent}30 100%)`,
              border: `1px solid ${accent}40`,
            }}
          >
            <span
              aria-hidden
              className="inline-block rounded-full"
              style={{
                width: 'clamp(6px, 0.7vw, 10px)',
                height: 'clamp(6px, 0.7vw, 10px)',
                backgroundColor: accent,
                boxShadow: `0 0 0 3px ${accent}30`,
                animation: 'clk-pulse 1.6s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontSize: 'clamp(11px, 1.3vw, 16px)',
                fontWeight: 800,
                color: accentDark,
                letterSpacing: '-0.3px',
              }}
            >
              {currentPeriod.label} 진행 중
            </span>
            <span
              className="tabular-nums"
              style={{
                fontSize: 'clamp(10px, 1.1vw, 14px)',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                letterSpacing: '-0.2px',
              }}
            >
              {currentPeriod.start_time} – {currentPeriod.end_time}
            </span>
          </div>
        ) : (
          <span
            style={{
              fontSize: 'clamp(11px, 1.2vw, 14px)',
              fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: '-0.2px',
            }}
          >
            지금은 수업 시간이 아니에요
          </span>
        )}
      </div>

      {/* 벨 이벤트 오버레이 — 수업 시작/끝 시 10초 표시. 전자칠판에서 학생들이 보기 좋게 크게. */}
      <AnimatePresence>
        {bellEvent && (
          <motion.div
            key={bellEvent.at}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            style={{
              background: bellEvent.kind === 'start'
                ? 'radial-gradient(ellipse at 50% 40%, rgba(14,165,233,0.88) 0%, rgba(2,132,199,0.92) 55%, rgba(12,74,110,0.96) 100%)'
                : 'radial-gradient(ellipse at 50% 40%, rgba(124,58,237,0.88) 0%, rgba(109,40,217,0.92) 55%, rgba(49,27,94,0.96) 100%)',
              backdropFilter: 'blur(2px)',
            }}
          >
            <button
              onClick={() => setBellEvent(null)}
              className="absolute pointer-events-auto flex items-center justify-center hover:bg-white/20 transition-colors"
              style={{
                top: 'clamp(10px, 1.5vw, 18px)',
                right: 'clamp(10px, 1.5vw, 18px)',
                width: 'clamp(28px, 3.4vw, 42px)',
                height: 'clamp(28px, 3.4vw, 42px)',
                borderRadius: 999,
                color: '#fff',
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.28)',
                fontSize: 'clamp(14px, 1.8vw, 22px)',
                fontWeight: 900,
                lineHeight: 1,
              }}
              title="닫기"
            >
              ×
            </button>
            <motion.div
              animate={bellEvent.kind === 'start' ? { rotate: [0, -15, 15, -15, 15, 0] } : {}}
              transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 1 }}
              style={{ marginBottom: 'clamp(10px, 1.6vw, 22px)' }}
            >
              {bellEvent.kind === 'start'
                ? <BellRing size={64} color="#fff" strokeWidth={2} style={{ width: 'clamp(52px, 9vw, 128px)', height: 'clamp(52px, 9vw, 128px)', filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.35))' }} />
                : <Bell size={64} color="#fff" strokeWidth={2} style={{ width: 'clamp(52px, 9vw, 128px)', height: 'clamp(52px, 9vw, 128px)', filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.35))' }} />
              }
            </motion.div>
            <div
              style={{
                fontSize: 'clamp(36px, 9vw, 128px)',
                fontWeight: 900,
                color: '#fff',
                letterSpacing: '-0.04em',
                lineHeight: 1,
                textShadow: '0 6px 24px rgba(0,0,0,0.35)',
              }}
            >
              {bellEvent.kind === 'start' ? '수업 시작' : '수업 끝'}
            </div>
            {bellEvent.periodLabel && (
              <div
                className="tabular-nums"
                style={{
                  marginTop: 'clamp(8px, 1.2vw, 18px)',
                  fontSize: 'clamp(18px, 3.4vw, 48px)',
                  fontWeight: 800,
                  color: 'rgba(255,255,255,0.94)',
                  letterSpacing: '-0.025em',
                  textShadow: '0 4px 16px rgba(0,0,0,0.3)',
                }}
              >
                {bellEvent.periodLabel}
                {bellEvent.periodNumber > 0 && (
                  <span style={{ marginLeft: 8, opacity: 0.7 }}>· {bellEvent.periodNumber}교시</span>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes clk-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}
