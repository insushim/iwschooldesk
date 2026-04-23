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
