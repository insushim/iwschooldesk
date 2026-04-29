import type { Schedule, CreateScheduleInput, UpdateScheduleInput, ScheduleFilter } from './schedule.types'
import type { Task, CreateTaskInput, UpdateTaskInput, TaskFilter } from './task.types'
import type { Memo, CreateMemoInput, UpdateMemoInput, MemoFilter } from './memo.types'
import type { TimetableSlot, TimetablePeriod, CreateSlotInput, TimetableOverride, CreateOverrideInput } from './timetable.types'
import type { Checklist, ChecklistItem, CreateChecklistInput, UpdateChecklistInput, CreateChecklistItemInput } from './checklist.types'
import type { Section, CreateSectionInput, UpdateSectionInput } from './section.types'
import type { AppSettings, SettingKey, DDayEvent, CreateDDayInput, UpdateDDayInput } from './settings.types'
import type { WidgetPosition } from './widget.types'
import type { Routine, RoutineItem, RoutineItemWithStatus, CreateRoutineInput, UpdateRoutineInput, CreateRoutineItemInput } from './routine.types'
import type { Goal, CreateGoalInput, UpdateGoalInput } from './goal.types'

/** 백업 복호화에 필요한 자격증명. 비밀번호 또는 복구구문 중 최소 하나. */
export interface BackupCredentials {
  password?: string
  mnemonic?: string
}

export interface DetectedCloudFolder {
  provider: 'GoogleDrive' | 'OneDrive' | 'Dropbox' | 'iCloud' | 'Documents'
  label: string
  path: string
  priority: number
}

export interface BackupAutoConfig {
  frequency: 'off' | 'daily' | 'weekly'
  folder: string
  lastAt: number
  nextAt: number | null
}

export interface BackupFileEntry {
  name: string
  path: string
  bytes: number
  mtime: number
}

export interface BackupMetaInfo {
  app: string
  app_version: string
  format_version: number
  created_at_utc: string
  created_at_local: string
  host: string
  user: string
  row_counts: Record<string, number>
  chain_head_hash: string
  chain_tail_hash: string
  chain_total_logs: number
  note: string
}

export type BackupExportResult =
  | {
      ok: true
      path: string
      bytes: number
      tables: number
      rowCounts: Record<string, number>
      chainTotalLogs: number
    }
  | { ok: false; reason: string; detail?: string }

export type BackupPreviewResult =
  | {
      ok: true
      path: string
      via: 'password' | 'mnemonic'
      meta: BackupMetaInfo
      chainOk: boolean
      chainTotal: number
      chainFirstMismatchIndex: number | null
    }
  | { ok: false; reason: string; detail?: string }

export type BackupImportResult =
  | {
      ok: true
      via: 'password' | 'mnemonic'
      replaced: string[]
      inserted: number
      skipped: string[]
      chainTotal: number
      meta: BackupMetaInfo
    }
  | {
      ok: false
      reason: string
      detail?: string
      firstMismatchIndex?: number | null
      firstMismatchId?: number | null
    }

