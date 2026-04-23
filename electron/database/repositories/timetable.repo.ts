import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import type { TimetableSlot, TimetablePeriod, CreateSlotInput, TimetableOverride, CreateOverrideInput } from '../../../src/types/timetable.types'

export function getSlots(timetableSet: string = 'default'): TimetableSlot[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM timetable_slots WHERE timetable_set = ? ORDER BY day_of_week, period').all(timetableSet) as TimetableSlot[]
}

export function setSlot(data: CreateSlotInput): TimetableSlot {
  const db = getDatabase()
  const timetableSet = data.timetable_set ?? 'default'

  const existing = db.prepare(
    'SELECT id FROM timetable_slots WHERE day_of_week = ? AND period = ? AND timetable_set = ?'
  ).get(data.day_of_week, data.period, timetableSet) as { id: string } | undefined

  if (existing) {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
    db.prepare(`
      UPDATE timetable_slots SET subject = ?, class_name = ?, teacher = ?, room = ?, color = ?, memo = ?, is_specialist = ?, specialist_teacher = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.subject,
      data.class_name ?? '',
      data.teacher ?? '',
      data.room ?? '',
      data.color ?? '#2563EB',
      data.memo ?? '',
      data.is_specialist ?? 0,
      data.specialist_teacher ?? '',
      now,
      existing.id
    )
    return db.prepare('SELECT * FROM timetable_slots WHERE id = ?').get(existing.id) as TimetableSlot
  }

  const id = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  db.prepare(`
    INSERT INTO timetable_slots (id, day_of_week, period, subject, class_name, teacher, room, color, memo, timetable_set, is_specialist, specialist_teacher, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.day_of_week, data.period, data.subject,
    data.class_name ?? '', data.teacher ?? '', data.room ?? '',
    data.color ?? '#2563EB', data.memo ?? '', timetableSet,
    data.is_specialist ?? 0, data.specialist_teacher ?? '',
    now, now
  )

  return db.prepare('SELECT * FROM timetable_slots WHERE id = ?').get(id) as TimetableSlot
}

export function deleteSlot(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM timetable_slots WHERE id = ?').run(id)
}

export function getPeriods(): TimetablePeriod[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM timetable_periods ORDER BY period ASC').all() as TimetablePeriod[]
}

export function updatePeriods(periods: TimetablePeriod[]): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    UPDATE timetable_periods SET label = ?, start_time = ?, end_time = ?, is_break = ? WHERE id = ?
  `)
  const transaction = db.transaction(() => {
    for (const p of periods) {
      stmt.run(p.label, p.start_time, p.end_time, p.is_break, p.id)
    }
  })
  transaction()
}

// ─── 날짜별 임시 시간표 (강사수업 등) ───

export function getOverrides(date: string): TimetableOverride[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM timetable_overrides WHERE date = ? ORDER BY period').all(date) as TimetableOverride[]
}

export function createOverride(data: CreateOverrideInput): TimetableOverride {
  const db = getDatabase()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const kind = data.kind ?? 'instructor'
  const defaultColor = kind === 'extracurricular' ? '#10B981' : '#8B5CF6'

  // UPSERT: 같은 날짜+교시면 업데이트
  const existing = db.prepare('SELECT id FROM timetable_overrides WHERE date = ? AND period = ?').get(data.date, data.period) as { id: string } | undefined

  if (existing) {
    db.prepare(`
      UPDATE timetable_overrides SET subject = ?, teacher = ?, room = ?, color = ?, memo = ?, kind = ? WHERE id = ?
    `).run(data.subject, data.teacher ?? '', data.room ?? '', data.color ?? defaultColor, data.memo ?? '', kind, existing.id)
    return db.prepare('SELECT * FROM timetable_overrides WHERE id = ?').get(existing.id) as TimetableOverride
  }

  const id = uuid()
  db.prepare(`
    INSERT INTO timetable_overrides (id, date, period, subject, teacher, room, color, memo, kind, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.date, data.period, data.subject, data.teacher ?? '', data.room ?? '', data.color ?? defaultColor, data.memo ?? '', kind, now)
  return db.prepare('SELECT * FROM timetable_overrides WHERE id = ?').get(id) as TimetableOverride
}

export function deleteOverride(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM timetable_overrides WHERE id = ?').run(id)
}
