/**
 * 암호화 백업/복원 IPC 핸들러.
 *
 * 설계 2트랙:
 *   (1) 저장된 자격증명 트랙 — 최초 1회 "백업 설정" 시 safeStorage 에
 *       복구구문(암호화) + 비밀번호 hash 를 저장. 이후 저장 시 비밀번호만 입력.
 *   (2) 복원 트랙 — 다른 기기/OS 에서는 safeStorage 에 아무 것도 없으므로
 *       비밀번호 또는 프린트된 복구구문을 직접 입력해 복호화.
 *
 * 채널 요약:
 *   backup:isConfigured()
 *   backup:generateMnemonic(lang?)
 *   backup:verifyMnemonic(phrase, lang?)
 *   backup:setup({password, mnemonic})
 *   backup:clearSetup({password})
 *   backup:exportEncrypted({password})
 *   backup:previewEncrypted({password?, mnemonic?})
 *   backup:importEncrypted({password?, mnemonic?, replaceLocalSetup?})
 *
 * 보안:
 *   - renderer 가 임의 경로를 전달할 수 없다. 모든 파일 선택은 main 의 dialog 사용.
 *   - 파일 크기 상한 200MB.
 *   - 복구구문 원본은 사용자가 프린트 보관. 앱은 safeStorage(OS 키체인) 에 암호화만.
 *   - 체인 검증 실패 시 복원 거부 — 증거 무결성 우선.
 */

import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { encryptBackup, decryptBackup, inspectBackupHeader } from '../lib/crypto'

// bip39 는 dynamic import — main bundle 초기화 크래시 방지 + 최초 호출 시점까지 지연.
// 한번 로드하면 캐시.
let _bip39Mod: typeof import('bip39') | null = null
async function bip39(): Promise<typeof import('bip39')> {
  if (_bip39Mod) return _bip39Mod
  _bip39Mod = await import('bip39')
  return _bip39Mod
}
import {
  buildBackupPayload,
  applyBackupPayload,
  verifyLogsChain,
  BACKUP_EXPORT_TABLES,
  type BackupPayload,
} from '../lib/backup'
import {
  secureAvailable,
  secureGet,
  secureSet,
  secureHas,
  secureDelete,
  hashBackupPassword,
  verifyBackupPassword,
} from '../lib/secure-storage'
import { detectCloudFolders, ensureSchoolDeskSubfolder } from '../lib/cloud-folders'
import { triggerAutoBackupNow, computeNextDueAt } from '../lib/backup-scheduler'
import { getDatabase } from '../database/connection'
import { getSetting, setSetting } from '../database/repositories/settings.repo'
import { BACKUP_IMPORT_TABLES, ALLOWED_TABLE_COLUMNS } from '../database/allowed-fields'

const MAX_BACKUP_BYTES = 200 * 1024 * 1024

// safeStorage 키
const KEY_MNEMONIC = 'backup.mnemonic'
const KEY_PW_HASH = 'backup.password_hash'
/** 자동 백업에 쓸 평문 비밀번호. OS 키체인으로 암호화돼 있으므로 복구구문과 동급 방어 수준. */
const KEY_PW_PLAIN = 'backup.password'

// 일반 settings 키
const SET_FREQ = 'backup_auto_frequency'
const SET_FOLDER = 'backup_auto_folder'
const SET_LAST = 'backup_last_auto_at'

type Frequency = 'off' | 'daily' | 'weekly'

async function resolveWordlist(lang: 'korean' | 'english' | undefined): Promise<string[]> {
  const b = await bip39()
  if (lang === 'english') return b.wordlists.english
  return b.wordlists.korean
}

async function validMnemonic(phrase: string): Promise<boolean> {
  const trimmed = phrase.trim()
  if (!trimmed) return false
  const b = await bip39()
  return (
    b.validateMnemonic(trimmed, b.wordlists.korean) ||
    b.validateMnemonic(trimmed, b.wordlists.english)
  )
}

function broadcastAllDataChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue
    const types = [
      'schedule', 'task', 'memo', 'timetable', 'checklist',
      'section', 'dday', 'settings', 'routine', 'goal', 'studentrecord',
    ]
    for (const t of types) {
      try { w.webContents.send('data:changed', t) } catch { /* ignore */ }
    }
  }
}

