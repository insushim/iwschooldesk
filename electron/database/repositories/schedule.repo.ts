import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import { ALLOWED_UPDATE_FIELDS } from '../allowed-fields'
import type { Schedule, CreateScheduleInput, UpdateScheduleInput, ScheduleFilter } from '../../../src/types/schedule.types'

export function listSchedules(filters?: ScheduleFilter): Schedule[] {
  const db = getDatabase()
  let sql = 'SELECT * FROM schedules WHERE 1=1'
  const params: unknown[] = []

  // 범위 겹침(overlap) 비교: start_date가 시간 포함("YYYY-MM-DDTHH:mm:ss") 이고
  // 필터는 날짜 문자열("YYYY-MM-DD")로 오므로 DATE()로 날짜부만 잘라 비교한다.
  // 멀티데이 일정(end_date > start_date)도 범위와 겹치면 포함.
  if (filters?.startDate) {
    sql += ' AND DATE(COALESCE(end_date, start_date)) >= ?'
    params.push(filters.startDate)
  }
  if (filters?.endDate) {
    sql += ' AND DATE(start_date) <= ?'
    params.push(filters.endDate)
  }
  if (filters?.category) {
    sql += ' AND category = ?'
    params.push(filters.category)
  }
  if (filters?.search) {
    sql += ' AND (title LIKE ? OR description LIKE ?)'
    const q = `%${filters.search}%`
    params.push(q, q)
  }

  sql += ' ORDER BY start_date ASC'
  return db.prepare(sql).all(...params) as Schedule[]
}

export function createSchedule(data: CreateScheduleInput): Schedule {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

  db.prepare(`
    INSERT INTO schedules (id, title, description, start_date, end_date, all_day, color, category, location, reminder_minutes, recurrence, recurrence_end, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title,
    data.description ?? '',
    data.start_date,
    data.end_date ?? null,
    data.all_day ?? 0,
    data.color ?? '#2563EB',
    data.category ?? '일반',
    data.location ?? '',
    data.reminder_minutes ?? 10,
    data.recurrence ?? null,
    data.recurrence_end ?? null,
    now,
    now
  )

  return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as Schedule
}

export function updateSchedule(id: string, data: UpdateScheduleInput): Schedule {
  const db = getDatabase()
  const fields: string[] = []
  const params: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (!ALLOWED_UPDATE_FIELDS.schedules.has(key)) continue
    fields.push(`${key} = ?`)
    params.push(value)
  }

  fields.push("updated_at = datetime('now','localtime')")
  params.push(id)

  db.prepare(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as Schedule
}

export function deleteSchedule(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM schedules WHERE id = ?').run(id)
}

/** 모든 일정을 한 번에 삭제. 학사일정 재임포트 테스트 등에서 유용. */
export function deleteAllSchedules(): number {
  const db = getDatabase()
  const info = db.prepare('DELETE FROM schedules').run()
  return info.changes
}
