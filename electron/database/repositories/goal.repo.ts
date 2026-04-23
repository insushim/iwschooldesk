import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import { ALLOWED_UPDATE_FIELDS } from '../allowed-fields'
import type { Goal, CreateGoalInput, UpdateGoalInput } from '../../../src/types/goal.types'

export function listGoals(): Goal[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM goals ORDER BY sort_order ASC, created_at ASC').all() as Goal[]
}

export function createGoal(data: CreateGoalInput): Goal {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM goals').get() as { m: number | null })?.m ?? 0
  db.prepare(`
    INSERT INTO goals (id, content, emoji, color, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.content, data.emoji ?? '🎯', data.color ?? '#2563EB', maxOrder + 1, now, now)
  return db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as Goal
}

export function updateGoal(id: string, data: UpdateGoalInput): Goal {
  const db = getDatabase()
  const fields: string[] = []
  const params: unknown[] = []
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    if (!ALLOWED_UPDATE_FIELDS.goals.has(k)) continue
    fields.push(`${k} = ?`); params.push(v)
  }
  fields.push("updated_at = datetime('now','localtime')")
  params.push(id)
  db.prepare(`UPDATE goals SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as Goal
}

export function deleteGoal(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM goals WHERE id = ?').run(id)
}
