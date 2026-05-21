/**
 * 습관 트래커.
 *  - 한 습관 = 한 단위 (루틴과 달리 sub-item 없음).
 *  - 매일 1번 ✓ 토글 → habit_completions(date) 누적.
 *  - 위젯이 보여주는 핵심 지표:
 *      total_days     누적 체크 일수
 *      streak_current 오늘 기준 연속 체크 일수 ("N일째")
 *      streak_longest 역대 최장 연속
 */
export interface Habit {
  id: string
  title: string
  color: string
  icon: string
  start_date: string // YYYY-MM-DD
  sort_order: number
  created_at: string
  updated_at: string
}

export interface HabitStats {
  total_days: number
  streak_current: number
  streak_longest: number
  today_done: boolean
  /** 최근 7일 (오늘 포함) — 좌→우 = 과거→오늘. 위젯의 dot grid 용. */
  last_7_days: { date: string; done: boolean }[]
}

export interface CreateHabitInput {
  title: string
  color?: string
  icon?: string
}

export interface UpdateHabitInput extends Partial<CreateHabitInput> {
  sort_order?: number
}
