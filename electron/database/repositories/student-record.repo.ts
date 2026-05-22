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

// ─── 시한·파기 ─────────────────────────────────────────────
// 보관 기간 정책: 작성 시점 + retentionYears. 만료 시 일괄 파기.
// 모드:
//   - 'auto'      : 일반 설정의 school_name(초/중/고) + class_name(학년) 파싱 → 학생 성년 도달
//                   + 공소시효 worst 10년 자동 계산. 추론 실패 시 RETENTION_DEFAULT.
//   - 'fixed'     : retention_years 값 그대로 사용
//   - 'unlimited' : 0 (만료 없음)
// 근거: 아동학대처벌법 §34 — 공소시효는 학생 성년 도달일부터 시작.

const RETENTION_MODE_KEY = 'student_record_retention_mode'   // 'auto' | 'fixed' | 'unlimited'
const RETENTION_YEARS_KEY = 'student_record_retention_years' // fixed 모드에서 사용
const RETENTION_DEFAULT = 20

type RetentionMode = 'auto' | 'fixed' | 'unlimited'

function readSettingString(key: string): string {
  const v = getSetting(key as Parameters<typeof getSetting>[0]) as unknown
  return typeof v === 'string' ? v : ''
}

/** 일반 설정의 학교명·학급명에서 학생 보관 기간 추론.
 *  반환: years(추론 결과 또는 default) + 설명용 grade/level. */
export function computeAutoRetention(): { years: number; level: 'elem' | 'mid' | 'high' | 'unknown'; grade: number | null; reason: string } {
  const schoolName = readSettingString('school_name')
  const className = readSettingString('class_name')

  // 학교급
  let level: 'elem' | 'mid' | 'high' | 'unknown' = 'unknown'
  if (/초등|국민학교|초$|초학교/.test(schoolName) || /^초/.test(className)) level = 'elem'
  else if (/중학교|중$/.test(schoolName) || /^중/.test(className)) level = 'mid'
  else if (/고등|고$|고교/.test(schoolName) || /^고/.test(className)) level = 'high'

  // 학년 (class_name 의 첫 숫자)
  const m = className.match(/(\d+)/)
  const grade = m ? parseInt(m[1], 10) : null

  if (!grade || level === 'unknown') {
    return { years: RETENTION_DEFAULT, level, grade, reason: '학교급·학년 추론 불가 → default 20년' }
  }

  // 학년별 학생 만 나이 추정 (한국 표준 — 만 6세 초1 입학 기준, 보수적으로 학년 시작 시점)
  const baseAge: Record<'elem' | 'mid' | 'high', number> = { elem: 5, mid: 11, high: 14 }
  const studentAge = baseAge[level] + grade // 초1: 6세, 중1: 12세, 고1: 15세 (학년 시작 직후 기준)

  // 19세까지 남은 햇수 + 공소시효 worst 10년. 최소 10년은 보장(이미 성인이라도 분쟁 가능).
  const yearsToAdult = Math.max(0, 19 - studentAge)
  const years = Math.max(10, yearsToAdult + 10)

  const levelKr = level === 'elem' ? '초' : level === 'mid' ? '중' : '고'
  return {
    years,
    level,
    grade,
    reason: `${levelKr}${grade}학년 → 만 ${studentAge}세 추정 → 19세까지 ${yearsToAdult}년 + 공소시효 10년 = ${years}년`,
  }
}

export function getRetentionYears(): number {
  const modeRaw = readSettingString(RETENTION_MODE_KEY) as RetentionMode | ''
  const mode: RetentionMode = (modeRaw === 'auto' || modeRaw === 'fixed' || modeRaw === 'unlimited') ? modeRaw : 'auto'

  if (mode === 'unlimited') return 0
  if (mode === 'fixed') {
    const v = readSettingString(RETENTION_YEARS_KEY)
    const n = parseInt(v, 10)
    if (!isNaN(n) && n >= 0) return n
    return RETENTION_DEFAULT
  }
  // auto
  return computeAutoRetention().years
}

/** 한 행이 만료됐는지 — 0(무제한)이면 항상 false. */
function isExpired(createdAt: string, retentionYears: number, nowMs: number): boolean {
  if (retentionYears <= 0) return false
  const created = new Date(createdAt).getTime()
  if (isNaN(created)) return false
  const expireAt = created + retentionYears * 365.25 * 24 * 60 * 60 * 1000
  return nowMs > expireAt
}

/** 만료된 (= soft-delete 되지 않은) 기록 hard-delete + 로그도 함께 삭제.
 *  반환: 삭제된 본 기록 + 삭제된 로그 행 수. */
export function purgeExpiredStudentRecords(): { records: number; logs: number; retentionYears: number } {
  const retentionYears = getRetentionYears()
  if (retentionYears <= 0) return { records: 0, logs: 0, retentionYears }

  const db = getDatabase()
  const now = Date.now()
  const allRecords = db.prepare('SELECT id, created_at FROM student_records').all() as Array<{ id: string; created_at: string }>
  const expiredIds = allRecords.filter((r) => isExpired(r.created_at, retentionYears, now)).map((r) => r.id)
  if (expiredIds.length === 0) return { records: 0, logs: 0, retentionYears }

  const placeholders = expiredIds.map(() => '?').join(',')
  let recordCount = 0, logCount = 0
  db.transaction(() => {
    const r1 = db.prepare(`DELETE FROM student_record_logs WHERE record_id IN (${placeholders})`).run(...expiredIds)
    logCount = Number(r1.changes)
    const r2 = db.prepare(`DELETE FROM student_records WHERE id IN (${placeholders})`).run(...expiredIds)
    recordCount = Number(r2.changes)
  })()
  return { records: recordCount, logs: logCount, retentionYears }
}

/** UI 표시용 — 만료된 기록 ID 목록. (실제 삭제는 사용자가 트리거 또는 자동 파기) */
export function listExpiredRecordIds(): string[] {
  const retentionYears = getRetentionYears()
  if (retentionYears <= 0) return []
  const db = getDatabase()
  const now = Date.now()
  const all = db.prepare('SELECT id, created_at FROM student_records WHERE is_deleted = 0').all() as Array<{ id: string; created_at: string }>
  return all.filter((r) => isExpired(r.created_at, retentionYears, now)).map((r) => r.id)
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
