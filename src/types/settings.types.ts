export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  language: string
  auto_start: boolean
  notification_enabled: boolean
  notification_sound: boolean
  pomodoro_work: number
  pomodoro_break: number
  pomodoro_long_break: number
  current_timetable_set: string
  current_semester: string
  school_name: string
  teacher_name: string
  class_name: string
  backup_path: string
  widget_theme: 'glassmorphism' | 'solid' | 'minimal'
  /** 학생 시간표 위젯 하단 알림 — 숙제·준비물·전달사항. 학생들이 보고 알 수 있도록. */
  student_timetable_note: string
  /** 디스플레이 모드(전역 헤더 숨김 + NOACTIVATE) ON 여부. 앱 재시작 후에도 유지. */
  display_mode_all: boolean
  /** 자동 백업 주기 — 'off' | 'daily' | 'weekly'. backup-handlers.ts 에서 관리. */
  backup_auto_frequency: string
  /** 자동 백업 저장 폴더 (절대경로). */
  backup_auto_folder: string
  /** 마지막 자동 백업 시각 (ISO 문자열). */
  backup_last_auto_at: string
  /** 교시별 종소리 ON/OFF 맵 — period.id → { startBell, endBell }. */
  bell_settings: Record<string, { startBell: boolean; endBell: boolean }>
}

export type SettingKey = keyof AppSettings

export interface DDayEvent {
  id: string
  title: string
  target_date: string
  color: string
  emoji: string
  is_active: number
  created_at: string
}

export interface CreateDDayInput {
  title: string
  target_date: string
  color?: string
  emoji?: string
}

export interface UpdateDDayInput extends Partial<CreateDDayInput> {
  is_active?: number
}
