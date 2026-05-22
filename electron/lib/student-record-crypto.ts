/**
 * 학생 기록 컬럼 암호화 (AES-256-GCM).
 *
 * 보호 목적: PIPA §29 안전조치 의무 대응 + DB Browser·디스크 분리 시 평문 노출 차단.
 *
 * 저장 포맷: "enc1:<base64(iv 12B)>:<base64(ciphertext||tag 16B)>"
 *   - prefix 'enc1:' 없으면 평문으로 간주 (마이그레이션 호환 + safeStorage 비가용 환경 대응)
 *
 * 마스터키: 32바이트 random. OS safeStorage (Windows DPAPI / macOS Keychain) 보관.
 *   - 분실 시: .sdbackup 백업이 평문 dump 방식이라 복원 후 새 PC의 신규 키로 재암호화.
 *
 * 해시체인 호환: 이 모듈은 *저장 직전*과 *읽기 직후*에만 사용. computeLogHash는 평문으로 동작.
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { secureGet, secureSet, secureHas, secureAvailable } from './secure-storage'

const PREFIX = 'enc1:'
const KEY_NAME = 'student_record_master_key'
const IV_LEN = 12
const TAG_LEN = 16

let cachedKey: Buffer | null = null

function loadOrGenerateKey(): Buffer | null {
  if (cachedKey) return cachedKey
  if (!secureAvailable()) return null

  const existingHex = secureGet(KEY_NAME)
  if (existingHex && /^[0-9a-fA-F]{64}$/.test(existingHex)) {
    cachedKey = Buffer.from(existingHex, 'hex')
    return cachedKey
  }

  const fresh = randomBytes(32)
  const ok = secureSet(KEY_NAME, fresh.toString('hex'))
  if (!ok) return null
  cachedKey = fresh
  return cachedKey
}

export function isMasterKeyAvailable(): boolean {
  return loadOrGenerateKey() !== null
}

export function isFieldEncrypted(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith(PREFIX)
}

/**
 * 빈 문자열·null은 그대로 반환. 키 없으면 평문 그대로 반환(회귀 방지).
 * 이미 prefix 붙어 있으면 그대로 반환(이중 암호화 방지).
 */
export function encryptField(plain: string | null | undefined): string {
  if (plain === null || plain === undefined || plain === '') return plain ?? ''
  if (isFieldEncrypted(plain)) return plain
  const key = loadOrGenerateKey()
  if (!key) return plain

  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${Buffer.concat([ct, tag]).toString('base64')}`
}

/**
 * prefix 없으면 그대로 반환(평문 호환). 복호화 실패 시 throw — 잘못된 키·손상된 데이터 감지.
 */
export function decryptField(stored: string | null | undefined): string {
  if (stored === null || stored === undefined || stored === '') return stored ?? ''
  if (!isFieldEncrypted(stored)) return stored

  const key = loadOrGenerateKey()
  if (!key) {
    throw new Error('student-record decrypt failed: master key unavailable')
  }

  const body = stored.slice(PREFIX.length)
  const sepIdx = body.indexOf(':')
  if (sepIdx < 0) throw new Error('student-record decrypt failed: bad format')

  const iv = Buffer.from(body.slice(0, sepIdx), 'base64')
  const blob = Buffer.from(body.slice(sepIdx + 1), 'base64')
  if (iv.length !== IV_LEN || blob.length < TAG_LEN) {
    throw new Error('student-record decrypt failed: bad length')
  }
  const ct = blob.subarray(0, blob.length - TAG_LEN)
  const tag = blob.subarray(blob.length - TAG_LEN)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

/** 디버깅·내보내기용. 외부에 노출 X. */
export function getMasterKeyHex(): string | null {
  const k = loadOrGenerateKey()
  return k ? k.toString('hex') : null
}

/** 테스트·복구용. 일반 흐름에서는 사용 X. */
export function resetCachedKey(): void {
  cachedKey = null
}
