import { useState, useEffect, useCallback } from 'react'
import type { Schedule, CreateScheduleInput, UpdateScheduleInput, ScheduleFilter } from '../types/schedule.types'
import { useDataChange } from './useDataChange'

export function useSchedules(filters?: ScheduleFilter) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await window.api.schedule.list(filters)
    setSchedules(data)
    setLoading(false)
  }, [filters])

  useEffect(() => { refresh() }, [refresh])
  // 다른 창(위젯·달력탭)에서 일정이 바뀌면 자동 재조회
  useDataChange('schedule', refresh)

  const create = async (data: CreateScheduleInput) => {
    const s = await window.api.schedule.create(data)
    setSchedules((prev) => [...prev, s].sort((a, b) => a.start_date.localeCompare(b.start_date)))
    return s
  }

  const update = async (id: string, data: UpdateScheduleInput) => {
    const s = await window.api.schedule.update(id, data)
    setSchedules((prev) => prev.map((x) => (x.id === id ? s : x)))
    return s
  }

  const remove = async (id: string) => {
    await window.api.schedule.delete(id)
    setSchedules((prev) => prev.filter((x) => x.id !== id))
  }

  return { schedules, loading, refresh, create, update, remove }
}
