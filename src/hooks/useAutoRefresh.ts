import { useEffect, useRef } from 'react'

/**
 * 위젯 자동 갱신 안전망.
 *
 *   ① `data:changed` IPC 이벤트 기반 갱신(useDataChange) — 즉시성 ↑
 *   ② 60초 폴링 — 이벤트 누락 / 경쟁 조건 대비 (로컬 DB 라 부하 거의 0)
 *   ③ 창 포커스 · 탭 가시성 복귀 시 즉시 갱신
 *
 * 기존 useDataChange 는 그대로 두고, 이 훅은 ②·③만 담당하는 보조 안전망.
 *
 * `reload` 는 ref 로 잡아두므로 stable 하지 않아도 OK (매 렌더마다 새 함수여도
 * 인터벌/리스너는 한 번만 등록되고, 호출 시점의 최신 reload 가 실행됨).
 */
export function useAutoRefresh(
  reload: () => void,
  options?: { intervalMs?: number; onFocus?: boolean },
): void {
  const interval = options?.intervalMs ?? 60_000
  const enableFocus = options?.onFocus ?? true

  const reloadRef = useRef(reload)
  reloadRef.current = reload

  // 폴링
  useEffect(() => {
    if (!interval || interval <= 0) return
    const t = setInterval(() => reloadRef.current(), interval)
    return () => clearInterval(t)
  }, [interval])

  // 창 포커스 · 탭 가시성 복귀 시 즉시 새로고침
  useEffect(() => {
    if (!enableFocus) return
    const handler = (): void => { reloadRef.current() }
    window.addEventListener('focus', handler)
    document.addEventListener('visibilitychange', handler)
    return () => {
      window.removeEventListener('focus', handler)
      document.removeEventListener('visibilitychange', handler)
    }
  }, [enableFocus])
}
