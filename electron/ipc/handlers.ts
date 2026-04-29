import { ipcMain, BrowserWindow, Notification, dialog, app } from 'electron'
import { registerBackupHandlers } from './backup-handlers'
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
import path from 'path'
import os from 'os'
import { createHash } from 'crypto'

/**
 * OpenTimestamps 캘린더 서버에 SHA-256 해시를 등록하고 .ots 바이너리를 반환.
 *
 * 네이티브 라이브러리 없이 순수 HTTPS + 바이너리 조립으로 구현 (크로스 빌드 호환).
 * .ots 포맷 (python-opentimestamps 기준):
 *   HEADER_MAGIC(31) + varuint(MAJOR_VERSION=1) + file_hash_op_tag(1) + digest(32) + calendar_response
 *   (Calendar 응답은 이미 digest 를 시작점으로 한 serialized Timestamp)
 *
 * 보안: 캘린더로 전송되는 것은 SHA-256 해시(32 bytes)뿐. 원본 내용은 전송되지 않음.
 * 오류/타임아웃/오프라인 시 null 반환 → 호출부에서 조용히 스킵.
 */
async function createOtsForSha256(hashHex: string, timeoutMs = 20000): Promise<Buffer | null> {
  const hashBuf = Buffer.from(hashHex, 'hex')
  if (hashBuf.length !== 32) return null

  const calendars = [
    'https://a.pool.opentimestamps.org',
    'https://b.pool.opentimestamps.org',
    'https://alice.btc.calendar.opentimestamps.org',
    'https://finney.calendar.eternitywall.com',
  ]

  let calendarProof: Buffer | null = null
  let usedCalendar = ''
  for (const base of calendars) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(base + '/digest', {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.opentimestamps.v1',
          'User-Agent': 'SchoolDesk/1.0 (+https://github.com/insushim/iwschooldesk)',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: hashBuf,
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) continue
      calendarProof = Buffer.from(await res.arrayBuffer())
      usedCalendar = base
      break
    } catch {
      // 이 캘린더 실패 → 다음 시도
    }
  }
  if (!calendarProof) {
    console.warn('[OpenTimestamps] 모든 캘린더 호출 실패 (오프라인 또는 서버 이슈)')
    return null
  }

  // .ots 파일 조립
  // HEADER_MAGIC = b'\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94' (31 bytes)
  const magic = Buffer.from([
    0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d,
    0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73, 0x00,
    0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf,
    0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94,
  ])
  const version = Buffer.from([0x01])   // varuint(MAJOR_VERSION=1)
  const sha256Op = Buffer.from([0x08])  // OpSHA256.TAG

  console.log('[OpenTimestamps] stamped via', usedCalendar)
  return Buffer.concat([magic, version, sha256Op, hashBuf, calendarProof])
}

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
  ipcMain.handle('schedule:deleteAll', () => {
    const n = scheduleRepo.deleteAllSchedules()
    broadcastChange('schedule')
    return n
  })

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
      title: '학생 기록 로그 저장 (법원 증거용)',
      defaultPath: `학생기록_로그_${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false as const, reason: 'canceled' }

    // 1) JSON payload 저장
    const payload = studentRecordRepo.buildLogExportPayload()
    const jsonText = JSON.stringify(payload, null, 2)
    fs.writeFileSync(result.filePath, jsonText, 'utf8')

    // 2) 파일 SHA-256 계산 → 원본성 증명서(.proof.txt) 동시 저장
    const fileSha256 = createHash('sha256').update(jsonText, 'utf8').digest('hex')
    const fileSize = Buffer.byteLength(jsonText, 'utf8')
    const proofPath = result.filePath.replace(/\.json$/i, '') + '.proof.txt'

    // 3) OpenTimestamps .ots 파일 생성 시도 (인터넷 필요, 실패 시 스킵)
    //    해시만 전송되므로 학생 정보·기록 내용 일체 유출 없음.
    const otsBytes = await createOtsForSha256(fileSha256)
    let otsPath: string | null = null
    if (otsBytes) {
      otsPath = result.filePath + '.ots'
      fs.writeFileSync(otsPath, otsBytes)
    }

    const now = new Date()
    const appVersion = app.getVersion ? app.getVersion() : '1.0.0'
    const proof =
`═══════════════════════════════════════════════════════════════
      SchoolDesk  학생기록 원본 증명서 (Proof of Integrity)
