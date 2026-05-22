/**
 * Application-level 데이터 마이그레이션.
 *
 * migrations.ts 는 순수 SQL exec 기반이라 JS 변환(예: 컬럼 암호화)이 불가능.
 * 여기서 _migrations 테이블의 진행 플래그(prefix 'data:')를 사용해 1회성 변환을 수행한다.
 *
 * 호출 위치: connection.ts 에서 runMigrations(db) 직후.
 *   - 스키마 보장 후에 row 변환을 하기 위해 순서가 중요하다.
 *   - safeStorage 비가용 등으로 키가 없으면 진행 플래그를 찍지 않고 skip → 다음 부팅 때 자동 재시도.
 */

import type Database from 'better-sqlite3'
import { encryptField, isFieldEncrypted, isMasterKeyAvailable } from '../lib/student-record-crypto'

const FLAG_ENCRYPT_STUDENT_RECORDS = 'data:018_encrypt_student_records'

function hasFlag(db: Database.Database, name: string): boolean {
  const row = db.prepare('SELECT name FROM _migrations WHERE name = ?').get(name)
  return !!row
}

function setFlag(db: Database.Database, name: string): void {
  db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name)
}

function maybeEncrypt(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value)
  if (s === '' || isFieldEncrypted(s)) return s
  return encryptField(s)
}

function encryptStudentRecords(db: Database.Database): void {
  if (hasFlag(db, FLAG_ENCRYPT_STUDENT_RECORDS)) return
  if (!isMasterKeyAvailable()) {
    // 키 없으면 마이그레이션 skip — 다음 부팅 때 재시도 (플래그 안 찍음).
    console.warn('[data-migration] master key unavailable, skipping student-record encryption')
    return
  }

  const records = db.prepare('SELECT id, student_name, content, tag FROM student_records').all() as Array<{
    id: string
    student_name: string
    content: string
    tag: string
  }>

  const logs = db.prepare(
    'SELECT id, student_name, content_before, content_after, tag_before, tag_after FROM student_record_logs',
  ).all() as Array<{
    id: number
    student_name: string
    content_before: string | null
    content_after: string | null
    tag_before: string | null
    tag_after: string | null
  }>

  const recStmt = db.prepare(
    'UPDATE student_records SET student_name = ?, content = ?, tag = ? WHERE id = ?',
  )
  const logStmt = db.prepare(
    `UPDATE student_record_logs
       SET student_name = ?, content_before = ?, content_after = ?, tag_before = ?, tag_after = ?
       WHERE id = ?`,
  )

  let recCount = 0
  let logCount = 0

  db.transaction(() => {
    for (const r of records) {
      const ns = maybeEncrypt(r.student_name) ?? ''
      const nc = maybeEncrypt(r.content) ?? ''
      const nt = maybeEncrypt(r.tag) ?? ''
      if (ns !== r.student_name || nc !== r.content || nt !== r.tag) {
        recStmt.run(ns, nc, nt, r.id)
        recCount++
      }
    }
    for (const l of logs) {
      const ns = maybeEncrypt(l.student_name) ?? ''
      const ncb = maybeEncrypt(l.content_before)
      const nca = maybeEncrypt(l.content_after)
      const ntb = maybeEncrypt(l.tag_before)
      const nta = maybeEncrypt(l.tag_after)
      const changed =
        ns !== l.student_name ||
        ncb !== l.content_before ||
        nca !== l.content_after ||
        ntb !== l.tag_before ||
        nta !== l.tag_after
      if (changed) {
        logStmt.run(ns, ncb, nca, ntb, nta, l.id)
        logCount++
      }
    }
    setFlag(db, FLAG_ENCRYPT_STUDENT_RECORDS)
  })()

  console.log(`[data-migration] encrypted student records=${recCount}/${records.length}, logs=${logCount}/${logs.length}`)
}

export function runDataMigrations(db: Database.Database): void {
  encryptStudentRecords(db)
}
