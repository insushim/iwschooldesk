/**
 * SchoolDesk 백업용 암호화 엔진.
 *
 * Envelope Encryption:
 *   - DEK(Data Encryption Key, 32B 랜덤)로 실제 백업 JSON 을 AES-256-GCM 암호화.
 *   - DEK 자체는 두 경로로 각각 감싸서 파일 헤더에 함께 저장한다:
 *       (1) scrypt(password, salt_pw) 로 유도한 키로 AES-256-GCM 래핑  → 일상 복호화
 *       (2) scrypt(mnemonic, salt_mn) 로 유도한 키로 AES-256-GCM 래핑  → 비밀번호 분실 시 복구
 *   - 둘 중 어느 쪽으로 DEK 를 복원해도 본체 payload 복호화가 가능.
 *
 * 파일 포맷 v1 (고정 190 바이트 헤더 + payload):
 *   0..7   (8)   MAGIC        "SDBACKUP"
 *   8      (1)   VERSION      0x01
 *   9      (1)   FLAGS        bit0=has_mnemonic_wrap
 *   10..25 (16)  SALT_PW      scrypt salt for password
 *   26..41 (16)  SALT_MN      scrypt salt for mnemonic
 *   42..53 (12)  DATA_IV      GCM IV for payload
 *   54..69 (16)  DATA_TAG     GCM auth tag for payload
 *   70..81 (12)  WRAP_PW_IV   GCM IV wrapping DEK via password key
 *   82..97 (16)  WRAP_PW_TAG  GCM tag for password-wrap
 *   98..129(32)  WRAP_PW_CT   ciphertext(DEK) via password key
 *   130..141(12) WRAP_MN_IV   GCM IV wrapping DEK via mnemonic key
 *   142..157(16) WRAP_MN_TAG  GCM tag for mnemonic-wrap
 *   158..189(32) WRAP_MN_CT   ciphertext(DEK) via mnemonic key
 *   190..    N   PAYLOAD_CT   AES-256-GCM encrypted JSON (UTF-8)
 */

import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto'

const MAGIC = Buffer.from('SDBACKUP', 'ascii') // 8 bytes
const VERSION = 0x01
const FLAG_HAS_MN_WRAP = 0x01

const SALT_LEN = 16
const IV_LEN = 12
const TAG_LEN = 16
const DEK_LEN = 32
const WRAP_CT_LEN = DEK_LEN // GCM preserves length

// scrypt 파라미터 — 교사용 로컬 앱이므로 과도하지 않게. 유저 체감 응답 1초 전후.
const SCRYPT_N = 1 << 15 // 32768
const SCRYPT_R = 8
const SCRYPT_P = 1

// 헤더 오프셋 계산 (명확성)
const OFF_MAGIC = 0
const OFF_VERSION = 8
const OFF_FLAGS = 9
const OFF_SALT_PW = 10
const OFF_SALT_MN = 26
const OFF_DATA_IV = 42
const OFF_DATA_TAG = 54
const OFF_WRAP_PW_IV = 70
const OFF_WRAP_PW_TAG = 82
const OFF_WRAP_PW_CT = 98
const OFF_WRAP_MN_IV = 130
const OFF_WRAP_MN_TAG = 142
const OFF_WRAP_MN_CT = 158
const HEADER_SIZE = 190

function kdf(secret: string, salt: Buffer): Buffer {
  // 입력 secret 은 모두 string(password or 12-word mnemonic phrase). NFC 정규화로 환경 차이 흡수.
  const normalized = secret.normalize('NFC')
  return scryptSync(normalized, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }) as Buffer
}

function gcmEncrypt(key: Buffer, iv: Buffer, plaintext: Buffer): { ct: Buffer; tag: Buffer } {
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return { ct, tag }
}

function gcmDecrypt(key: Buffer, iv: Buffer, ct: Buffer, tag: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()])
}

export interface EncryptOptions {
  /** 사용자 비밀번호. 최소 4자 이상 권장 (상위 레이어에서 강제). */
  password: string
  /** 12단어 복구구문. 같은 DEK 를 복구구문 경로로 감싸 저장해 비밀번호 분실 시 복구 가능. */
  mnemonic: string
}

/**
 * 평문 payload(일반적으로 JSON 문자열의 utf-8 Buffer)를 암호화한 .sdbackup 파일 전체 Buffer 를 반환.
 * 호출부는 반환 Buffer 를 그대로 fs.writeFileSync 하면 된다.
 */
export function encryptBackup(plaintext: Buffer, opts: EncryptOptions): Buffer {
  const { password, mnemonic } = opts
  if (!password || password.length < 4) throw new Error('비밀번호가 너무 짧아요.')
  if (!mnemonic || mnemonic.trim().split(/\s+/).length < 12) {
    throw new Error('복구구문(12단어)이 올바르지 않아요.')
  }

  const dek = randomBytes(DEK_LEN)

  const saltPw = randomBytes(SALT_LEN)
  const saltMn = randomBytes(SALT_LEN)
  const keyPw = kdf(password, saltPw)
  const keyMn = kdf(mnemonic, saltMn)

  const dataIv = randomBytes(IV_LEN)
  const wrapPwIv = randomBytes(IV_LEN)
  const wrapMnIv = randomBytes(IV_LEN)

  const dataEnc = gcmEncrypt(dek, dataIv, plaintext)
  const wrapPw = gcmEncrypt(keyPw, wrapPwIv, dek)
  const wrapMn = gcmEncrypt(keyMn, wrapMnIv, dek)

  const header = Buffer.alloc(HEADER_SIZE)
  MAGIC.copy(header, OFF_MAGIC)
  header[OFF_VERSION] = VERSION
  header[OFF_FLAGS] = FLAG_HAS_MN_WRAP
  saltPw.copy(header, OFF_SALT_PW)
  saltMn.copy(header, OFF_SALT_MN)
  dataIv.copy(header, OFF_DATA_IV)
  dataEnc.tag.copy(header, OFF_DATA_TAG)
  wrapPwIv.copy(header, OFF_WRAP_PW_IV)
  wrapPw.tag.copy(header, OFF_WRAP_PW_TAG)
  wrapPw.ct.copy(header, OFF_WRAP_PW_CT)
  wrapMnIv.copy(header, OFF_WRAP_MN_IV)
  wrapMn.tag.copy(header, OFF_WRAP_MN_TAG)
  wrapMn.ct.copy(header, OFF_WRAP_MN_CT)

  return Buffer.concat([header, dataEnc.ct])
}

