export const SCHEDULE_CATEGORIES = ['일반', '학교행사', '수업', '회의', '출장', '연수', '개인'] as const
export const TASK_CATEGORIES = ['일반', '교무', '학급', '수업', '행정', '개인'] as const
export const CHECKLIST_CATEGORIES = ['일반', '업무', '학급', '점검', '개인'] as const

export const CATEGORY_COLORS: Record<string, string> = {
  '일반': '#94A3B8',
  '학교행사': '#EF4444',
  '수업': '#3B82F6',
  '회의': '#F59E0B',
  '출장': '#8B5CF6',
  '연수': '#10B981',
  '개인': '#EC4899',
  '교무': '#6366F1',
  '학급': '#14B8A6',
  '행정': '#F97316',
  '업무': '#2563EB',
  '점검': '#84CC16',
}

export const GREETING = (): string => {
  const hour = new Date().getHours()
  if (hour < 6) return '새벽이에요'
  if (hour < 9) return '좋은 아침이에요'
  if (hour < 12) return '오전이에요'
  if (hour < 14) return '점심시간이에요'
  if (hour < 17) return '오후에요'
  if (hour < 21) return '저녁이에요'
  return '늦은 밤이에요'
}
