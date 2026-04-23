export interface TimetableSlot {
  id: string
  day_of_week: DayOfWeek
  period: number
  subject: string
  class_name: string
  teacher: string
  room: string
  color: string
  memo: string
  semester: string
  timetable_set: string
  is_specialist: number
  specialist_teacher: string
  created_at: string
  updated_at: string
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4

export const DAY_LABELS: Record<DayOfWeek, string> = {
  0: '월',
  1: '화',
  2: '수',
  3: '목',
  4: '금'
}

export interface TimetablePeriod {
  id: string
  period: number
  label: string
  start_time: string
  end_time: string
  is_break: number
}

export interface CreateSlotInput {
  day_of_week: DayOfWeek
  period: number
  subject: string
  class_name?: string
  teacher?: string
  room?: string
  color?: string
  memo?: string
  timetable_set?: string
  is_specialist?: number
  specialist_teacher?: string
}

export interface UpdateSlotInput extends Partial<CreateSlotInput> {}

export const SUBJECT_COLORS: Record<string, string> = {
  '국어': '#EF4444',
  '수학': '#3B82F6',
  '영어': '#8B5CF6',
  '사회': '#F59E0B',
  '과학': '#10B981',
  '음악': '#EC4899',
  '미술': '#F97316',
  '체육': '#06B6D4',
  '도덕': '#6366F1',
  '실과': '#84CC16',
  '창체': '#14B8A6',
  '자율': '#A855F7',
  '동아리': '#D946EF',
  '봉사': '#22C55E',
  '진로': '#0EA5E9',
  '보건': '#F43F5E',
  '방과후': '#78716C',
  '통합': '#F59E0B',
  '바른생활': '#F59E0B',
  '슬기로운생활': '#10B981',
  '즐거운생활': '#EC4899',
  '안전한생활': '#EF4444',
}

const EXTRA_CREATIVE = ['자율', '동아리', '봉사', '진로', '보건']

export const SUBJECTS_BY_GRADE: Record<number, string[]> = {
  1: ['국어', '수학', '바른생활', '슬기로운생활', '즐거운생활', '안전한생활', '창체', ...EXTRA_CREATIVE],
  2: ['국어', '수학', '바른생활', '슬기로운생활', '즐거운생활', '안전한생활', '창체', ...EXTRA_CREATIVE],
  3: ['국어', '도덕', '사회', '수학', '과학', '체육', '음악', '미술', '영어', '창체', ...EXTRA_CREATIVE],
  4: ['국어', '도덕', '사회', '수학', '과학', '체육', '음악', '미술', '영어', '창체', ...EXTRA_CREATIVE],
  5: ['국어', '도덕', '사회', '수학', '과학', '실과', '체육', '음악', '미술', '영어', '창체', ...EXTRA_CREATIVE],
  6: ['국어', '도덕', '사회', '수학', '과학', '실과', '체육', '음악', '미술', '영어', '창체', ...EXTRA_CREATIVE],
}

/** 강사(instructor) | 비교과(extracurricular: 보건/상담/영양 등) */
export type OverrideKind = 'instructor' | 'extracurricular'

export interface TimetableOverride {
  id: string
  date: string
  period: number
  subject: string
  teacher: string
  room: string
  color: string
  memo: string
  kind: OverrideKind
  created_at: string
}

export interface CreateOverrideInput {
  date: string
  period: number
  subject: string
  teacher?: string
  room?: string
  color?: string
  memo?: string
  kind?: OverrideKind
}
