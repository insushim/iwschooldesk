/**
 * Electron safeStorage 래퍼 — 운영체제 키체인 기반 민감정보 저장.
 *
 * 저장 대상:
 *   - 백업 복구구문 (12단어 BIP39). 앱 사용 편의상 암호화 저장, 원본은 교사가 프린트 보관.
 *   - 백업 비밀번호의 scrypt hash (검증용).
 *
 * 동작:
 *   - macOS: Keychain, Windows: DPAPI, Linux: libsecret.
 *   - safeStorage.isEncryptionAvailable() false 면 저장 거부 (plaintext 저장 금지).
 *
 * 저장 위치:
 *   app.getPath('userData') / secure-kv.json
 *   파일은 암호문 base64 저장. JSON 전체가 평문이지만 values 는 모두 safeStorage.encryptString() 결과.
 */

import { safeStorage, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const FILE_NAME = 'secure-kv.json'

function filePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME)
}

function readStore(): Record<string, string> {
  try {
    const p = filePath()
    if (!fs.existsSync(p)) return {}
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {}
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, string>): void {
  fs.writeFileSync(filePath(), JSON.stringify(store, null, 2), 'utf8')
}

export function secureAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function secureSet(key: string, plaintext: string): boolean {
  if (!secureAvailable()) return false
  const cipher = safeStorage.encryptString(plaintext)
  const store = readStore()
  store[key] = cipher.toString('base64')
  writeStore(store)
  return true
}

export function secureGet(key: string): string | null {
  if (!secureAvailable()) return null
  const store = readStore()
  const b64 = store[key]
  if (!b64) return null
  try {
    return safeStorage.decryptString(Buffer.from(b64, 'base64'))
  } catch {
    return null
  }
}

export function secureHas(key: string): boolean {
  const store = readStore()
  return typeof store[key] === 'string' && store[key].length > 0
}

export function secureDelete(key: string): void {
  const store = readStore()
  if (store[key]) {
    delete store[key]
    writeStore(store)
  }
}

// ─── 백업 비밀번호 (scrypt, 검증용 해시만 저장) ─────────────────
// 저장 포맷: "scrypt$<N>$<r>$<p>$<salt-hex>$<hash-hex>"
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64

export function hashBackupPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password.normalize('NFC'), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyBackupPassword(password: string, stored: string | null): boolean {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  try {
    const N = parseInt(parts[1], 10)
    const r = parseInt(parts[2], 10)
    const p = parseInt(parts[3], 10)
    const salt = Buffer.from(parts[4], 'hex')
    const storedHash = Buffer.from(parts[5], 'hex')
    const testHash = scryptSync(password.normalize('NFC'), salt, storedHash.length, { N, r, p }) as Buffer
    return testHash.length === storedHash.length && timingSafeEqual(testHash, storedHash)
  } catch {
    return false
  }
}
