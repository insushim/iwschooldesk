import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import { ALLOWED_UPDATE_FIELDS } from '../allowed-fields'
import type { Section, CreateSectionInput, UpdateSectionInput } from '../../../src/types/section.types'

export function listSections(): Section[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM sections ORDER BY sort_order ASC, created_at ASC').all() as Section[]
}

export function createSection(data: CreateSectionInput): Section {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM sections').get() as { m: number | null })?.m ?? 0

  db.prepare(`
    INSERT INTO sections (id, name, color, icon, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.color ?? '#3B82F6', data.icon ?? '', maxOrder + 1, now, now)

  return db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as Section
}

export function updateSection(id: string, data: UpdateSectionInput): Section {
  const db = getDatabase()
  const fields: string[] = []
  const params: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (!ALLOWED_UPDATE_FIELDS.sections.has(key)) continue
    fields.push(`${key} = ?`)
    params.push(value)
  }

  fields.push("updated_at = datetime('now','localtime')")
  params.push(id)

  db.prepare(`UPDATE sections SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return db.prepare('SELECT * FROM sections WHERE id = ?').get(id) as Section
}

export function deleteSection(id: string): void {
  const db = getDatabase()
  db.transaction(() => {
    db.prepare('UPDATE tasks SET section_id = NULL WHERE section_id = ?').run(id)
    db.prepare('UPDATE checklists SET section_id = NULL WHERE section_id = ?').run(id)
    db.prepare('DELETE FROM sections WHERE id = ?').run(id)
  })()
}

export function reorderSections(items: { id: string; sort_order: number }[]): void {
  const db = getDatabase()
  const stmt = db.prepare('UPDATE sections SET sort_order = ? WHERE id = ?')
  db.transaction(() => {
    for (const item of items) stmt.run(item.sort_order, item.id)
  })()
}
