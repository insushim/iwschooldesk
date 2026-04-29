import { useEffect, useState } from 'react'
import {
  ShieldCheck, KeyRound, Copy, AlertTriangle, Download, Upload,
  RefreshCw, Trash2, Check, FileLock2, Eye,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Dialog } from '../ui/Dialog'
import { useUIStore } from '../../stores/ui.store'
import { AutoBackupSection } from './AutoBackupSection'

/**
 * 암호화 백업/복원 섹션.
 *
 * 설계:
 *   - 최초 1회 "설정"에서 BIP39 12단어 복구구문 생성 + 비밀번호 설정.
 *     복구구문은 교사가 프린트/필사해 보관. 앱은 safeStorage 로 OS 키체인에 암호화 저장.
 *   - 이후 "백업 저장"은 비밀번호만 입력하면 됨.
 *   - "백업 복원"은 같은 기기면 비밀번호, 새 기기면 복구구문 입력.
 */

type ConfigStatus = {
  secureAvailable: boolean
  hasMnemonic: boolean
  hasPassword: boolean
}

export function EncryptedBackupSection() {
  const addToast = useUIStore((s) => s.addToast)
  const [status, setStatus] = useState<ConfigStatus | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [revealOpen, setRevealOpen] = useState(false)

  async function refreshStatus(): Promise<void> {
    const s = await window.api.backup.isConfigured()
    setStatus(s)
  }

  useEffect(() => { refreshStatus() }, [])

  const configured = !!(status?.hasMnemonic && status?.hasPassword)

  return (
    <div className="space-y-4">
      <div
        className="flex items-start gap-3"
        style={{
          padding: '14px 16px', borderRadius: 12,
          background: 'rgba(37,99,235,0.08)',
          border: '1px solid rgba(37,99,235,0.22)',
        }}
      >
        <ShieldCheck size={18} strokeWidth={2.2} style={{ color: '#1D4ED8', marginTop: 2 }} className="shrink-0" />
        <div className="flex-1">
          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1E3A8A', letterSpacing: '-0.2px', marginBottom: 4 }}>
            암호화 전체 백업 · 새 컴퓨터 이관
          </div>
          <p style={{ fontSize: 12.5, color: '#1E40AF', lineHeight: 1.55, letterSpacing: '-0.2px', fontWeight: 500 }}>
            모든 위젯 데이터(학생기록 포함)를 AES-256-GCM 으로 암호화해 저장합니다.
            학생기록 해시체인도 그대로 보존돼 법원 증거 효력이 유지됩니다.
            <br />
            컴퓨터를 바꿔도 <b>같은 비밀번호</b> 또는 <b>복구구문(12단어)</b> 만 있으면 그대로 이어서 쓸 수 있어요.
          </p>
        </div>
      </div>

      {status && !status.secureAvailable && (
        <div
          className="flex items-start gap-3"
          style={{
            padding: '12px 14px', borderRadius: 10,
            background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)',
          }}
        >
          <AlertTriangle size={16} strokeWidth={2.4} style={{ color: '#B91C1C', marginTop: 2 }} className="shrink-0" />
          <p style={{ fontSize: 12.5, color: '#991B1B', lineHeight: 1.5, fontWeight: 600 }}>
            이 컴퓨터는 OS 키체인(safeStorage) 을 쓸 수 없어 복구구문을 안전하게 저장할 수 없습니다.
            Windows 계정 비밀번호가 설정된 PC에서 사용해주세요.
          </p>
        </div>
      )}

      {!configured && status?.secureAvailable && (
        <Button variant="default" className="w-full justify-center py-3" onClick={() => setSetupOpen(true)}>
          <KeyRound size={16} />
          암호화 백업 처음 설정하기
        </Button>
      )}

      {configured && (
        <>
          <div className="space-y-2.5">
            <Button variant="default" className="w-full justify-start py-3" onClick={() => setSaveOpen(true)}>
              <Download size={16} />
              암호화 백업 수동 저장
            </Button>
            <Button variant="secondary" className="w-full justify-start py-3" onClick={() => setRestoreOpen(true)}>
              <Upload size={16} />
              파일에서 복원 (수동)
            </Button>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" className="flex-1 justify-center py-2" onClick={() => setRevealOpen(true)}>
                <Eye size={13} /> 복구구문 다시 보기
              </Button>
              <Button variant="ghost" className="flex-1 justify-center py-2 text-red-600" onClick={() => setClearOpen(true)}>
                <Trash2 size={13} /> 자격증명 해제
              </Button>
            </div>
          </div>

          {/* 자동 백업 섹션 (핵심 UX) */}
          <AutoBackupSection
            canUseSecureStorage={!!status?.secureAvailable}
            hasCredentials={configured}
          />
        </>
      )}

      {/* 복원은 미설정 상태에서도 가능 — 새 컴퓨터 첫 설치 시나리오 */}
      {!configured && status?.secureAvailable && (
        <Button variant="secondary" className="w-full justify-center py-3" onClick={() => setRestoreOpen(true)}>
          <Upload size={16} />
          이미 있는 백업 파일로 복원하기 (새 컴퓨터)
        </Button>
      )}

      {setupOpen && (
        <SetupDialog
          open={setupOpen}
          onOpenChange={setSetupOpen}
          onDone={() => {
            addToast('success', '암호화 백업이 설정되었어요.')
            refreshStatus()
          }}
        />
      )}
      {saveOpen && (
        <SaveDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          onDone={(info) => {
            const kb = Math.round(info.bytes / 1024)
            addToast('success', `백업 저장 완료 · ${kb} KB`)
          }}
        />
      )}
      {restoreOpen && (
        <RestoreDialog
          open={restoreOpen}
          onOpenChange={setRestoreOpen}
          canPersistSetup={!!status?.secureAvailable}
          onDone={(info) => {
            const when = info.meta?.created_at_local ?? ''
            addToast('success', `복원 완료 · ${when} 시점 백업`)
            refreshStatus()
          }}
        />
      )}
      {clearOpen && (
        <ClearSetupDialog
          open={clearOpen}
          onOpenChange={setClearOpen}
          onDone={() => {
            addToast('info', '이 컴퓨터의 저장 자격증명을 해제했어요.')
            refreshStatus()
          }}
        />
      )}
      {revealOpen && (
        <RevealMnemonicDialog open={revealOpen} onOpenChange={setRevealOpen} />
      )}
    </div>
  )
}

function RevealMnemonicDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const addToast = useUIStore((s) => s.addToast)
  const [pw, setPw] = useState('')
  const [phrase, setPhrase] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reveal(): Promise<void> {
    if (pw.length < 4) { addToast('error', '비밀번호를 입력해주세요.'); return }
    setBusy(true)
    try {
      const r = await window.api.backup.revealMnemonic({ password: pw })
      if (!r.ok) {
        addToast('error', r.reason === 'password_mismatch' ? '비밀번호가 맞지 않아요.' : `실패: ${r.reason}`)
        return
      }
      setPhrase(r.mnemonic)
    } finally {
      setBusy(false)
    }
  }

  async function copyPhrase(): Promise<void> {
    if (!phrase) return
    try {
      await navigator.clipboard.writeText(phrase)
      addToast('success', '복사했어요.')
    } catch {
      addToast('error', '복사 실패')
    }
  }

  const words = phrase ? phrase.trim().split(/\s+/) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="복구구문 다시 보기" wide>
      <div className="flex flex-col gap-3">
        {!phrase ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              분실/확인 목적이에요. 비밀번호를 입력하면 저장된 12단어를 다시 보여드려요.
            </p>
            <Input
              type="password"
              label="비밀번호"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') void reveal() }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>취소</Button>
              <Button variant="default" disabled={busy} onClick={reveal}>
                <Eye size={13} /> {busy ? '확인 중...' : '보기'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                padding: 14, borderRadius: 10,
                background: 'var(--bg-secondary)', border: '1px dashed var(--border-widget)',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {words.map((w, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 10px', borderRadius: 8,
                      background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                      fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.2px', color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 18, fontFamily: 'ui-monospace,monospace' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={copyPhrase}>
                <Copy size={13} /> 클립보드로 복사
              </Button>
              <Button variant="default" onClick={() => onOpenChange(false)}>닫기</Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

// ─── 설정 다이얼로그 ────────────────────────────────────────────
function SetupDialog({
  open, onOpenChange, onDone,
}: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const addToast = useUIStore((s) => s.addToast)
  const [step, setStep] = useState<'intro' | 'phrase' | 'confirm' | 'password'>('intro')
  const [phrase, setPhrase] = useState('')
  const [savedCheck, setSavedCheck] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  async function genPhrase(): Promise<void> {
    const p = await window.api.backup.generateMnemonic('korean')
    setPhrase(p)
    setStep('phrase')
  }

  async function finish(): Promise<void> {
    if (pw.length < 4) { addToast('error', '비밀번호는 최소 4자 이상이어야 해요.'); return }
    if (pw !== pw2) { addToast('error', '비밀번호가 서로 달라요.'); return }
    setBusy(true)
    try {
      const r = await window.api.backup.setup({ password: pw, mnemonic: phrase })
      if (!r.ok) {
        addToast('error', `설정 실패: ${r.reason}`)
        return
      }
      onDone()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  async function copyPhrase(): Promise<void> {
    try {
      await navigator.clipboard.writeText(phrase)
      addToast('success', '복구구문을 복사했어요. 안전한 곳에 붙여넣으세요.')
    } catch {
      addToast('error', '복사에 실패했어요. 손으로 받아 적어 주세요.')
    }
  }

  const words = phrase ? phrase.trim().split(/\s+/) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="암호화 백업 처음 설정" wide>
      <div className="flex flex-col gap-4">
        {step === 'intro' && (
          <>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              다음 3단계로 설정합니다.
            </p>
            <ol style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)', paddingLeft: 18, listStyle: 'decimal' }}>
              <li><b>복구구문(12단어)</b> 을 받아서 안전한 곳에 <b>반드시 프린트/필사</b> 하여 보관</li>
              <li><b>비밀번호</b> 를 설정 (평상시 백업 저장·복원에 사용)</li>
              <li>완료 후 언제든 "암호화 백업 저장" 버튼으로 .sdbackup 파일 생성 가능</li>
            </ol>
            <div
              style={{
                padding: '10px 12px', borderRadius: 10,
                background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)',
                fontSize: 12.5, color: '#78350F', lineHeight: 1.55, fontWeight: 500,
              }}
            >
              <b>복구구문을 분실하면 복구 수단이 없어집니다.</b> 비밀번호를 잊어도 복구구문만 있으면 복원 가능하지만,
              둘 다 잊으면 백업 파일을 열 수 없어요. 반드시 종이에 적어 두세요.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>취소</Button>
              <Button variant="default" onClick={genPhrase}>
                <RefreshCw size={14} /> 복구구문 생성하기
              </Button>
            </div>
          </>
        )}

        {step === 'phrase' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              아래 12단어가 복구구문입니다. <b>순서 그대로</b> 프린트하거나 종이에 적어두세요.
            </p>
            <div
              style={{
                padding: '14px', borderRadius: 10,
                background: 'var(--bg-secondary)', border: '1px dashed var(--border-widget)',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                {words.map((w, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 10px', borderRadius: 8,
                      background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                      fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.2px', color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 18, fontFamily: 'ui-monospace,monospace' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={copyPhrase}>
                <Copy size={14} /> 클립보드로 복사
              </Button>
              <Button variant="ghost" onClick={genPhrase}>
                <RefreshCw size={14} /> 다시 생성
              </Button>
            </div>
            <label
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 12px', borderRadius: 10,
                background: savedCheck ? 'rgba(34,197,94,0.08)' : 'var(--bg-secondary)',
                border: savedCheck ? '1px solid rgba(34,197,94,0.35)' : '1px solid var(--border-widget)',
                cursor: 'pointer', transition: 'all .15s ease',
                fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
              }}
            >
              <input
                type="checkbox"
                checked={savedCheck}
                onChange={(e) => setSavedCheck(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>위 12단어를 <b>종이에 적거나 안전한 곳에 보관했습니다.</b></span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep('intro')}>뒤로</Button>
              <Button variant="default" disabled={!savedCheck} onClick={() => setStep('password')}>
                다음: 비밀번호 설정
              </Button>
            </div>
          </>
        )}

        {step === 'password' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              평상시 백업 저장·복원에 사용할 비밀번호를 설정해 주세요. 4자 이상.
            </p>
            <Input
              type="password"
              label="비밀번호"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="예: 잊지않을문장"
            />
            <Input
              type="password"
              label="비밀번호 확인"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="한 번 더 입력"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep('phrase')}>뒤로</Button>
              <Button variant="default" disabled={busy} onClick={finish}>
                <Check size={14} /> {busy ? '저장 중...' : '설정 완료'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

// ─── 저장 다이얼로그 ────────────────────────────────────────────
function SaveDialog({
  open, onOpenChange, onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: (info: { bytes: number; path: string }) => void
}) {
  const addToast = useUIStore((s) => s.addToast)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(): Promise<void> {
    if (pw.length < 4) { addToast('error', '비밀번호를 입력해주세요.'); return }
    setBusy(true)
    try {
      const r = await window.api.backup.exportEncrypted({ password: pw })
      if (!r.ok) {
        if (r.reason === 'canceled') { onOpenChange(false); return }
        addToast('error', `저장 실패: ${r.reason}`)
        return
      }
      onDone({ bytes: r.bytes, path: r.path })
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="암호화 백업 저장">
      <div className="flex flex-col gap-3">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          설정된 비밀번호를 입력하면 모든 위젯 데이터가 암호화된 .sdbackup 파일로 저장됩니다.
          파일을 USB·클라우드 드라이브 어디든 둬도 안전해요.
        </p>
        <Input
          type="password"
          label="비밀번호"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') void run() }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>취소</Button>
          <Button variant="default" disabled={busy} onClick={run}>
            <FileLock2 size={14} /> {busy ? '암호화 중...' : '저장'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

// ─── 복원 다이얼로그 ────────────────────────────────────────────
function RestoreDialog({
  open, onOpenChange, canPersistSetup, onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  canPersistSetup: boolean
  onDone: (info: { meta?: { created_at_local?: string } }) => void
}) {
  const addToast = useUIStore((s) => s.addToast)
  const [mode, setMode] = useState<'password' | 'mnemonic'>('password')
  const [pw, setPw] = useState('')
  const [phrase, setPhrase] = useState('')
  const [replaceLocal, setReplaceLocal] = useState(true)
  const [busy, setBusy] = useState(false)

  async function run(): Promise<void> {
    const creds: { password?: string; mnemonic?: string; replaceLocalSetup?: boolean } = {}
    if (mode === 'password') {
      if (pw.length < 4) { addToast('error', '비밀번호를 입력해주세요.'); return }
      creds.password = pw
    } else {
      const words = phrase.trim().split(/\s+/)
      if (words.length < 12) { addToast('error', '복구구문 12단어를 모두 입력해주세요.'); return }
      creds.mnemonic = phrase.trim()
      // 새 기기에서 복구구문으로 복원할 때는 비밀번호도 함께 입력받아 local setup 에 반영할 수 있음
      if (pw.length >= 4) creds.password = pw
    }
    creds.replaceLocalSetup = canPersistSetup && replaceLocal && !!creds.password && !!creds.mnemonic
    setBusy(true)
    try {
      const r = await window.api.backup.importEncrypted(creds)
      if (!r.ok) {
        if (r.reason === 'canceled') { onOpenChange(false); return }
        if (r.reason === 'chain_invalid') {
          addToast('error', `해시체인 검증 실패 — 복원이 거부되었어요 (#${r.firstMismatchIndex ?? '?'})`)
        } else {
          addToast('error', `복원 실패: ${r.reason}`)
        }
        return
      }
      onDone({ meta: r.meta })
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  const isMn = mode === 'mnemonic'

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="암호화 백업 복원" wide>
      <div className="flex flex-col gap-4">
        <div
          style={{
            padding: '10px 12px', borderRadius: 10,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.24)',
            fontSize: 12.5, color: '#991B1B', lineHeight: 1.55, fontWeight: 500,
          }}
        >
          복원하면 <b>현재 모든 데이터가 백업 파일의 내용으로 교체</b>됩니다.
          학생기록 해시체인은 재검증 후 적용되며, 체인이 깨져 있으면 복원이 거부돼요.
        </div>

        <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 10, background: 'var(--bg-secondary)' }}>
          <button
            onClick={() => setMode('password')}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: !isMn ? 'var(--bg-widget)' : 'transparent',
              color: !isMn ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: !isMn ? '1px solid var(--border-widget)' : '1px solid transparent',
              cursor: 'pointer', transition: 'all .15s',
            }}
          >
            비밀번호로 복원
          </button>
          <button
            onClick={() => setMode('mnemonic')}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: isMn ? 'var(--bg-widget)' : 'transparent',
              color: isMn ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: isMn ? '1px solid var(--border-widget)' : '1px solid transparent',
              cursor: 'pointer', transition: 'all .15s',
            }}
          >
            복구구문으로 복원 (비밀번호 분실 시)
          </button>
        </div>

        {mode === 'password' ? (
          <Input
            type="password"
            label="비밀번호"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
          />
        ) : (
          <>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '-0.2px' }}>
              복구구문 12단어 (공백 또는 줄바꿈 구분)
            </label>
            <textarea
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              rows={3}
              placeholder="프린트한 12단어를 순서대로 입력"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                fontSize: 13.5, fontFamily: 'ui-monospace,monospace',
                color: 'var(--text-primary)', lineHeight: 1.6, resize: 'vertical',
              }}
              autoFocus
            />
            <Input
              type="password"
              label="새 비밀번호 (선택 — 이 컴퓨터에서 앞으로 사용할 비밀번호)"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="입력하면 이 컴퓨터의 백업 설정으로 저장됩니다"
            />
            {canPersistSetup && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={replaceLocal}
                  onChange={(e) => setReplaceLocal(e.target.checked)}
                />
                복원 후 이 컴퓨터에 자격증명을 저장 (이후 비밀번호만으로 저장 가능)
              </label>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>취소</Button>
          <Button variant="danger" disabled={busy} onClick={run}>
            <Upload size={14} /> {busy ? '복원 중...' : '복원 진행'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

// ─── 자격증명 해제 ─────────────────────────────────────────────
function ClearSetupDialog({
  open, onOpenChange, onDone,
}: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const addToast = useUIStore((s) => s.addToast)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(): Promise<void> {
    setBusy(true)
    try {
      const r = await window.api.backup.clearSetup({ password: pw })
      if (!r.ok) {
        addToast('error', r.reason === 'password_mismatch' ? '비밀번호가 맞지 않아요.' : `실패: ${r.reason}`)
        return
      }
      onDone()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="이 컴퓨터 자격증명 해제">
      <div className="flex flex-col gap-3">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          해제하면 이 컴퓨터에 저장된 복구구문/비밀번호 hash 가 삭제됩니다.
          이미 만든 .sdbackup 파일은 프린트한 복구구문 또는 알고 있는 비밀번호로 계속 복원할 수 있어요.
        </p>
        <Input
          type="password"
          label="현재 비밀번호"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>취소</Button>
          <Button variant="danger" disabled={busy || pw.length < 4} onClick={run}>
            <Trash2 size={14} /> 해제
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
