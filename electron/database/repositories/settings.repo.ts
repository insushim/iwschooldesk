import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import { ALLOWED_UPDATE_FIELDS } from '../allowed-fields'
import type { AppSettings, SettingKey, DDayEvent, CreateDDayInput, UpdateDDayInput } from '../../../src/types/settings.types'
import type { WidgetPosition } from '../../../src/types/widget.types'

export function getSetting<K extends SettingKey>(key: K): AppSettings[K] {
  const db = getDatabase()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return '' as AppSettings[K]
  return JSON.parse(row.value) as AppSettings[K]
}

export function setSetting<K extends SettingKey>(key: K, value: AppSettings[K]): void {
  const db = getDatabase()
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value))
}

export function getAllSettings(): AppSettings {
  const db = getDatabase()
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const settings: Record<string, unknown> = {}
  for (const row of rows) {
    settings[row.key] = JSON.parse(row.value)
  }
  return settings as AppSettings
}

// D-Day
export function listDDays(): DDayEvent[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM dday_events WHERE is_active = 1 ORDER BY target_date ASC').all() as DDayEvent[]
}

export function createDDay(data: CreateDDayInput): DDayEvent {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  db.prepare(`
    INSERT INTO dday_events (id, title, target_date, color, emoji, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.title, data.target_date, data.color ?? '#F59E0B', data.emoji ?? '📅', now)
  return db.prepare('SELECT * FROM dday_events WHERE id = ?').get(id) as DDayEvent
}

export function updateDDay(id: string, data: UpdateDDayInput): DDayEvent {
  const db = getDatabase()
  const fields: string[] = []
  const params: unknown[] = []
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (!ALLOWED_UPDATE_FIELDS.dday_events.has(key)) continue
    fields.push(`${key} = ?`)
    params.push(value)
  }
  params.push(id)
  db.prepare(`UPDATE dday_events SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return db.prepare('SELECT * FROM dday_events WHERE id = ?').get(id) as DDayEvent
}

export function deleteDDay(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM dday_events WHERE id = ?').run(id)
}

// Widget Positions
export function getWidgetPositions(): WidgetPosition[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM widget_positions').all() as WidgetPosition[]
}

export function saveWidgetPosition(pos: Partial<WidgetPosition> & { widget_id: string }): void {
  const db = getDatabase()
  const existing = db.prepare('SELECT widget_id FROM widget_positions WHERE widget_id = ?').get(pos.widget_id)

  if (existing) {
    const fields: string[] = []
    const params: unknown[] = []
    for (const [key, value] of Object.entries(pos)) {
      if (key === 'widget_id' || value === undefined) continue
      if (!ALLOWED_UPDATE_FIELDS.widget_positions.has(key)) continue
      fields.push(`${key} = ?`)
      params.push(value)
    }
    fields.push("updated_at = datetime('now','localtime')")
    params.push(pos.widget_id)
    db.prepare(`UPDATE widget_positions SET ${fields.join(', ')} WHERE widget_id = ?`).run(...params)
  } else {
    db.prepare(`
      INSERT INTO widget_positions (widget_id, widget_type, x, y, width, height, is_visible, is_locked, opacity, always_on_top, config, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    `).run(
      pos.widget_id,
      pos.widget_type ?? 'calendar',
      pos.x ?? 100, pos.y ?? 100,
      pos.width ?? 350, pos.height ?? 400,
      pos.is_visible ?? 0, pos.is_locked ?? 0,
      pos.opacity ?? 0.95, pos.always_on_top ?? 1,
      pos.config ?? '{}'
    )
  }
}

export function toggleWidgetVisibility(widgetId: string): void {
  const db = getDatabase()
  db.prepare(`
    UPDATE widget_positions SET is_visible = CASE WHEN is_visible = 0 THEN 1 ELSE 0 END, updated_at = datetime('now','localtime')
    WHERE widget_id = ?
  `).run(widgetId)
}
