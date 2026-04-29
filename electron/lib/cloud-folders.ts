/**
 * 클라우드 동기화 폴더 자동 감지.
 *
 * 목적: 사용자가 "자동 백업 폴더" 를 지정할 때 OS별 표준 경로를 자동 탐색해서
 *       발견된 Google Drive / OneDrive / Dropbox / iCloud Drive 폴더를 추천.
 *       교사가 경로를 직접 찾지 않아도 되게.
 *
 * 감지 전략: 경로가 실제로 존재하고 디렉터리인지만 확인. 실제 동기화 상태는 확인하지 않음
 * (사용자가 로그인돼 있다면 동기화는 OS가 담당).
 */

import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

export type CloudProvider = 'GoogleDrive' | 'OneDrive' | 'Dropbox' | 'iCloud' | 'Documents'

export interface DetectedFolder {
  provider: CloudProvider
  label: string
  /** 절대 경로. SchoolDesk 백업을 담을 하위 폴더까지는 포함하지 않음(사용자가 선택). */
  path: string
  /** UI 정렬용 — 큰 값일수록 상단 추천. */
  priority: number
}

function existsDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function glob(base: string, pattern: RegExp): string[] {
  try {
    return fs
      .readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory() && pattern.test(d.name))
      .map((d) => path.join(base, d.name))
  } catch {
    return []
  }
}

export function detectCloudFolders(): DetectedFolder[] {
  const home = os.homedir()
  const platform = process.platform
  const found: DetectedFolder[] = []
  const seen = new Set<string>()
  const push = (f: DetectedFolder): void => {
    const norm = path.normalize(f.path)
    if (seen.has(norm)) return
    seen.add(norm)
    if (existsDir(norm)) found.push({ ...f, path: norm })
  }

  if (platform === 'darwin') {
    // macOS: Google Drive for Desktop 은 ~/Library/CloudStorage/GoogleDrive-*/My Drive 형태
    const cloudStorage = path.join(home, 'Library', 'CloudStorage')
    for (const gdRoot of glob(cloudStorage, /^GoogleDrive-/)) {
      push({ provider: 'GoogleDrive', label: 'Google 드라이브', path: path.join(gdRoot, 'My Drive'), priority: 100 })
    }
    for (const od of glob(cloudStorage, /^OneDrive-?/)) {
      push({ provider: 'OneDrive', label: 'OneDrive', path: od, priority: 90 })
    }
    for (const dbx of glob(cloudStorage, /^Dropbox-?/)) {
      push({ provider: 'Dropbox', label: 'Dropbox', path: dbx, priority: 80 })
    }
    // 구버전 경로
    push({ provider: 'GoogleDrive', label: 'Google 드라이브 (구)', path: path.join(home, 'Google Drive', 'My Drive'), priority: 70 })
    push({ provider: 'GoogleDrive', label: 'Google 드라이브 (구)', path: path.join(home, 'Google Drive'), priority: 65 })
    push({ provider: 'OneDrive', label: 'OneDrive', path: path.join(home, 'OneDrive'), priority: 60 })
    push({ provider: 'Dropbox', label: 'Dropbox', path: path.join(home, 'Dropbox'), priority: 55 })
    push({ provider: 'iCloud', label: 'iCloud Drive', path: path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'), priority: 85 })
    push({ provider: 'Documents', label: '문서', path: path.join(home, 'Documents'), priority: 10 })
  } else if (platform === 'win32') {
    // Windows: Google Drive for Desktop 최신 버전은 가상 드라이브(G:\My Drive) — 감지 힘듦
    // 폴더 미러링 모드에선 %USERPROFILE%\My Drive 또는 %USERPROFILE%\Google Drive 사용
    push({ provider: 'GoogleDrive', label: 'Google 드라이브', path: path.join(home, 'My Drive'), priority: 100 })
    push({ provider: 'GoogleDrive', label: 'Google 드라이브 (구)', path: path.join(home, 'Google Drive', 'My Drive'), priority: 95 })
    push({ provider: 'GoogleDrive', label: 'Google 드라이브 (구)', path: path.join(home, 'Google Drive'), priority: 90 })
    // 가상 드라이브 G: 도 시도 (실패해도 existsDir 필터됨)
    push({ provider: 'GoogleDrive', label: 'Google 드라이브 (G:)', path: 'G:\\My Drive', priority: 88 })
    // OneDrive 개인/비즈니스
    push({ provider: 'OneDrive', label: 'OneDrive', path: path.join(home, 'OneDrive'), priority: 80 })
    for (const od of glob(home, /^OneDrive - /)) {
      push({ provider: 'OneDrive', label: `OneDrive (${path.basename(od).replace(/^OneDrive - /, '')})`, path: od, priority: 78 })
    }
    push({ provider: 'Dropbox', label: 'Dropbox', path: path.join(home, 'Dropbox'), priority: 70 })
    push({ provider: 'iCloud', label: 'iCloud Drive', path: path.join(home, 'iCloudDrive'), priority: 65 })
    push({ provider: 'Documents', label: '문서', path: path.join(home, 'Documents'), priority: 10 })
  } else {
    // Linux / 기타
    push({ provider: 'Dropbox', label: 'Dropbox', path: path.join(home, 'Dropbox'), priority: 60 })
    push({ provider: 'GoogleDrive', label: 'Google 드라이브', path: path.join(home, 'GoogleDrive'), priority: 50 })
    push({ provider: 'OneDrive', label: 'OneDrive', path: path.join(home, 'OneDrive'), priority: 40 })
    push({ provider: 'Documents', label: '문서', path: path.join(home, 'Documents'), priority: 10 })
  }

  return found.sort((a, b) => b.priority - a.priority)
}

/**
 * 후보 경로에 SchoolDesk 전용 하위 폴더를 만들고 그 경로를 반환.
 * 사용자가 "이 폴더에 저장" 을 선택했을 때 실제 쓸 path.
 */
export function ensureSchoolDeskSubfolder(basePath: string): string {
  const sub = path.join(basePath, 'SchoolDesk')
  if (!existsDir(sub)) {
    fs.mkdirSync(sub, { recursive: true })
  }
  return sub
}
