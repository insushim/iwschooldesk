import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import { ALLOWED_UPDATE_FIELDS } from '../allowed-fields'
import type { Memo, CreateMemoInput, UpdateMemoInput, MemoFilter } from '../../../src/types/memo.types'

export function listMemos(filters?: MemoFilter): Memo[] {
  const db = getDatabase()
  let sql = 'SELECT * FROM memos WHERE 1=1'
  const params: unknown[] = []

  if (filters?.category) {
    sql += ' AND category = ?'
    params.push(filters.category)
  }
  if (filters?.search) {
    sql += ' AND (title LIKE ? OR content LIKE ?)'
    const q = `%${filters.search}%`
    params.push(q, q)
  }
  if (filters?.isPinned !== undefined) {
    sql += ' AND is_pinned = ?'
    params.push(filters.isPinned ? 1 : 0)
  }

  sql += ' ORDER BY is_pinned DESC, sort_order ASC, updated_at DESC'
  return db.prepare(sql).all(...params) as Memo[]
}

export function createMemo(data: CreateMemoInput): Memo {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM memos').get() as { m: number | null })?.m ?? 0

  db.prepare(`
    INSERT INTO memos (id, title, content, color, category, tags, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title ?? '',
    data.content ?? '',
    data.color ?? '#FEF3C7',
    data.category ?? '일반',
    JSON.stringify(data.tags ?? []),
    maxOrder + 1,
    now,
    now
  )

  return db.prepare('SELECT * FROM memos WHERE id = ?').get(id) as Memo
}

export function updateMemo(id: string, data: UpdateMemoInput): Memo {
  const db = getDatabase()
  const fields: string[] = []
  const params: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (!ALLOWED_UPDATE_FIELDS.memos.has(key)) continue
    if (key === 'tags' && Array.isArray(value)) {
      fields.push('tags = ?')
      params.push(JSON.stringify(value))
    } else {
      fields.push(`${key} = ?`)
      params.push(value)
    }
  }

  fields.push("updated_at = datetime('now','localtime')")
  params.push(id)

  db.prepare(`UPDATE memos SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return db.prepare('SELECT * FROM memos WHERE id = ?').get(id) as Memo
}

export function deleteMemo(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM memos WHERE id = ?').run(id)
}

export function reorderMemos(items: { id: string; sort_order: number }[]): void {
  const db = getDatabase()
  const stmt = db.prepare('UPDATE memos SET sort_order = ? WHERE id = ?')
  const transaction = db.transaction(() => {
    for (const item of items) {
      stmt.run(item.sort_order, item.id)
    }
  })
  transaction()
}
