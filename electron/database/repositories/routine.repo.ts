import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import { ALLOWED_UPDATE_FIELDS } from '../allowed-fields'
import type {
  Routine, RoutineItem, RoutineItemWithStatus,
  CreateRoutineInput, UpdateRoutineInput, CreateRoutineItemInput,
} from '../../../src/types/routine.types'

export function listRoutines(kind?: 'personal' | 'classroom'): Routine[] {
  const db = getDatabase()
  if (kind) {
    return db.prepare('SELECT * FROM routines WHERE kind = ? ORDER BY sort_order ASC, created_at ASC').all(kind) as Routine[]
  }
  return db.prepare('SELECT * FROM routines ORDER BY sort_order ASC, created_at ASC').all() as Routine[]
}

export function createRoutine(data: CreateRoutineInput): Routine {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const today = new Date().toISOString().slice(0, 10)
  const kind = data.kind ?? 'personal'
  const defaultIcon = kind === 'classroom' ? '✅' : '🔁'
  const defaultColor = kind === 'classroom' ? '#0EA5E9' : '#8B5CF6'
  db.prepare(`
    INSERT INTO routines (id, title, color, icon, kind, start_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.title, data.color ?? defaultColor, data.icon ?? defaultIcon, kind, today, now, now)
  return db.prepare('SELECT * FROM routines WHERE id = ?').get(id) as Routine
}

export function updateRoutine(id: string, data: UpdateRoutineInput): Routine {
  const db = getDatabase()
  const fields: string[] = []
  const params: unknown[] = []
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    if (!ALLOWED_UPDATE_FIELDS.routines.has(k)) continue
    fields.push(`${k} = ?`); params.push(v)
  }
  fields.push("updated_at = datetime('now','localtime')")
  params.push(id)
  db.prepare(`UPDATE routines SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return db.prepare('SELECT * FROM routines WHERE id = ?').get(id) as Routine
}

export function deleteRoutine(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM routines WHERE id = ?').run(id)
}

/**
 * 루틴의 항목들을 "특정 날짜의 완료 여부와 함께" 반환.
 * routine_completions 테이블과 LEFT JOIN해서 해당 date에 레코드가 있으면 is_completed=1.
 */
export function getRoutineItemsForDate(routineId: string, date: string): RoutineItemWithStatus[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT i.*,
           CASE WHEN c.id IS NULL THEN 0 ELSE 1 END AS is_completed
    FROM routine_items i
    LEFT JOIN routine_completions c
      ON c.item_id = i.id AND c.date = ?
    WHERE i.routine_id = ?
    ORDER BY i.sort_order ASC, i.created_at ASC
  `).all(date, routineId) as RoutineItemWithStatus[]
}

export function addRoutineItem(data: CreateRoutineItemInput): RoutineItem {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM routine_items WHERE routine_id = ?').get(data.routine_id) as { m: number | null })?.m ?? 0
  db.prepare(`
    INSERT INTO routine_items (id, routine_id, content, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.routine_id, data.content, maxOrder + 1, now)
  return db.prepare('SELECT * FROM routine_items WHERE id = ?').get(id) as RoutineItem
}

export function updateRoutineItem(id: string, content: string): RoutineItem {
  const db = getDatabase()
  db.prepare('UPDATE routine_items SET content = ? WHERE id = ?').run(content, id)
  return db.prepare('SELECT * FROM routine_items WHERE id = ?').get(id) as RoutineItem
}

export function deleteRoutineItem(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM routine_items WHERE id = ?').run(id)
}

/**
 * 특정 날짜의 완료 상태를 토글.
 * 완료 → 미완료, 미완료 → 완료.
 */
export function toggleRoutineCompletion(itemId: string, date: string): { is_completed: number } {
  const db = getDatabase()
  const existing = db.prepare(
    'SELECT id FROM routine_completions WHERE item_id = ? AND date = ?'
  ).get(itemId, date) as { id: string } | undefined

  if (existing) {
    db.prepare('DELETE FROM routine_completions WHERE id = ?').run(existing.id)
    return { is_completed: 0 }
  } else {
    const id = uuid()
    db.prepare(`
      INSERT INTO routine_completions (id, item_id, date)
      VALUES (?, ?, ?)
    `).run(id, itemId, date)
    return { is_completed: 1 }
  }
}

/** 루틴 시작일 ~ 오늘까지 일수 (시작일 포함 = 1). "N일차" 표시용. */
export function getRoutineDayNumber(startDate: string, today: string): number {
  const s = new Date(startDate + 'T00:00:00')
  const t = new Date(today + 'T00:00:00')
  const diff = Math.floor((t.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
  return diff + 1
}

/**
 * 특정 routine의 [fromDate, toDate] 구간 동안 itemId별 완료된 날짜 목록 반환.
 * 학급 체크 위젯에서 "전날 양치 여부 + 이번주 누적 횟수" 등 통계 표시용.
 * fromDate/toDate는 'YYYY-MM-DD' 문자열, inclusive.
 */
export function getRoutineCompletionsInRange(
  routineId: string,
  fromDate: string,
  toDate: string,
): Array<{ item_id: string; date: string }> {
  const db = getDatabase()
  return db.prepare(`
    SELECT c.item_id, c.date
    FROM routine_completions c
    INNER JOIN routine_items i ON i.id = c.item_id
    WHERE i.routine_id = ?
      AND c.date >= ? AND c.date <= ?
  `).all(routineId, fromDate, toDate) as Array<{ item_id: string; date: string }>
}
