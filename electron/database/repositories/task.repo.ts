import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import { ALLOWED_UPDATE_FIELDS } from '../allowed-fields'
import type { Task, CreateTaskInput, UpdateTaskInput, TaskFilter } from '../../../src/types/task.types'

export function listTasks(filters?: TaskFilter): Task[] {
  const db = getDatabase()
  let sql = 'SELECT * FROM tasks WHERE 1=1'
  const params: unknown[] = []

  if (filters?.status) {
    sql += ' AND status = ?'
    params.push(filters.status)
  }
  if (filters?.category) {
    sql += ' AND category = ?'
    params.push(filters.category)
  }
  if (filters?.section_id !== undefined) {
    if (filters.section_id === null) {
      sql += ' AND section_id IS NULL'
    } else {
      sql += ' AND section_id = ?'
      params.push(filters.section_id)
    }
  }
  if (filters?.priority !== undefined) {
    sql += ' AND priority = ?'
    params.push(filters.priority)
  }
  if (filters?.search) {
    sql += ' AND (title LIKE ? OR description LIKE ?)'
    const q = `%${filters.search}%`
    params.push(q, q)
  }
  if (filters?.dueDateFrom) {
    sql += ' AND due_date >= ?'
    params.push(filters.dueDateFrom)
  }
  if (filters?.dueDateTo) {
    sql += ' AND due_date <= ?'
    params.push(filters.dueDateTo)
  }

  sql += ' ORDER BY sort_order ASC, priority DESC, created_at DESC'
  return db.prepare(sql).all(...params) as Task[]
}

export function createTask(data: CreateTaskInput): Task {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM tasks').get() as { m: number | null })?.m ?? 0

  db.prepare(`
    INSERT INTO tasks (id, title, description, priority, status, category, section_id, due_date, due_time, tags, sort_order, parent_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title,
    data.description ?? '',
    data.priority ?? 2,
    data.status ?? 'todo',
    data.category ?? '일반',
    data.section_id ?? null,
    data.due_date ?? null,
    data.due_time ?? null,
    JSON.stringify(data.tags ?? []),
    maxOrder + 1,
    data.parent_id ?? null,
    now,
    now
  )

  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task
}

export function updateTask(id: string, data: UpdateTaskInput): Task {
  const db = getDatabase()
  const fields: string[] = []
  const params: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (!ALLOWED_UPDATE_FIELDS.tasks.has(key)) continue
    if (key === 'tags' && Array.isArray(value)) {
      fields.push('tags = ?')
      params.push(JSON.stringify(value))
    } else {
      fields.push(`${key} = ?`)
      params.push(value)
    }
  }

  if (data.is_completed === 1 && !data.completed_at) {
    fields.push("completed_at = datetime('now','localtime')")
  }

  fields.push("updated_at = datetime('now','localtime')")
  params.push(id)

  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task
}

export function deleteTask(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

export function reorderTasks(items: { id: string; sort_order: number }[]): void {
  const db = getDatabase()
  const stmt = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?')
  const transaction = db.transaction(() => {
    for (const item of items) {
      stmt.run(item.sort_order, item.id)
    }
  })
  transaction()
}
