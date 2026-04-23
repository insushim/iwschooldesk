/**
 * 각 테이블의 UPDATE 허용 컬럼 화이트리스트.
 *
 * 이유: updateXXX repo들은 `for (const [key, value] of Object.entries(data))`
 * 패턴으로 동적 SET 절을 만들기 때문에, renderer가 넘긴 key가 그대로 SQL에 박힌다.
 * 악성/변조된 IPC 페이로드 한 번으로 임의 SQL injection이 가능하므로
 * 모든 동적 컬럼은 여기 등록된 이름에서만 허용한다.
 *
 * 사용법: repo의 dynamic-SET 블록에서
 *   if (!ALLOWED_UPDATE_FIELDS.tasks.has(key)) continue
 * 형태로 필터링.
 */

export const ALLOWED_UPDATE_FIELDS = {
  schedules: new Set([
    'title', 'description', 'start_date', 'end_date', 'all_day',
    'color', 'category', 'location', 'reminder_minutes',
    'recurrence', 'recurrence_end', 'is_completed',
  ]),
  tasks: new Set([
    'title', 'description', 'priority', 'status', 'category', 'section_id',
    'due_date', 'due_time', 'tags', 'sort_order', 'parent_id',
    'is_completed', 'completed_at',
  ]),
  memos: new Set([
    'title', 'content', 'color', 'is_pinned', 'category', 'tags', 'sort_order',
  ]),
  checklists: new Set([
    'title', 'description', 'color', 'is_template', 'category',
    'sort_order', 'section_id',
  ]),
  checklist_items: new Set([
    'content', 'is_checked', 'sort_order', 'due_date', 'assignee', 'checked_at',
  ]),
  sections: new Set([
    'name', 'color', 'icon', 'sort_order',
  ]),
  routines: new Set([
    'title', 'color', 'icon', 'sort_order', 'start_date', 'kind',
  ]),
  goals: new Set([
    'content', 'emoji', 'color', 'sort_order',
  ]),
  dday_events: new Set([
    'title', 'target_date', 'color', 'emoji', 'is_active',
  ]),
  widget_positions: new Set([
    'widget_type', 'x', 'y', 'width', 'height',
    'is_visible', 'is_locked', 'opacity', 'always_on_top',
    'config', 'font_scale', 'wallpaper_mode',
  ]),
} as const

/**
 * data:import 시 허용되는 테이블 목록(고정). JSON 파일에 등록되지 않은
 * 테이블 이름이 있으면 해당 블록만 무시한다.
 */
export const ALLOWED_IMPORT_TABLES = new Set([
  'schedules', 'tasks', 'memos',
  'timetable_slots', 'timetable_periods', 'timetable_overrides',
  'checklists', 'checklist_items',
  'sections', 'dday_events',
  'settings', 'widget_positions',
  'routines', 'routine_items', 'routine_completions',
  'goals',
])

/**
 * 각 테이블의 모든 컬럼명 화이트리스트. data:import 시 INSERT 컬럼명 검증용.
 * ALTER TABLE로 컬럼이 추가되면 여기도 같이 보강해야 한다.
 */
export const ALLOWED_TABLE_COLUMNS: Record<string, Set<string>> = {
  schedules: new Set([
    'id', 'title', 'description', 'start_date', 'end_date', 'all_day',
    'color', 'category', 'location', 'reminder_minutes',
    'recurrence', 'recurrence_end', 'is_completed',
    'created_at', 'updated_at',
  ]),
  tasks: new Set([
    'id', 'title', 'description', 'priority', 'status', 'category',
    'section_id', 'due_date', 'due_time', 'tags', 'sort_order', 'parent_id',
    'is_completed', 'completed_at', 'created_at', 'updated_at',
  ]),
  memos: new Set([
    'id', 'title', 'content', 'color', 'is_pinned', 'category', 'tags',
    'sort_order', 'created_at', 'updated_at',
  ]),
  timetable_slots: new Set([
    'id', 'day_of_week', 'period', 'subject', 'class_name', 'teacher', 'room',
    'color', 'memo', 'semester', 'timetable_set',
    'is_specialist', 'specialist_teacher',
    'created_at', 'updated_at',
  ]),
  timetable_periods: new Set([
    'id', 'period', 'label', 'start_time', 'end_time', 'is_break',
  ]),
  timetable_overrides: new Set([
    'id', 'date', 'period', 'subject', 'teacher', 'room', 'color', 'memo',
    'created_at',
  ]),
  checklists: new Set([
    'id', 'title', 'description', 'color', 'is_template', 'category',
    'sort_order', 'section_id', 'created_at', 'updated_at',
  ]),
  checklist_items: new Set([
    'id', 'checklist_id', 'content', 'is_checked', 'sort_order',
    'due_date', 'assignee', 'checked_at', 'created_at',
  ]),
  sections: new Set([
    'id', 'name', 'color', 'icon', 'sort_order', 'created_at', 'updated_at',
  ]),
  dday_events: new Set([
    'id', 'title', 'target_date', 'color', 'emoji', 'is_active', 'created_at',
  ]),
  settings: new Set(['key', 'value', 'updated_at']),
  widget_positions: new Set([
    'widget_id', 'widget_type', 'x', 'y', 'width', 'height',
    'is_visible', 'is_locked', 'opacity', 'always_on_top',
    'config', 'font_scale', 'wallpaper_mode', 'updated_at',
  ]),
  routines: new Set([
    'id', 'title', 'color', 'icon', 'sort_order', 'start_date',
    'kind', 'created_at', 'updated_at',
  ]),
  routine_items: new Set([
    'id', 'routine_id', 'content', 'sort_order', 'created_at',
  ]),
  routine_completions: new Set([
    'id', 'item_id', 'date', 'created_at',
  ]),
  goals: new Set([
    'id', 'content', 'emoji', 'color', 'sort_order', 'created_at', 'updated_at',
  ]),
}
