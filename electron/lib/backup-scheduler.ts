/**
 * 자동 백업 스케줄러.
 *
 * 설계:
 *   - 앱 실행 중에만 작동(setInterval). 앱이 닫혀 있다가 다시 켜지면, 시작 직후 "놓친 백업" 을 감지해 즉시 1회 실행.
 *   - 체크 주기는 15분(너무 자주 깨우면 리소스 낭비). 실제 백업 주기는 daily/weekly.
 *   - 마지막 성공 백업 시각은 settings 테이블에 저장(backup.last_auto_at).
 *   - 자동 백업 대상 폴더(backup.auto_folder)가 지정돼 있고, safeStorage 에 복구구문+비번이 저장돼 있어야 실행.
 *
 * 자동 실행은 renderer 입장에선 투명 — 성공 시 알림만.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BrowserWindow, Notification } from 'electron'
import { getDatabase } from '../database/connection'
import { getSetting, setSetting } from '../database/repositories/settings.repo'
import { secureGet, secureHas } from './secure-storage'
import { buildBackupPayload } from './backup'
import { encryptBackup } from './crypto'

type Frequency = 'off' | 'daily' | 'weekly'

const CHECK_INTERVAL_MS = 15 * 60 * 1000 // 15분
let timer: NodeJS.Timeout | null = null

const KEY_FREQ = 'backup_auto_frequency'
const KEY_FOLDER = 'backup_auto_folder'
const KEY_LAST = 'backup_last_auto_at'
const SEC_MNEMONIC = 'backup.mnemonic'
const SEC_PASSWORD = 'backup.password'

function readSetting(key: string): string {
  const v = getSetting(key) as unknown
  if (typeof v === 'string') return v
  return ''
}

function writeSetting(key: string, value: string): void {
  setSetting(key, value as unknown as string)
}

function frequencyMs(f: Frequency): number {
  if (f === 'daily') return 24 * 60 * 60 * 1000
  if (f === 'weekly') return 7 * 24 * 60 * 60 * 1000
  return Number.POSITIVE_INFINITY
}

/** 다음 자동 백업 예정 시각(ms since epoch). 설정 끄면 null. */
export function computeNextDueAt(): number | null {
  const freq = readSetting(KEY_FREQ) as Frequency
  if (freq !== 'daily' && freq !== 'weekly') return null
  const last = parseInt(readSetting(KEY_LAST) || '0', 10) || 0
  return last + frequencyMs(freq)
}

function notifyTeacher(title: string, body: string): void {
  try {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  } catch { /* ignore */ }
  // 렌더러에도 이벤트 — 설정 패널이 열려 있으면 "마지막 백업: 방금" 즉시 갱신.
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue
    try { w.webContents.send('data:changed', 'settings') } catch { /* ignore */ }
  }
}

async function runOnce(): Promise<void> {
  try {
    const freq = readSetting(KEY_FREQ) as Frequency
    if (freq !== 'daily' && freq !== 'weekly') return
    const folder = readSetting(KEY_FOLDER)
    if (!folder || !isUsableFolder(folder)) return
    if (!secureHas(SEC_MNEMONIC) || !secureHas(SEC_PASSWORD)) return

    const last = parseInt(readSetting(KEY_LAST) || '0', 10) || 0
    const dueAt = last + frequencyMs(freq)
    if (Date.now() < dueAt) return

    const mnemonic = secureGet(SEC_MNEMONIC)
    const password = secureGet(SEC_PASSWORD)
    if (!mnemonic || !password) return

    // 실제 백업
    const db = getDatabase()
    const payload = buildBackupPayload({
      db,
      appVersion: '1.0.0',
      host: os.hostname(),
      user: os.userInfo().username,
    })
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
    const fileBuf = encryptBackup(plaintext, { password, mnemonic })

    const name = `schooldesk-auto-${new Date().toISOString().slice(0, 10)}.sdbackup`
    const target = path.join(folder, name)
    fs.writeFileSync(target, fileBuf)

    // 오래된 자동 백업 파일 정리 — 최신 14개만 보관
    pruneOldAutoBackups(folder, 14)

    writeSetting(KEY_LAST, String(Date.now()))
    notifyTeacher('SchoolDesk 자동 백업 완료', `${name} (${Math.round(fileBuf.length / 1024)} KB)`)
  } catch (err) {
    console.warn('[auto-backup] run failed:', err)
  }
}

function isUsableFolder(p: string): boolean {
  try {
    const stat = fs.statSync(p)
    if (!stat.isDirectory()) return false
    // 쓰기 권한 간단 체크 — 실패하면 시도 자체를 안 함
    fs.accessSync(p, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

function pruneOldAutoBackups(folder: string, keep: number): void {
  try {
    const files = fs
      .readdirSync(folder)
      .filter((f) => /^schooldesk-auto-.*\.sdbackup$/i.test(f))
      .map((f) => ({ f, full: path.join(folder, f), mtime: fs.statSync(path.join(folder, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    for (const old of files.slice(keep)) {
      try { fs.unlinkSync(old.full) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/** 앱 시작 시 1회 호출. 이후 15분마다 체크. */
export function startBackupScheduler(): void {
  if (timer) return
  // 시작 직후 1회 — 어제 놓친 백업 보정
  setTimeout(() => { void runOnce() }, 10_000)
  timer = setInterval(() => { void runOnce() }, CHECK_INTERVAL_MS)
}

export function stopBackupScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** 즉시 1회 실행(수동 트리거 또는 설정 변경 직후). */
export async function triggerAutoBackupNow(): Promise<void> {
  await runOnce()
}
