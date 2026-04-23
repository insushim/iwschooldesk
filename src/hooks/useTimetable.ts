import { useState, useEffect, useCallback } from 'react'
import type { TimetableSlot, TimetablePeriod, CreateSlotInput } from '../types/timetable.types'

export function useTimetable(timetableSet: string = 'default') {
  const [slots, setSlots] = useState<TimetableSlot[]>([])
  const [periods, setPeriods] = useState<TimetablePeriod[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [s, p] = await Promise.all([
      window.api.timetable.getSlots(timetableSet),
      window.api.timetable.getPeriods(),
    ])
    setSlots(s)
    setPeriods(p)
    setLoading(false)
  }, [timetableSet])

  useEffect(() => { refresh() }, [refresh])

  const setSlot = async (data: CreateSlotInput) => {
    const s = await window.api.timetable.setSlot(data)
    setSlots((prev) => {
      const filtered = prev.filter(
        (x) => !(x.day_of_week === data.day_of_week && x.period === data.period && x.timetable_set === (data.timetable_set ?? 'default'))
      )
      return [...filtered, s]
    })
    return s
  }

  const deleteSlot = async (id: string) => {
    await window.api.timetable.deleteSlot(id)
    setSlots((prev) => prev.filter((x) => x.id !== id))
  }

  const getSlotFor = (day: number, period: number): TimetableSlot | undefined => {
    return slots.find((s) => s.day_of_week === day && s.period === period)
  }

  const getClassPeriods = (): TimetablePeriod[] => {
    return periods.filter((p) => p.is_break === 0).sort((a, b) => a.period - b.period)
  }

  return { slots, periods, loading, refresh, setSlot, deleteSlot, getSlotFor, getClassPeriods }
}
