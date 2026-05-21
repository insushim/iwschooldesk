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
  // 이 항목이 누적으로 체크된 횟수 — "1일차/2일차" 표시에 사용.
  // (이전엔 루틴 생성일 기준 경과일을 썼지만 사용자 요청으로 항목별 누적 체크 수로 변경)
  completion_count: number
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
