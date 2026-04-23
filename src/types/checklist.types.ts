export interface Checklist {
  id: string
  title: string
  description: string
  color: string
  is_template: number
  category: ChecklistCategory
  section_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type ChecklistCategory = '일반' | '업무' | '학급' | '점검' | '개인'

export interface ChecklistItem {
  id: string
  checklist_id: string
  content: string
  is_checked: number
  sort_order: number
  due_date: string | null
  assignee: string
  created_at: string
}

export interface CreateChecklistInput {
  title: string
  description?: string
  color?: string
  is_template?: number
  category?: ChecklistCategory
  section_id?: string | null
}

export interface UpdateChecklistInput extends Partial<CreateChecklistInput> {
  sort_order?: number
}

export interface CreateChecklistItemInput {
  checklist_id: string
  content: string
  due_date?: string | null
  assignee?: string
}

export interface ChecklistWithItems extends Checklist {
  items: ChecklistItem[]
  progress: number
}