function validatePayloadShape(payload: unknown): payload is BackupPayload {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as { meta?: unknown; data?: unknown }
  if (!p.meta || typeof p.meta !== 'object') return false
  if (!p.data || typeof p.data !== 'object' || Array.isArray(p.data)) return false
  return true
}

export function registerBackupHandlers(): void {
  // 현재 기기 설정 상태 — UI 초기 렌더에서 "설정하기" vs "저장/복원" 분기용.
  ipcMain.handle('backup:isConfigured', () => {
    return {
      secureAvailable: secureAvailable(),
      hasMnemonic: secureHas(KEY_MNEMONIC),
      hasPassword: secureHas(KEY_PW_HASH),
    }
  })

  ipcMain.handle('backup:generateMnemonic', async (_e, lang?: 'korean' | 'english') => {
    const b = await bip39()
    const wordlist = await resolveWordlist(lang)
    return b.generateMnemonic(128, undefined, wordlist)
  })

  ipcMain.handle('backup:verifyMnemonic', async (_e, phrase: string, lang?: 'korean' | 'english') => {
    if (typeof phrase !== 'string' || !phrase.trim()) return false
    const b = await bip39()
    const wordlist = await resolveWordlist(lang)
    try {
      return b.validateMnemonic(phrase.trim(), wordlist)
    } catch {
      return false
    }
  })

  // 최초 설정 — 복구구문 + 비밀번호를 OS 키체인에 보관.
  ipcMain.handle(
    'backup:setup',
    async (_e, opts: { password?: string; mnemonic?: string }) => {
      if (!secureAvailable()) return { ok: false as const, reason: 'secure_unavailable' }
      if (!opts || typeof opts.password !== 'string' || opts.password.length < 4) {
        return { ok: false as const, reason: 'password_too_short' }
      }
      if (!opts.mnemonic || !(await validMnemonic(opts.mnemonic))) {
        return { ok: false as const, reason: 'mnemonic_invalid' }
      }
      const okMn = secureSet(KEY_MNEMONIC, opts.mnemonic.trim())
      if (!okMn) return { ok: false as const, reason: 'secure_write_failed' }
      const okPwHash = secureSet(KEY_PW_HASH, hashBackupPassword(opts.password))
      const okPwPlain = secureSet(KEY_PW_PLAIN, opts.password)
      if (!okPwHash || !okPwPlain) return { ok: false as const, reason: 'secure_write_failed' }
      return { ok: true as const }
    },
  )

  // 현재 기기의 저장된 자격증명 해제 — 비밀번호 확인 후 삭제. 파일 백업은 계속 사용 가능.
  ipcMain.handle('backup:clearSetup', (_e, opts: { password?: string }) => {
    if (!opts?.password) return { ok: false as const, reason: 'password_required' }
    const stored = secureGet(KEY_PW_HASH)
    if (!verifyBackupPassword(opts.password, stored)) {
      return { ok: false as const, reason: 'password_mismatch' }
    }
    secureDelete(KEY_MNEMONIC)
    secureDelete(KEY_PW_HASH)
    secureDelete(KEY_PW_PLAIN)
    // 자동 백업 폴더/주기도 같이 해제 (자격증명 없으면 자동 백업 불가)
    setSetting(SET_FREQ, 'off' as unknown as string)
    setSetting(SET_FOLDER, '' as unknown as string)
    return { ok: true as const }
  })

  // 복구구문 다시 보기 — 비밀번호 입력 후 safeStorage 에서 꺼내 반환. 분실 대비 UX.
  ipcMain.handle('backup:revealMnemonic', (_e, opts: { password?: string }) => {
    if (!opts?.password) return { ok: false as const, reason: 'password_required' }
    const stored = secureGet(KEY_PW_HASH)
    if (!verifyBackupPassword(opts.password, stored)) {
      return { ok: false as const, reason: 'password_mismatch' }
    }
    const mn = secureGet(KEY_MNEMONIC)
    if (!mn) return { ok: false as const, reason: 'mnemonic_missing' }
    return { ok: true as const, mnemonic: mn }
  })

  // ─── 자동 백업 폴더 / 주기 ────────────────────────────────────
  ipcMain.handle('backup:detectCloudFolders', () => detectCloudFolders())

  ipcMain.handle('backup:getAutoConfig', () => {
    const freq = ((getSetting(SET_FREQ) as unknown as string) || 'off') as Frequency
    const folder = (getSetting(SET_FOLDER) as unknown as string) || ''
    const lastRaw = (getSetting(SET_LAST) as unknown as string) || ''
    const last = lastRaw ? parseInt(lastRaw, 10) || 0 : 0
    return { frequency: freq, folder, lastAt: last, nextAt: computeNextDueAt() }
  })

  // 폴더 지정: 후보 경로를 받아 SchoolDesk 하위폴더 만들어 저장하고 반환.
  ipcMain.handle('backup:setAutoFolder', (_e, opts: { basePath?: string }) => {
    if (!opts?.basePath) return { ok: false as const, reason: 'path_required' }
    try {
      const resolved = ensureSchoolDeskSubfolder(opts.basePath)
      setSetting(SET_FOLDER, resolved as unknown as string)
      return { ok: true as const, path: resolved }
    } catch (err) {
      return { ok: false as const, reason: 'mkdir_failed', detail: String(err) }
    }
  })

  // 폴더 사용자 직접 선택 (dialog).
  ipcMain.handle('backup:pickAutoFolder', async () => {
    const pick = await dialog.showOpenDialog({
      title: '자동 백업 폴더 선택 (Google Drive / OneDrive / Dropbox 등 동기화 폴더 권장)',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (pick.canceled || !pick.filePaths[0]) return { ok: false as const, reason: 'canceled' }
    const resolved = ensureSchoolDeskSubfolder(pick.filePaths[0])
    setSetting(SET_FOLDER, resolved as unknown as string)
    return { ok: true as const, path: resolved }
  })

  ipcMain.handle('backup:setAutoFrequency', (_e, opts: { frequency?: Frequency }) => {
    const f = opts?.frequency
    if (f !== 'off' && f !== 'daily' && f !== 'weekly') {
      return { ok: false as const, reason: 'invalid_frequency' }
    }
    setSetting(SET_FREQ, f as unknown as string)
    return { ok: true as const }
  })

  // 수동으로 "지금 자동 백업 실행" — 테스트 및 즉시 동기화용.
  ipcMain.handle('backup:runAutoNow', async () => {
    await triggerAutoBackupNow()
    const lastRaw = (getSetting(SET_LAST) as unknown as string) || ''
    const last = lastRaw ? parseInt(lastRaw, 10) || 0 : 0
    return { ok: true as const, lastAt: last }
  })

  // 자동 백업 폴더에 있는 .sdbackup 파일 목록 — 새 컴퓨터에서 복원할 때 드롭다운 표시용.
  ipcMain.handle('backup:listBackupsInFolder', (_e, opts: { folder?: string }) => {
    const folder = opts?.folder || (getSetting(SET_FOLDER) as unknown as string) || ''
    if (!folder) return { ok: false as const, reason: 'no_folder' }
    try {
      const entries = fs
        .readdirSync(folder)
        .filter((f) => /\.sdbackup$/i.test(f))
        .map((f) => {
          const full = path.join(folder, f)
          const stat = fs.statSync(full)
          return { name: f, path: full, bytes: stat.size, mtime: stat.mtimeMs }
        })
        .sort((a, b) => b.mtime - a.mtime)
      return { ok: true as const, folder, entries }
    } catch (err) {
      return { ok: false as const, reason: 'read_failed', detail: String(err) }
    }
  })

  // 지정 경로의 .sdbackup 파일을 직접 복호화 · 복원 (파일 선택 dialog 스킵).
  // renderer 가 임의 경로를 주면 위험하므로 "설정된 자동 백업 폴더 하위" 로 제한.
  ipcMain.handle(
    'backup:importFromPath',
    async (
      _e,
      opts: {
        filePath?: string
        password?: string
        mnemonic?: string
        replaceLocalSetup?: boolean
      },
    ) => {
      if (!opts?.filePath) return { ok: false as const, reason: 'path_required' }
      if (!opts.password && !opts.mnemonic) return { ok: false as const, reason: 'no_credentials' }
      // 허용 폴더 제한
      const folder = (getSetting(SET_FOLDER) as unknown as string) || ''
      const normalized = path.normalize(opts.filePath)
      if (!folder || !normalized.startsWith(path.normalize(folder) + path.sep)) {
        return { ok: false as const, reason: 'path_not_allowed' }
      }
      const result = await handleDecryptAndParse(normalized, opts, { applyToDB: true })
      if (!result.ok) return result
      if (opts.replaceLocalSetup && secureAvailable() && opts.password && opts.mnemonic) {
        secureSet(KEY_MNEMONIC, opts.mnemonic.trim())
        secureSet(KEY_PW_HASH, hashBackupPassword(opts.password))
        secureSet(KEY_PW_PLAIN, opts.password)
      }
      broadcastAllDataChanged()
      return result
    },
  )

  // 암호화 백업 저장 — 저장된 mnemonic 과 입력 비밀번호로 .sdbackup 생성.
  ipcMain.handle('backup:exportEncrypted', async (_e, opts: { password?: string }) => {
    if (!secureHas(KEY_MNEMONIC) || !secureHas(KEY_PW_HASH)) {
      return { ok: false as const, reason: 'not_configured' }
    }
    if (!opts?.password || opts.password.length < 4) {
      return { ok: false as const, reason: 'password_required' }
    }
    const storedHash = secureGet(KEY_PW_HASH)
    if (!verifyBackupPassword(opts.password, storedHash)) {
      return { ok: false as const, reason: 'password_mismatch' }
    }
    const mnemonic = secureGet(KEY_MNEMONIC)
    if (!mnemonic) return { ok: false as const, reason: 'mnemonic_missing' }

    const result = await dialog.showSaveDialog({
      title: 'SchoolDesk 암호화 백업 저장',
      defaultPath: `schooldesk-backup-${new Date().toISOString().slice(0, 10)}.sdbackup`,
      filters: [{ name: 'SchoolDesk 백업', extensions: ['sdbackup'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false as const, reason: 'canceled' }

    try {
      const db = getDatabase()
      const appVersion = app.getVersion ? app.getVersion() : '1.0.0'
      const payload = buildBackupPayload({
        db,
        appVersion,
        host: os.hostname(),
        user: os.userInfo().username,
      })
      const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
      const fileBuf = encryptBackup(plaintext, { password: opts.password, mnemonic })
      fs.writeFileSync(result.filePath, fileBuf)

      return {
        ok: true as const,
        path: result.filePath,
        bytes: fileBuf.length,
        tables: BACKUP_EXPORT_TABLES.length,
        rowCounts: payload.meta.row_counts,
        chainTotalLogs: payload.meta.chain_total_logs,
      }
    } catch (err) {
      return { ok: false as const, reason: 'export_failed', detail: String(err) }
    }
  })

  // 미리보기 — 실제 DB 반영 X. 복원 전에 어떤 백업인지 확인용.
  ipcMain.handle(
    'backup:previewEncrypted',
    async (_e, opts: { password?: string; mnemonic?: string }) => {
      if (!opts || (!opts.password && !opts.mnemonic)) {
        return { ok: false as const, reason: 'no_credentials' }
      }
      const pick = await dialog.showOpenDialog({
        title: 'SchoolDesk 백업 미리보기',
        filters: [{ name: 'SchoolDesk 백업', extensions: ['sdbackup'] }],
        properties: ['openFile'],
      })
      if (pick.canceled || !pick.filePaths[0]) return { ok: false as const, reason: 'canceled' }

      return handleDecryptAndParse(pick.filePaths[0], opts, { applyToDB: false })
    },
  )

  // 실제 복원. 성공 시 모든 위젯 창에 변경 알림.
  ipcMain.handle(
    'backup:importEncrypted',
    async (
      _e,
      opts: {
        password?: string
        mnemonic?: string
        /** 복원 직후 현재 기기의 저장된 mnemonic/password 도 이 백업의 것으로 맞춤 (신규 설치 기기에서 유용). */
        replaceLocalSetup?: boolean
      },
    ) => {
      if (!opts || (!opts.password && !opts.mnemonic)) {
        return { ok: false as const, reason: 'no_credentials' }
      }
      const pick = await dialog.showOpenDialog({
        title: 'SchoolDesk 백업 복원',
        filters: [{ name: 'SchoolDesk 백업', extensions: ['sdbackup'] }],
        properties: ['openFile'],
      })
      if (pick.canceled || !pick.filePaths[0]) return { ok: false as const, reason: 'canceled' }

      const result = await handleDecryptAndParse(pick.filePaths[0], opts, { applyToDB: true })
      if (!result.ok) return result

      // 사용자가 원하면, 이 기기의 로컬 setup 도 방금 복원에 쓴 자격증명으로 저장.
      if (opts.replaceLocalSetup && secureAvailable() && opts.password && opts.mnemonic) {
        const okMn = secureSet(KEY_MNEMONIC, opts.mnemonic.trim())
        const okPw = secureSet(KEY_PW_HASH, hashBackupPassword(opts.password))
        const okPwPlain = secureSet(KEY_PW_PLAIN, opts.password)
        if (okMn && okPw && okPwPlain) {
          ;(result as { setupPersisted?: boolean }).setupPersisted = true
        }
      }
      broadcastAllDataChanged()
      return result
    },
  )
}

// ─── 내부 헬퍼: 파일 복호화 → payload 파싱 → 선택적 DB 적용 ─────
async function handleDecryptAndParse(
  filePath: string,
  creds: { password?: string; mnemonic?: string },
  opts: { applyToDB: boolean },
): Promise<
  | {
      ok: true
      path: string
      via: 'password' | 'mnemonic'
      meta: BackupPayload['meta']
      chainOk: boolean
      chainTotal: number
      chainFirstMismatchIndex: number | null
      replaced?: string[]
      inserted?: number
      skipped?: string[]
    }
  | {
      ok: false
      reason: string
      detail?: string
      firstMismatchIndex?: number | null
      firstMismatchId?: number | null
    }
> {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size > MAX_BACKUP_BYTES) return { ok: false, reason: 'too_large' }
  } catch {
    return { ok: false, reason: 'stat_failed' }
  }

  let fileBuf: Buffer
  try {
    fileBuf = fs.readFileSync(filePath)
  } catch {
    return { ok: false, reason: 'read_failed' }
  }
  try {
    inspectBackupHeader(fileBuf)
  } catch {
    return { ok: false, reason: 'not_sdbackup' }
  }

  let plaintext: Buffer
  let via: 'password' | 'mnemonic'
  try {
    const dec = decryptBackup(fileBuf, creds)
    plaintext = dec.plaintext
    via = dec.via
  } catch (err) {
    return { ok: false, reason: 'decrypt_failed', detail: String(err) }
  }

  let payload: BackupPayload
  try {
    const parsed = JSON.parse(plaintext.toString('utf8')) as unknown
    if (!validatePayloadShape(parsed)) return { ok: false, reason: 'payload_invalid' }
    payload = parsed
  } catch {
    return { ok: false, reason: 'parse_failed' }
  }

  const logs = (payload.data['student_record_logs'] as Array<Record<string, unknown>>) ?? []
  const chain = verifyLogsChain(logs)
  if (!chain.ok && opts.applyToDB) {
    return {
      ok: false,
      reason: 'chain_invalid',
      firstMismatchIndex: chain.firstMismatchIndex,
      firstMismatchId: chain.firstMismatchId,
    }
  }

  if (!opts.applyToDB) {
    return {
      ok: true,
      path: filePath,
      via,
      meta: payload.meta,
      chainOk: chain.ok,
      chainTotal: chain.total,
      chainFirstMismatchIndex: chain.firstMismatchIndex,
    }
  }

  try {
    const db = getDatabase()
    const applyResult = applyBackupPayload({
      db,
      payload,
      allowedTables: BACKUP_IMPORT_TABLES,
      allowedColumns: ALLOWED_TABLE_COLUMNS,
    })
    return {
      ok: true,
      path: filePath,
      via,
      meta: payload.meta,
      chainOk: chain.ok,
      chainTotal: chain.total,
      chainFirstMismatchIndex: chain.firstMismatchIndex,
      replaced: applyResult.replacedTables,
      inserted: applyResult.totalInserted,
      skipped: applyResult.skippedTables,
    }
  } catch (err) {
    return { ok: false, reason: 'apply_failed', detail: String(err) }
  }
}
