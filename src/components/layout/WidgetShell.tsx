import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { X, Pin, PinOff, Eye, Type, Image as WallpaperIcon } from 'lucide-react'
import { WALLPAPER_ELIGIBLE_TYPES, type WidgetType } from '../../types/widget.types'

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
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const fontPopoverRef = useRef<HTMLDivElement | null>(null)

  // 현재 위젯이 "편집용(배경모드 제외)" 위젯이면 마스터 토글 노출.
  // 제외 위젯(Timer/Memo/Task/Checklist/Routine)에서는 항상 클릭 가능하므로 여기서 on/off.
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
    const off = window.api.widget.onWallpaperModeChanged?.((p) => {
      if (p.widgetId === myWidgetId.current) setIAmWallpaper(p.on)
    })
    return () => { cancelled = true; if (off) off() }
  }, [])

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
      {/* Draggable header — 배경화면 모드면 완전히 숨겨 콘텐츠 전체를 깔끔하게 노출 */}
      {!iAmWallpaper && (
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
                  ? '배경화면 모드 전체 해제 — 시간표/학급체크/달력/우리반목표/학생용시간표/D-Day/시계/타이머'
                  : '열린 시간표·학급체크·달력·우리반목표·학생용시간표·D-Day·시계·타이머를 모두 배경화면 모드로 전환 (클릭 통과 + 맨 뒤 고정). 단축키: Ctrl+Alt+Shift+W'
              }
              style={anyWallpaperOn
                ? { color: '#fff', background: 'linear-gradient(135deg, #0EA5E9, #2563EB)', boxShadow: '0 4px 10px rgba(14,165,233,0.45)' }
                : undefined}
            >
              <WallpaperIcon size={13} strokeWidth={2.2} />
            </button>
          )}

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
            title="닫기"
          >
            <X size={13.5} strokeWidth={2.4} />
          </button>
        </div>
      </div>
      )}

      {/* Body — 헤더 유무와 무관하게 4 모서리 모두 round. 헤더가 있으면 위 2 모서리는 헤더 뒤에 가려서 안 보이고,
          헤더가 없으면(배경화면 모드) 그대로 예쁜 rounded top 이 노출됨. */}
      <div
        className="flex-1 overflow-hidden"
        style={{ borderRadius: 'var(--shell-radius)' }}
      >
        {children}
      </div>
    </div>
  )
}
