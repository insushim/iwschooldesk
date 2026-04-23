export interface Schedule {
  id: string
  title: string
  description: string
  start_date: string
  end_date: string | null
  all_day: number
  color: string
  category: ScheduleCategory
  location: string
  reminder_minutes: number
  recurrence: RecurrenceType | null
  recurrence_end: string | null
  is_completed: number
  created_at: string
  updated_at: string
}

export type ScheduleCategory = '일반' | '학교행사' | '수업' | '회의' | '출장' | '연수' | '개인'

export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface CreateScheduleInput {
  title: string
  description?: string
  start_date: string
  end_date?: string | null
  all_day?: number
  color?: string
  category?: ScheduleCategory
  location?: string
  reminder_minutes?: number
  recurrence?: RecurrenceType | null
  recurrence_end?: string | null
}

export interface UpdateScheduleInput extends Partial<CreateScheduleInput> {
  is_completed?: number
}

export interface ScheduleFilter {
  startDate?: string
  endDate?: string
  category?: ScheduleCategory
  search?: string
}
