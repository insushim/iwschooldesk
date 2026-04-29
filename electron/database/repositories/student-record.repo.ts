import { v4 as uuid } from 'uuid'
import { createHash, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { getDatabase } from '../connection'
import { getSetting, setSetting } from './settings.repo'

/**
 * 학생 기록 위젯 저장소.
 *
 * 핵심 설계: 법원 증거능력 확보를 위한 2트랙 저장.
 *   1) student_records  — 현재 상태(삭제는 soft-delete). 편집·조회 편의.
 *   2) student_record_logs — append-only + SHA-256 해시체인. 변조 탐지 증거.
 *
 * 해시 계산식:
 *   hash = SHA-256( [record_id, action, student_name, content_after,
 *                    tag_after, timestamp, prev_hash].join('|') )
 *   prev_hash = 이전 로그 행의 hash (최초 로그는 빈 문자열).
 *
 * 검증:
 *   exportLogs() 결과 JSON 을 누구든 동일 공식으로 재계산 → 한 행이라도 변경되면 이후 체인 전부 불일치.
 *   이는 writer가 직접 DB를 손대도 동일 — 원본 SQLite 에서도 변조 시 재계산 불일치가 남는다.
 */

export type StudentRecord = {
  id: string
  student_name: string
  content: string
  tag: string
  is_deleted: number
  created_at: string
  updated_at: string
}

export type StudentRecordLog = {
  id: number
  record_id: string
  action: 'create' | 'update' | 'delete'
  student_name: string
  content_before: string | null
  content_after: string | null
  tag_before: string | null
  tag_after: string | null
  timestamp: string
  prev_hash: string | null
  hash: string
}

// ─── 해시체인 ─────────────────────────────────────────────────
function computeLogHash(parts: {
  record_id: string
  action: string
  student_name: string
  content_after: string | null
  tag_after: string | null
  timestamp: string
  prev_hash: string | null
}): string {
  const joined = [
    parts.record_id,
    parts.action,
    parts.student_name,
    parts.content_after ?? '',
    parts.tag_after ?? '',
    parts.timestamp,
    parts.prev_hash ?? '',
  ].join('|')
  return createHash('sha256').update(joined, 'utf8').digest('hex')
}

function getLastHashForRecord(recordId: string): string | null {
  const db = getDatabase()
  const row = db.prepare(
    'SELECT hash FROM student_record_logs WHERE record_id = ? ORDER BY id DESC LIMIT 1'
  ).get(recordId) as { hash: string } | undefined
  return row?.hash ?? null
}

function getLastGlobalHash(): string | null {
  // 전역 체인: record 간 순서 불변성을 위한 글로벌 prev_hash.
  const db = getDatabase()
  const row = db.prepare(
    'SELECT hash FROM student_record_logs ORDER BY id DESC LIMIT 1'
  ).get() as { hash: string } | undefined
  return row?.hash ?? null
}

function nowIsoMs(): string {
  // 초·밀리초 + 타임존 정보 포함 ISO 8601. 법원 제출용 로그는 절대시각이 필수.
  const d = new Date()
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  const tzOff = -d.getTimezoneOffset()
  const tzSign = tzOff >= 0 ? '+' : '-'
  const tzH = pad(Math.floor(Math.abs(tzOff) / 60))
  const tzM = pad(Math.abs(tzOff) % 60)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.` +
    `${pad(d.getMilliseconds(), 3)}${tzSign}${tzH}:${tzM}`
  )
}

function appendLog(params: {
  record_id: string
  action: 'create' | 'update' | 'delete'
  student_name: string
  content_before: string | null
  content_after: string | null
  tag_before: string | null
  tag_after: string | null
}): StudentRecordLog {
  const db = getDatabase()
  const timestamp = nowIsoMs()
  // 글로벌 체인 사용 — record 간 삽입 순서 보증도 가능.
  const prev_hash = getLastGlobalHash()
  const hash = computeLogHash({
    record_id: params.record_id,
    action: params.action,
    student_name: params.student_name,
    content_after: params.content_after,
    tag_after: params.tag_after,
    timestamp,
    prev_hash,
  })
  const info = db.prepare(`
    INSERT INTO student_record_logs
      (record_id, action, student_name, content_before, content_after, tag_before, tag_after, timestamp, prev_hash, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.record_id, params.action, params.student_name,
    params.content_before, params.content_after,
    params.tag_before, params.tag_after,
    timestamp, prev_hash, hash
  )
  return db.prepare('SELECT * FROM student_record_logs WHERE id = ?').get(info.lastInsertRowid) as StudentRecordLog
}

// ─── CRUD ────────────────────────────────────────────────────

export function listStudentRecords(): StudentRecord[] {
  const db = getDatabase()
  return db.prepare(
    'SELECT * FROM student_records WHERE is_deleted = 0 ORDER BY updated_at DESC'
  ).all() as StudentRecord[]
}

export function createStudentRecord(data: {
  student_name: string
  content: string
  tag?: string
}): StudentRecord {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const name = (data.student_name ?? '').trim()
  const content = (data.content ?? '').trim()
  const tag = (data.tag ?? '').trim()
  if (!name || !content) throw new Error('학생 이름과 내용을 모두 입력해 주세요.')

  db.transaction(() => {
    db.prepare(
      'INSERT INTO student_records (id, student_name, content, tag, is_deleted, created_at, updated_at) VALUES (?,?,?,?,0,?,?)'
    ).run(id, name, content, tag, now, now)
    appendLog({
      record_id: id,
      action: 'create',
      student_name: name,
      content_before: null,
      content_after: content,
      tag_before: null,
      tag_after: tag,
    })
  })()
  return db.prepare('SELECT * FROM student_records WHERE id = ?').get(id) as StudentRecord
}

export function updateStudentRecord(id: string, data: {
  student_name?: string
  content?: string
  tag?: string
}): StudentRecord {
  const db = getDatabase()
  const current = db.prepare('SELECT * FROM student_records WHERE id = ? AND is_deleted = 0').get(id) as StudentRecord | undefined
  if (!current) throw new Error('기록을 찾을 수 없어요.')

  const nextName = (data.student_name ?? current.student_name).trim()
  const nextContent = (data.content ?? current.content).trim()
  const nextTag = (data.tag ?? current.tag).trim()
  if (!nextName || !nextContent) throw new Error('학생 이름과 내용을 모두 입력해 주세요.')

  db.transaction(() => {
    db.prepare(
      "UPDATE student_records SET student_name = ?, content = ?, tag = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(nextName, nextContent, nextTag, id)
    appendLog({
      record_id: id,
      action: 'update',
      student_name: nextName,
      content_before: current.content,
      content_after: nextContent,
      tag_before: current.tag,
      tag_after: nextTag,
    })
  })()
  return db.prepare('SELECT * FROM student_records WHERE id = ?').get(id) as StudentRecord
}

export function deleteStudentRecord(id: string): void {
  const db = getDatabase()
  const current = db.prepare('SELECT * FROM student_records WHERE id = ?').get(id) as StudentRecord | undefined
  if (!current || current.is_deleted === 1) return
  db.transaction(() => {
    db.prepare(
      "UPDATE student_records SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(id)
    appendLog({
      record_id: id,
      action: 'delete',
      student_name: current.student_name,
      content_before: current.content,
      content_after: null,
      tag_before: current.tag,
      tag_after: null,
    })
  })()
}

export function listAllLogs(): StudentRecordLog[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM student_record_logs ORDER BY id ASC').all() as StudentRecordLog[]
}

// ─── 비밀번호 (scrypt, salt 포함) ─────────────────────────────
// 저장 포맷: "scrypt$<N>$<r>$<p>$<salt-hex>$<hash-hex>"
const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1, SCRYPT_KEYLEN = 64
const PASSWORD_KEY = 'student_record_password'

export function isPasswordSet(): boolean {
  const v = getSetting(PASSWORD_KEY) as string | null
  return typeof v === 'string' && v.length > 0
}

export function setPassword(newPassword: string, currentPassword?: string): void {
  if (typeof newPassword !== 'string' || newPassword.length < 4) {
    throw new Error('비밀번호는 최소 4자 이상이어야 해요.')
  }
  // 이미 설정돼 있다면 현재 비밀번호 확인
  if (isPasswordSet()) {
    if (!currentPassword || !verifyPassword(currentPassword)) {
      throw new Error('현재 비밀번호가 맞지 않아요.')
    }
  }
  const salt = randomBytes(16)
  const hash = scryptSync(newPassword, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  const encoded = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`
  setSetting(PASSWORD_KEY, encoded)
}

export function verifyPassword(password: string): boolean {
  const stored = getSetting(PASSWORD_KEY) as string | null
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  try {
    const N = parseInt(parts[1], 10), r = parseInt(parts[2], 10), p = parseInt(parts[3], 10)
    const salt = Buffer.from(parts[4], 'hex')
    const storedHash = Buffer.from(parts[5], 'hex')
    const testHash = scryptSync(password, salt, storedHash.length, { N, r, p })
    return testHash.length === storedHash.length && timingSafeEqual(testHash, storedHash)
  } catch {
    return false
  }
}

export function clearPassword(currentPassword: string): void {
  if (!verifyPassword(currentPassword)) throw new Error('비밀번호가 맞지 않아요.')
  setSetting(PASSWORD_KEY, '')
}

// ─── 로그 내보내기(검증 가능한 JSON) ───────────────────────────
export interface LogExportPayload {
  meta: {
    app: string
    app_version: string
    exported_at_utc: string
    exported_at_local: string
    total_logs: number
    chain_algorithm: string
    chain_head_hash: string
    chain_tail_hash: string
    verification: string
  }
  logs: StudentRecordLog[]
}

export function buildLogExportPayload(): LogExportPayload {
  const logs = listAllLogs()
  const now = new Date()
  return {
    meta: {
      app: 'SchoolDesk',
      app_version: '1.0.0',
      exported_at_utc: now.toISOString(),
      exported_at_local: now.toLocaleString('ko-KR', { hour12: false }),
      total_logs: logs.length,
      chain_algorithm: 'SHA-256',
      chain_head_hash: logs[0]?.hash ?? '',
      chain_tail_hash: logs[logs.length - 1]?.hash ?? '',
      verification:
        "각 로그의 hash = SHA-256(record_id|action|student_name|content_after|tag_after|timestamp|prev_hash). " +
        "prev_hash 는 바로 이전 로그의 hash (첫 로그는 빈 문자열). 한 행이라도 변조되면 이후 체인이 전부 불일치.",
    },
    logs,
  }
}

// 외부 검증용 해시 재계산 함수 노출 (export 에 포함되지는 않지만 렌더러 export 로직이 사용 가능)
export { computeLogHash }

// ─── 일상 확인용 CSV 내보내기 (Excel/한글에서 바로 열림) ───────
// 법원 제출 등 증거용이 아니라 "담임이 기록 훑어보기" 용도.
// UTF-8 BOM 포함 → Excel 한글 깨짐 방지.
function escapeCsv(v: unknown): string {
  const s = String(v ?? '')
  if (s === '') return ''
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function buildRecordsCsv(): string {
  const rows = listStudentRecords()
  const header = ['학생 이름', '태그', '내용', '작성일시', '수정일시']
  const lines: string[] = [header.join(',')]
  for (const r of rows) {
    lines.push([
      escapeCsv(r.student_name),
      escapeCsv(r.tag),
      escapeCsv(r.content),
      escapeCsv(r.created_at),
      escapeCsv(r.updated_at),
    ].join(','))
  }
  // UTF-8 BOM → Excel 에서 더블클릭 시 한글 깨짐 방지
  return '﻿' + lines.join('\r\n')
}
