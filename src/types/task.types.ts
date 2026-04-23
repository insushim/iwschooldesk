export interface Task {
  id: string
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  category: TaskCategory
  section_id: string | null
  due_date: string | null
  due_time: string | null
  tags: string
  sort_order: number
  parent_id: string | null
  is_completed: number
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type TaskPriority = 0 | 1 | 2 | 3 | 4

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'archived'

export type TaskCategory = '일반' | '교무' | '학급' | '수업' | '행정' | '개인'

export interface CreateTaskInput {
  title: string
  description?: string
  priority?: TaskPriority
  status?: TaskStatus
  category?: TaskCategory
  section_id?: string | null
  due_date?: string | null
  due_time?: string | null
  tags?: string[]
  parent_id?: string | null
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  is_completed?: number
  completed_at?: string | null
  sort_order?: number
}

export interface TaskFilter {
  status?: TaskStatus
  category?: TaskCategory
  section_id?: string | null
  priority?: TaskPriority
  search?: string
  dueDateFrom?: string
  dueDateTo?: string
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  0: '없음',
  1: '낮음',
  2: '보통',
  3: '높음',
  4: '긴급'
}

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  0: '#94A3B8',
  1: '#94A3B8',
  2: '#3B82F6',
  3: '#F97316',
  4: '#EF4444'
}
