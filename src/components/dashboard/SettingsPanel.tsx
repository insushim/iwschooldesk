import { useEffect, useState } from 'react'
import { Settings, Palette, Clock, Database, Keyboard, Info, Download, Upload, Trash2, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../../stores/app.store'
import { useUIStore } from '../../stores/ui.store'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Dialog } from '../ui/Dialog'
import { EncryptedBackupSection } from './EncryptedBackupSection'

type SettingsTab = 'general' | 'theme' | 'timetable' | 'timer' | 'data' | 'shortcuts' | 'about'

const tabs: { id: SettingsTab; icon: typeof Settings; label: string }[] = [
  { id: 'general', icon: Settings, label: '일반' },
  { id: 'theme', icon: Palette, label: '테마' },
  { id: 'timer', icon: Clock, label: '타이머' },
  { id: 'data', icon: Database, label: '데이터' },
  { id: 'shortcuts', icon: Keyboard, label: '단축키' },
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
          <div className="max-w-2xl space-y-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">일반 설정</h2>
            <div className="space-y-5">
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
          <div className="max-w-2xl space-y-6">
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
          <div className="max-w-2xl space-y-6">
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
          <div className="max-w-2xl space-y-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">데이터 관리</h2>

            <EncryptedBackupSection />

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
          <div className="max-w-2xl space-y-6">
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

        {activeTab === 'about' && (
          <div className="max-w-2xl space-y-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">앱 정보</h2>
            <div className="glass p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-2xl font-bold">S</span>
              </div>
              <h3 className="text-xl font-bold text-[var(--text-primary)]">SchoolDesk</h3>
              <p className="text-sm text-[var(--text-muted)] mt-1">선생님의 책상 위, 가장 똑똑한 도우미</p>
              <p className="text-xs text-[var(--text-muted)] mt-3">버전 1.0.0</p>
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
