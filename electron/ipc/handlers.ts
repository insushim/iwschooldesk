import { ipcMain, BrowserWindow, Notification, dialog, app } from 'electron'
import * as scheduleRepo from '../database/repositories/schedule.repo'
import * as taskRepo from '../database/repositories/task.repo'
import * as memoRepo from '../database/repositories/memo.repo'
import * as timetableRepo from '../database/repositories/timetable.repo'
import * as checklistRepo from '../database/repositories/checklist.repo'
import * as sectionRepo from '../database/repositories/section.repo'
import * as routineRepo from '../database/repositories/routine.repo'
import * as goalRepo from '../database/repositories/goal.repo'
import * as studentRecordRepo from '../database/repositories/student-record.repo'
import * as settingsRepo from '../database/repositories/settings.repo'
import { getDatabase } from '../database/connection'
import { ALLOWED_IMPORT_TABLES, ALLOWED_TABLE_COLUMNS } from '../database/allowed-fields'
import fs from 'fs'

/** 데이터 변경을 모든 창(메인 + 위젯들)에 알림. 위젯은 자기와 관련된 type이면 refetch. */
type ChangeType = 'schedule' | 'task' | 'memo' | 'timetable' | 'checklist' | 'section' | 'dday' | 'settings' | 'routine' | 'goal' | 'studentrecord'
function broadcastChange(type: ChangeType): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      try { w.webContents.send('data:changed', type) } catch { /* ignore */ }
    }
  }
}

