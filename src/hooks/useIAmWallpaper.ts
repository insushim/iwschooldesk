import { useEffect, useRef, useState } from 'react'

/**
 * 자기 창이 배경화면 모드인지 추적.
 *
 * 배경화면 모드(=`wallpaper_mode`)는 클릭 통과 + 맨 뒤 고정 상태라서
 * 위젯 내부 버튼은 어차피 눌리지 않는다 → 컨트롤(편집/색 변경 등)을
 * 시각적으로도 숨겨야 사용자가 "왜 안 눌리지" 혼란을 겪지 않는다.
 */
export function useIAmWallpaper(widgetType: string): boolean {
  const myIdRef = useRef<string | null>(null)
  if (myIdRef.current === null) {
    const m = /instance=([^&]+)/.exec(window.location.hash)
    const inst = m ? decodeURIComponent(m[1]) : null
    myIdRef.current = inst ? `widget-${widgetType}-${inst}` : `widget-${widgetType}`
  }
  const [on, setOn] = useState(false)
  useEffect(() => {
    let cancelled = false
    const sync = async (): Promise<void> => {
      try {
        const map = await window.api.widget.getWallpaperModeMap()
        if (cancelled) return
        setOn(Array.isArray(map) && map.includes(myIdRef.current!))
      } catch { /* noop */ }
    }
    sync()
    const off = window.api.widget.onWallpaperModeChanged?.((p) => {
      if (p.widgetId === myIdRef.current) setOn(p.on)
    })
    return () => { cancelled = true; if (off) off() }
  }, [])
  return on
}