export interface DecryptOptions {
  /** 비밀번호 또는 복구구문 중 하나(또는 둘 다) 제공. 최소 하나 필수. */
  password?: string
  mnemonic?: string
}

export interface DecryptResult {
  plaintext: Buffer
  /** 어느 경로로 복호화에 성공했는지. UI 에서 "복구구문으로 해제됨" 표시용. */
  via: 'password' | 'mnemonic'
}

/** .sdbackup Buffer 를 읽어 payload 평문을 반환. 비밀번호 또는 복구구문 어느 쪽이든 주면 됨. */
export function decryptBackup(fileBuf: Buffer, opts: DecryptOptions): DecryptResult {
  if (fileBuf.length < HEADER_SIZE + TAG_LEN) {
    throw new Error('백업 파일이 손상되었거나 형식이 맞지 않아요.')
  }
  const magic = fileBuf.subarray(OFF_MAGIC, OFF_MAGIC + 8)
  if (!magic.equals(MAGIC)) {
    throw new Error('SchoolDesk 백업 파일이 아니에요.')
  }
  const version = fileBuf[OFF_VERSION]
  if (version !== VERSION) {
    throw new Error(`지원하지 않는 백업 버전입니다 (v${version}).`)
  }
  const flags = fileBuf[OFF_FLAGS]
  const hasMnWrap = (flags & FLAG_HAS_MN_WRAP) !== 0

  const saltPw = fileBuf.subarray(OFF_SALT_PW, OFF_SALT_PW + SALT_LEN)
  const saltMn = fileBuf.subarray(OFF_SALT_MN, OFF_SALT_MN + SALT_LEN)
  const dataIv = fileBuf.subarray(OFF_DATA_IV, OFF_DATA_IV + IV_LEN)
  const dataTag = fileBuf.subarray(OFF_DATA_TAG, OFF_DATA_TAG + TAG_LEN)
  const wrapPwIv = fileBuf.subarray(OFF_WRAP_PW_IV, OFF_WRAP_PW_IV + IV_LEN)
  const wrapPwTag = fileBuf.subarray(OFF_WRAP_PW_TAG, OFF_WRAP_PW_TAG + TAG_LEN)
  const wrapPwCt = fileBuf.subarray(OFF_WRAP_PW_CT, OFF_WRAP_PW_CT + WRAP_CT_LEN)
  const wrapMnIv = fileBuf.subarray(OFF_WRAP_MN_IV, OFF_WRAP_MN_IV + IV_LEN)
  const wrapMnTag = fileBuf.subarray(OFF_WRAP_MN_TAG, OFF_WRAP_MN_TAG + TAG_LEN)
  const wrapMnCt = fileBuf.subarray(OFF_WRAP_MN_CT, OFF_WRAP_MN_CT + WRAP_CT_LEN)
  const payloadCt = fileBuf.subarray(HEADER_SIZE)

  let dek: Buffer | null = null
  let via: 'password' | 'mnemonic' | null = null
  const errors: string[] = []

  if (opts.password) {
    try {
      const keyPw = kdf(opts.password, saltPw)
      dek = gcmDecrypt(keyPw, wrapPwIv, wrapPwCt, wrapPwTag)
      via = 'password'
    } catch {
      errors.push('비밀번호가 맞지 않아요.')
    }
  }
  if (!dek && opts.mnemonic && hasMnWrap) {
    try {
      const keyMn = kdf(opts.mnemonic, saltMn)
      dek = gcmDecrypt(keyMn, wrapMnIv, wrapMnCt, wrapMnTag)
      via = 'mnemonic'
    } catch {
      errors.push('복구구문이 맞지 않아요.')
    }
  }
  if (!dek || !via) {
    throw new Error(errors.length ? errors.join(' ') : '복호화 정보가 제공되지 않았어요.')
  }

  const plaintext = gcmDecrypt(dek, dataIv, payloadCt, dataTag)
  return { plaintext, via }
}

/** 헤더만 읽어 버전·mnemonic-wrap 유무를 확인. 사용자에게 "복구구문 가능 여부"를 먼저 보여줄 때. */
export function inspectBackupHeader(fileBuf: Buffer): { version: number; hasMnemonicWrap: boolean } {
  if (fileBuf.length < HEADER_SIZE) throw new Error('백업 파일 헤더가 불완전해요.')
  const magic = fileBuf.subarray(0, 8)
  if (!magic.equals(MAGIC)) throw new Error('SchoolDesk 백업 파일이 아니에요.')
  const version = fileBuf[OFF_VERSION]
  const flags = fileBuf[OFF_FLAGS]
  return { version, hasMnemonicWrap: (flags & FLAG_HAS_MN_WRAP) !== 0 }
}
