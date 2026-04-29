import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { X, Pin, PinOff, Eye, Type, Image as WallpaperIcon, MonitorOff } from 'lucide-react'
import { WALLPAPER_ELIGIBLE_TYPES, type WidgetType } from '../../types/widget.types'
import { useDisplayBg } from '../../lib/display-bg'
import { DisplayBgPicker } from '../ui/DisplayBgPicker'

interface WidgetShellProps {
  title: string
  icon?: ReactNode
  iconColor?: string
  children: ReactNode
  /** 이 위젯의 타입 — 배경화면 모드 전체 토글 버튼 노출 여부 결정 */
  widgetType?: string
}

export function WidgetShell({ title, icon, iconColor, children, widgetType }: WidgetShellProps) {
  const [opacity, setOpacityState] = useState(1)
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [opacityOpen, setOpacityOpen] = useState(false)
  const [fontOpen, setFontOpen] = useState(false)
  const [fontScale, setFontScale] = useState(1)
  // 배경화면 모드가 "한 개라도 켜져 있으면" true — 전체 on/off 마스터 상태.
  const [anyWallpaperOn, setAnyWallpaperOn] = useState(false)
  // 내 창이 배경화면 모드면 헤더 숨기고 콘텐츠만 풀로 보여주자.
  const [iAmWallpaper, setIAmWallpaper] = useState(false)
  // 자식 위젯(GoalWidget / StudentCheckWidget 등)이 보낸 "디스플레이 모드" 상태.
  // 배경화면 모드가 아니어도 디스플레이 모드면 헤더를 숨겨 콘텐츠만 풀로 보여준다.
  const [childDisplayMode, setChildDisplayMode] = useState(false)
  // 쉘 자체 디스플레이 모드 — 헤더 버튼으로 토글. 배경화면 모드가 없는 위젯이나 "그냥 헤더만 숨기고 싶을 때" 사용.
  const [shellDisplayMode, setShellDisplayMode] = useState(false)
  // 쉘 레벨 디스플레이 배경 프리셋 — 디스플레이 모드 켠 위젯의 body 배경 색.
  // 위젯별로 따로 저장 (e.g. 메모/시계 각자 다른 색 선택 가능).
  const bgScopeKey = useMemo(() => `shell:${widgetType ?? 'default'}`, [widgetType])
  const { preset: shellBg, setPresetId: setShellBgId } = useDisplayBg(bgScopeKey)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const fontPopoverRef = useRef<HTMLDivElement | null>(null)

  // 배경화면 모드 마스터 토글은 편집용 위젯(= 배경화면 불가능) 헤더에서만 노출.
  const isMasterToggleHost = !!widgetType && !WALLPAPER_ELIGIBLE_TYPES.has(widgetType as WidgetType)

  // 내 widget id — URL hash에서 유도. 형태: `widget-<type>[-<instanceId>]`.
  // main.ts 의 widget id 명명 규칙과 동일해야 한다.
  const myWidgetId = useRef<string | null>(null)
  if (myWidgetId.current === null && widgetType) {
    const m = /instance=([^&]+)/.exec(window.location.hash)
    const inst = m ? decodeURIComponent(m[1]) : null
    myWidgetId.current = inst ? `widget-${widgetType}-${inst}` : `widget-${widgetType}`
  }

  const refreshWallpaperState = useCallback(async () => {
    try {
      const map = await window.api.widget.getWallpaperModeMap()
      setAnyWallpaperOn((map?.length ?? 0) > 0)
    } catch { setAnyWallpaperOn(false) }
  }, [])

  useEffect(() => {
    window.api.widget.getAlwaysOnTop?.().then(setAlwaysOnTop).catch(() => {})
    window.api.widget.getFontScale?.().then((v) => setFontScale(v || 1)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isMasterToggleHost) return
    refreshWallpaperState()
    // main이 모드 변경 이벤트를 쏘면 즉시 동기화
    const off = window.api.widget.onWallpaperModeChanged?.(() => {
      refreshWallpaperState()
    })
    return () => { if (off) off() }
  }, [isMasterToggleHost, refreshWallpaperState])

  // 내 창의 배경화면 상태를 실시간 추적. 켜지면 헤더 전체를 숨긴다.
  useEffect(() => {
    if (!myWidgetId.current) return
    let cancelled = false
    const syncMine = async (): Promise<void> => {
      try {
        const map = await window.api.widget.getWallpaperModeMap()
        if (cancelled) return
        setIAmWallpaper(Array.isArray(map) && map.includes(myWidgetId.current!))
      } catch { /* ignore */ }
    }
    syncMine()
    // 자식 위젯이 자신의 "디스플레이 모드" 상태를 dispatch 하면 헤더를 숨긴다.
    // 배경화면 모드 아닌 상태에서도 "화면 가득 보여주기"가 가능해짐.
    const onDisplayMode = (ev: Event): void => {
      const detail = (ev as CustomEvent<{ on?: boolean }>).detail
      setChildDisplayMode(!!detail?.on)
    }
    window.addEventListener('widget:displayMode', onDisplayMode as EventListener)
    const off = window.api.widget.onWallpaperModeChanged?.((p) => {
      if (p.widgetId !== myWidgetId.current) return
      setIAmWallpaper(p.on)
      // 배경화면 모드 진입 시 현재 창에 남아있는 DOM focus 를 즉시 해제.
      // (input·button·contentEditable 에 포커스가 있으면 Windows 가 창을
      //  다시 앞으로 가져와 "맨 뒤 고정"을 방해한다.)
      if (p.on) {
        try {
          const active = document.activeElement as HTMLElement | null
          if (active && typeof active.blur === 'function') active.blur()
        } catch { /* noop */ }
        try { window.getSelection()?.removeAllRanges?.() } catch { /* noop */ }
        try { window.blur() } catch { /* noop */ }
      }
    })
    return () => {
      cancelled = true
      if (off) off()
      window.removeEventListener('widget:displayMode', onDisplayMode as EventListener)
    }
  }, [])

  // 마스터 디스플레이 모드 브로드캐스트 구독 — 다른 위젯에서 "전체 디스플레이 모드" 를 켜면 내 shellDisplayMode 도 동기화.
  useEffect(() => {
    const off = window.api.widget.onAllDisplayModeChanged?.((p) => {
      setShellDisplayMode(!!p.on)
    })
    return () => { if (off) off() }
  }, [])

  // 디스플레이 모드 해제(플로팅 버튼)는 항상 마스터 브로드캐스트 — 모든 위젯이 함께 해제.
  const exitAllDisplayMode = (): void => {
    setShellDisplayMode(false)
    try { window.api.widget.setAllDisplayMode?.(false) } catch { /* ignore */ }
  }

  const toggleAllWallpaper = async (): Promise<void> => {
    if (anyWallpaperOn) {
      await window.api.widget.exitAllWallpaperMode()
      setAnyWallpaperOn(false)
      return
    }
    // 열린 위젯 중 eligible 타입만 선별해서 한 번에 켠다.
    const openIds = await window.api.widget.listOpen()
    const targets = openIds
      .map((id) => {
        // id는 "type" 또는 "type-<instanceId>" 형태(widget- 접두는 listOpen에서 제거됨)
        const prefix = id.split('-')[0] as WidgetType
        return { prefix, fullId: `widget-${id}` }
      })
      .filter((t) => WALLPAPER_ELIGIBLE_TYPES.has(t.prefix))
    for (const t of targets) {
      try { await window.api.widget.setWallpaperMode(t.fullId, true) } catch { /* ignore */ }
    }
    setAnyWallpaperOn(targets.length > 0)
  }

  const changeFontScale = (next: number) => {
    const clamped = Math.max(0.7, Math.min(1.6, Math.round(next * 20) / 20))
    setFontScale(clamped)
    window.api.widget.setFontScale?.(clamped)
  }

  const applyOpacity = (v: number) => {
    setOpacityState(v)
    window.api.widget.setOpacity(v)
  }

  const toggleAlwaysOnTop = () => {
    const next = !alwaysOnTop
    setAlwaysOnTop(next)
    window.api.widget.setAlwaysOnTop(next)
  }

  useEffect(() => {
    if (!opacityOpen) return
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpacityOpen(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [opacityOpen])

  useEffect(() => {
    if (!fontOpen) return
    const onDown = (e: MouseEvent) => {
      if (fontPopoverRef.current && !fontPopoverRef.current.contains(e.target as Node)) {
        setFontOpen(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [fontOpen])

  const accent = iconColor ?? 'var(--accent)'
  const chipBg = iconColor ? `${iconColor}1F` : 'var(--accent-light)'

  return (
    <div
      className="shell-card flex flex-col h-screen w-screen"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* Draggable header — 배경화면 모드, 자식 위젯 디스플레이 모드, 쉘 자체 디스플레이 모드면 완전히 숨김. */}
      {!iAmWallpaper && !childDisplayMode && !shellDisplayMode && (
      <div
        className="flex items-center justify-between relative"
        style={{
          WebkitAppRegion: 'drag',
          padding: '10px 12px 10px 14px',
          background: 'var(--shell-header-bg)',
          borderBottom: '1px solid var(--shell-header-border)',
        } as React.CSSProperties}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <span
              className="flex items-center justify-center shrink-0"
              style={{
                width: 26,
                height: 26,
                borderRadius: 9,
                background: chipBg,
                color: accent,
                boxShadow: `0 1px 0 rgba(255,255,255,0.4) inset, 0 0 0 1px ${iconColor ? `${iconColor}26` : 'rgba(37,99,235,0.18)'}`,
              }}
            >
              {icon}
            </span>
          )}
          <span
            className="truncate text-[var(--text-primary)]"
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '-0.015em',
            }}
          >
            {title}
          </span>
        </div>

        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* 배경화면 모드 전체 on/off — 편집용 위젯에만 노출 (언제든 클릭 가능). */}
          {isMasterToggleHost && (
            <button
              onClick={toggleAllWallpaper}
              className={`shell-btn ${anyWallpaperOn ? 'shell-btn-active' : ''}`}
              title={
                anyWallpaperOn
                  ? '배경화면 모드 전체 해제 — 단축키: Ctrl+Alt+Shift+W (다시 누르면 진입)'
                  : '배경화면 모드 전체 진입 — 시간표·학급체크·달력·우리반목표·학생용시간표·D-Day·시계·타이머·오늘·급식 일괄 적용. 단축키: Ctrl+Alt+Shift+W (같은 단축키로 해제)'
              }
              style={anyWallpaperOn
                ? { color: '#fff', background: 'linear-gradient(135deg, #0EA5E9, #2563EB)', boxShadow: '0 4px 10px rgba(14,165,233,0.45)' }
                : undefined}
            >
              <WallpaperIcon size={13} strokeWidth={2.2} />
            </button>
          )}

          {/* 디스플레이 모드 토글은 위젯 내부의 Monitor 버튼(시계/학생시간표/학급체크/우리반목표) 과
              중복되어 제거. 내부 토글이 이미 마스터 브로드캐스트를 보내 모든 위젯에 일괄 적용됨. */}

          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setOpacityOpen((p) => !p)}
              className={`shell-btn ${opacityOpen ? 'shell-btn-active' : ''}`}
              title="투명도"
            >
              <Eye size={13.5} strokeWidth={2.1} />
            </button>
            {opacityOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 z-10"
                style={{
                  padding: '12px 14px',
                  minWidth: 170,
                  borderRadius: 14,
                  background: 'var(--shell-popover-bg)',
                  border: '1px solid var(--shell-popover-border)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  boxShadow: '0 12px 32px -8px rgba(15, 23, 42, 0.24), 0 4px 12px -2px rgba(15, 23, 42, 0.1)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-[var(--text-secondary)] tracking-tight">투명도</span>
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{ color: 'var(--accent)' }}
                  >
                    {Math.round(opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.05}
                  value={opacity}
                  onChange={(e) => applyOpacity(Number(e.target.value))}
                  className="shell-slider"
                />
              </div>
            )}
          </div>

          <div className="relative" ref={fontPopoverRef}>
            <button
              onClick={() => setFontOpen((p) => !p)}
              className={`shell-btn ${fontOpen ? 'shell-btn-active' : ''}`}
              title="글씨 크기"
            >
              <Type size={13} strokeWidth={2.2} />
            </button>
            {fontOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 z-10"
                style={{
                  padding: '10px 12px',
                  minWidth: 170,
                  borderRadius: 14,
                  background: 'var(--shell-popover-bg)',
                  border: '1px solid var(--shell-popover-border)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  boxShadow: '0 12px 32px -8px rgba(15, 23, 42, 0.24), 0 4px 12px -2px rgba(15, 23, 42, 0.1)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-[var(--text-secondary)] tracking-tight">글씨 크기</span>
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{ color: 'var(--accent)' }}
                  >
                    {Math.round(fontScale * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => changeFontScale(fontScale - 0.1)}
                    className="flex-1 py-1 rounded-md text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--shell-popover-border)',
                    }}
                  >A−</button>
                  <button
                    onClick={() => changeFontScale(1)}
                    className="px-2 py-1 rounded-md text-[10px] font-medium"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--shell-popover-border)',
                    }}
                  >기본</button>
                  <button
                    onClick={() => changeFontScale(fontScale + 0.1)}
                    className="flex-1 py-1 rounded-md text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--accent-light)',
                      color: 'var(--accent)',
                      border: '1px solid var(--shell-popover-border)',
                    }}
                  >A+</button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={toggleAlwaysOnTop}
            className={`shell-btn ${alwaysOnTop ? 'shell-btn-active' : ''}`}
            title={
              alwaysOnTop
                ? '핀 해제 (다른 창 클릭 시 자동으로 뒤로 감)'
                : '맨 앞에 핀 고정'
            }
          >
            {alwaysOnTop ? <Pin size={13} strokeWidth={2.2} /> : <PinOff size={13} strokeWidth={2.2} />}
          </button>

          <button
            onClick={() => window.api.widget.closeSelf()}
            className="shell-btn shell-btn-danger"
            title="닫기 — 바탕화면 위젯 패널에서 다시 켤 수 있어요"
          >
            <X size={13.5} strokeWidth={2.4} />
          </button>
        </div>
      </div>
      )}

      {/* Body — 헤더 유무와 무관하게 4 모서리 모두 round. 헤더가 있으면 위 2 모서리는 헤더 뒤에 가려서 안 보이고,
          헤더가 없으면(배경화면/디스플레이 모드) 그대로 예쁜 rounded top 이 노출됨.
          shellDisplayMode 일 때는 사용자가 고른 배경 프리셋을 body 에 깔아준다 — 모든 위젯에 일관된 배경. */}
      <div
        className="flex-1 overflow-hidden relative"
        style={{
          borderRadius: 'var(--shell-radius)',
          background: shellDisplayMode && shellBg.bg ? shellBg.bg : undefined,
          transition: 'background 320ms ease',
        }}
      >
        {/* 디스플레이 모드 글로우 오버레이 */}
        {shellDisplayMode && shellBg.glow && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{ background: shellBg.glow, zIndex: 0 }}
          />
        )}

        {/* 글씨 크기 배율 적용 — CSS zoom 은 cqmin/vw 까지 모두 스케일하므로
            webContents.setZoomFactor 가 스케일 못하던 콘텐츠 내부 글씨도 제대로 커진다.
            A-/A+ 버튼이 이 값을 바꾸면 body 만 커지고 헤더는 그대로. */}
        <div
          className="relative w-full h-full"
          style={{
            zIndex: 1,
            color: shellDisplayMode && shellBg.textMode === 'light' ? '#fff' : undefined,
            zoom: fontScale,
          } as React.CSSProperties}
        >
          {children}
        </div>

        {/* 디스플레이 모드 전용 플로팅 컨트롤.
            위젯 내부의 팔레트/토글 버튼(시계·학생시간표·학급체크·목표)과 겹치지 않도록
            좌하단(bottom-left) 에 위치. 기본 완전 투명(opacity:0) — 위젯에 마우스를 올려야 나타남. */}
        {shellDisplayMode && !iAmWallpaper && (
          <div
            className="shell-float-controls absolute bottom-1.5 left-1.5 flex items-center gap-1"
            style={{ zIndex: 30, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <DisplayBgPicker current={shellBg} onPick={setShellBgId} />
            <button
              onClick={exitAllDisplayMode}
              className="rounded-md transition-colors flex items-center justify-center"
              title="디스플레이 모드 해제 (모든 위젯 · Ctrl+Alt+Shift+D)"
              style={{
                width: 22,
                height: 22,
                color: shellBg.textMode === 'light' ? '#fff' : 'var(--text-secondary)',
                background: shellBg.textMode === 'light'
                  ? 'rgba(255,255,255,0.14)'
                  : 'rgba(15,23,42,0.06)',
                border: shellBg.textMode === 'light'
                  ? '1px solid rgba(255,255,255,0.28)'
                  : '1px solid var(--border-widget)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <MonitorOff size={11} strokeWidth={2.2} />
            </button>
          </div>
        )}

        {/* 평소엔 안 보이게 — 위젯 hover 시에만 opacity 1.0. 내부 콘텐츠와 시각적 충돌 최소화. */}
        <style>{`
          .shell-float-controls { opacity: 0; transition: opacity 0.2s ease; pointer-events: none; }
          .shell-card:hover .shell-float-controls,
          .shell-float-controls:hover,
          .shell-float-controls:focus-within { opacity: 1; pointer-events: auto; }
        `}</style>
      </div>
    </div>
  )
}
