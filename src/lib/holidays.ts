/**
 * 한국 공휴일 · 휴업일 판별.
 *
 * 구성:
 *  1) 양력 고정 공휴일 — 매년 같은 날짜.
 *  2) 음력 기반 공휴일 — 설날·부처님오신날·추석 연휴 + 대체공휴일. 2024~2030 하드코딩.
 *  3) 사용자 일정 제목 키워드 — "재량휴업" "방학" "휴업일" "공휴일" 등은 빨간날 취급.
 *  4) 토요일은 달력 UI 에서 "쉬는 날" 로 취급(학교는 주5일제).
 *
 * 반환 {date → label} 은 캘린더 렌더에서 "빨간날 + 이름" 표시용.
 */

export type HolidayHit = { name: string; source: 'fixed' | 'lunar' | 'substitute' | 'custom' }

/** 양력 고정 공휴일 (월-일 → 이름). */
const FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': '신정',
  '03-01': '삼일절',
  '05-05': '어린이날',
  '06-06': '현충일',
  '08-15': '광복절',
  '10-03': '개천절',
  '10-09': '한글날',
  '12-25': '성탄절',
}

/**
 * 음력 기반 공휴일 하드코딩 — 2024~2030 (대체공휴일 포함).
 * 출처: 대한민국 관공서 공휴일에 관한 규정 + 인사혁신처 고시.
 * 키: YYYY-MM-DD, 값: 이름.
 */
const LUNAR_HOLIDAYS: Record<string, string> = {
  // 2024
  '2024-02-09': '설날 연휴',
  '2024-02-10': '설날',
  '2024-02-11': '설날 연휴',
  '2024-02-12': '설날 대체휴일',
  '2024-05-06': '어린이날 대체휴일',
  '2024-05-15': '부처님오신날',
  '2024-09-16': '추석 연휴',
  '2024-09-17': '추석',
  '2024-09-18': '추석 연휴',

  // 2025
  '2025-01-28': '설날 연휴',
  '2025-01-29': '설날',
  '2025-01-30': '설날 연휴',
  '2025-05-05': '어린이날/부처님오신날',
  '2025-05-06': '대체휴일',
  '2025-10-03': '개천절',
  '2025-10-05': '추석 연휴',
  '2025-10-06': '추석',
  '2025-10-07': '추석 연휴',
  '2025-10-08': '대체휴일',
  '2025-10-09': '한글날',

  // 2026
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '부처님오신날 대체휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',

  // 2027
  '2027-02-06': '설날 연휴',
  '2027-02-07': '설날',
  '2027-02-08': '설날 연휴',
  '2027-02-09': '설날 대체휴일',
  '2027-05-13': '부처님오신날',
  '2027-09-14': '추석 연휴',
  '2027-09-15': '추석',
  '2027-09-16': '추석 연휴',

  // 2028
  '2028-01-26': '설날 연휴',
  '2028-01-27': '설날',
  '2028-01-28': '설날 연휴',
  '2028-05-02': '부처님오신날',
  '2028-10-02': '추석 연휴',
  '2028-10-03': '추석/개천절',
  '2028-10-04': '추석 연휴',
  '2028-10-05': '대체휴일',

  // 2029
  '2029-02-12': '설날 연휴',
  '2029-02-13': '설날',
  '2029-02-14': '설날 연휴',
  '2029-05-20': '부처님오신날',
  '2029-05-21': '부처님오신날 대체휴일',
  '2029-09-21': '추석 연휴',
  '2029-09-22': '추석',
  '2029-09-23': '추석 연휴',
  '2029-09-24': '추석 대체휴일',

  // 2030
  '2030-02-02': '설날 연휴',
  '2030-02-03': '설날',
  '2030-02-04': '설날 연휴',
  '2030-05-09': '부처님오신날',
  '2030-09-11': '추석 연휴',
  '2030-09-12': '추석',
  '2030-09-13': '추석 연휴',
}