export function registerIpcHandlers(): void {
  // Schedule
  ipcMain.handle('schedule:list', (_e, filters) => scheduleRepo.listSchedules(filters))
  ipcMain.handle('schedule:create', (_e, data) => { const r = scheduleRepo.createSchedule(data); broadcastChange('schedule'); return r })
  ipcMain.handle('schedule:update', (_e, id, data) => { const r = scheduleRepo.updateSchedule(id, data); broadcastChange('schedule'); return r })
  ipcMain.handle('schedule:delete', (_e, id) => { scheduleRepo.deleteSchedule(id); broadcastChange('schedule') })

  // Task
  ipcMain.handle('task:list', (_e, filters) => taskRepo.listTasks(filters))
  ipcMain.handle('task:create', (_e, data) => { const r = taskRepo.createTask(data); broadcastChange('task'); return r })
  ipcMain.handle('task:update', (_e, id, data) => { const r = taskRepo.updateTask(id, data); broadcastChange('task'); return r })
  ipcMain.handle('task:delete', (_e, id) => { taskRepo.deleteTask(id); broadcastChange('task') })
  ipcMain.handle('task:reorder', (_e, items) => { taskRepo.reorderTasks(items); broadcastChange('task') })

  // Memo
  ipcMain.handle('memo:list', (_e, filters) => memoRepo.listMemos(filters))
  ipcMain.handle('memo:create', (_e, data) => { const r = memoRepo.createMemo(data); broadcastChange('memo'); return r })
  ipcMain.handle('memo:update', (_e, id, data) => { const r = memoRepo.updateMemo(id, data); broadcastChange('memo'); return r })
  ipcMain.handle('memo:delete', (_e, id) => { memoRepo.deleteMemo(id); broadcastChange('memo') })
  ipcMain.handle('memo:reorder', (_e, items) => { memoRepo.reorderMemos(items); broadcastChange('memo') })

  // Timetable
  ipcMain.handle('timetable:getSlots', (_e, set) => timetableRepo.getSlots(set))
  ipcMain.handle('timetable:setSlot', (_e, data) => { const r = timetableRepo.setSlot(data); broadcastChange('timetable'); return r })
  ipcMain.handle('timetable:deleteSlot', (_e, id) => { timetableRepo.deleteSlot(id); broadcastChange('timetable') })
  ipcMain.handle('timetable:getPeriods', () => timetableRepo.getPeriods())
  ipcMain.handle('timetable:updatePeriods', (_e, periods) => { const r = timetableRepo.updatePeriods(periods); broadcastChange('timetable'); return r })
  ipcMain.handle('timetable:getOverrides', (_e, date) => timetableRepo.getOverrides(date))
  ipcMain.handle('timetable:createOverride', (_e, data) => { const r = timetableRepo.createOverride(data); broadcastChange('timetable'); return r })
  ipcMain.handle('timetable:deleteOverride', (_e, id) => { timetableRepo.deleteOverride(id); broadcastChange('timetable') })

  // Checklist
  ipcMain.handle('checklist:list', () => checklistRepo.listChecklists())
  ipcMain.handle('checklist:create', (_e, data) => { const r = checklistRepo.createChecklist(data); broadcastChange('checklist'); return r })
  ipcMain.handle('checklist:update', (_e, id, data) => { const r = checklistRepo.updateChecklist(id, data); broadcastChange('checklist'); return r })
  ipcMain.handle('checklist:delete', (_e, id) => { checklistRepo.deleteChecklist(id); broadcastChange('checklist') })
  ipcMain.handle('checklist:getItems', (_e, id) => checklistRepo.getChecklistItems(id))
  ipcMain.handle('checklist:addItem', (_e, data) => { const r = checklistRepo.addChecklistItem(data); broadcastChange('checklist'); return r })
  ipcMain.handle('checklist:toggleItem', (_e, id) => { const r = checklistRepo.toggleChecklistItem(id); broadcastChange('checklist'); return r })
  ipcMain.handle('checklist:updateItem', (_e, id, data) => { const r = checklistRepo.updateChecklistItem(id, data); broadcastChange('checklist'); return r })
  ipcMain.handle('checklist:deleteItem', (_e, id) => { checklistRepo.deleteChecklistItem(id); broadcastChange('checklist') })
  ipcMain.handle('checklist:reorderItems', (_e, items) => { checklistRepo.reorderChecklistItems(items); broadcastChange('checklist') })

  // Section
  ipcMain.handle('section:list', () => sectionRepo.listSections())
  ipcMain.handle('section:create', (_e, data) => { const r = sectionRepo.createSection(data); broadcastChange('section'); return r })
  ipcMain.handle('section:update', (_e, id, data) => { const r = sectionRepo.updateSection(id, data); broadcastChange('section'); return r })
  ipcMain.handle('section:delete', (_e, id) => { sectionRepo.deleteSection(id); broadcastChange('section') })
  ipcMain.handle('section:reorder', (_e, items) => { sectionRepo.reorderSections(items); broadcastChange('section') })

  // Routine
  ipcMain.handle('routine:list', (_e, kind) => routineRepo.listRoutines(kind))
  ipcMain.handle('routine:create', (_e, data) => { const r = routineRepo.createRoutine(data); broadcastChange('routine'); return r })
  ipcMain.handle('routine:update', (_e, id, data) => { const r = routineRepo.updateRoutine(id, data); broadcastChange('routine'); return r })
  ipcMain.handle('routine:delete', (_e, id) => { routineRepo.deleteRoutine(id); broadcastChange('routine') })
  ipcMain.handle('routine:getItems', (_e, routineId, date) => routineRepo.getRoutineItemsForDate(routineId, date))
  ipcMain.handle('routine:addItem', (_e, data) => { const r = routineRepo.addRoutineItem(data); broadcastChange('routine'); return r })
  ipcMain.handle('routine:updateItem', (_e, id, content) => { const r = routineRepo.updateRoutineItem(id, content); broadcastChange('routine'); return r })
  ipcMain.handle('routine:deleteItem', (_e, id) => { routineRepo.deleteRoutineItem(id); broadcastChange('routine') })
  ipcMain.handle('routine:toggleCompletion', (_e, itemId, date) => { const r = routineRepo.toggleRoutineCompletion(itemId, date); broadcastChange('routine'); return r })
  ipcMain.handle('routine:dayNumber', (_e, startDate, today) => routineRepo.getRoutineDayNumber(startDate, today))
  ipcMain.handle('routine:completionsInRange', (_e, routineId, fromDate, toDate) => routineRepo.getRoutineCompletionsInRange(routineId, fromDate, toDate))

  // Student Record (학생 기록 — 잠금 + 해시체인 로그)
  ipcMain.handle('studentRecord:list', () => studentRecordRepo.listStudentRecords())
  ipcMain.handle('studentRecord:create', (_e, data) => {
    const r = studentRecordRepo.createStudentRecord(data); broadcastChange('studentrecord'); return r
  })
  ipcMain.handle('studentRecord:update', (_e, id, data) => {
    const r = studentRecordRepo.updateStudentRecord(id, data); broadcastChange('studentrecord'); return r
  })
  ipcMain.handle('studentRecord:delete', (_e, id) => {
    studentRecordRepo.deleteStudentRecord(id); broadcastChange('studentrecord')
  })
  ipcMain.handle('studentRecord:isPasswordSet', () => studentRecordRepo.isPasswordSet())
  ipcMain.handle('studentRecord:setPassword', (_e, newPw: string, curPw?: string) => {
    studentRecordRepo.setPassword(newPw, curPw); broadcastChange('studentrecord'); return true
  })
  ipcMain.handle('studentRecord:verifyPassword', (_e, pw: string) => studentRecordRepo.verifyPassword(pw))
  ipcMain.handle('studentRecord:clearPassword', (_e, curPw: string) => {
    studentRecordRepo.clearPassword(curPw); broadcastChange('studentrecord'); return true
  })
  ipcMain.handle('studentRecord:exportLogs', async () => {
    const result = await dialog.showSaveDialog({
      title: '학생 기록 로그 저장',
      defaultPath: `학생기록_로그_${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false as const, reason: 'canceled' }
    const payload = studentRecordRepo.buildLogExportPayload()
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
    return { ok: true as const, count: payload.logs.length, path: result.filePath }
  })

  // Goal (우리반 목표)
  ipcMain.handle('goal:list', () => goalRepo.listGoals())
  ipcMain.handle('goal:create', (_e, data) => { const r = goalRepo.createGoal(data); broadcastChange('goal'); return r })
  ipcMain.handle('goal:update', (_e, id, data) => { const r = goalRepo.updateGoal(id, data); broadcastChange('goal'); return r })
  ipcMain.handle('goal:delete', (_e, id) => { goalRepo.deleteGoal(id); broadcastChange('goal') })

  // D-Day
  ipcMain.handle('dday:list', () => settingsRepo.listDDays())
  ipcMain.handle('dday:create', (_e, data) => { const r = settingsRepo.createDDay(data); broadcastChange('dday'); return r })
  ipcMain.handle('dday:update', (_e, id, data) => { const r = settingsRepo.updateDDay(id, data); broadcastChange('dday'); return r })
  ipcMain.handle('dday:delete', (_e, id) => { settingsRepo.deleteDDay(id); broadcastChange('dday') })

  // Settings
  ipcMain.handle('settings:get', (_e, key) => settingsRepo.getSetting(key))
  ipcMain.handle('settings:set', (_e, key, value) => { settingsRepo.setSetting(key, value); broadcastChange('settings') })
  ipcMain.handle('settings:getAll', () => settingsRepo.getAllSettings())

  // Widget
  ipcMain.handle('widget:getPositions', () => settingsRepo.getWidgetPositions())
  ipcMain.handle('widget:savePosition', (_e, pos) => settingsRepo.saveWidgetPosition(pos))
  ipcMain.handle('widget:toggleVisibility', (_e, id) => settingsRepo.toggleWidgetVisibility(id))

  // Notification
  ipcMain.handle('notification:show', (_e, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  })

  // Bell broadcast — 메인 창에서 탐지한 수업 시작/끝 이벤트를 모든 창(특히 위젯 창)에 전달.
  // 듀얼 모니터 사용 시 전자칠판에 띄워둔 시계 위젯이 시각적 알림을 보여줄 수 있도록.
  ipcMain.on('bell:broadcast', (_e, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return
    const p = payload as { kind?: string; periodLabel?: string; periodNumber?: number }
    if (p.kind !== 'start' && p.kind !== 'end') return
    const safe = {
      kind: p.kind,
      periodLabel: String(p.periodLabel ?? '').slice(0, 40),
      periodNumber: typeof p.periodNumber === 'number' ? p.periodNumber : 0,
      at: new Date().toISOString(),
    }
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        try { w.webContents.send('school-bell', safe) } catch { /* ignore */ }
      }
    }
  })

  // Data export/import
  //
  // 보안 설계:
  //  - EXPORT 대상 테이블은 하드코딩된 배열(EXPORT_TABLES)만. 동적 SQL 없음.
  //  - IMPORT는 renderer가 filePath를 전달하지 않는다. main에서 직접 dialog.showOpenDialog를
  //    띄워 사용자가 고른 경로만 읽는다 (임의 파일 읽기 봉쇄).
  //  - IMPORT 시 JSON의 테이블명은 ALLOWED_IMPORT_TABLES로, 컬럼명은 테이블별
  //    ALLOWED_TABLE_COLUMNS로 각각 화이트리스트 검증 후에만 DELETE/INSERT.
  const EXPORT_TABLES = [
    'schedules', 'tasks', 'memos',
    'timetable_slots', 'timetable_periods', 'timetable_overrides',
    'checklists', 'checklist_items',
    'sections', 'dday_events',
    'settings', 'widget_positions',
    'routines', 'routine_items', 'routine_completions',
    'goals',
  ] as const

  ipcMain.handle('data:export', async () => {
    const db = getDatabase()
    const data: Record<string, unknown[]> = {}

    for (const table of EXPORT_TABLES) {
      // table은 위 상수 배열에서만 나오므로 동적 주입 불가
      data[table] = db.prepare(`SELECT * FROM ${table}`).all()
    }

    const result = await dialog.showSaveDialog({
      defaultPath: `schooldesk-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
      return result.filePath
    }
    return null
  })

  // data:import는 인자를 받지 않는다 — renderer가 임의 경로를 넘기지 못하도록
  // 파일 선택을 main에서 직접 수행한다.
  ipcMain.handle('data:import', async () => {
    const pick = await dialog.showOpenDialog({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (pick.canceled || !pick.filePaths[0]) return { ok: false, reason: 'canceled' }

    const filePath = pick.filePaths[0]
    // 과도하게 큰 파일은 거부 (DoS 방지)
    const MAX_BYTES = 50 * 1024 * 1024
    try {
      const stat = fs.statSync(filePath)
      if (stat.size > MAX_BYTES) return { ok: false, reason: 'too_large' }
    } catch { return { ok: false, reason: 'stat_failed' } }

    let parsed: unknown
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      parsed = JSON.parse(content)
    } catch { return { ok: false, reason: 'parse_failed' } }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: 'invalid_shape' }
    }
    const data = parsed as Record<string, unknown>

    const db = getDatabase()
    let inserted = 0
    try {
      db.transaction(() => {
        // 기존 데이터 전량 삭제: 화이트리스트 상의 테이블에 한정
        for (const table of ALLOWED_IMPORT_TABLES) {
          db.prepare(`DELETE FROM ${table}`).run()
        }

        for (const [table, rows] of Object.entries(data)) {
          if (!ALLOWED_IMPORT_TABLES.has(table)) continue
          if (!Array.isArray(rows) || rows.length === 0) continue
          const allowedCols = ALLOWED_TABLE_COLUMNS[table]
          if (!allowedCols) continue

          // 첫 행에서 컬럼 추출하되, 화이트리스트에 있는 컬럼만 남김
          const firstRow = rows[0]
          if (!firstRow || typeof firstRow !== 'object') continue
          const cols = Object.keys(firstRow as Record<string, unknown>)
            .filter((c) => allowedCols.has(c))
          if (cols.length === 0) continue

          const placeholders = cols.map(() => '?').join(', ')
          // table과 cols 모두 화이트리스트 검증된 identifier이므로 안전
          const stmt = db.prepare(
            `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`
          )
          for (const row of rows) {
            if (!row || typeof row !== 'object') continue
            const r = row as Record<string, unknown>
            stmt.run(...cols.map((c) => r[c] ?? null))
            inserted++
          }
        }
      })()
    } catch (err) {
      return { ok: false, reason: 'transaction_failed', detail: String(err) }
    }

    // 복구된 데이터가 반영되도록 모든 창에 갱신 알림
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        try { w.webContents.send('data:changed', 'settings') } catch { /* ignore */ }
      }
    }
    return { ok: true, inserted }
  })

  // 레거시 호환: 파일 선택 엔드포인트. 이제 data:import 내부에서 자체 호출하므로
  // 외부에선 불필요하지만, preload 시그니처 호환을 위해 남겨둔다. 파일을 읽지는 않는다.
  ipcMain.handle('system:selectFile', async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('system:getAppVersion', () => app.getVersion())
}
