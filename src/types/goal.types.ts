export interface Goal {
  id: string
  content: string
  emoji: string
  color: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CreateGoalInput {
  content: string
  emoji?: string
  color?: string
}

export interface UpdateGoalInput extends Partial<CreateGoalInput> {
  sort_order?: number
}
