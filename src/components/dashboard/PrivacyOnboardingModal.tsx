import { useEffect, useState } from 'react'
import { Shield, Lock, Server, Check } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'

/** 첫 실행 시 1회만 표시. localStorage 플래그로 재표시 차단.
 *  사용자에게 "개발사가 학생 정보를 수집하지 않으며, 본인이 보관 책임자"임을 명확히 인지시키는 안내. */
const ACK_KEY = 'privacy:acknowledged:v1'

export function PrivacyOnboardingModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      const acked = localStorage.getItem(ACK_KEY)
      if (!acked) setOpen(true)
    } catch { /* ignore */ }
  }, [])

  const acknowledge = (): void => {
    try { localStorage.setItem(ACK_KEY, new Date().toISOString()) } catch { /* ignore */ }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) acknowledge() }} title="시작하기 전에">
      <div className="space-y-4" style={{ maxWidth: 480 }}>
        <div className="flex items-start gap-3" style={{
          padding: 14, borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(16,185,129,0.10) 0%, rgba(5,150,105,0.14) 100%)',
          border: '1px solid rgba(16,185,129,0.28)',
        }}>
          <Shield size={22} color="#059669" strokeWidth={2.2} />
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#065F46', lineHeight: 1.5 }}>
            SchoolDesk 는 학생·교사 개인정보를 <b>개발사 서버로 전송하지 않습니다.</b>
            모든 데이터는 사용자의 PC 에만 저장됩니다.
          </div>
        </div>

        <div className="space-y-2.5" style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <Row icon={Server} text="외부 서버 호출은 NEIS(급식·학교)·기상청(날씨)·에어코리아(미세먼지) 만 사용 — 학생 정보 미전송" />
          <Row icon={Lock} text="학생기록·메모는 로컬 SQLite + AES-256-GCM 암호화로 저장 · 해시체인으로 변조 탐지" />
          <Row icon={Check} text="개인정보보호법(PIPA)상 보관 책임은 사용 교사·학교에 있습니다. PC 잠금·백업 암호화·분실 대비 권장" />
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-secondary)' }}>
          자세한 내용은 <b>설정 → 개인정보</b> 탭에서 확인하실 수 있습니다.
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={acknowledge}>
            확인했어요
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function Row({ icon: Icon, text }: { icon: typeof Shield; text: string }): React.ReactElement {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={14} color="var(--accent)" strokeWidth={2.2} style={{ marginTop: 2, flexShrink: 0 }} />
      <span>{text}</span>
    </div>
  )
}