export interface ElectronAPI {
  schedule: {
    list: (filters?: ScheduleFilter) => Promise<Schedule[]>
    create: (data: CreateScheduleInput) => Promise<Schedule>
    update: (id: string, data: UpdateScheduleInput) => Promise<Schedule>
    delete: (id: string) => Promise<void>
  }
  task: {
    list: (filters?: TaskFilter) => Promise<Task[]>
    create: (data: CreateTaskInput) => Promise<Task>
    update: (id: string, data: UpdateTaskInput) => Promise<Task>
    delete: (id: string) => Promise<void>
    reorder: (items: { id: string; sort_order: number }[]) => Promise<void>
  }
  memo: {
    list: (filters?: MemoFilter) => Promise<Memo[]>
    create: (data: CreateMemoInput) => Promise<Memo>
    update: (id: string, data: UpdateMemoInput) => Promise<Memo>
    delete: (id: string) => Promise<void>
    reorder: (items: { id: string; sort_order: number }[]) => Promise<void>
  }
  timetable: {
    getSlots: (timetableSet?: string) => Promise<TimetableSlot[]>
    setSlot: (data: CreateSlotInput) => Promise<TimetableSlot>
    deleteSlot: (id: string) => Promise<void>
    getPeriods: () => Promise<TimetablePeriod[]>
    updatePeriods: (periods: TimetablePeriod[]) => Promise<void>
    getOverrides: (date: string) => Promise<TimetableOverride[]>
    createOverride: (data: CreateOverrideInput) => Promise<TimetableOverride>
    deleteOverride: (id: string) => Promise<void>
  }
  checklist: {
    list: () => Promise<Checklist[]>
    create: (data: CreateChecklistInput) => Promise<Checklist>
    update: (id: string, data: UpdateChecklistInput) => Promise<Checklist>
    delete: (id: string) => Promise<void>
    getItems: (checklistId: string) => Promise<ChecklistItem[]>
    addItem: (data: CreateChecklistItemInput) => Promise<ChecklistItem>
    toggleItem: (id: string) => Promise<ChecklistItem>
    updateItem: (id: string, data: { content?: string; due_date?: string | null; assignee?: string }) => Promise<ChecklistItem>
    deleteItem: (id: string) => Promise<void>
    reorderItems: (items: { id: string; sort_order: number }[]) => Promise<void>
  }
  section: {
    list: () => Promise<Section[]>
    create: (data: CreateSectionInput) => Promise<Section>
    update: (id: string, data: UpdateSectionInput) => Promise<Section>
    delete: (id: string) => Promise<void>
    reorder: (items: { id: string; sort_order: number }[]) => Promise<void>
  }
  dday: {
    list: () => Promise<DDayEvent[]>
    create: (data: CreateDDayInput) => Promise<DDayEvent>
    update: (id: string, data: UpdateDDayInput) => Promise<DDayEvent>
    delete: (id: string) => Promise<void>
  }
  routine: {
    list: (kind?: 'personal' | 'classroom') => Promise<Routine[]>
    create: (data: CreateRoutineInput) => Promise<Routine>
    update: (id: string, data: UpdateRoutineInput) => Promise<Routine>
    delete: (id: string) => Promise<void>
    getItems: (routineId: string, date: string) => Promise<RoutineItemWithStatus[]>
    addItem: (data: CreateRoutineItemInput) => Promise<RoutineItem>
    updateItem: (id: string, content: string) => Promise<RoutineItem>
    deleteItem: (id: string) => Promise<void>
    toggleCompletion: (itemId: string, date: string) => Promise<{ is_completed: number }>
    dayNumber: (startDate: string, today: string) => Promise<number>
    completionsInRange: (routineId: string, fromDate: string, toDate: string) => Promise<Array<{ item_id: string; date: string }>>
  }
  goal: {
    list: () => Promise<Goal[]>
    create: (data: CreateGoalInput) => Promise<Goal>
    update: (id: string, data: UpdateGoalInput) => Promise<Goal>
    delete: (id: string) => Promise<void>
  }
  settings: {
    get: <K extends SettingKey>(key: K) => Promise<AppSettings[K]>
    set: <K extends SettingKey>(key: K, value: AppSettings[K]) => Promise<void>
    getAll: () => Promise<AppSettings>
  }
  meal: {
    searchSchool: (name: string, apiKey?: string) => Promise<import('./meal.types').NeisSchool[]>
    fetchToday: (scCode: string, schoolCode: string, ymd: string, apiKey?: string) => Promise<import('./meal.types').MealMenu[]>
  }
  widget: {
    getPositions: () => Promise<WidgetPosition[]>
    savePosition: (pos: Partial<WidgetPosition> & { widget_id: string }) => Promise<void>
    toggleVisibility: (widgetId: string) => Promise<void>
    openWindow: (type: string, opts?: { instanceId?: string }) => Promise<void>
    closeWindow: (type: string) => Promise<void>
    isOpen: (type: string) => Promise<boolean>
    listOpen: () => Promise<string[]>
    setOpacity: (value: number) => void
    setAlwaysOnTop: (flag: boolean) => void
    getAlwaysOnTop: () => Promise<boolean>
    setFontScale: (scale: number) => void
    getFontScale: () => Promise<number>
    focusSelf: () => void
    closeSelf: () => void
    /** 배경화면 모드: 클릭 통과 + z-order 최하단 고정 */
    setWallpaperMode: (widgetId: string, on: boolean) => Promise<boolean>
    exitAllWallpaperMode: () => Promise<boolean>
    getWallpaperModeMap: () => Promise<string[]>
    /** main → renderer 브로드캐스트 구독. 반환값은 unsubscribe 함수. */
    onWallpaperModeChanged: (cb: (payload: { widgetId: string; on: boolean }) => void) => () => void
    /** 위젯 최소화(= 창 숨김). 복원은 WidgetLauncher 에서 재클릭. */
    minimizeSelf: () => void
    /** 디스플레이 모드 마스터 토글 — 모든 위젯 헤더 숨김 on/off. */
    setAllDisplayMode: (on: boolean) => void
    onAllDisplayModeChanged: (cb: (payload: { on: boolean }) => void) => () => void
  }
  backup: {
    /** 현재 기기의 백업 설정 상태. setup 여부, OS 키체인 사용 가능 여부. */
    isConfigured: () => Promise<{ secureAvailable: boolean; hasMnemonic: boolean; hasPassword: boolean }>
    /** 신규 BIP39 복구구문(기본 한국어) 생성. 12단어 space 구분 문자열. */
    generateMnemonic: (lang?: 'korean' | 'english') => Promise<string>
    /** 복구구문 체크섬 검증 (BIP39 표준). */
    verifyMnemonic: (phrase: string, lang?: 'korean' | 'english') => Promise<boolean>
    /** 최초 설정: 복구구문 + 비밀번호를 OS 키체인에 저장. */
    setup: (opts: { password: string; mnemonic: string }) => Promise<{ ok: true } | { ok: false; reason: string }>
    /** 현재 기기의 저장된 자격증명 해제 (기존 백업 파일은 그대로 사용 가능). */
    clearSetup: (opts: { password: string }) => Promise<{ ok: true } | { ok: false; reason: string }>
    exportEncrypted: (opts: { password: string }) => Promise<BackupExportResult>
    previewEncrypted: (opts: BackupCredentials) => Promise<BackupPreviewResult>
    importEncrypted: (opts: BackupCredentials & { replaceLocalSetup?: boolean }) => Promise<BackupImportResult>
    /** 비밀번호 입력 후 저장된 복구구문을 다시 표시 (분실 대비). */
    revealMnemonic: (opts: { password: string }) =>
      Promise<{ ok: true; mnemonic: string } | { ok: false; reason: string }>
    /** OS별 잘 알려진 클라우드 동기화 폴더 자동 감지. */
    detectCloudFolders: () => Promise<DetectedCloudFolder[]>
    getAutoConfig: () => Promise<BackupAutoConfig>
    /** 후보 경로 하위에 SchoolDesk 폴더를 만들어 자동 백업 위치로 설정. */
    setAutoFolder: (opts: { basePath: string }) =>
      Promise<{ ok: true; path: string } | { ok: false; reason: string }>
    /** 사용자가 직접 폴더 선택. */
    pickAutoFolder: () => Promise<{ ok: true; path: string } | { ok: false; reason: string }>
    setAutoFrequency: (opts: { frequency: 'off' | 'daily' | 'weekly' }) =>
      Promise<{ ok: true } | { ok: false; reason: string }>
    /** 지금 즉시 자동 백업 1회 실행. */
    runAutoNow: () => Promise<{ ok: true; lastAt: number }>
    listBackupsInFolder: (opts?: { folder?: string }) =>
      Promise<
        | { ok: true; folder: string; entries: BackupFileEntry[] }
        | { ok: false; reason: string }
      >
    importFromPath: (opts: {
      filePath: string
      password?: string
      mnemonic?: string
      replaceLocalSetup?: boolean
    }) => Promise<BackupImportResult>
  }
  system: {
    minimize: () => void
    close: () => void
    maximize: () => void
    setAlwaysOnTop: (flag: boolean) => void
    showNotification: (title: string, body: string) => Promise<void>
    exportData: () => Promise<string>
    importData: (filePath: string) => Promise<void>
    selectFile: () => Promise<string | null>
    getAppVersion: () => Promise<string>
    setAutoStart: (enabled: boolean) => Promise<boolean>
    isLaunchedAtStartup: () => Promise<boolean>
    isAutoStartEnabled: () => Promise<boolean>
    isPortable: () => Promise<boolean>
  }
  on: (channel: string, callback: (...args: unknown[]) => void) => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
