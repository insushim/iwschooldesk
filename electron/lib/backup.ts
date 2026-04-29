/**
 * SchoolDesk 전체 백업/복원 빌더.
 *
 * 대상 데이터:
 *   (A) 일반 위젯 테이블 (schedules, tasks, memos, timetable_*, checklists*,
 *       sections, dday_events, settings, widget_positions, routines*, goals)
 *   (B) 학생 기록 트랙 (student_records + student_record_logs)
 *       → 해시체인을 그대로 복원해야 법원 증거력이 유지됨.
 *
 * 복원 시 주의:
 *   - student_record_logs 는 그대로 INSERT (체인 검증 후).
 *   - student_records 의 is_deleted 까지 포함.
 *   - settings 의 student_record_password 도 복원 (새 기기에서도 같은 비번으로 잠김 유지).
 *
 * 체인 검증:
 *   JS 로 재계산한 hash 가 파일에 저장된 hash 와 다르면 payload 를 거부.
 *   → 백업 파일이 중간에서 변조되었거나 (envelope GCM 으로 사실상 불가능하지만
 *      이중 방어), 애초에 DB 체인이 깨져 있던 상태였음을 탐지.
 */

import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'

export const BACKUP_EXPORT_TABLES = [
  // 일반 위젯 데이터
  'schedules', 'tasks', 'memos',
  'timetable_slots', 'timetable_periods', 'timetable_overrides',
  'checklists', 'checklist_items',
  'sections', 'dday_events',
  'settings', 'widget_positions',
  'routines', 'routine_items', 'routine_completions',
  'goals',
  // 학생 기록
  'student_records', 'student_record_logs',
] as const

export type BackupTable = typeof BACKUP_EXPORT_TABLES[number]

export interface BackupMeta {
  app: 'SchoolDesk'
  app_version: string
  format_version: 1
  created_at_utc: string
  created_at_local: string
  host: string
  user: string
  row_counts: Record<string, number>
  chain_head_hash: string
  chain_tail_hash: string
  chain_total_logs: number
  /** 설명서 — 복원자/검수자가 읽고 이해할 수 있게 한국어. */
  note: string
}

export interface BackupPayload {
  meta: BackupMeta
  data: Record<string, unknown[]>
}

/** 학생기록 해시체인 검증: 각 로그의 hash 를 재계산하여 원본과 비교. */
export interface ChainVerifyResult {
  ok: boolean
  total: number
  firstMismatchIndex: number | null
  firstMismatchId: number | null
}

function computeLogHash(row: {
  record_id: string
  action: string
  student_name: string
  content_after: string | null
  tag_after: string | null
  timestamp: string
  prev_hash: string | null
}): string {
  const joined = [
    row.record_id,
    row.action,
    row.student_name,
    row.content_after ?? '',
    row.tag_after ?? '',
    row.timestamp,
    row.prev_hash ?? '',
  ].join('|')
  return createHash('sha256').update(joined, 'utf8').digest('hex')
}

export function verifyLogsChain(
  logs: Array<Record<string, unknown>>,
): ChainVerifyResult {
  for (let i = 0; i < logs.length; i++) {
    const row = logs[i] as {
      id?: number
      record_id?: string
      action?: string
      student_name?: string
      content_after?: string | null
      tag_after?: string | null
      timestamp?: string
      prev_hash?: string | null
      hash?: string
    }
    if (!row.record_id || !row.action || !row.student_name || !row.timestamp || !row.hash) {
      return { ok: false, total: logs.length, firstMismatchIndex: i, firstMismatchId: row.id ?? null }
    }
    const expected = computeLogHash({
      record_id: row.record_id,
      action: row.action,
      student_name: row.student_name,
      content_after: row.content_after ?? null,
      tag_after: row.tag_after ?? null,
      timestamp: row.timestamp,
      prev_hash: row.prev_hash ?? null,
    })
    if (expected !== row.hash) {
      return { ok: false, total: logs.length, firstMismatchIndex: i, firstMismatchId: row.id ?? null }
    }
  }
  return { ok: true, total: logs.length, firstMismatchIndex: null, firstMismatchId: null }
}

