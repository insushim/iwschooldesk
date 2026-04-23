export type RoutineKind = 'personal' | 'classroom'

export interface Routine {
  id: string
  title: string
  color: string
  icon: string
  kind: RoutineKind
  sort_order: number
  start_date: string // YYYY-MM-DD
  created_at: string
  updated_at: string
}

export interface RoutineItem {
  id: string
  routine_id: string
  content: string
  sort_order: number
  created_at: string
}

export interface RoutineItemWithStatus extends RoutineItem {
  is_completed: number // 오늘 날짜 기준 완료 여부 (0/1)
}

export interface CreateRoutineInput {
  title: string
  color?: string
  icon?: string
  kind?: RoutineKind
}

export interface UpdateRoutineInput extends Partial<CreateRoutineInput> {
  sort_order?: number
}

export interface CreateRoutineItemInput {
  routine_id: string
  content: string
}
