import {
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
  isPast,
  isSameDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  differenceInDays,
  parseISO,
  getDay,
} from 'date-fns'
import { ko } from 'date-fns/locale'

export {
  format,
  isToday,
  isTomorrow,
  isYesterday,
  isPast,
  isSameDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  differenceInDays,
  parseISO,
  getDay,
}

export function formatDate(date: Date | string, fmt: string = 'yyyy-MM-dd'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt, { locale: ko })
}

export function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  if (isToday(d)) return '오늘'
  if (isTomorrow(d)) return '내일'
  if (isYesterday(d)) return '어제'
  return formatDistanceToNow(d, { locale: ko, addSuffix: true })
}

export function getDDayText(targetDate: string): string {
  // 시/분/초 포함 비교는 오늘 오후 → 내일 자정 차이가 0으로 버려지는 버그가 있음.
  // 양쪽을 자정으로 정규화해서 "달력상 며칠 차이"만 본다.
  const target = parseISO(targetDate)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = differenceInDays(target, today)
  if (diff === 0) return 'D-Day'
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)}`
}

export function getKoreanDay(date: Date): string {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return days[getDay(date)]
}

export function getCalendarDays(year: number, month: number): Date[] {
  const start = startOfWeek(startOfMonth(new Date(year, month)), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(new Date(year, month)), { weekStartsOn: 0 })
  return eachDayOfInterval({ start, end })
}