/** 모든 테이블을 SELECT * 하여 백업 payload JSON 객체를 구성. */
export function buildBackupPayload(params: {
  db: Database.Database
  appVersion: string
  host: string
  user: string
}): BackupPayload {
  const { db, appVersion, host, user } = params
  const data: Record<string, unknown[]> = {}
  const rowCounts: Record<string, number> = {}

  for (const table of BACKUP_EXPORT_TABLES) {
    // table 은 상수 배열에서만 오므로 동적 주입 불가
    const rows = db.prepare(`SELECT * FROM ${table}`).all() as unknown[]
    data[table] = rows
    rowCounts[table] = rows.length
  }

  const logs = data['student_record_logs'] as Array<Record<string, unknown>>
  const head = logs[0]?.hash as string | undefined
  const tail = logs[logs.length - 1]?.hash as string | undefined

  const now = new Date()
  const meta: BackupMeta = {
    app: 'SchoolDesk',
    app_version: appVersion,
    format_version: 1,
    created_at_utc: now.toISOString(),
    created_at_local: now.toLocaleString('ko-KR', { hour12: false }),
    host,
    user,
    row_counts: rowCounts,
    chain_head_hash: head ?? '',
    chain_tail_hash: tail ?? '',
    chain_total_logs: logs.length,
    note:
      '이 파일은 SchoolDesk 교사 개인 업무 자료의 암호화 백업입니다. ' +
      '공식 학교 생활기록부와는 별개이며, 교사가 관찰·지도·상담 과정에서 남긴 개인 메모입니다. ' +
      '학생기록의 hash 체인은 SHA-256 append-only 로 복원 시에도 그대로 보존됩니다.',
  }

  return { meta, data }
}

/**
 * 백업 payload 를 현재 DB 에 적용 (REPLACE 전략).
 * 화이트리스트 기반 안전 INSERT — 모르는 테이블/컬럼은 무시.
 *
 * 학생기록 로그(append-only)는 새 기기에서 "빈 체인에 이어붙이기" 가 아닌
 * "이 백업의 체인을 통째로 복원" 이다. 복원 후 신규 기록이 추가되면 마지막 hash 위에 이어진다.
 */
export function applyBackupPayload(params: {
  db: Database.Database
  payload: BackupPayload
  allowedTables: Set<string>
  allowedColumns: Record<string, Set<string>>
}): { replacedTables: string[]; totalInserted: number; skippedTables: string[] } {
  const { db, payload, allowedTables, allowedColumns } = params
  const replaced: string[] = []
  const skipped: string[] = []
  let inserted = 0

  db.transaction(() => {
    // 1) 허용 테이블 전체 비움
    for (const table of allowedTables) {
      db.prepare(`DELETE FROM ${table}`).run()
    }
    // 2) 복원
    for (const [table, rowsUnknown] of Object.entries(payload.data)) {
      if (!allowedTables.has(table)) {
        skipped.push(table)
        continue
      }
      const rows = rowsUnknown as Array<Record<string, unknown>>
      if (!Array.isArray(rows) || rows.length === 0) continue
      const cols = allowedColumns[table]
      if (!cols) {
        skipped.push(table)
        continue
      }
      // 첫 행 기준 컬럼 추출 (화이트리스트와 교집합)
      const firstRow = rows[0]
      const useCols = Object.keys(firstRow).filter((c) => cols.has(c))
      if (useCols.length === 0) continue
      const placeholders = useCols.map(() => '?').join(', ')
      const stmt = db.prepare(
        `INSERT INTO ${table} (${useCols.join(', ')}) VALUES (${placeholders})`,
      )
      for (const row of rows) {
        stmt.run(...useCols.map((c) => (row as Record<string, unknown>)[c] ?? null))
        inserted++
      }
      replaced.push(table)
    }
  })()

  return { replacedTables: replaced, totalInserted: inserted, skippedTables: skipped }
}
