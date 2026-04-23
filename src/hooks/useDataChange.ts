import { useEffect, useRef } from 'react'

export type DataChangeType =
  | 'schedule' | 'task' | 'memo' | 'timetable'
  | 'checklist' | 'section' | 'dday' | 'settings' | 'routine' | 'goal' | 'studentrecord'

/**
 * 메인 프로세스가 broadcast하는 `data:changed` 이벤트를 구독.
 * 관심 있는 type 중 하나라도 일치하면 handler 호출.
 * 대시보드에서 편집 → 위젯 자동 갱신이 핵심 용도.
 */
export function useDataChange(
  types: DataChangeType | DataChangeType[],
  handler: () => void,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const set = new Set(Array.isArray(types) ? types : [types])
    const listener = (t: unknown) => {
      if (typeof t === 'string' && set.has(t as DataChangeType)) {
        handlerRef.current()
      }
    }
    window.api.on('data:changed', listener)
    return () => window.api.off('data:changed', listener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(types) ? types.join(',') : types])
}