═══════════════════════════════════════════════════════════════

⚠️  보관 시 반드시 지켜야 할 것 (선생님 필독)
───────────────────────────────────────────────────────────────
1. 다음 3개 파일은 항상 한 세트입니다. **절대 분리하지 마세요.**
   ① ${path.basename(result.filePath)}             ← 원본 데이터
   ② ${path.basename(proofPath)}     ← 본 증명서 (지금 이 파일)
   ${otsPath ? `③ ${path.basename(otsPath)}  ← 비트코인 시간증명 (바이너리)` : '③ .ots 파일 (생성 안 됨 — 인터넷 연결 후 재export 권장)'}

2. **.ots 파일은 절대 메모장·워드로 열지 마세요.**
   바이너리(컴퓨터 전용) 파일이라 깨져 보이는 게 정상입니다.
   메모장으로 열어서 "저장" 버튼을 누르면 즉시 무효화됩니다.

3. 파일명을 바꾸지 마세요. 바꾸면 짝이 안 맞아 검증이 어려워집니다.

4. 권장 보관: 학교 컴퓨터 + 클라우드(드라이브) + 외장 USB 등 3중 백업.
   민원·소송 발생 시 즉시 검증 가능해야 합니다.

5. 평소엔 그냥 안전하게 보관만 하시면 됩니다.
   진짜 분쟁이 생겼을 때만 아래 [검증 방법]에 따라 확인하세요.

═══════════════════════════════════════════════════════════════

원본 파일명        : ${path.basename(result.filePath)}
원본 파일 SHA-256  : ${fileSha256}
파일 크기          : ${fileSize.toLocaleString()} bytes
내보낸 시각 (UTC)  : ${now.toISOString()}
내보낸 시각 (로컬) : ${now.toLocaleString('ko-KR', { hour12: false })}
컴퓨터 이름        : ${os.hostname()}
사용자             : ${os.userInfo().username}
운영체제           : ${os.platform()} ${os.release()} (${os.arch()})
앱                 : SchoolDesk v${appVersion}
포함 로그 개수     : ${payload.logs.length}
체인 시작 해시     : ${payload.meta.chain_head_hash || '(없음)'}
체인 끝 해시       : ${payload.meta.chain_tail_hash || '(없음)'}
해시 알고리즘      : SHA-256 append-only chain
OpenTimestamps     : ${otsPath ? '✅ ' + path.basename(otsPath) + ' 자동 생성 (Bitcoin 블록체인 등록 요청 완료)' : '⚠️ 생성 안 됨 — 인터넷 미연결 또는 서버 응답 없음'}

─── 검증 방법 ────────────────────────────────────────────────
1) 위 원본 파일 SHA-256 값을 별도 도구로 재계산하여 일치를 확인합니다.
   · Windows(PowerShell): Get-FileHash "${path.basename(result.filePath)}" -Algorithm SHA256
   · macOS/Linux: shasum -a 256 "${path.basename(result.filePath)}"
   · 온라인: https://emn178.github.io/online-tools/sha256_checksum.html
2) 원본 JSON 파일 내 logs[] 의 prev_hash / hash 체인을 재계산하여
   어떤 행이든 변조되지 않았음을 확인합니다.
   hash = SHA-256(record_id|action|student_name|content_after|tag_after|timestamp|prev_hash)

─── 법원 제출 시 권장 절차 ───────────────────────────────────
① 본 증명서(.proof.txt)를 프린트하여 서명 · 날인합니다.
② 원본 JSON 파일과 함께(CD/USB/이메일) 동시 제출합니다.
③ 위 .ots 파일이 함께 저장되어 있다면(인터넷 연결 상태에서 자동 생성):
   약 2~6시간 후 Bitcoin 블록체인에 해시가 포함되어 "이 시점 이전 존재"가
   영구적·수학적으로 증명됩니다. 검증 방법:
   · https://opentimestamps.org 에 접속
   · 원본 JSON 파일과 .ots 파일을 같이 드래그
   · "Verified!" 메시지와 함께 타임스탬프 시각이 표시됨
