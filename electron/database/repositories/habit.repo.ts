import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import { ALLOWED_UPDATE_FIELDS } from '../allowed-fields'
import type {
  Habit, HabitStats, CreateHabitInput, UpdateHabitInput,
} from '../../../src/types/habit.types'

export function listHabits(): Habit[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM habits ORDER BY sort_order ASC, created_at ASC').all() as Habit[]
}

/** 모든 습관 + 각자의 stats — 위젯이 리스트로 동시 표시할 때 IPC 1회로 끝내려고. */
export function listHabitsWithStats(today: string): (Habit & HabitStats)[] {
  const list = listHabits()
  return list.map((h) => ({ ...h, ...getHabitStats(h.id, today) }))
}

/** [from, to] 범위(YYYY-MM-DD) 의 모든 완료 기록 — 대시보드 월간 히트맵 용. */
export function getHabitCompletionsInRange(habitId: string, fromDate: string, toDate: string): { date: string }[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT date FROM habit_completions
    WHERE habit_id = ? AND date >= ? AND date <= ?
    ORDER BY date ASC
  `).all(habitId, fromDate, toDate) as { date: string }[]
}

export function createHabit(data: CreateHabitInput): Habit {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const today = new Date().toISOString().slice(0, 10)
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM habits').get() as { m: number | null })?.m ?? 0
  db.prepare(`
    INSERT INTO habits (id, title, color, icon, start_date, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.title, data.color ?? '#0EA5E9', data.icon ?? '🌱', today, maxOrder + 1, now, now)
  return db.prepare('SELECT * FROM habits WHERE id = ?').get(id) as Habit
}

export function updateHabit(id: string, data: UpdateHabitInput): Habit {
  const db = getDatabase()
  const fields: string[] = []
  const params: unknown[] = []
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    if (!ALLOWED_UPDATE_FIELDS.habits.has(k)) continue
    fields.push(`${k} = ?`); params.push(v)
  }
  fields.push("updated_at = datetime('now','localtime')")
  params.push(id)
  db.prepare(`UPDATE habits SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return db.prepare('SELECT * FROM habits WHERE id = ?').get(id) as Habit
}

export function deleteHabit(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM habits WHERE id = ?').run(id)
}

/**
 * 오늘 ✓ 토글 — 없으면 추가, 있으면 삭제.
 */
export function toggleHabitToday(habitId: string, date: string): { done: boolean } {
  const db = getDatabase()
  const existing = db.prepare(
    'SELECT id FROM habit_completions WHERE habit_id = ? AND date = ?'
  ).get(habitId, date) as { id: string } | undefined

  if (existing) {
    db.prepare('DELETE FROM habit_completions WHERE id = ?').run(existing.id)
    return { done: false }
  } else {
    const id = uuid()
    db.prepare('INSERT INTO habit_completions (id, habit_id, date) VALUES (?, ?, ?)').run(id, habitId, date)
    return { done: true }
  }
}

/** YYYY-MM-DD 끼리 일수 차이 (양수 = a 가 b 보다 미래). */
function dayDiff(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime()
  const db = new Date(b + 'T00:00:00').getTime()
  return Math.round((da - db) / 86_400_000)
}
function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * 습관 통계.
 *  - total_days: 누적 체크 일수
 *  - streak_current: 오늘(또는 어제) 부터 거꾸로 연속 체크된 일수
 *      - 오늘 체크 안 했어도 어제까지 연속이면 그 streak 을 보여줌 ("어제까지 N일째")
 *      - 둘 다 안 했으면 0
 *  - streak_longest: 전체 기간 중 최장 연속
 *  - last_7_days: 오늘 포함 최근 7일 done/not 배열 (위젯 dot grid 용)
 */
export function getHabitStats(habitId: string, today: string): HabitStats {
  const db = getDatabase()
  const rows = db.prepare(
    'SELECT date FROM habit_completions WHERE habit_id = ? ORDER BY date ASC'
  ).all(habitId) as { date: string }[]
  const set = new Set(rows.map((r) => r.date))
  const total_days = set.size

  // 최장 streak
  let streak_longest = 0
  let prev = ''
  let run = 0
  for (const r of rows) {
    if (prev && dayDiff(r.date, prev) === 1) run += 1
    else run = 1
    if (run > streak_longest) streak_longest = run
    prev = r.date
  }

  // 현재 streak — 오늘 또는 어제부터 거꾸로
  let streak_current = 0
  const today_done = set.has(today)
  let cursor = today_done ? today : addDays(today, -1)
  // 어제 안 했으면 현재 streak 은 0
  if (!set.has(cursor)) {
    streak_current = 0
  } else {
    while (set.has(cursor)) {
      streak_current += 1
      cursor = addDays(cursor, -1)
    }
  }

  // 최근 7일
  const last_7_days: { date: string; done: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i)
    last_7_days.push({ date: d, done: set.has(d) })
  }

  return { total_days, streak_current, streak_longest, today_done, last_7_days }
}
