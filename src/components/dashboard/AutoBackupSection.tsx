import { useEffect, useState } from 'react'
import {
  Cloud, FolderOpen, HardDrive, RefreshCw, Upload, CheckCircle2, Folder,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { useUIStore } from '../../stores/ui.store'
import type { BackupAutoConfig, BackupFileEntry, DetectedCloudFolder } from '../../types/ipc.types'

/**
 * 자동 백업 폴더/주기 설정 + "폴더에서 복원" 진입점.
 *
 * UX 설계:
 *   - "폴더 선택" 누르면 자동 감지된 클라우드 폴더(Drive/OneDrive/Dropbox/iCloud) 추천
 *   - 주기: 매일 / 매주 / 꺼짐
 *   - 상태: "마지막 백업: X분 전 · 다음 예정: Y시간 후" 표시
 *   - "지금 즉시 백업" 버튼으로 수동 테스트
 *   - "이 폴더의 백업 목록" 으로 새 기기에서 복원 (드롭다운)
 */

function formatRelative(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '없음'
  const diff = Date.now() - ms
  if (diff < 60_000) return '방금'
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}시간 전`
  return `${Math.floor(diff / (24 * 60 * 60_000))}일 전`
}

function formatFuture(target: number | null | undefined): string {
  if (!target) return '예정 없음'
  const diff = target - Date.now()
  if (diff <= 0) return '곧 실행'
  if (diff < 60 * 60_000) return `${Math.ceil(diff / 60_000)}분 후`
  if (diff < 24 * 60 * 60_000) return `${Math.ceil(diff / (60 * 60_000))}시간 후`
  return `${Math.ceil(diff / (24 * 60 * 60_000))}일 후`
}

export function AutoBackupSection({
  canUseSecureStorage,
  hasCredentials,
}: {
  canUseSecureStorage: boolean
  hasCredentials: boolean
}) {
  const addToast = useUIStore((s) => s.addToast)
  const [config, setConfig] = useState<BackupAutoConfig | null>(null)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function refresh(): Promise<void> {
    const c = await window.api.backup.getAutoConfig()
    setConfig(c)
  }

  useEffect(() => { refresh() }, [])

  async function setFrequency(freq: 'off' | 'daily' | 'weekly'): Promise<void> {
    await window.api.backup.setAutoFrequency({ frequency: freq })
    await refresh()
  }

  async function runNow(): Promise<void> {
    if (!config?.folder) { addToast('error', '먼저 백업 폴더를 지정해주세요.'); return }
    if (!hasCredentials) { addToast('error', '백업 설정(복구구문/비밀번호)이 먼저 필요해요.'); return }
    setBusy(true)
    try {
      await window.api.backup.runAutoNow()
      await refresh()
      addToast('success', '자동 백업을 실행했어요.')
    } finally {
      setBusy(false)
    }
  }

  const disabled = !canUseSecureStorage || !hasCredentials

  return (
    <div
      style={{
        padding: '14px 16px', borderRadius: 12,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-widget)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Cloud size={16} strokeWidth={2.2} style={{ color: 'var(--accent)' }} />
        <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
          자동 백업 폴더
        </div>
      </div>

      {disabled && (
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 8 }}>
          {canUseSecureStorage
            ? '먼저 위에서 암호화 백업을 설정해주세요.'
            : '이 컴퓨터는 OS 키체인을 쓸 수 없어 자동 백업을 지원하지 않아요.'}
        </p>
      )}

      {!disabled && (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 10 }}>
            <b>Google Drive · OneDrive · Dropbox · iCloud</b> 같은 동기화 폴더를 지정해 두시면, 파일이 자동으로 클라우드에 올라가고
            새 컴퓨터에서도 같은 계정으로 로그인하면 그대로 복원할 수 있어요.
          </div>

          {/* 폴더 상태 */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10, marginBottom: 10,
              background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
            }}
          >
            <Folder size={14} style={{ color: config?.folder ? '#16A34A' : 'var(--text-secondary)' }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 600 }}>
              {config?.folder ? (
                <span title={config.folder} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {config.folder}
                </span>
              ) : (
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>지정된 폴더 없음</span>
              )}
            </div>
            <Button variant="ghost" onClick={() => setFolderPickerOpen(true)} className="py-1.5">
              <FolderOpen size={13} /> {config?.folder ? '변경' : '선택'}
            </Button>
          </div>

          {/* 주기 선택 */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '-0.2px' }}>
            백업 주기
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['off', 'daily', 'weekly'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFrequency(f)}
                disabled={!config?.folder && f !== 'off'}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 8,
                  fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.2px',
                  background: config?.frequency === f ? 'var(--accent-light)' : 'var(--bg-widget)',
                  color: config?.frequency === f ? 'var(--accent)' : 'var(--text-primary)',
                  border: config?.frequency === f ? '1px solid var(--accent)' : '1px solid var(--border-widget)',
                  cursor: !config?.folder && f !== 'off' ? 'not-allowed' : 'pointer',
                  opacity: !config?.folder && f !== 'off' ? 0.5 : 1,
                  transition: 'all .15s',
                }}
              >
                {f === 'off' ? '끔' : f === 'daily' ? '매일' : '매주'}
              </button>
            ))}
          </div>

          {/* 상태 */}
          {config?.folder && config.frequency !== 'off' && (
            <div
              style={{
                display: 'flex', gap: 14, padding: '8px 12px', borderRadius: 8,
                background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.20)',
                fontSize: 12, color: '#166534', fontWeight: 600, marginBottom: 10, letterSpacing: '-0.2px',
              }}
            >
              <span><CheckCircle2 size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />마지막 백업: {formatRelative(config.lastAt)}</span>
              <span style={{ opacity: 0.85 }}>다음 예정: {formatFuture(config.nextAt)}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={runNow} disabled={busy || !config?.folder} className="flex-1 justify-center py-2">
              <RefreshCw size={13} /> 지금 즉시 백업
            </Button>
            <Button variant="ghost" onClick={() => setRestoreOpen(true)} disabled={!config?.folder} className="flex-1 justify-center py-2">
              <Upload size={13} /> 폴더에서 복원
            </Button>
          </div>
        </>
      )}

      {folderPickerOpen && (
        <FolderPickerDialog
          open={folderPickerOpen}
          onOpenChange={setFolderPickerOpen}
          onPicked={(p) => {
            addToast('success', '백업 폴더를 저장했어요.')
            refresh()
          }}
        />
      )}

      {restoreOpen && config?.folder && (
        <FolderRestoreDialog
          open={restoreOpen}
          onOpenChange={setRestoreOpen}
          folder={config.folder}
          onDone={() => {
            addToast('success', '복원 완료. 화면이 갱신되었습니다.')
          }}
        />
      )}
    </div>
  )
}

function FolderPickerDialog({
  open, onOpenChange, onPicked,
}: { open: boolean; onOpenChange: (v: boolean) => void; onPicked: (p: string) => void }) {
  const addToast = useUIStore((s) => s.addToast)
  const [folders, setFolders] = useState<DetectedCloudFolder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.backup.detectCloudFolders().then((list) => {
      setFolders(list)
      setLoading(false)
    })
  }, [])

  async function pickRecommended(f: DetectedCloudFolder): Promise<void> {
    const r = await window.api.backup.setAutoFolder({ basePath: f.path })
    if (r.ok) {
      onPicked(r.path)
      onOpenChange(false)
    } else {
      addToast('error', `폴더 지정 실패: ${r.reason}`)
    }
  }

  async function pickManual(): Promise<void> {
    const r = await window.api.backup.pickAutoFolder()
    if (r.ok) {
      onPicked(r.path)
      onOpenChange(false)
    } else if (r.reason !== 'canceled') {
      addToast('error', `폴더 지정 실패: ${r.reason}`)
    }
  }

  function providerIcon(p: DetectedCloudFolder['provider']): string {
    if (p === 'GoogleDrive') return '🟦'
    if (p === 'OneDrive') return '🔷'
    if (p === 'Dropbox') return '🟪'
    if (p === 'iCloud') return '☁️'
    return '📁'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="자동 백업 폴더 선택" wide>
      <div className="flex flex-col gap-3">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          감지된 클라우드 동기화 폴더 중에서 고르거나, 직접 폴더를 선택하세요.
          이 폴더 아래 <b>SchoolDesk</b> 하위 폴더를 만들어 암호화 백업 파일을 저장해요.
        </p>

        {loading ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>감지 중...</p>
        ) : folders.length === 0 ? (
          <div
            style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)',
              fontSize: 12.5, color: '#78350F', lineHeight: 1.55,
            }}
          >
            동기화 폴더가 감지되지 않았어요. Google Drive · OneDrive · Dropbox 중 하나를 설치 후
            아래 "직접 선택"으로 수동 지정하세요.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {folders.map((f) => (
              <button
                key={f.path}
                onClick={() => pickRecommended(f)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                  textAlign: 'left', cursor: 'pointer', transition: 'all .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-widget-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-widget)' }}
              >
                <span style={{ fontSize: 18 }}>{providerIcon(f.provider)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{f.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.path}
                  </div>
                </div>
                <CheckCircle2 size={14} style={{ color: 'var(--accent)' }} />
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-between gap-2" style={{ marginTop: 4 }}>
          <Button variant="ghost" onClick={pickManual}>
            <HardDrive size={13} /> 직접 선택
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>닫기</Button>
        </div>
      </div>
    </Dialog>
  )
}

function FolderRestoreDialog({
  open, onOpenChange, folder, onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  folder: string
  onDone: () => void
}) {
  const addToast = useUIStore((s) => s.addToast)
  const [entries, setEntries] = useState<BackupFileEntry[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.backup.listBackupsInFolder({ folder }).then((r) => {
      if (r.ok) {
        setEntries(r.entries)
        if (r.entries[0]) setSelected(r.entries[0].path)
      }
    })
  }, [folder])

  async function run(): Promise<void> {
    if (!selected) { addToast('error', '파일을 선택해주세요.'); return }
    if (pw.length < 4) { addToast('error', '비밀번호를 입력해주세요.'); return }
    setBusy(true)
    try {
      const r = await window.api.backup.importFromPath({ filePath: selected, password: pw })
      if (!r.ok) {
        addToast('error', r.reason === 'decrypt_failed' ? '비밀번호가 맞지 않거나 손상된 파일이에요.' : `복원 실패: ${r.reason}`)
        return
      }
      onDone()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="폴더에서 복원" wide>
      <div className="flex flex-col gap-3">
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          <b>{folder}</b> 안의 백업 중에서 복원할 파일을 선택하세요. 최신 파일이 위에 있어요.
        </p>
        {entries.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            이 폴더에 .sdbackup 파일이 없어요.
          </p>
        ) : (
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {entries.map((e) => (
              <button
                key={e.path}
                onClick={() => setSelected(e.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                  background: selected === e.path ? 'var(--accent-light)' : 'var(--bg-widget)',
                  border: selected === e.path ? '1px solid var(--accent)' : '1px solid var(--border-widget)',
                  transition: 'all .1s',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {new Date(e.mtime).toLocaleString('ko-KR', { hour12: false })} · {Math.round(e.bytes / 1024)} KB
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        <Input
          type="password"
          label="비밀번호"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>취소</Button>
          <Button variant="danger" disabled={busy || !selected || pw.length < 4} onClick={run}>
            <Upload size={14} /> {busy ? '복원 중...' : '복원 진행'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