④ .ots 가 생성 안 된 경우엔 선생님이 직접 웹에서 수동 등록 가능:
   https://opentimestamps.org → 원본 JSON 드래그 → .ots 다운로드 → 함께 보관
⑤ (선택·유료) 더 강한 원본성이 필요하면 공증인 사무소 공증
   (약 2~3만원) 또는 우체국 내용증명(약 1,000원)을 받으면
   국내 법원에서 확실하게 인정됩니다.
⑥ 제출 이후 파일이 한 바이트라도 변경되면 SHA-256 이 완전히
   달라져 즉시 탐지됩니다.

본 증명서는 ${now.toLocaleString('ko-KR', { hour12: false })} 에
${os.hostname()} (${os.userInfo().username}) 에서 SchoolDesk v${appVersion} 에 의해
자동 생성되었습니다.
═══════════════════════════════════════════════════════════════
`
    fs.writeFileSync(proofPath, proof, 'utf8')

    // 다운로드 직후 핵심 안내 다이얼로그 — 사용자가 .ots 파일을 메모장으로 열어 깨졌다고
    // 혼란을 겪지 않도록, 저장 완료 시점에 무조건 한 번 보여준다.
    void dialog.showMessageBox({
      type: 'info',
      title: '학생 기록 저장 완료 — 보관 안내',
      message: `${payload.logs.length}개 로그 저장 완료`,
      detail:
        `다음 ${otsPath ? '3' : '2'}개 파일은 항상 한 세트로 보관해 주세요:\n` +
        `  • ${path.basename(result.filePath)}  (원본 데이터)\n` +
        `  • ${path.basename(proofPath)}  (증명서·읽기용)\n` +
        (otsPath ? `  • ${path.basename(otsPath)}  (비트코인 시간증명·바이너리)\n\n` : '\n') +
        (otsPath ? '⚠️ .ots 파일은 절대 메모장으로 열지 마세요.\n   바이너리 파일이라 깨져 보이는 게 정상이고,\n   열어서 저장하면 무효화됩니다.\n\n' : '') +
        '평소엔 그냥 안전하게 보관만 하시면 됩니다.\n' +
        '민원·분쟁 발생 시 증명서(.proof.txt) 안의 [검증 방법] 참고.\n\n' +
        '권장: 학교 컴퓨터 + 클라우드 + USB 3중 백업',
      buttons: ['알겠습니다'],
      defaultId: 0,
    }).catch(() => { /* 다이얼로그 실패해도 export 자체는 성공 */ })

    return {
      ok: true as const,
      count: payload.logs.length,
      path: result.filePath,
      proofPath,
      otsPath,
      sha256: fileSha256,
    }
  })

  // 일상 확인용: 현재 학생 기록을 CSV 로 내보냄 (Excel/한글에서 바로 열림)
  ipcMain.handle('studentRecord:exportCsv', async () => {
    const result = await dialog.showSaveDialog({
      title: '학생 기록 CSV 저장',
      defaultPath: `학생기록_${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV (Excel/한글)', extensions: ['csv'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false as const, reason: 'canceled' }
    const csv = studentRecordRepo.buildRecordsCsv()
    const count = csv.split('\r\n').length - 1 // BOM+header 한 줄 제외
    fs.writeFileSync(result.filePath, csv, 'utf8')
    return { ok: true as const, count, path: result.filePath }
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

  // Meal — Cloudflare Workers 프록시 우선, 실패 시 NEIS 직접 호출 fallback.
  // Worker 코드 + 배포 가이드: ../../cloudflare-worker/README.md
  const MEAL_WORKER_URL = 'https://schooldesk-meal.simssijjang.workers.dev'
  const fetchWithTimeout = async (url: string, ms = 10000): Promise<Response> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ms)
    try { return await fetch(url, { signal: ctrl.signal }) }
    finally { clearTimeout(timer) }
  }

  ipcMain.handle('meal:searchSchool', async (_e, name: string, apiKey?: string) => {
    if (!name?.trim()) return []
    // 1) Worker 경로 — 캐시 hit 시 즉시 응답
    if (MEAL_WORKER_URL) {
      try {
        const res = await fetchWithTimeout(`${MEAL_WORKER_URL}/school?name=${encodeURIComponent(name.trim())}`)
        if (res.ok) return await res.json()
      } catch { /* worker 실패 → NEIS fallback */ }
    }
    // 2) NEIS 직접 호출 fallback
    const params = new URLSearchParams({ Type: 'json', pIndex: '1', pSize: '20', SCHUL_NM: name.trim() })
    if (apiKey?.trim()) params.set('KEY', apiKey.trim())
    try {
      const res = await fetchWithTimeout(`https://open.neis.go.kr/hub/schoolInfo?${params}`)
      const data = await res.json() as Record<string, unknown>
      const arr = data.schoolInfo as Array<{ row?: Array<Record<string, string>> }> | undefined
      if (!Array.isArray(arr)) return []
      const rows = arr.find((s) => s.row)?.row ?? []
      return rows.map((r) => ({
        scCode: r.ATPT_OFCDC_SC_CODE,
        schoolCode: r.SD_SCHUL_CODE,
        name: r.SCHUL_NM,
        type: r.SCHUL_KND_SC_NM,
        address: r.ORG_RDNMA,
      }))
    } catch { return [] }
  })

  ipcMain.handle('meal:fetchToday', async (_e, scCode: string, schoolCode: string, ymd: string, apiKey?: string) => {
    if (!scCode || !schoolCode || !ymd) return []
    // 1) Worker 경로
    if (MEAL_WORKER_URL) {
      try {
        const url = `${MEAL_WORKER_URL}/meal?scCode=${encodeURIComponent(scCode)}&schoolCode=${encodeURIComponent(schoolCode)}&date=${encodeURIComponent(ymd)}`
        const res = await fetchWithTimeout(url)
        if (res.ok) return await res.json()
      } catch { /* worker 실패 → NEIS fallback */ }
    }
    // 2) NEIS 직접 호출 fallback
    const ymdClean = ymd.replace(/-/g, '')
    const params = new URLSearchParams({
      Type: 'json', pIndex: '1', pSize: '20',
      ATPT_OFCDC_SC_CODE: scCode, SD_SCHUL_CODE: schoolCode, MLSV_YMD: ymdClean,
    })
    if (apiKey?.trim()) params.set('KEY', apiKey.trim())
    try {
      const res = await fetchWithTimeout(`https://open.neis.go.kr/hub/mealServiceDietInfo?${params}`)
      const data = await res.json() as Record<string, unknown>
      const arr = data.mealServiceDietInfo as Array<{ row?: Array<Record<string, string>> }> | undefined
      if (!Array.isArray(arr)) return []
      const rows = arr.find((s) => s.row)?.row ?? []
      const dateStr = ymdClean.length === 8
        ? `${ymdClean.slice(0, 4)}-${ymdClean.slice(4, 6)}-${ymdClean.slice(6, 8)}`
        : ymdClean
      return rows.map((r) => {
        const rawText = r.DDISH_NM ?? ''
        const dishes = rawText
          .split(/<br\s*\/?>/i)
          .map((s) => s.replace(/\s*\([0-9.\s]+\)\s*$/, '').trim())
          .filter(Boolean)
        return {
          date: dateStr,
          mealType: r.MMEAL_SC_NM ?? '중식',
          dishes,
          rawText,
          calInfo: r.CAL_INFO,
        }
      })
    } catch { return [] }
  })

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

  // 암호화 백업/복원 (.sdbackup): BIP39 복구구문 + 비밀번호 envelope encryption.
  registerBackupHandlers()
}