/** 학교 자체 "쉬는 날" 로 취급할 일정 제목 키워드. */
const SCHOOL_OFF_PATTERNS = [
  /재량/,
  /휴업일/,
  /방학/,
  /공휴일/,
  /개교기념일/,
]

/** YYYY-MM-DD 포매팅 — Date → key. */
export function toHolidayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 양력/음력 공휴일 여부. 일요일 자체는 여기서 다루지 않음(호출부에서 dow 로 판정). */
export function getKoreanHoliday(date: Date): HolidayHit | null {
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  if (FIXED_HOLIDAYS[mmdd]) {
    return { name: FIXED_HOLIDAYS[mmdd], source: 'fixed' }
  }
  const key = toHolidayKey(date)
  if (LUNAR_HOLIDAYS[key]) {
    const name = LUNAR_HOLIDAYS[key]
    return { name, source: /대체/.test(name) ? 'substitute' : 'lunar' }
  }
  return null
}

/**
 * 사용자가 import 한 학사일정 제목이 그 날의 공식 공휴일과 같은지 판정.
 * 같으면 달력에서 중복 표시 (공휴일 빨간 라벨 + 사용자 일정 칩) 발생 → 사용자 칩만 숨겨야 함.
 *
 * 비교 규칙:
 *  - 공백·슬래시·중점·콤마 제거 후 비교 (예: "부처님 오신날" === "부처님오신날")
 *  - 공휴일명이 사용자 제목을 포함하면 중복 (예: "어린이날/부처님오신날" ⊃ "어린이날")
 *  - 사용자 제목 길이 < 2 면 false (오탐 방지)
 *  - 단방향만 — 사용자 제목이 공휴일명보다 길면 (예: "어린이날 행사") 사용자 의도 보존, 표시
 */
export function isDuplicateOfHoliday(scheduleTitle: string, holidayName: string | null): boolean {
  if (!holidayName) return false
  const normalize = (s: string): string => s.replace(/\s+/g, '').replace(/[/·,]/g, '')
  const t = normalize(scheduleTitle)
  const h = normalize(holidayName)
  if (t.length < 2) return false
  return h.includes(t)
}

/** 일정 제목 배열에서 "쉬는 날" 판별 — 매칭되는 첫 제목 반환. */
export function findSchoolOff(titles: string[]): string | null {
  for (const t of titles) {
    for (const re of SCHOOL_OFF_PATTERNS) {
      if (re.test(t)) return t
    }
  }
  return null
}

/**
 * 종합 "빨간날" 판정 — 달력 렌더 1회 호출에서 사용.
 *  - 일요일 / 토요일 → isOff = true
 *  - 한국 공휴일(양력/음력/대체) → isOff = true, label = 공휴일 이름
 *  - 일정 제목이 재량휴업·방학·개교기념일 등 → isOff = true, label = 해당 제목
 *
 * 토요일은 "빨간날" 로 처리(학교 주5일제). 사용자가 원하면 나중에 파란색으로 되돌릴 수 있도록
 * dow 정보도 함께 반환.
 */
export interface RedDayInfo {
  isOff: boolean
  /** 0=일, 6=토 인 경우 true */
  isWeekend: boolean
  /** 공휴일/휴업일 이름. 주말만인 경우 null. */
  label: string | null
}

export function getRedDayInfo(date: Date, scheduleTitlesForDay: string[]): RedDayInfo {
  const dow = date.getDay()
  const isWeekend = dow === 0 || dow === 6
  const holiday = getKoreanHoliday(date)
  if (holiday) return { isOff: true, isWeekend, label: holiday.name }
  const off = findSchoolOff(scheduleTitlesForDay)
  if (off) return { isOff: true, isWeekend, label: off }
  if (isWeekend) return { isOff: true, isWeekend, label: null }
  return { isOff: false, isWeekend: false, label: null }
}
