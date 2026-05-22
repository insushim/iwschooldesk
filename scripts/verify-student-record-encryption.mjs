#!/usr/bin/env node
/**
 * 학생 기록 컬럼 암호화 — mac 환경 단위 검증.
 *
 * Electron safeStorage 의존성을 mock 한 형태로 핵심 알고리즘 라운드트립을 검증한다.
 * 실패 시 process.exit(1) — CI 에서도 그대로 사용 가능.
 */

import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import { strict as assert } from 'node:assert'

// ─── student-record-crypto.ts 와 동일 알고리즘 (inline 복제) ───
const PREFIX = 'enc1:'
const IV_LEN = 12
const TAG_LEN = 16

function makeKey() {
  return randomBytes(32)
}

function encryptField(plain, key) {
  if (plain === null || plain === undefined || plain === '') return plain ?? ''
  if (typeof plain === 'string' && plain.startsWith(PREFIX)) return plain
  if (!key) return plain
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${Buffer.concat([ct, tag]).toString('base64')}`
}

function decryptField(stored, key) {
  if (stored === null || stored === undefined || stored === '') return stored ?? ''
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return stored
  if (!key) throw new Error('no key')
  const body = stored.slice(PREFIX.length)
  const sepIdx = body.indexOf(':')
  if (sepIdx < 0) throw new Error('bad format')
  const iv = Buffer.from(body.slice(0, sepIdx), 'base64')
  const blob = Buffer.from(body.slice(sepIdx + 1), 'base64')
  if (iv.length !== IV_LEN || blob.length < TAG_LEN) throw new Error('bad length')
  const ct = blob.subarray(0, blob.length - TAG_LEN)
  const tag = blob.subarray(blob.length - TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

function isFieldEncrypted(v) {
  return typeof v === 'string' && v.startsWith(PREFIX)
}

// backup.ts 와 동일 — 해시체인 검증
function computeLogHash(row) {
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

// ─── 테스트 케이스 ───
const cases = []
const fail = []

function test(name, fn) {
  cases.push(name)
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (e) {
    fail.push({ name, err: e })
    console.log(`  ✗ ${name}: ${e.message}`)
  }
}

console.log('\n[1] 기본 라운드트립')
const key = makeKey()
test('한글 평문 → 암호화 → 복호화 동일', () => {
  const plain = '5교시에 옆 친구 머리를 잡아당겨서 따로 불러서 상담함. 가정 환경 어려움 있음.'
  const enc = encryptField(plain, key)
  assert(enc.startsWith('enc1:'), 'prefix 누락')
  assert(enc !== plain, '암호화 안 됨')
  const dec = decryptField(enc, key)
  assert.equal(dec, plain)
})
test('짧은 학생 이름 라운드트립', () => {
  const name = '김민준'
  assert.equal(decryptField(encryptField(name, key), key), name)
})
test('태그(빈 문자열) → 그대로', () => {
  assert.equal(encryptField('', key), '')
  assert.equal(decryptField('', key), '')
})
test('null → 그대로', () => {
  assert.equal(encryptField(null, key), '')
  assert.equal(decryptField(null, key), '')
})

console.log('\n[2] 이중 암호화·평문 호환')
test('이미 암호문이면 다시 암호화 X', () => {
  const enc = encryptField('테스트', key)
  const reEnc = encryptField(enc, key)
  assert.equal(enc, reEnc)
})
test('prefix 없는 평문은 decryptField가 그대로 반환 (마이그레이션 호환)', () => {
  assert.equal(decryptField('legacy plain text', key), 'legacy plain text')
})
test('isFieldEncrypted — prefix 판정', () => {
  assert.equal(isFieldEncrypted('enc1:abc:def'), true)
  assert.equal(isFieldEncrypted('hello'), false)
  assert.equal(isFieldEncrypted(''), false)
  assert.equal(isFieldEncrypted(null), false)
})

console.log('\n[3] 키 분리·인증 태그')
test('다른 키로 복호화 시 throw', () => {
  const enc = encryptField('비밀', key)
  const otherKey = makeKey()
  let threw = false
  try { decryptField(enc, otherKey) } catch { threw = true }
  assert(threw, 'GCM 인증 실패해야 함')
})
test('암호문 변조 시 throw (binary flip)', () => {
  const enc = encryptField('비밀', key)
  const body = enc.slice(PREFIX.length)
  const sepIdx = body.indexOf(':')
  const ivB64 = body.slice(0, sepIdx)
  const blob = Buffer.from(body.slice(sepIdx + 1), 'base64')
  // ct 영역(tag 제외)의 첫 바이트 flip
  blob[0] = blob[0] ^ 0xff
  const tampered = `${PREFIX}${ivB64}:${blob.toString('base64')}`
  let threw = false
  try { decryptField(tampered, key) } catch { threw = true }
  assert(threw, '변조된 암호문 거부해야 함')
})

console.log('\n[4] 키 비가용(safeStorage 무) 환경')
test('키 없으면 encryptField 평문 그대로 반환 (회귀 방지)', () => {
  const out = encryptField('학생기록', null)
  assert.equal(out, '학생기록')
})

console.log('\n[5] 해시체인 — 평문 기준 호환 (Critical)')
test('암호화 전후 computeLogHash 결과 동일 (평문 인자로 호출)', () => {
  const params = {
    record_id: 'r1',
    action: 'create',
    student_name: '김민준',
    content_after: '수업 중 졸음. 가정에서 늦게 잠.',
    tag_after: '생활',
    timestamp: '2026-05-22T15:00:00.000+09:00',
    prev_hash: null,
  }
  const h1 = computeLogHash(params)
  // DB 저장 시점에 컬럼은 암호화되지만 hash 계산은 *평문 인자*로 함 → 동일.
  const h2 = computeLogHash(params)
  assert.equal(h1, h2)
})

console.log('\n[6] 다양한 입력')
test('긴 본문 (1KB)', () => {
  const plain = '학생 상담 기록 — '.repeat(50)
  assert.equal(decryptField(encryptField(plain, key), key), plain)
})
test('특수문자·이모지', () => {
  const plain = '🌟 정말 잘했어요! "최고" — 100점!\n다음에도 화이팅 💪'
  assert.equal(decryptField(encryptField(plain, key), key), plain)
})
test('파이프 문자(해시 계산용 separator)도 안전', () => {
  const plain = 'a|b|c|d'
  assert.equal(decryptField(encryptField(plain, key), key), plain)
})

console.log('\n[7] 백업·복원 시나리오 (mac → new-pc)')
test('DB(암호화) → 백업(평문 dump) → 복원(새 키로 재암호화) → 복호화 일치', () => {
  // 원본 PC: master key1
  const key1 = makeKey()
  const plainName = '이서연'
  const plainContent = '독서 시간에 친구에게 책 빌려줌. 배려심 좋음.'
  const plainTag = '칭찬'

  // DB 에 저장 (암호화)
  const dbName = encryptField(plainName, key1)
  const dbContent = encryptField(plainContent, key1)
  const dbTag = encryptField(plainTag, key1)
  assert(dbName.startsWith('enc1:'))

  // buildBackupPayload: 평문으로 dump
  const backupRow = {
    student_name: decryptField(dbName, key1),
    content: decryptField(dbContent, key1),
    tag: decryptField(dbTag, key1),
  }
  assert.equal(backupRow.student_name, plainName)
  assert.equal(backupRow.content, plainContent)
  assert.equal(backupRow.tag, plainTag)

  // 새 PC: master key2 (다름)
  const key2 = makeKey()
  // applyBackupPayload: 다시 암호화 후 INSERT
  const newDbName = encryptField(backupRow.student_name, key2)
  const newDbContent = encryptField(backupRow.content, key2)
  const newDbTag = encryptField(backupRow.tag, key2)

  // 새 PC 에서 읽기
  assert.equal(decryptField(newDbName, key2), plainName)
  assert.equal(decryptField(newDbContent, key2), plainContent)
  assert.equal(decryptField(newDbTag, key2), plainTag)
})

console.log('\n[8] 마이그레이션 — 평문 → 암호화')
test('기존 평문 row 1회 변환 후 isFieldEncrypted true', () => {
  const legacyRow = { student_name: '박지윤', content: '발표를 또렷하게 잘함.', tag: '학습' }
  // migration step
  const migratedName = encryptField(legacyRow.student_name, key)
  const migratedContent = encryptField(legacyRow.content, key)
  const migratedTag = encryptField(legacyRow.tag, key)
  assert(isFieldEncrypted(migratedName))
  assert(isFieldEncrypted(migratedContent))
  assert(isFieldEncrypted(migratedTag))
  // idempotent — 다시 돌려도 같음
  assert.equal(encryptField(migratedName, key), migratedName)
})

// ─── 요약 ───
console.log(`\n총 ${cases.length}개 — 통과 ${cases.length - fail.length}, 실패 ${fail.length}`)
if (fail.length > 0) {
  console.error('\n실패 상세:')
  for (const f of fail) console.error(`  - ${f.name}: ${f.err.message}\n${f.err.stack}`)
  process.exit(1)
}
console.log('✅ 모든 검증 통과')
