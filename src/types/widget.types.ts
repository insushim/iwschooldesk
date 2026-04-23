export type WidgetType =
  | 'calendar'
  | 'task'
  | 'memo'
  | 'timetable'
  | 'checklist'
  | 'timer'
  | 'dday'
  | 'clock'
  | 'routine'
  | 'goal'
  | 'studentcheck'
  | 'studenttimetable'
  | 'today'
  | 'studentrecord'

export interface WidgetPosition {
  widget_id: string
  widget_type: WidgetType
  x: number
  y: number
  width: number
  height: number
  is_visible: number
  is_locked: number
  opacity: number
  always_on_top: number
  config: string
  font_scale?: number
  /** 배경화면 모드: 1 = 클릭 통과 + z-order 최하단 고정, 0 = 일반 위젯 */
  wallpaper_mode?: number
  updated_at: string
}

/**
 * 배경화면 모드 지원 위젯 타입 — 자주 편집하지 않고 "보여주기" 위주인 위젯만.
 * 타이머/메모/할일/체크리스트 등 상호작용이 많은 위젯은 의도적으로 제외.
 */
export const WALLPAPER_ELIGIBLE_TYPES: ReadonlySet<WidgetType> = new Set<WidgetType>([
  'timetable', 'studentcheck', 'calendar', 'goal', 'studenttimetable', 'dday', 'clock', 'timer', 'today',
])

export interface WidgetConfig {
  type: WidgetType
  label: string
  icon: string
  defaultWidth: number
  defaultHeight: number
  minWidth: number
  minHeight: number
}

export const WIDGET_CONFIGS: Record<WidgetType, WidgetConfig> = {
  calendar: {
    type: 'calendar',
    label: '달력',
    icon: 'Calendar',
    defaultWidth: 350,
    defaultHeight: 400,
    minWidth: 280,
    minHeight: 320,
  },
  task: {
    type: 'task',
    label: '할일',
    icon: 'CheckSquare',
    defaultWidth: 320,
    defaultHeight: 450,
    minWidth: 260,
    minHeight: 300,
  },
  memo: {
    type: 'memo',
    label: '메모',
    icon: 'StickyNote',
    defaultWidth: 300,
    defaultHeight: 350,
    minWidth: 250,
    minHeight: 250,
  },
  timetable: {
    type: 'timetable',
    label: '시간표',
    icon: 'Table',
    defaultWidth: 350,
    defaultHeight: 400,
    minWidth: 300,
    minHeight: 300,
  },
  checklist: {
    type: 'checklist',
    label: '체크리스트',
    icon: 'ListChecks',
    defaultWidth: 300,
    defaultHeight: 400,
    minWidth: 250,
    minHeight: 300,
  },
  timer: {
    type: 'timer',
    label: '타이머',
    icon: 'Timer',
    defaultWidth: 280,
    defaultHeight: 350,
    minWidth: 250,
    minHeight: 280,
  },
  dday: {
    type: 'dday',
    label: 'D-Day',
    icon: 'CalendarClock',
    defaultWidth: 300,
    defaultHeight: 300,
    minWidth: 250,
    minHeight: 200,
  },
  clock: {
    type: 'clock',
    label: '시계',
    icon: 'Clock',
    defaultWidth: 280,
    defaultHeight: 200,
    minWidth: 220,
    minHeight: 150,
  },
  routine: {
    type: 'routine',
    label: '루틴',
    icon: 'Repeat',
    defaultWidth: 320,
    defaultHeight: 420,
    minWidth: 260,
    minHeight: 300,
  },
  goal: {
    type: 'goal',
    label: '목표',
    icon: 'Target',
    defaultWidth: 340,
    defaultHeight: 260,
    minWidth: 260,
    minHeight: 200,
  },
  studentcheck: {
    type: 'studentcheck',
    label: '학급 체크',
    icon: 'Users',
    defaultWidth: 380,
    defaultHeight: 480,
    minWidth: 300,
    minHeight: 320,
  },
  studenttimetable: {
    type: 'studenttimetable',
    label: '학생용 시간표',
    icon: 'GraduationCap',
    defaultWidth: 420,
    defaultHeight: 280,
    minWidth: 280,
    minHeight: 200,
  },
  today: {
    type: 'today',
    label: '오늘',
    icon: 'CalendarCheck',
    defaultWidth: 440,
    defaultHeight: 320,
    minWidth: 280,
    minHeight: 200,
  },
  studentrecord: {
    type: 'studentrecord',
    label: '학생 기록',
    icon: 'ShieldCheck',
    defaultWidth: 380,
    defaultHeight: 460,
    minWidth: 300,
    minHeight: 280,
  },
}
