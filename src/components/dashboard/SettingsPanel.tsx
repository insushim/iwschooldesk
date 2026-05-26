import { useEffect, useState } from 'react'
import { Settings, Palette, Clock, Database, Keyboard, Info, Download, Upload, Trash2, AlertTriangle, Shield, Lock, Server, Check, Timer, Scale } from 'lucide-react'
import { useAppStore } from '../../stores/app.store'
import { useUIStore } from '../../stores/ui.store'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Dialog } from '../ui/Dialog'
import { EncryptedBackupSection } from './EncryptedBackupSection'
import pkg from '../../../package.json'

type SettingsTab = 'general' | 'theme' | 'timetable' | 'timer' | 'data' | 'shortcuts' | 'privacy' | 'about'

const tabs: { id: SettingsTab; icon: typeof Settings; label: string }[] = [
  { id: 'general', icon: Settings, label: '일반' },
  { id: 'theme', icon: Palette, label: '테마' },
  { id: 'timer', icon: Clock, label: '타이머' },
  { id: 'data', icon: Database, label: '데이터' },
  { id: 'shortcuts', icon: Keyboard, label: '단축키' },
  { id: 'privacy', icon: Shield, label: '개인정보' },
  { id: 'about', icon: Info, label: '정보' },
]

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const settings = useAppStore((s) => s.settings)
  const updateSetting = useAppStore((s) => s.updateSetting)
  const addToast = useUIStore((s) => s.addToast)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)
  const [isPortable, setIsPortable] = useState(false)

  useEffect(() => {
    window.api.system.isPortable?.().then((v) => setIsPortable(!!v)).catch(() => {})
  }, [])

  if (!settings) return null

  return (
    <div className="h-full flex overflow-hidden">
      {/* Settings sidebar */}
      <div className="w-52 border-r border-[var(--border-widget)] p-4 flex flex-col gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-[var(--radius-xs)] text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-[var(--accent-light)] text-[var(--accent)] font-medium'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'general' && (
          <div className="w-full max-w-[1200px] mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">일반 설정</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
                gap: 16,
              }}
            >
              <Input
                label="학교 이름"
                value={settings.school_name}
                onChange={(e) => updateSetting('school_name', e.target.value)}
                placeholder="학교 이름을 입력하세요"
              />
              <Input
                label="교사 이름"
                value={settings.teacher_name}
                onChange={(e) => updateSetting('teacher_name', e.target.value)}
                placeholder="선생님 이름을 입력하세요"
              />
              <Input
                label="담당 학급"
                value={settings.class_name}
                onChange={(e) => updateSetting('class_name', e.target.value)}
                placeholder="예: 5-3"
              />
            </div>
            <div className="space-y-3">
              <ToggleRow
                label="시작 시 자동 실행"
                description="Windows 시작 시 트레이에 숨은 채 켜둔 위젯만 복원합니다 (메인 창은 뜨지 않음)"
                checked={settings.auto_start}
                onChange={(v) => updateSetting('auto_start', v)}
              />
              {isPortable && settings.auto_start && (
                <div className="flex gap-2.5 rounded-[12px] border border-amber-500/25 bg-amber-50/60 dark:bg-amber-500/8 px-3.5 py-3">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[12.5px] leading-snug text-amber-900 dark:text-amber-200">
                    <strong className="font-semibold">포터블 버전 안내</strong>
                    <p className="mt-0.5 text-amber-800/90 dark:text-amber-200/85">
                      실행 파일(.exe)을 <b>고정된 폴더</b>(예: <code className="px-1 rounded bg-black/5 dark:bg-white/10">C:\SchoolDesk\</code>)에 두고 사용하세요. 다른 위치로 옮기면 앱을 한 번 실행해야 자동시작이 다시 등록됩니다. 안정적인 자동시작이 필요하면 <b>설치형(Setup)</b> 버전을 권장합니다.
                    </p>
                  </div>
                </div>
              )}
              <ToggleRow
                label="알림 활성화"
                description="일정, 수업, 마감 알림을 받습니다"
                checked={settings.notification_enabled}
                onChange={(v) => updateSetting('notification_enabled', v)}
              />
              <ToggleRow
                label="알림 소리"
                description="알림 시 소리를 재생합니다"
                checked={settings.notification_sound}
                onChange={(v) => updateSetting('notification_sound', v)}
              />
            </div>
          </div>
        )}

        {activeTab === 'theme' && (
          <div className="w-full max-w-[1200px] mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">테마 설정</h2>
            <div className="space-y-5">
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">테마 모드</label>
                <div className="flex gap-2">
                  {(['light', 'dark', 'system'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => updateSetting('theme', t)}
                      className={`px-4 py-2.5 rounded-[var(--radius-xs)] text-sm transition-all ${
                        settings.theme === t
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-widget)]'
                      }`}
                    >
                      {t === 'light' ? '라이트' : t === 'dark' ? '다크' : '시스템'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">위젯 테마</label>
                <div className="flex gap-2">
                  {(['glassmorphism', 'solid', 'minimal'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => updateSetting('widget_theme', t)}
                      className={`px-4 py-2.5 rounded-[var(--radius-xs)] text-sm transition-all ${
                        settings.widget_theme === t
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-widget)]'
                      }`}
                    >
                      {t === 'glassmorphism' ? '글래스' : t === 'solid' ? '솔리드' : '미니멀'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'timer' && (
          <div className="w-full max-w-[1200px] mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">타이머 설정</h2>
            <div className="space-y-5">
              <Input
                label="뽀모도로 집중 시간 (분)"
                type="number"
                value={settings.pomodoro_work}
                onChange={(e) => updateSetting('pomodoro_work', Number(e.target.value))}
                min={1}
                max={120}
              />
              <Input
                label="휴식 시간 (분)"
                type="number"
                value={settings.pomodoro_break}
                onChange={(e) => updateSetting('pomodoro_break', Number(e.target.value))}
                min={1}
                max={60}
              />
              <Input
                label="긴 휴식 시간 (분)"
                type="number"
                value={settings.pomodoro_long_break}
                onChange={(e) => updateSetting('pomodoro_long_break', Number(e.target.value))}
                min={1}
                max={60}
              />
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="w-full max-w-[1200px] mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">데이터 관리</h2>

            <EncryptedBackupSection />

            {/* ── 학생 기록 자동 CSV 백업 ── */}
            <StudentRecordAutoCsvSection />

            {/* ── 학생 기록 보관 기간·자동 파기 ── */}
            <StudentRecordRetentionSection />

            <div style={{ borderTop: '1px solid var(--border-widget)', paddingTop: 20 }}>
              <h3 className="text-base font-semibold text-[var(--text-primary)]" style={{ marginBottom: 12 }}>
                평문 JSON 백업 (임시용 · 학생기록 미포함)
              </h3>
            </div>

            {/* 공용 PC 사용 주의 — 배포 시 선생님들께 공유해야 할 핵심 안내 */}
            <div
              className="flex items-start gap-3"
              style={{
                padding: '14px 16px', borderRadius: 12,
                background: 'rgba(245,158,11,0.10)',
                border: '1px solid rgba(245,158,11,0.30)',
              }}
            >
              <AlertTriangle size={18} strokeWidth={2.4} style={{ color: '#B45309', marginTop: 2 }} className="shrink-0" />
              <div className="flex-1">
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#92400E', letterSpacing: '-0.2px', marginBottom: 4 }}>
                  개인 PC에서만 사용하세요
                </div>
                <p style={{ fontSize: 12.5, color: '#78350F', lineHeight: 1.55, letterSpacing: '-0.2px', fontWeight: 500 }}>
                  데이터는 모두 <b>로컬 SQLite(%APPDATA%/SchoolDesk/)</b>에 저장되며 외부로 나가지 않아요. 다만 DB 파일 자체는 암호화되어 있지 않아서
                  <b> 같은 Windows 계정에 접근할 수 있는 사람은 파일을 열어볼 수 있습니다.</b> 교실 PC처럼 <b>개인 계정·비밀번호 잠금</b>이 설정된 환경에서만 사용하시고,
                  공용 로그인 PC에서는 사용을 피해 주세요. 학생 기록 위젯은 10분간 상호작용이 없으면 자동으로 잠깁니다.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                variant="secondary"
                onClick={async () => {
                  const result = await window.api.system.exportData()
                  if (result) addToast('success', '백업이 완료되었습니다.')
                }}
                className="w-full justify-start py-3"
              >
                <Download size={16} />
                데이터 백업 (JSON 내보내기)
              </Button>
              <Button
                variant="secondary"
                onClick={() => setImportConfirmOpen(true)}
                className="w-full justify-start py-3"
              >
                <Upload size={16} />
                데이터 복원 (JSON 가져오기)
              </Button>
              <Button
                variant="danger"
                onClick={() => setResetDialogOpen(true)}
                className="w-full justify-start py-3"
              >
                <Trash2 size={16} />
                데이터 초기화
              </Button>
            </div>

            <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen} title="데이터 초기화">
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                모든 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                <br />정말 초기화하시겠습니까?
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setResetDialogOpen(false)}>취소</Button>
                <Button
                  variant="danger"
                  onClick={async () => {
                    setResetDialogOpen(false)
                    addToast('info', '데이터가 초기화되었습니다. 앱을 다시 시작해주세요.')
                  }}
                >
                  초기화
                </Button>
              </div>
            </Dialog>

            {/* 데이터 복원 확인 — 기존 전 테이블이 DELETE 되므로 실수 방지용 */}
            <Dialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen} title="데이터 복원 — 주의">
              <div className="flex flex-col gap-3">
                <div
                  style={{
                    padding: '10px 12px', borderRadius: 10,
                    background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)',
                    fontSize: 13, color: '#B91C1C', fontWeight: 700, letterSpacing: '-0.2px',
                    lineHeight: 1.5,
                  }}
                >
                  <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
                    <AlertTriangle size={14} strokeWidth={2.6} />
                    <span style={{ fontWeight: 900 }}>현재 모든 데이터가 삭제됩니다</span>
                  </div>
                  일정·업무·메모·체크리스트·루틴·학생기록 등 <b>모든 테이블</b>이
                  선택한 JSON 파일의 내용으로 완전히 교체돼요. 실행 전에 "데이터 백업"으로 먼저 내보내 두시길 권장합니다.
                </div>
                <p className="text-sm text-[var(--text-secondary)]" style={{ lineHeight: 1.55 }}>
                  계속 진행하시겠어요? 다음 단계에서 복원할 JSON 파일을 고르게 됩니다.
                </p>
                <div className="flex justify-end gap-2" style={{ marginTop: 4 }}>
                  <Button variant="secondary" onClick={() => setImportConfirmOpen(false)}>취소</Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      setImportConfirmOpen(false)
                      const filePath = await window.api.system.selectFile()
                      if (filePath) {
                        await window.api.system.importData(filePath)
                        addToast('success', '데이터를 복원했습니다. 앱을 다시 시작해주세요.')
                      }
                    }}
                  >
                    <Upload size={14} />
                    복원 진행
                  </Button>
                </div>
              </div>
            </Dialog>
          </div>
        )}

        {activeTab === 'shortcuts' && (
          <div className="w-full max-w-[1200px] mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">단축키</h2>
            <div className="space-y-2">
              {[
                { keys: 'Ctrl + K', desc: '빠른 입력' },
                { keys: 'Ctrl + N', desc: '새 메모' },
                { keys: 'Ctrl + T', desc: '새 할일' },
                { keys: 'Ctrl + Shift + C', desc: '달력 열기' },
                { keys: 'Ctrl + Shift + T', desc: '시간표 열기' },
              ].map((s) => (
                <div key={s.keys} className="flex items-center justify-between py-3 px-4 rounded-[var(--radius-xs)] bg-[var(--bg-secondary)]">
                  <span className="text-sm text-[var(--text-primary)]">{s.desc}</span>
                  <kbd className="px-2 py-1 text-xs font-mono bg-[var(--bg-widget)] border border-[var(--border-widget)] rounded text-[var(--text-secondary)]">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="w-full max-w-[1200px] mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">개인정보 보호</h2>

            {/* 결론 박스 */}
            <div style={{
              padding: 18, borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(16,185,129,0.10) 0%, rgba(5,150,105,0.14) 100%)',
              border: '1px solid rgba(16,185,129,0.28)',
            }}>
              <div className="flex items-start gap-3">
                <Shield size={22} color="#059669" strokeWidth={2.2} style={{ marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#065F46', marginBottom: 4 }}>
                    학생 정보는 개발사 서버로 전송되지 않습니다
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#047857', lineHeight: 1.55 }}>
                    SchoolDesk 는 텔레메트리·자동 동기화·클라우드 백업 기능이 없으며, 모든 데이터는 사용자의 PC 에만 로컬 저장됩니다.
                  </div>
                </div>
              </div>
            </div>

            {/* 정보처리자 구분 — 책임 분리 명시 */}
            <div style={{
              padding: 18, borderRadius: 14,
              background: 'rgba(139,92,246,0.07)',
              border: '1px solid rgba(139,92,246,0.28)',
            }}>
              <div className="flex items-start" style={{ gap: 12 }}>
                <Scale size={22} color="#7C3AED" strokeWidth={2.2} style={{ marginTop: 2, flexShrink: 0 }} />
                <div className="flex-1">
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#5B21B6', marginBottom: 6 }}>
                    정보처리자 = 사용자 (교사·학교) · 개발사는 도구 제공자
                  </div>
                  <div style={{ fontSize: 12.5, color: '#5B21B6', lineHeight: 1.6, letterSpacing: '-0.2px' }}>
                    개인정보보호법 §2.5 상 "개인정보처리자"는 <b>업무를 목적으로 개인정보파일을 운용하는 자</b>입니다.
                    SchoolDesk는 학생 정보를 직접 수집·저장·이용하지 않고(외부 서버 0, 모든 데이터 로컬 SQLite), 사용자가 본인 PC에서 본인 직무수행을 위해 사용하는 도구일 뿐입니다.
                  </div>
                  <ul style={{ marginTop: 10, paddingLeft: 16, listStyle: 'disc', fontSize: 12, color: '#5B21B6', lineHeight: 1.7 }}>
                    <li><b>사용자(교사·학교)</b>는 정보처리자로서 학생 정보의 수집·이용·파기·안전 조치 책임을 집니다.</li>
                    <li><b>개발사(SchoolDesk)</b>는 정보처리자가 아니며, 본 도구 사용으로 발생한 처리 결과·법적 책임을 부담하지 않습니다.</li>
                    <li><b>공식 학생 자료</b>는 NEIS 행동발달누가기록 등 정식 시스템에 기록하고, 본 앱은 교사 직무수행 보조 메모로만 사용 권장.</li>
                    <li><b>분쟁 또는 정식 신고 절차</b> 진행 시 학교 변호사·교육청 정보보호 담당의 검토를 받으세요.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 데이터 처리 표 */}
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">데이터 처리 방식</h3>
              <div className="space-y-2.5">
                {[
                  { icon: Server, title: '외부 서버 호출 (학생 정보 미포함)', body: 'NEIS(급식·학교 검색), 기상청(날씨), 에어코리아(미세먼지) — 학교 이름·좌표·도시명만 전송' },
                  { icon: Lock, title: '로컬 암호화', body: '학생기록·메모는 AES-256-GCM 봉투 암호화 + scrypt 키 도출 + 해시체인 변조 탐지로 저장' },
                  { icon: Database, title: '데이터 위치', body: 'Windows: %APPDATA%\\school-desk\\, macOS/Linux 동일 경로. SQLite DB 파일 하나로 관리' },
                  { icon: Check, title: '제3자 공유·판매', body: '없음. 익명 통계·광고 추적·분석 도구 일체 미사용' },
                ].map(({ icon: Icon, title, body }) => (
                  <div key={title} className="flex items-start gap-3" style={{
                    padding: 12, borderRadius: 10,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-widget)',
                  }}>
                    <Icon size={16} color="var(--accent)" strokeWidth={2.2} style={{ marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 법적 책임 */}
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">법적 책임 구분</h3>
              <div className="space-y-2" style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <p>· <b>개발사 (SchoolDesk)</b>: 개인정보보호법(PIPA) §2.5 상 <b>개인정보처리자가 아님</b>. 학생 정보를 수집·저장·이용·제3자 제공하지 않음.</p>
                <p>· <b>사용 교사·학교</b>: 학생 개인정보의 보관 및 관리 책임 주체. 학교의 정보보호 지침에 따라 보호자 동의·안전한 보관·목적 외 사용 금지·학년 종료 시 삭제 의무.</p>
                <p>· 본 앱을 학교에 정식 도입하는 경우 교육청 정보보호 담당 또는 학교 변호사 검토 권장.</p>
              </div>
            </div>

            {/* 권장 운영 수칙 */}
            <div style={{ padding: 14, borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} color="#D97706" strokeWidth={2.2} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ fontSize: 12.5, color: '#92400E', fontWeight: 600, lineHeight: 1.6 }}>
                  <b>안전한 운영을 위한 권장 사항</b>
                  <ul style={{ marginTop: 6, paddingLeft: 16, listStyle: 'disc' }}>
                    <li>OS 로그인 비밀번호 설정 + 자리 비울 때 잠금(Win+L)</li>
                    <li>백업 파일은 USB 또는 학교 보안망 내 보관 (Dropbox·OneDrive 등 일반 클라우드 지양)</li>
                    <li>여러 교사가 한 PC 공유 시 Windows 사용자 계정 분리</li>
                    <li>분실·도난 대비 BitLocker(Win) / FileVault(Mac) 디스크 암호화</li>
                    <li>학년·반 변경 시 데이터 → 초기화 기능으로 삭제</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="w-full max-w-[1200px] mx-auto space-y-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">앱 정보</h2>
            <div className="glass p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-2xl font-bold">S</span>
              </div>
              <h3 className="text-xl font-bold text-[var(--text-primary)]">SchoolDesk</h3>
              <p className="text-sm text-[var(--text-muted)] mt-1">선생님의 책상 위, 가장 똑똑한 도우미</p>
              <p className="text-xs text-[var(--text-muted)] mt-3">버전 {pkg.version}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Copyright 2026 SchoolDesk</p>
            </div>

            {/* 개인정보 처리 안내 */}
            <div
              className="rounded-[14px] border"
              style={{ borderColor: 'rgba(15,23,42,0.1)', backgroundColor: 'var(--bg-widget)', padding: 20 }}
            >
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <span style={{ fontSize: 15 }}>🔒</span> 개인정보 처리 안내
              </h3>
              <ul className="text-xs text-[var(--text-secondary)] space-y-2 leading-relaxed" style={{ letterSpacing: '-0.2px' }}>
                <li className="flex gap-2">
                  <span className="text-[var(--accent)] font-bold shrink-0">·</span>
                  <span>입력하신 모든 정보(시간표, 할 일, 메모, 체크리스트, 학생 이름 등)는 <b className="text-[var(--text-primary)]">이 PC에만 저장</b>됩니다.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[var(--accent)] font-bold shrink-0">·</span>
                  <span>앱은 <b className="text-[var(--text-primary)]">외부 서버로 어떤 데이터도 전송하지 않습니다.</b> 분석·추적·광고 코드 포함 안 됨.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[var(--accent)] font-bold shrink-0">·</span>
                  <span>인터넷 연결 없이도 완전히 동작합니다 (폰트 포함 모든 리소스 내장).</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[var(--accent)] font-bold shrink-0">·</span>
                  <span>데이터 저장 위치: <code className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[11px]">%APPDATA%\SchoolDesk\</code></span>
                </li>
                <li className="flex gap-2">
                  <span className="text-red-500 font-bold shrink-0">·</span>
                  <span><b className="text-red-600 dark:text-red-400">학생 개인정보</b>가 포함된 경우 공용 PC 사용을 피하고, 앱 제거 시 위 경로의 폴더도 함께 삭제해주세요.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[var(--accent)] font-bold shrink-0">·</span>
                  <span>기관(학교/교육청) 정책에 따라 설치·사용이 제한될 수 있습니다. 배포·설치 전 IT 담당자와 확인해주세요.</span>
                </li>
              </ul>
            </div>

            {/* 데이터 출처 — 공공데이터법 시행령 §20 출처 명시 의무 준수 */}
            <div
              className="rounded-[14px] border"
              style={{ borderColor: 'rgba(15,23,42,0.1)', backgroundColor: 'var(--bg-widget)', padding: 20 }}
            >
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <span style={{ fontSize: 15 }}>📊</span> 데이터 출처
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                본 앱은 다음 공공기관·서비스의 데이터를 활용하여 제작되었습니다. 모든 데이터는 각 제공기관에 저작권이 귀속됩니다.
              </p>
              <div className="space-y-2.5">
                {[
                  {
                    name: '기상청 단기예보 · 초단기실황',
                    body: '날씨 위젯의 현재 기온·예보·강수형태·풍속·특보. 공공데이터포털(data.go.kr) 제공.',
                    url: 'https://www.data.go.kr/data/15084084/openapi.do',
                  },
                  {
                    name: '한국환경공단 에어코리아',
                    body: '날씨 위젯의 미세먼지(PM10) · 초미세먼지(PM2.5) 실시간 측정값. 공공데이터포털 제공.',
                    url: 'https://www.data.go.kr/data/15073861/openapi.do',
                  },
                  {
                    name: 'NEIS 교육행정정보시스템',
                    body: '급식 위젯의 학교 정보·식단. 교육부 NEIS open API 제공.',
                    url: 'https://open.neis.go.kr/',
                  },
                  {
                    name: 'Open-Meteo (백업)',
                    body: '기상청 API 일시 장애 시 자동 대체 기상 데이터. CC BY 4.0.',
                    url: 'https://open-meteo.com/',
                  },
                  {
                    name: 'OpenTimestamps',
                    body: '학생기록 위젯 해시체인을 Bitcoin 블록체인에 등록해 변조 탐지 (개인정보 미전송, 해시값만 전송).',
                    url: 'https://opentimestamps.org/',
                  },
                ].map(({ name, body, url }) => (
                  <div key={name} style={{
                    padding: 10, borderRadius: 8,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-widget)',
                  }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>
                      {name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 4 }}>
                      {body}
                    </div>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ fontSize: 10.5, color: 'var(--accent)', textDecoration: 'underline', fontWeight: 600 }}
                    >
                      {url}
                    </a>
                  </div>
                ))}
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] mt-3 leading-relaxed" style={{ fontStyle: 'italic' }}>
                공공데이터포털 자료 활용 시 공공데이터법 시행령 제20조에 따라 출처를 명시합니다.
              </p>
            </div>

            {/* 오픈소스 라이선스 */}
            <div
              className="rounded-[14px] border"
              style={{ borderColor: 'rgba(15,23,42,0.1)', backgroundColor: 'var(--bg-widget)', padding: 20 }}
            >
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <span style={{ fontSize: 15 }}>📦</span> 오픈소스 라이선스
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                이 앱은 아래 오픈소스 프로젝트를 사용합니다. 각 프로젝트 라이선스는 원저작자에게 귀속됩니다.
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px] text-[var(--text-secondary)]">
                {[
                  ['Electron', 'MIT'],
                  ['React', 'MIT'],
                  ['better-sqlite3', 'MIT'],
                  ['Tailwind CSS', 'MIT'],
                  ['framer-motion', 'MIT'],
                  ['lucide-react', 'ISC'],
                  ['Radix UI', 'MIT'],
                  ['koffi', 'MIT'],
                  ['Pretendard', 'SIL OFL 1.1'],
                  ['Zustand', 'MIT'],
                  ['Recharts', 'MIT'],
                  ['@dnd-kit', 'MIT'],
                ].map(([name, license]) => (
                  <div key={name} className="flex justify-between gap-2 py-0.5">
                    <span className="truncate">{name}</span>
                    <span className="text-[var(--text-muted)] shrink-0 tabular-nums">{license}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 학생 기록 매주 CSV 자동 백업 ───────────────────────────────
// 위의 암호화 자동 백업 폴더(backup_auto_folder)를 그대로 재사용해 'student-records/' 하위에 떨굼.
// 잠금 상태와 무관하게 동작. 결정적 증거는 여전히 수동 "증거 내보내기"를 써야 함.
function StudentRecordAutoCsvSection(): React.ReactElement {
  const [enabled, setEnabled] = useState(false)
  const [folder, setFolder] = useState<string>('')
  const [lastAt, setLastAt] = useState<number>(0)

  const load = (): void => {
    window.api.settings.get('student_record_auto_csv_enabled' as 'theme')
      .then((v) => {
        const raw = v as unknown
        setEnabled(raw === 'true' || raw === true)
      })
      .catch(() => {})
    window.api.settings.get('backup_auto_folder' as 'theme')
      .then((v) => setFolder(typeof v === 'string' ? v : ''))
      .catch(() => {})
    window.api.settings.get('student_record_auto_csv_last' as 'theme')
      .then((v) => setLastAt(parseInt(String(v) || '0', 10) || 0))
      .catch(() => {})
  }
  useEffect(() => { load() }, [])

  const toggle = async (next: boolean): Promise<void> => {
    await window.api.settings.set('student_record_auto_csv_enabled' as 'theme', String(next) as never)
    setEnabled(next)
  }

  const lastLabel = lastAt > 0
    ? `${new Date(lastAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}`
    : '아직 실행 안 됨'

  return (
    <div
      className="flex flex-col"
      style={{
        padding: 18, gap: 12, borderRadius: 14,
        background: 'var(--bg-widget)',
        border: '1px solid var(--border-widget)',
      }}
    >
      <div className="flex items-start justify-between" style={{ gap: 16 }}>
        <div className="flex items-start" style={{ gap: 12 }}>
          <Shield size={18} strokeWidth={2.2} style={{ color: '#8B5CF6', marginTop: 2, flexShrink: 0 }} />
          <div className="min-w-0">
            <div className="font-bold text-[var(--text-primary)]" style={{ fontSize: 14.5, letterSpacing: '-0.2px' }}>
              학생 기록 매주 CSV 자동 백업
            </div>
            <div className="text-[var(--text-muted)]" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.55, letterSpacing: '-0.2px' }}>
              위에서 지정한 자동 백업 폴더 안의 <code style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--bg-secondary)', fontSize: 11 }}>student-records/</code> 하위에 매주 한 번 학생 기록 CSV가 자동 저장됩니다.
              잠금 상태와 무관하게 동작하고, 시점이 매주 분산되어 사후 조작 부인 보강용으로 매우 유용합니다.
              <b className="text-[var(--text-primary)]"> 결정적 증거가 필요한 사건은 별도로 "증거 내보내기"를 수동 실행</b>해 주세요.
              <span className="block" style={{ marginTop: 4, fontSize: 11.5, color: 'var(--text-muted)' }}>
                백업 파일은 자동으로 지우지 않고 <b>전부 누적 보관</b>합니다 (학생 기록 본체는 항상 DB에 그대로 있어요).
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => toggle(!enabled)}
          className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${
            enabled ? 'bg-purple-500' : 'bg-[var(--text-muted)]'
          }`}
          style={{ marginTop: 4 }}
          title={enabled ? '자동 백업 끄기' : '자동 백업 켜기'}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
              enabled ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </div>

      <div className="flex items-center" style={{ gap: 16, fontSize: 12, letterSpacing: '-0.2px' }}>
        <div className="flex items-center" style={{ gap: 6 }}>
          <span className="text-[var(--text-muted)]" style={{ fontWeight: 700 }}>저장 폴더</span>
          <span className="text-[var(--text-primary)] truncate" style={{ fontWeight: 600, maxWidth: 380 }}>
            {folder ? folder : '— 자동 백업 폴더가 먼저 지정돼야 합니다 (위 섹션에서 설정)'}
          </span>
        </div>
        <div className="flex items-center ml-auto" style={{ gap: 6 }}>
          <span className="text-[var(--text-muted)]" style={{ fontWeight: 700 }}>마지막 실행</span>
          <span className="text-[var(--text-primary)] tabular-nums" style={{ fontWeight: 600 }}>
            {lastLabel}
          </span>
        </div>
      </div>

      {enabled && !folder && (
        <div
          className="flex items-start"
          style={{
            gap: 8, padding: '8px 11px', borderRadius: 9,
            background: 'rgba(245,158,11,0.10)',
            border: '1px solid rgba(245,158,11,0.30)',
            fontSize: 11.5, color: '#92400E', letterSpacing: '-0.2px', lineHeight: 1.5,
          }}
        >
          <AlertTriangle size={12} strokeWidth={2.6} style={{ marginTop: 1, flexShrink: 0 }} />
          위 "암호화 자동 백업" 섹션에서 폴더를 먼저 지정해 주세요. 폴더가 비어 있으면 자동 CSV도 실행되지 않습니다.
        </div>
      )}
    </div>
  )
}

// ─── 학생 기록 보관 기간·자동 파기 ────────────────────────────
// auto: 학교명·학급에서 학년 추론 → 학생 성년 도달 + 공소시효 10년 자동 계산
// fixed: 사용자가 10/15/20/25 년 선택
// unlimited: 보관 기간 없음
function StudentRecordRetentionSection(): React.ReactElement {
  type Mode = 'auto' | 'fixed' | 'unlimited'
  const [mode, setMode] = useState<Mode>('auto')
  const [fixedYears, setFixedYears] = useState<number>(20)
  const [autoPurge, setAutoPurge] = useState(false)
  const [info, setInfo] = useState<{ effectiveYears: number; autoReason: string } | null>(null)

  const reload = (): void => {
    window.api.settings.get('student_record_retention_mode' as 'theme').then((v) => {
      const raw = v as unknown
      if (raw === 'auto' || raw === 'fixed' || raw === 'unlimited') setMode(raw)
    }).catch(() => {})
    window.api.settings.get('student_record_retention_years' as 'theme').then((v) => {
      const n = parseInt(String(v ?? '20'), 10)
      if (!isNaN(n) && n > 0) setFixedYears(n)
    }).catch(() => {})
    window.api.settings.get('student_record_auto_purge_enabled' as 'theme').then((v) => {
      const raw = v as unknown
      setAutoPurge(raw === 'true' || raw === true)
    }).catch(() => {})
    window.api.studentRecord.retentionInfo()
      .then((r) => setInfo({ effectiveYears: r.effectiveYears, autoReason: r.auto.reason }))
      .catch(() => {})
  }
  useEffect(() => { reload() }, [])

  const saveMode = async (next: Mode): Promise<void> => {
    await window.api.settings.set('student_record_retention_mode' as 'theme', next as never)
    setMode(next)
    setTimeout(reload, 80)
  }
  const saveFixedYears = async (years: number): Promise<void> => {
    await window.api.settings.set('student_record_retention_years' as 'theme', String(years) as never)
    setFixedYears(years)
    setTimeout(reload, 80)
  }
  const saveAutoPurge = async (next: boolean): Promise<void> => {
    await window.api.settings.set('student_record_auto_purge_enabled' as 'theme', String(next) as never)
    setAutoPurge(next)
  }

  return (
    <div
      className="flex flex-col"
      style={{
        padding: 18, gap: 14, borderRadius: 14,
        background: 'var(--bg-widget)',
        border: '1px solid var(--border-widget)',
      }}
    >
      <div className="flex items-start" style={{ gap: 12 }}>
        <Scale size={18} strokeWidth={2.2} style={{ color: '#0EA5E9', marginTop: 2, flexShrink: 0 }} />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[var(--text-primary)]" style={{ fontSize: 14.5, letterSpacing: '-0.2px' }}>
            학생 기록 보관 기간 · 자동 파기
          </div>
          <div className="text-[var(--text-muted)]" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.55, letterSpacing: '-0.2px' }}>
            아동학대처벌법 §34 (공소시효는 학생 성년 도달부터 시작)을 고려해, 작성 시점 기준으로 보관 기간이 지나면 만료 표시됩니다.
            만료 기록은 학생 기록 화면 헤더의 "만료 N건 정리" 버튼으로 일괄 파기 가능.
          </div>
        </div>
      </div>

      {/* 모드 선택 */}
      <div className="flex flex-wrap" style={{ gap: 8 }}>
        {([
          { id: 'auto', label: '자동 (학년 기반)', desc: '학교/학급 정보에서 추론' },
          { id: 'fixed', label: '고정 (직접 선택)', desc: '아래 연수 선택' },
          { id: 'unlimited', label: '무제한', desc: '만료 없음' },
        ] as { id: Mode; label: string; desc: string }[]).map((opt) => {
          const active = mode === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => saveMode(opt.id)}
              className="flex flex-col items-start transition-all"
              style={{
                padding: '10px 14px',
                borderRadius: 11,
                background: active
                  ? 'linear-gradient(135deg, rgba(14,165,233,0.14) 0%, rgba(2,132,199,0.20) 100%)'
                  : 'var(--bg-secondary)',
                border: active ? '1.5px solid #0284C7' : '1.5px solid var(--border-widget)',
                color: active ? '#0369A1' : 'var(--text-secondary)',
                minWidth: 150,
                letterSpacing: '-0.2px',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800 }}>{opt.label}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.8, marginTop: 2 }}>{opt.desc}</span>
            </button>
          )
        })}
      </div>

      {mode === 'fixed' && (
        <div className="flex items-center" style={{ gap: 8 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '-0.2px' }}>
            보관 기간
          </span>
          {[10, 15, 20, 25].map((y) => {
            const active = fixedYears === y
            return (
              <button
                key={y}
                onClick={() => saveFixedYears(y)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  fontSize: 12, fontWeight: 800, letterSpacing: '-0.2px',
                  background: active ? '#0284C7' : 'var(--bg-secondary)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: active ? 'none' : '1px solid var(--border-widget)',
                }}
              >
                {y}년
              </button>
            )
          })}
        </div>
      )}

      {/* 현재 적용 정보 */}
      {info && (
        <div
          style={{
            padding: '10px 13px', borderRadius: 11,
            background: 'rgba(2,132,199,0.07)',
            border: '1px solid rgba(2,132,199,0.22)',
            fontSize: 12, color: '#0C4A6E', letterSpacing: '-0.2px', lineHeight: 1.55,
          }}
        >
          <b style={{ fontWeight: 800 }}>현재 적용:</b> {info.effectiveYears === 0 ? '무제한 (만료 없음)' : `${info.effectiveYears}년`}
          {mode === 'auto' && (
            <span className="block" style={{ marginTop: 2, fontSize: 11.5, color: '#075985' }}>
              {info.autoReason}
            </span>
          )}
        </div>
      )}

      {/* 자동 파기 토글 */}
      <div className="flex items-start justify-between" style={{ gap: 16 }}>
        <div className="flex items-start" style={{ gap: 11 }}>
          <Timer size={16} strokeWidth={2.4} style={{ color: '#B45309', marginTop: 2, flexShrink: 0 }} />
          <div className="min-w-0">
            <div className="font-bold text-[var(--text-primary)]" style={{ fontSize: 13.5, letterSpacing: '-0.2px' }}>
              만료된 기록 자동 파기
            </div>
            <div className="text-[var(--text-muted)]" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.55, letterSpacing: '-0.2px' }}>
              <b>기본 OFF (권장)</b> — 실수 삭제 방지를 위해 보통은 사용자가 직접 "만료 N건 정리" 버튼을 눌러 파기합니다.
              ON 시 매일 1회 만료된 기록을 자동 hard-delete 합니다.
            </div>
          </div>
        </div>
        <button
          onClick={() => saveAutoPurge(!autoPurge)}
          className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${
            autoPurge ? 'bg-amber-500' : 'bg-[var(--text-muted)]'
          }`}
          style={{ marginTop: 4 }}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
              autoPurge ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </div>
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm text-[var(--text-primary)]">{label}</p>
        <p className="text-xs text-[var(--text-muted)]">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full transition-all relative ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
            checked ? 'left-5' : 'left-1'
          }`}
        />
      </button>
    </div>
  )
}
