import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Lock, Unlock, ShieldCheck, Plus, Trash2, Download, Key, X, Check, AlertCircle,
  FileSpreadsheet, Search, Pencil, Users,
  FileText, Stamp, AlertTriangle, Building2, Scale, Server, Save, Clock,
  Timer, Eraser,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDataChange } from '../../hooks/useDataChange'
import { cn } from '../../lib/utils'

/**
 * 학생 기록 풀스크린 매니저 (대시보드 탭).
 *  - 위젯과 동일한 보안 모델: 비밀번호 잠금 + 해시체인 로그 + 유휴 자동 잠금
 *  - 위젯과 달리 좌측 학생 리스트 + 우측 기록 상세 레이아웃 + 검색/태그 필터
 *  - StudentRecordWidget 의 컴팩트 모드 토글(setLockCompact)은 호출하지 않음 — 풀스크린 view 라서 의미 없음.
 */

type StudentRecord = {
  id: string
  student_name: string
  content: string
  tag: string
  is_deleted: number
  created_at: string
  updated_at: string
}

type Mode =
  | { kind: 'loading' }
  | { kind: 'consent' }    // 첫 사용 동의 — 비밀번호 설정 이전 단계
  | { kind: 'setup' }
  | { kind: 'locked' }
  | { kind: 'unlocked' }

const CONSENT_KEY = 'student_record_consent_at'

const ACCENT = '#8B5CF6'
const TAG_OPTIONS = ['생활', '학습', '상담', '출결', '칭찬', '지도'] as const

function tagColor(tag: string): string {
  switch (tag) {
    case '생활': return '#F59E0B'
    case '학습': return '#2563EB'
    case '상담': return '#10B981'
    case '출결': return '#EC4899'
    case '칭찬': return '#8B5CF6'
    case '지도': return '#EF4444'
    default: return '#64748B'
  }
}

export function StudentRecordManager(): React.ReactElement {
  const [mode, setMode] = useState<Mode>({ kind: 'loading' })
  const [records, setRecords] = useState<StudentRecord[]>([])
  const [pwInput, setPwInput] = useState('')
  const [pwInput2, setPwInput2] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [changePwOpen, setChangePwOpen] = useState(false)

  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string>('')

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newTag, setNewTag] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editTag, setEditTag] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [exportToast, setExportToast] = useState<string | null>(null)
  const [schoolMoveGuideOpen, setSchoolMoveGuideOpen] = useState(false)
  const [expiredIds, setExpiredIds] = useState<Set<string>>(new Set())
  const [retentionYears, setRetentionYears] = useState<number>(20)
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false)

  const unlockInputRef = useRef<HTMLInputElement>(null)

  const AUTO_LOCK_MS = 10 * 60 * 1000
  const idleTimerRef = useRef<number | null>(null)
  const resetIdleTimer = useCallback((): void => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = window.setTimeout(() => {
      setMode((m) => (m.kind === 'unlocked' ? { kind: 'locked' } : m))
    }, AUTO_LOCK_MS)
  }, [])

  useEffect(() => {
    if (mode.kind !== 'unlocked') {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      return
    }
    resetIdleTimer()
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const
    const onActivity = (): void => resetIdleTimer()
    for (const ev of events) window.addEventListener(ev, onActivity, { passive: true })
    return () => {
      for (const ev of events) window.removeEventListener(ev, onActivity)
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    }
  }, [mode.kind, resetIdleTimer])

  useEffect(() => {
    let alive = true
    // 1) 이미 비밀번호 설정돼 있으면 잠금 화면. 동의 절차도 이미 거친 것으로 간주.
    // 2) 비밀번호 미설정 + 동의 이력 있음 → setup 화면
    // 3) 비밀번호 미설정 + 동의 이력 없음 → consent 화면 (첫 사용)
    Promise.all([
      window.api.studentRecord.isPasswordSet().catch(() => false),
      window.api.settings.get(CONSENT_KEY as 'theme').catch(() => null),
    ]).then(([set, consent]) => {
      if (!alive) return
      if (set) {
        setMode({ kind: 'locked' })
      } else if (typeof consent === 'string' && consent.length > 0) {
        setMode({ kind: 'setup' })
      } else {
        setMode({ kind: 'consent' })
      }
    }).catch(() => {
      if (alive) setMode({ kind: 'consent' })
    })
    return () => { alive = false }
  }, [])

  const handleAcceptConsent = async (): Promise<void> => {
    try {
      await window.api.settings.set(CONSENT_KEY as 'theme', new Date().toISOString() as never)
    } catch { /* ignore */ }
    setMode({ kind: 'setup' })
  }

  const reloadRetention = useCallback(() => {
    if (mode.kind !== 'unlocked') return
    window.api.studentRecord.retentionInfo()
      .then((info) => setRetentionYears(info.effectiveYears))
      .catch(() => {})
    window.api.studentRecord.listExpiredIds()
      .then((ids) => setExpiredIds(new Set(ids)))
      .catch(() => setExpiredIds(new Set()))
  }, [mode.kind])

  useEffect(() => {
    if (mode.kind !== 'unlocked') { setRecords([]); return }
    window.api.studentRecord.list().then(setRecords).catch(() => setRecords([]))
    reloadRetention()
  }, [mode.kind, reloadRetention])

  useDataChange('studentrecord', () => {
    if (mode.kind === 'unlocked') {
      window.api.studentRecord.list().then(setRecords).catch(() => setRecords([]))
      reloadRetention()
    }
  })

  useEffect(() => {
    if (mode.kind === 'locked' || mode.kind === 'setup') {
      const t = setTimeout(() => unlockInputRef.current?.focus(), 120)
      return () => clearTimeout(t)
    }
  }, [mode.kind])

  const handleSetupPassword = async () => {
    setPwError(null)
    if (pwInput.length < 4) { setPwError('비밀번호는 최소 4자 이상이에요.'); return }
    if (pwInput !== pwInput2) { setPwError('두 번 입력한 비밀번호가 달라요.'); return }
    try {
      await window.api.studentRecord.setPassword(pwInput)
      setPwInput(''); setPwInput2('')
      setMode({ kind: 'unlocked' })
    } catch (err) {
      setPwError(err instanceof Error ? err.message : '비밀번호 설정 실패')
    }
  }

  const handleUnlock = async () => {
    setPwError(null)
    const ok = await window.api.studentRecord.verifyPassword(pwInput)
    if (!ok) { setPwError('비밀번호가 맞지 않아요.'); return }
    setPwInput('')
    setMode({ kind: 'unlocked' })
  }

  const handleLock = () => {
    setMode({ kind: 'locked' })
    setPwInput(''); setPwInput2(''); setPwError(null)
    setAdding(false); setEditingId(null)
  }

  const handleAdd = async () => {
    const name = newName.trim() || selectedName || ''
    if (!name || !newContent.trim()) return
    try {
      await window.api.studentRecord.create({
        student_name: name,
        content: newContent.trim(),
        tag: newTag.trim() || undefined,
      })
      setNewName(''); setNewContent(''); setNewTag('')
      setAdding(false)
      setSelectedName(name)
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장 실패')
    }
  }

  const startEdit = (r: StudentRecord) => {
    setEditingId(r.id)
    setEditName(r.student_name)
    setEditContent(r.content)
    setEditTag(r.tag)
  }
  const cancelEdit = () => { setEditingId(null); setEditName(''); setEditContent(''); setEditTag('') }
  const commitEdit = async () => {
    if (!editingId) return
    if (!editName.trim() || !editContent.trim()) return
    try {
      await window.api.studentRecord.update(editingId, {
        student_name: editName.trim(),
        content: editContent.trim(),
        tag: editTag.trim(),
      })
      cancelEdit()
    } catch (err) {
      alert(err instanceof Error ? err.message : '수정 실패')
    }
  }

  const handleDelete = async (id: string) => {
    await window.api.studentRecord.delete(id)
    setConfirmDeleteId(null)
  }

  const handlePurgeExpired = async () => {
    try {
      const r = await window.api.studentRecord.purgeExpired()
      setConfirmPurgeOpen(false)
      if (r.records > 0) {
        setExportToast(`보관 기간(${r.retentionYears}년) 경과 ${r.records}건 파기 완료`)
        setTimeout(() => setExportToast(null), 4500)
      } else {
        setExportToast('파기할 기록이 없어요')
        setTimeout(() => setExportToast(null), 2500)
      }
    } catch {
      setExportToast('파기 중 오류가 발생했어요')
      setTimeout(() => setExportToast(null), 3500)
    }
  }

  const handleExport = async () => {
    try {
      setExportToast('저장 중… (타임스탬프 요청 포함 최대 20초)')
      const res = await window.api.studentRecord.exportLogs() as
        | { ok: true; count: number; path: string; proofPath?: string; otsPath?: string | null; sha256?: string }
        | { ok: false; reason: string }
      if (res.ok) {
        const parts = ['JSON', '증명서']
        if (res.otsPath) parts.push('OTS(타임스탬프)')
        setExportToast(`${parts.join(' + ')} 저장 완료 (${res.count}개 로그)`)
      } else if (res.reason !== 'canceled') {
        setExportToast('저장에 실패했어요')
      } else {
        setExportToast(null)
      }
      setTimeout(() => setExportToast(null), 6000)
    } catch {
      setExportToast('저장에 실패했어요')
      setTimeout(() => setExportToast(null), 4000)
    }
  }

  const handleExportCsv = async () => {
    try {
      const res = await window.api.studentRecord.exportCsv() as
        | { ok: true; count: number; path: string }
        | { ok: false; reason: string }
      if (res.ok) {
        setExportToast(`${res.count}개 기록을 CSV로 저장했어요 (Excel에서 열기)`)
      } else if (res.reason !== 'canceled') {
        setExportToast('저장에 실패했어요')
      }
      setTimeout(() => setExportToast(null), 4000)
    } catch {
      setExportToast('저장에 실패했어요')
      setTimeout(() => setExportToast(null), 4000)
    }
  }

  const studentList = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of records) m.set(r.student_name, (m.get(r.student_name) ?? 0) + 1)
    const list = Array.from(m.entries()).map(([name, count]) => ({ name, count }))
    list.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    if (!search.trim()) return list
    const q = search.trim().toLowerCase()
    return list.filter((s) => s.name.toLowerCase().includes(q))
  }, [records, search])

  const selectedRecords = useMemo(() => {
    if (!selectedName) return []
    return records
      .filter((r) => r.student_name === selectedName)
      .filter((r) => !tagFilter || r.tag === tagFilter)
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
  }, [records, selectedName, tagFilter])

  useEffect(() => {
    if (selectedName && !records.some((r) => r.student_name === selectedName)) {
      setSelectedName(null)
    }
  }, [records, selectedName])

  // ─── loading ───
  if (mode.kind === 'loading') {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)]">
        불러오는 중…
      </div>
    )
  }

  // ─── consent: 첫 사용 동의 ───
  if (mode.kind === 'consent') {
    return (
      <ConsentScreen onAccept={handleAcceptConsent} />
    )
  }

  // ─── setup / locked: 중앙 잠금 화면 + 법원 증거 워크플로우 가이드 ───
  if (mode.kind === 'setup' || mode.kind === 'locked') {
    const isSetup = mode.kind === 'setup'
    return (
      <div
        className="h-full overflow-y-auto"
        style={{
          padding: 24,
          background: 'radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.07) 0%, transparent 55%)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))',
            gap: 24,
            maxWidth: 1280,
            margin: '0 auto',
            alignItems: 'start',
          }}
        >
        <div
          className="flex flex-col items-center"
          style={{
            width: '100%', maxWidth: 480, justifySelf: 'center',
            padding: 28, gap: 16,
            borderRadius: 18, background: 'var(--bg-widget)',
            border: '1px solid var(--border-widget)',
            boxShadow: '0 24px 48px rgba(15,23,42,0.10)',
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 56, height: 56, borderRadius: 16,
              background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
              boxShadow: '0 10px 28px rgba(239,68,68,0.32)',
              color: '#fff',
            }}
          >
            <Lock size={26} strokeWidth={2.4} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
              학생 기록 · {isSetup ? '비밀번호 설정' : '잠금'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5, letterSpacing: '-0.2px' }}>
              {isSetup
                ? '학생이 못 보도록 비밀번호를 먼저 설정해 주세요. 모든 기록은 해시체인 로그로 보관됩니다.'
                : '비밀번호를 입력해 잠금을 풀어 주세요. 10분 동안 사용하지 않으면 자동으로 다시 잠겨요.'}
            </div>
          </div>

          {isSetup ? (
            <div className="w-full flex flex-col" style={{ gap: 8 }}>
              <input
                ref={unlockInputRef}
                type="password"
                placeholder="새 비밀번호 (4자 이상)"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSetupPassword()}
                className="w-full outline-none"
                style={{
                  padding: '11px 13px', fontSize: 14,
                  borderRadius: 11, border: '1.5px solid var(--border-widget)',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                }}
              />
              <input
                type="password"
                placeholder="비밀번호 확인"
                value={pwInput2}
                onChange={(e) => setPwInput2(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSetupPassword()}
                className="w-full outline-none"
                style={{
                  padding: '11px 13px', fontSize: 14,
                  borderRadius: 11, border: '1.5px solid var(--border-widget)',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                }}
              />
              <button
                onClick={handleSetupPassword}
                className="w-full font-bold"
                style={{
                  padding: '11px', borderRadius: 11, fontSize: 14,
                  background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
                  color: '#fff', boxShadow: '0 6px 18px rgba(239,68,68,0.32)',
                  marginTop: 4,
                }}
              >
                설정하고 시작
              </button>
            </div>
          ) : (
            <div className="w-full flex flex-col" style={{ gap: 8 }}>
              <input
                ref={unlockInputRef}
                type="password"
                placeholder="비밀번호"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                className="w-full outline-none"
                style={{
                  padding: '11px 13px', fontSize: 14,
                  borderRadius: 11, border: '1.5px solid var(--border-widget)',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                }}
              />
              <button
                onClick={handleUnlock}
                className="w-full font-bold flex items-center justify-center gap-1.5"
                style={{
                  padding: '11px', borderRadius: 11, fontSize: 14,
                  background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
                  color: '#fff', boxShadow: '0 6px 18px rgba(239,68,68,0.32)',
                  marginTop: 4,
                }}
              >
                <Unlock size={14} strokeWidth={2.6} /> 잠금 해제
              </button>
            </div>
          )}

          {pwError && (
            <div
              className="flex items-center gap-1.5"
              style={{ fontSize: 12, color: '#EF4444', fontWeight: 700, letterSpacing: '-0.2px' }}
            >
              <AlertCircle size={12} /> {pwError}
            </div>
          )}
        </div>

        {/* ── 법원 증거 사용 가이드 ── */}
        <CourtEvidenceGuide />
        </div>
      </div>
    )
  }

  // ─── unlocked: 메인 매니저 화면 ───
  return (
    <div className="flex h-full overflow-hidden">
      {/* 좌측 — 학생 리스트 */}
      <div
        className="shrink-0 flex flex-col"
        style={{ width: 280, borderRight: '1px solid var(--border-widget)', padding: 16 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} strokeWidth={2.4} style={{ color: ACCENT }} />
          <h2 className="font-bold text-[var(--text-primary)]" style={{ fontSize: 14 }}>학생 목록</h2>
          <span className="ml-auto tabular-nums text-[var(--text-muted)]" style={{ fontSize: 11, fontWeight: 700 }}>
            {studentList.length}명
          </span>
        </div>

        <div className="relative mb-3">
          <Search
            size={13}
            strokeWidth={2.4}
            className="absolute top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            style={{ left: 10 }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="학생 이름 검색"
            className="w-full h-9 rounded-md border border-[var(--border-widget)] bg-[var(--bg-widget)] text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-purple-400"
            style={{ paddingLeft: 30, paddingRight: 10 }}
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {studentList.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)] p-3 text-center" style={{ lineHeight: 1.5 }}>
              {records.length === 0 ? '아직 기록이 없습니다.\n우측에서 첫 기록을 추가해 보세요.' : '검색 결과가 없습니다.'}
            </div>
          ) : (
            studentList.map((s) => {
              const active = s.name === selectedName
              return (
                <div
                  key={s.name}
                  onClick={() => setSelectedName(s.name)}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors',
                    active ? 'bg-purple-500/10' : 'hover:bg-[var(--bg-secondary)]',
                  )}
                >
                  <span
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: 26, height: 26, borderRadius: 8,
                      background: active
                        ? 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)'
                        : 'var(--bg-secondary)',
                      color: active ? '#fff' : 'var(--text-secondary)',
                      fontSize: 11, fontWeight: 800, letterSpacing: '-0.2px',
                    }}
                  >
                    {s.name.slice(0, 1)}
                  </span>
                  <span
                    className="flex-1 min-w-0 truncate"
                    style={{ fontSize: 13, fontWeight: active ? 800 : 600, color: 'var(--text-primary)', letterSpacing: '-0.2px' }}
                  >
                    {s.name}
                  </span>
                  <span
                    className="tabular-nums shrink-0"
                    style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}
                  >
                    {s.count}건
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 우측 — 상세 */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ padding: 20 }}>
        {/* 헤더 — 잠금/내보내기/비번 변경 */}
        <div className="shrink-0 flex items-center gap-2 mb-4">
          <span
            className="flex items-center justify-center shrink-0"
            style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
              color: '#fff',
              boxShadow: '0 6px 18px rgba(139,92,246,0.32)',
            }}
          >
            <ShieldCheck size={16} strokeWidth={2.4} />
          </span>
          <h1 className="font-bold text-[var(--text-primary)]" style={{ fontSize: 18, letterSpacing: '-0.3px' }}>
            학생 기록
          </h1>
          <span
            className="ml-2 shrink-0"
            style={{
              fontSize: 11, fontWeight: 700, color: '#0369A1',
              padding: '3px 9px', borderRadius: 999,
              background: 'rgba(2,132,199,0.12)', letterSpacing: '-0.2px',
            }}
          >
            해제됨 · 10분 후 자동 잠금
          </span>
          {expiredIds.size > 0 && (
            <button
              onClick={() => setConfirmPurgeOpen(true)}
              className="shrink-0 flex items-center gap-1 hover:opacity-90 transition-opacity"
              style={{
                fontSize: 11, fontWeight: 800, color: '#fff',
                padding: '4px 10px', borderRadius: 999,
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                letterSpacing: '-0.2px',
                boxShadow: '0 3px 10px rgba(245,158,11,0.32)',
              }}
              title={`보관 기간(${retentionYears}년) 경과 ${expiredIds.size}건. 클릭해서 일괄 파기.`}
            >
              <Timer size={11} strokeWidth={2.6} /> 만료 {expiredIds.size}건 정리
            </button>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 hover:bg-[var(--bg-secondary)] transition-colors"
              style={{
                padding: '7px 11px', borderRadius: 9,
                fontSize: 12, fontWeight: 700, color: '#059669',
                border: '1px solid rgba(5,150,105,0.28)',
                letterSpacing: '-0.2px',
              }}
              title="CSV 내보내기 — Excel/한글에서 바로 열림 (일상 확인용)"
            >
              <FileSpreadsheet size={13} strokeWidth={2.4} /> CSV
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 hover:bg-[var(--bg-secondary)] transition-colors"
              style={{
                padding: '7px 11px', borderRadius: 9,
                fontSize: 12, fontWeight: 700, color: '#0284C7',
                border: '1px solid rgba(2,132,199,0.28)',
                letterSpacing: '-0.2px',
              }}
              title="로그 JSON 내보내기 — 해시체인 포함 (법원 증거용)"
            >
              <Download size={13} strokeWidth={2.4} /> 증거 내보내기
            </button>
            <button
              onClick={() => setSchoolMoveGuideOpen(true)}
              className="flex items-center justify-center hover:bg-[var(--bg-secondary)] transition-colors"
              style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(234,88,12,0.30)', color: '#C2410C' }}
              title="학교/PC 이동 시 안내 — 이전 학교 기록은 어떻게 보관할까?"
            >
              <Building2 size={13} strokeWidth={2.4} />
            </button>
            <button
              onClick={() => setChangePwOpen(true)}
              className="flex items-center justify-center hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-muted)]"
              style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border-widget)' }}
              title="비밀번호 변경"
            >
              <Key size={13} strokeWidth={2.4} />
            </button>
            <button
              onClick={handleLock}
              className="flex items-center gap-1.5"
              style={{
                padding: '7px 12px', borderRadius: 9,
                color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: '-0.2px',
                background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
                boxShadow: '0 4px 12px rgba(239,68,68,0.32)',
              }}
              title="즉시 잠금"
            >
              <Lock size={13} strokeWidth={2.6} /> 잠금
            </button>
          </div>
        </div>

        {exportToast && (
          <div
            className="shrink-0"
            style={{
              marginBottom: 10, padding: '8px 12px', borderRadius: 9,
              fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.2px',
              backgroundColor: 'rgba(2,132,199,0.12)', color: '#0369A1',
            }}
          >
            {exportToast}
          </div>
        )}

        {/* 기록 추가 폼 — 학생 선택 안 됐어도 새 학생 이름 직접 입력 가능 */}
        {!adding ? (
          <button
            onClick={() => {
              setAdding(true)
              if (selectedName) setNewName(selectedName)
            }}
            className="flex items-center justify-center gap-1.5 shrink-0 hover:opacity-90 transition-opacity self-start"
            style={{
              marginBottom: 10, padding: '9px 14px', borderRadius: 10,
              background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
              color: '#fff', boxShadow: '0 4px 14px rgba(139,92,246,0.32)',
              fontSize: 13, fontWeight: 800, letterSpacing: '-0.2px',
            }}
          >
            <Plus size={14} strokeWidth={2.6} /> 기록 추가
            {selectedName && (
              <span style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.85 }}>· {selectedName}</span>
            )}
          </button>
        ) : (
          <div
            className="flex flex-col shrink-0"
            style={{
              marginBottom: 12, padding: 12, gap: 8,
              borderRadius: 12, background: 'var(--bg-secondary)',
              border: '1px solid rgba(139,92,246,0.28)',
            }}
          >
            <div className="flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="학생 이름"
                className="flex-1 min-w-0 outline-none"
                style={{
                  fontSize: 13.5, padding: '9px 11px', borderRadius: 9,
                  background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                  color: 'var(--text-primary)', fontWeight: 700, letterSpacing: '-0.2px',
                }}
              />
              <select
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                className="outline-none"
                style={{
                  fontSize: 12.5, padding: '9px 10px', borderRadius: 9,
                  background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                  color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '-0.2px',
                }}
              >
                <option value="">태그</option>
                {TAG_OPTIONS.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="기록 내용 (Ctrl+Enter 저장)"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAdd()
                if (e.key === 'Escape') { setAdding(false); setNewName(''); setNewContent(''); setNewTag('') }
              }}
              className="w-full outline-none resize-none"
              style={{
                fontSize: 13.5, padding: '10px 11px', borderRadius: 9, minHeight: 84,
                background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                color: 'var(--text-primary)', letterSpacing: '-0.2px', fontWeight: 500, lineHeight: 1.55,
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setAdding(false); setNewName(''); setNewContent(''); setNewTag('') }}
                className="flex-1 flex items-center justify-center"
                style={{
                  padding: '9px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                  background: 'var(--bg-widget)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-widget)', letterSpacing: '-0.2px',
                }}
              >
                취소
              </button>
              <button
                onClick={handleAdd}
                disabled={!(newName.trim() || selectedName) || !newContent.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{
                  padding: '9px', borderRadius: 9, fontSize: 13, fontWeight: 800,
                  background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                  color: '#fff', letterSpacing: '-0.2px',
                }}
              >
                <Check size={13} strokeWidth={2.8} /> 저장
              </button>
            </div>
          </div>
        )}

        {/* 학생 안 골랐을 때 — 안내 */}
        {!selectedName ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-[var(--text-muted)]">
            <ShieldCheck size={44} strokeWidth={1.2} className="opacity-25" />
            <div>
              <p className="text-sm font-semibold" style={{ letterSpacing: '-0.2px' }}>
                {records.length === 0 ? '아직 기록이 없습니다' : '왼쪽에서 학생을 선택하세요'}
              </p>
              <p className="text-xs mt-1.5" style={{ lineHeight: 1.6, letterSpacing: '-0.2px' }}>
                {records.length === 0
                  ? '"기록 추가"로 첫 기록을 남기면 학생 이름이 좌측에 정리됩니다.'
                  : '선택한 학생의 모든 기록을 시간순으로 볼 수 있어요.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* 학생 이름 + 태그 필터 */}
            <div className="shrink-0 flex items-center gap-2 mb-3">
              <h2 className="font-bold text-[var(--text-primary)]" style={{ fontSize: 16, letterSpacing: '-0.3px' }}>
                {selectedName}
              </h2>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                · {selectedRecords.length}건
              </span>
              <div className="ml-auto flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setTagFilter('')}
                  className={cn(
                    'transition-colors',
                    tagFilter === '' ? 'bg-purple-500/15 text-purple-700' : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]',
                  )}
                  style={{ padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '-0.2px' }}
                >
                  전체
                </button>
                {TAG_OPTIONS.map((t) => {
                  const active = tagFilter === t
                  const tc = tagColor(t)
                  return (
                    <button
                      key={t}
                      onClick={() => setTagFilter(active ? '' : t)}
                      className="transition-colors"
                      style={{
                        padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '-0.2px',
                        color: active ? '#fff' : tc,
                        background: active ? tc : `${tc}1A`,
                        border: `1px solid ${tc}33`,
                      }}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 기록 리스트 */}
            <div className="flex-1 overflow-y-auto flex flex-col" style={{ gap: 8 }}>
              {selectedRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-[var(--text-muted)]">
                  <ShieldCheck size={28} strokeWidth={1.6} />
                  <span className="text-xs font-semibold" style={{ letterSpacing: '-0.2px' }}>
                    조건에 맞는 기록이 없어요
                  </span>
                </div>
              ) : (
                <AnimatePresence>
                  {selectedRecords.map((r) => {
                    const tc = tagColor(r.tag)
                    const isEditing = editingId === r.id
                    const isExpired = expiredIds.has(r.id)
                    return (
                      <motion.div
                        key={r.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: isExpired ? 0.55 : 1, y: 0 }}
                        exit={{ opacity: 0, x: 30 }}
                        className="group"
                        style={{
                          padding: '11px 13px', borderRadius: 11,
                          background: isExpired ? 'rgba(245,158,11,0.08)' : 'var(--bg-secondary)',
                          border: isExpired ? '1px solid rgba(245,158,11,0.30)' : '1px solid transparent',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
                        }}
                      >
                        {isExpired && !isEditing && (
                          <div className="flex items-center" style={{ gap: 5, marginBottom: 4 }}>
                            <Timer size={10} strokeWidth={2.6} style={{ color: '#B45309' }} />
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#92400E', letterSpacing: '-0.2px' }}>
                              보관 기간 경과 · 파기 대상
                            </span>
                          </div>
                        )}
                        {isEditing ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="flex-1 min-w-0 outline-none"
                                style={{
                                  fontSize: 13, padding: '8px 10px', borderRadius: 8,
                                  background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                                  color: 'var(--text-primary)', fontWeight: 700,
                                }}
                              />
                              <select
                                value={editTag}
                                onChange={(e) => setEditTag(e.target.value)}
                                className="outline-none"
                                style={{
                                  fontSize: 12, padding: '8px 9px', borderRadius: 8,
                                  background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                                  color: 'var(--text-secondary)', fontWeight: 700,
                                }}
                              >
                                <option value="">태그</option>
                                {TAG_OPTIONS.map((t) => (<option key={t} value={t}>{t}</option>))}
                              </select>
                            </div>
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitEdit()
                                if (e.key === 'Escape') cancelEdit()
                              }}
                              className="w-full outline-none resize-none"
                              style={{
                                fontSize: 13, padding: '9px 11px', borderRadius: 8, minHeight: 72,
                                background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                                color: 'var(--text-primary)', lineHeight: 1.5,
                              }}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={cancelEdit}
                                className="flex-1 flex items-center justify-center"
                                style={{
                                  padding: '8px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                                  background: 'var(--bg-widget)', color: 'var(--text-secondary)',
                                  border: '1px solid var(--border-widget)',
                                }}
                              >
                                취소
                              </button>
                              <button
                                onClick={commitEdit}
                                className="flex-1 flex items-center justify-center gap-1"
                                style={{
                                  padding: '8px', borderRadius: 8, fontSize: 12.5, fontWeight: 800,
                                  background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                                  color: '#fff',
                                }}
                              >
                                <Check size={12} strokeWidth={2.8} /> 저장
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start gap-2.5">
                              {r.tag && (
                                <span
                                  className="shrink-0"
                                  style={{
                                    fontSize: 10.5, fontWeight: 800,
                                    padding: '3px 8px', borderRadius: 999,
                                    background: `${tc}1A`, color: tc,
                                    border: `1px solid ${tc}33`, letterSpacing: '-0.2px',
                                    marginTop: 1,
                                  }}
                                >
                                  {r.tag}
                                </span>
                              )}
                              <p
                                onDoubleClick={() => startEdit(r)}
                                className="flex-1 cursor-text"
                                title="더블클릭하여 수정"
                                style={{
                                  fontSize: 13.5, fontWeight: 500, lineHeight: 1.6,
                                  color: 'var(--text-primary)', letterSpacing: '-0.2px',
                                  whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
                                }}
                              >
                                {r.content}
                              </p>
                              <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => startEdit(r)}
                                  className="flex items-center justify-center hover:bg-purple-500/10"
                                  style={{ width: 24, height: 24, borderRadius: 6, color: '#7C3AED' }}
                                  title="수정"
                                >
                                  <Pencil size={11} strokeWidth={2.4} />
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(r.id)}
                                  className="flex items-center justify-center"
                                  style={{
                                    width: 24, height: 24, borderRadius: 6,
                                    color: '#EF4444', background: 'rgba(239,68,68,0.1)',
                                  }}
                                  title="삭제"
                                >
                                  <Trash2 size={11} strokeWidth={2.4} />
                                </button>
                              </div>
                            </div>
                            <div
                              className="flex items-center gap-1 tabular-nums"
                              style={{
                                marginTop: 6, fontSize: 10.5,
                                color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '-0.2px',
                              }}
                            >
                              {r.updated_at}
                              {r.created_at !== r.updated_at && (
                                <span style={{ opacity: 0.7 }}>· 수정됨</span>
                              )}
                            </div>
                          </>
                        )}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              )}
            </div>
          </>
        )}

        {/* 삭제 확인 오버레이 */}
        <AnimatePresence>
          {confirmDeleteId && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex items-center justify-center"
              style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
              onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteId(null) }}
            >
              <motion.div
                initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}
                style={{
                  padding: 20, maxWidth: 320, margin: 12, borderRadius: 16,
                  background: 'var(--bg-widget)',
                  boxShadow: '0 20px 48px rgba(15,23,42,0.32)',
                  border: '1px solid rgba(15,23,42,0.08)',
                }}
              >
                <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                  이 기록을 삭제할까요?
                </p>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
                  삭제도 로그에 남습니다 (복구 불가, 기록만 증거).
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="flex-1"
                    style={{
                      padding: '10px', fontSize: 13, fontWeight: 700, borderRadius: 10,
                      backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                      border: '1px solid var(--border-widget)',
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
                    className="flex-1"
                    style={{
                      padding: '10px', fontSize: 13, fontWeight: 800, borderRadius: 10,
                      background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
                      color: '#fff', boxShadow: '0 4px 12px rgba(239,68,68,0.38)',
                    }}
                  >
                    삭제
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 비밀번호 변경 오버레이 */}
        <AnimatePresence>
          {changePwOpen && (
            <ChangePasswordPanel onClose={() => setChangePwOpen(false)} />
          )}
        </AnimatePresence>

        {/* 학교/PC 이동 안내 모달 */}
        <AnimatePresence>
          {schoolMoveGuideOpen && (
            <SchoolMoveGuideModal onClose={() => setSchoolMoveGuideOpen(false)} />
          )}
        </AnimatePresence>

        {/* 만료 일괄 파기 확인 모달 */}
        <AnimatePresence>
          {confirmPurgeOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 flex items-center justify-center"
              style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
              onClick={(e) => { if (e.target === e.currentTarget) setConfirmPurgeOpen(false) }}
            >
              <motion.div
                initial={{ scale: 0.94 }} animate={{ scale: 1 }} exit={{ scale: 0.94 }}
                style={{
                  padding: 22, maxWidth: 380, width: '92%',
                  borderRadius: 16, background: 'var(--bg-widget)',
                  boxShadow: '0 24px 56px rgba(15,23,42,0.32)',
                  border: '1px solid rgba(15,23,42,0.08)',
                }}
              >
                <div className="flex items-center" style={{ gap: 10, marginBottom: 10 }}>
                  <span
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: 36, height: 36, borderRadius: 11,
                      background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                      color: '#fff',
                    }}
                  >
                    <Timer size={18} strokeWidth={2.4} />
                  </span>
                  <span className="font-bold text-[var(--text-primary)]" style={{ fontSize: 15.5, letterSpacing: '-0.3px' }}>
                    만료 기록 {expiredIds.size}건 파기
                  </span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6, letterSpacing: '-0.2px' }}>
                  보관 기간({retentionYears}년)이 지난 학생 기록과 그에 연결된 해시체인 로그를 <b>영구 삭제</b>합니다.
                  되돌릴 수 없으니, 필요한 자료는 미리 "증거 내보내기" 또는 자동 CSV 백업으로 보관해 두세요.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmPurgeOpen(false)}
                    className="flex-1"
                    style={{
                      padding: '10px', fontSize: 13, fontWeight: 700, borderRadius: 10,
                      backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                      border: '1px solid var(--border-widget)',
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handlePurgeExpired}
                    className="flex-1 flex items-center justify-center"
                    style={{
                      padding: '10px', fontSize: 13, fontWeight: 800, borderRadius: 10,
                      gap: 5,
                      background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                      color: '#fff', boxShadow: '0 4px 12px rgba(245,158,11,0.32)',
                    }}
                  >
                    <Eraser size={13} strokeWidth={2.6} /> 영구 삭제
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function ChangePasswordPanel({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState('')
  const [next1, setNext1] = useState('')
  const [next2, setNext2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    setErr(null)
    if (next1.length < 4) { setErr('새 비밀번호는 4자 이상이에요.'); return }
    if (next1 !== next2) { setErr('두 번 입력한 비밀번호가 달라요.'); return }
    try {
      await window.api.studentRecord.setPassword(next1, cur)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실패')
    }
  }
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}
        className="flex flex-col"
        style={{
          padding: 20, maxWidth: 340, width: '88%', gap: 10, borderRadius: 16,
          background: 'var(--bg-widget)', boxShadow: '0 20px 48px rgba(15,23,42,0.32)',
          border: '1px solid rgba(15,23,42,0.08)',
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>비밀번호 변경</span>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={15} />
          </button>
        </div>
        <input
          type="password" value={cur} onChange={(e) => setCur(e.target.value)}
          placeholder="현재 비밀번호"
          className="w-full outline-none"
          style={{ fontSize: 13.5, padding: '10px 12px', borderRadius: 9, background: 'var(--bg-secondary)', border: '1px solid var(--border-widget)', color: 'var(--text-primary)' }}
        />
        <input
          type="password" value={next1} onChange={(e) => setNext1(e.target.value)}
          placeholder="새 비밀번호 (4자 이상)"
          className="w-full outline-none"
          style={{ fontSize: 13.5, padding: '10px 12px', borderRadius: 9, background: 'var(--bg-secondary)', border: '1px solid var(--border-widget)', color: 'var(--text-primary)' }}
        />
        <input
          type="password" value={next2} onChange={(e) => setNext2(e.target.value)}
          placeholder="새 비밀번호 확인"
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="w-full outline-none"
          style={{ fontSize: 13.5, padding: '10px 12px', borderRadius: 9, background: 'var(--bg-secondary)', border: '1px solid var(--border-widget)', color: 'var(--text-primary)' }}
        />
        {err && (
          <div style={{ fontSize: 12, color: '#EF4444', fontWeight: 700, letterSpacing: '-0.2px' }}>
            {err}
          </div>
        )}
        <button
          onClick={save}
          className="font-bold"
          style={{
            padding: '10px', fontSize: 13.5, borderRadius: 9, marginTop: 4,
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)', color: '#fff',
            letterSpacing: '-0.2px',
          }}
        >
          변경
        </button>
      </motion.div>
    </motion.div>
  )
}

// ─── 첫 사용 동의 화면 ─────────────────────────────────────────
// 비밀번호 설정 이전 1회만 표시. settings.student_record_consent_at 에 ISO timestamp 저장.
// 목적·정보처리자 책임을 사용자가 인지·동의했다는 흔적을 남겨 분쟁 시 자기 보호용으로도 활용.
function ConsentScreen({ onAccept }: { onAccept: () => void }): React.ReactElement {
  const [checks, setChecks] = useState({ purpose: false, processor: false, official: false })
  const allChecked = checks.purpose && checks.processor && checks.official

  const items: { key: keyof typeof checks; title: string; body: string }[] = [
    {
      key: 'purpose',
      title: '사용 목적이 한정됨을 이해합니다',
      body:
        '본 기능은 ① 교사 직무수행 보조, ② 「아동학대처벌법」 §10 신고의무 대비, ③ 「교원지위향상법」 §15 교권 침해 분쟁 대비 — 이 세 목적에 한정하여 사용합니다. 그 외 목적(평가·차별·외부 공유 등)으로 사용하지 않습니다.',
    },
    {
      key: 'processor',
      title: '제가 정보처리자임을 이해합니다',
      body:
        '입력된 모든 학생 정보의 정보처리자(개인정보보호법 §2.5)는 제 본인이며, 수집·이용·파기·안전 관리 책임은 제게 있습니다. SchoolDesk 개발사는 도구 제공자이고, 처리 결과에 대한 법적 책임을 부담하지 않습니다.',
    },
    {
      key: 'official',
      title: '공식 자료는 NEIS 등에 별도 기록함을 이해합니다',
      body:
        '학생부·행동발달 누가기록 등 공식 학생 자료는 NEIS 등 학교 공식 시스템에 기록하고, 본 앱은 일상 메모와 사후 조작 부인을 위한 시점 보존 보조 도구로만 사용합니다.',
    },
  ]

  return (
    <div
      className="h-full overflow-y-auto flex items-center justify-center"
      style={{
        padding: 24,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.08) 0%, transparent 55%)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col"
        style={{
          width: '100%', maxWidth: 640, padding: 28, gap: 18,
          borderRadius: 18, background: 'var(--bg-widget)',
          border: '1px solid var(--border-widget)',
          boxShadow: '0 24px 48px rgba(15,23,42,0.10)',
        }}
      >
        {/* 헤더 */}
        <div className="flex items-center" style={{ gap: 12 }}>
          <div
            className="flex items-center justify-center"
            style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
              boxShadow: '0 10px 28px rgba(139,92,246,0.32)',
              color: '#fff',
            }}
          >
            <Scale size={22} strokeWidth={2.4} />
          </div>
          <div>
            <div className="font-bold text-[var(--text-primary)]" style={{ fontSize: 17, letterSpacing: '-0.3px' }}>
              학생 기록 — 시작 전 안내 (1회만 표시)
            </div>
            <div className="text-[var(--text-muted)]" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5, letterSpacing: '-0.2px' }}>
              민감한 학생 정보를 다루는 기능이라, 사용 목적과 책임을 한 번만 확인하고 시작합니다.
            </div>
          </div>
        </div>

        {/* 체크리스트 */}
        <div className="flex flex-col" style={{ gap: 10 }}>
          {items.map((it) => {
            const checked = checks[it.key]
            return (
              <button
                key={it.key}
                onClick={() => setChecks((c) => ({ ...c, [it.key]: !c[it.key] }))}
                className="flex items-start text-left transition-all"
                style={{
                  gap: 12,
                  padding: '13px 15px',
                  borderRadius: 12,
                  background: checked ? 'rgba(139,92,246,0.08)' : 'var(--bg-secondary)',
                  border: checked ? '1.5px solid #8B5CF6' : '1.5px solid var(--border-widget)',
                }}
              >
                <span
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: checked ? 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)' : 'var(--bg-widget)',
                    border: checked ? 'none' : '1.5px solid var(--border-widget)',
                    color: '#fff',
                    marginTop: 1,
                  }}
                >
                  {checked && <Check size={14} strokeWidth={3} />}
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-[var(--text-primary)]" style={{ fontSize: 13.5, letterSpacing: '-0.2px' }}>
                    {it.title}
                  </div>
                  <div className="text-[var(--text-secondary)]" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.6, letterSpacing: '-0.2px', wordBreak: 'keep-all' }}>
                    {it.body}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* 면책 박스 */}
        <div
          style={{
            padding: '11px 13px', borderRadius: 11,
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.28)',
            fontSize: 11.5, color: '#78350F', lineHeight: 1.6, letterSpacing: '-0.2px',
          }}
        >
          <b style={{ fontWeight: 800, color: '#92400E' }}>참고:</b> 본 안내는 일반 정보이며 법률 자문이 아닙니다.
          정식 법적 절차 또는 분쟁 발생 시에는 학교 변호사·교육청 정보보호 담당의 검토를 받으세요.
          동의 시각은 settings에 저장되어, 분쟁 시 "사용 목적과 책임을 인지한 상태였음"을 보여주는 자료로도 활용 가능합니다.
        </div>

        <button
          onClick={onAccept}
          disabled={!allChecked}
          className="font-bold transition-all"
          style={{
            padding: '13px', fontSize: 14, borderRadius: 11,
            background: allChecked
              ? 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)'
              : 'var(--bg-secondary)',
            color: allChecked ? '#fff' : 'var(--text-muted)',
            boxShadow: allChecked ? '0 6px 18px rgba(139,92,246,0.32)' : 'none',
            cursor: allChecked ? 'pointer' : 'not-allowed',
            letterSpacing: '-0.2px',
          }}
        >
          {allChecked ? '동의하고 시작' : '세 가지 항목에 모두 체크해 주세요'}
        </button>
      </motion.div>
    </div>
  )
}

// ─── 학교/PC 이동 안내 모달 ─────────────────────────────────
// 잠금 해제된 메인 화면에서 헤더의 Building2 버튼으로 열림.
// 잠금 화면 가이드의 "학교 옮길 때" 박스와 동일 톤·내용.
function SchoolMoveGuideModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const steps: { icon: typeof Download; text: string }[] = [
    { icon: Download, text: '이동 직전 마지막 "증거 내보내기" 1회 실행 — 시점 고정 (JSON + 증명서 + .ots)' },
    { icon: Save, text: '내보낸 폴더 + 자동 백업 폴더 + DB 파일(school-desk.db) 통째로 본인 USB·외장하드에 복사' },
    { icon: Lock, text: 'BitLocker(Win) / FileVault(Mac) / VeraCrypt 로 USB 암호화 보관' },
    { icon: ShieldCheck, text: '새 PC는 SchoolDesk 새로 설치 → 빈 상태로 시작 (이전 학생 정보 가져가지 X)' },
    { icon: Scale, text: '나중에 그 학교 시절 분쟁이 생기면 보관함에서 꺼내 제출 — 해시체인·OTS 그대로라 시점 입증' },
  ]
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
        className="flex flex-col"
        style={{
          padding: 24, maxWidth: 520, width: '92%', maxHeight: '85vh', overflowY: 'auto',
          gap: 14, borderRadius: 18,
          background: 'var(--bg-widget)',
          boxShadow: '0 24px 56px rgba(15,23,42,0.32)',
          border: '1px solid rgba(15,23,42,0.08)',
        }}
      >
        {/* 헤더 */}
        <div className="flex items-start" style={{ gap: 12 }}>
          <span
            className="flex items-center justify-center shrink-0"
            style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)',
              color: '#fff',
              boxShadow: '0 8px 20px rgba(234,88,12,0.32)',
            }}
          >
            <Building2 size={20} strokeWidth={2.4} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[var(--text-primary)]" style={{ fontSize: 16, letterSpacing: '-0.3px' }}>
              학교 옮길 때 · PC 옮길 때
            </div>
            <div className="text-[var(--text-muted)]" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.55, letterSpacing: '-0.2px' }}>
              이전 학교 학생 기록을 새 학교 PC로 옮기지 마세요. 본인 보관함에 안전하게 두고 분쟁 시 꺼내 제출하는 게 맞습니다.
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* 왜 그래야 하는가 */}
        <div
          style={{
            padding: '11px 13px', borderRadius: 11,
            background: 'rgba(245,158,11,0.10)',
            border: '1px solid rgba(245,158,11,0.30)',
            fontSize: 12, color: '#78350F', lineHeight: 1.6, letterSpacing: '-0.2px',
          }}
        >
          <div style={{ fontWeight: 800, color: '#92400E', marginBottom: 4 }}>왜 이렇게 해야 하나요?</div>
          개인정보보호법 §15·22에 따라 수집 목적이 끝나면 지체 없이 파기·분리 보관해야 합니다.
          이전 학교 학생들의 정보처리자는 그 학교지, 옮긴 학교가 아니에요.
          그래도 분쟁이 생길 수 있으니 — <b>본인이 안전한 보관함에 분리 보관</b>해 두는 게 정답입니다.
        </div>

        {/* 5단계 */}
        <div className="flex flex-col" style={{ gap: 8 }}>
          {steps.map((s, i) => (
            <div
              key={i}
              className="flex items-start"
              style={{
                gap: 10, padding: '10px 12px', borderRadius: 11,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-widget)',
              }}
            >
              <span
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 26, height: 26, borderRadius: 8,
                  background: 'rgba(234,88,12,0.14)',
                  color: '#EA580C',
                  fontSize: 11, fontWeight: 900,
                }}
              >
                {i + 1}
              </span>
              <s.icon size={13} strokeWidth={2.4} style={{ color: '#C2410C', flexShrink: 0, marginTop: 5 }} />
              <span style={{ fontSize: 12.5, color: 'var(--text-primary)', letterSpacing: '-0.2px', lineHeight: 1.6 }}>
                {s.text}
              </span>
            </div>
          ))}
        </div>

        {/* 핵심 메시지 */}
        <div
          style={{
            padding: '11px 13px', borderRadius: 11,
            background: 'rgba(139,92,246,0.08)',
            border: '1px solid rgba(139,92,246,0.28)',
            fontSize: 12, color: '#5B21B6', lineHeight: 1.6, letterSpacing: '-0.2px',
          }}
        >
          <b style={{ fontWeight: 800 }}>핵심:</b> 해시체인과 .ots는 파일을 옮겨도 그대로 유효합니다.
          USB에 보관해 두었다가 몇 년 후에 제출해도 "그 시점의 기록이 변조되지 않았다"가 시점적으로 증명됩니다.
        </div>

        <button
          onClick={onClose}
          className="font-bold mt-2"
          style={{
            padding: '11px', borderRadius: 11, fontSize: 13.5,
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            color: '#fff', boxShadow: '0 6px 18px rgba(139,92,246,0.32)',
            letterSpacing: '-0.2px',
          }}
        >
          확인했어요
        </button>
      </motion.div>
    </motion.div>
  )
}

// ─── 법원 증거 사용 가이드 ─────────────────────────────────
// 잠금/셋업 화면에 표시. 학생기록 export → 법원 제출 워크플로우를 5단계로 안내하고,
// 이 시스템 단독으로는 결정적 증거가 아니라는 한계도 정직하게 명시한다.
function CourtEvidenceGuide(): React.ReactElement {
  const steps: { icon: typeof Save; title: string; body: string; accent: string }[] = [
    {
      icon: Save,
      accent: '#0EA5E9',
      title: '1. 사건이 생기면 즉시 기록 (1~2시간 이내)',
      body:
        '기억이 흐려지기 전에 사실 그대로 입력하세요. 추측·감정·평가는 빼고, 보고 들은 것만 시간·장소·관련자와 함께. 잠금을 풀고 입력한 뒤 다시 잠그면 됩니다 — 10분 후 자동 잠금.',
    },
    {
      icon: FileSpreadsheet,
      accent: '#10B981',
      title: '2. 매주 자동 CSV 백업 켜두기 (설정 → 데이터)',
      body:
        '"학생 기록 매주 CSV 자동 백업"을 켜두면 매주 한 번 학교 보안망 폴더에 CSV가 자동 저장됩니다. 손으로 매주 백업할 필요 없이 시점이 촘촘하게 분산되어 "사건 후 급조한 자료가 아님"이 더 강력하게 증명됩니다.',
    },
    {
      icon: Download,
      accent: '#0284C7',
      title: '3. 사건이 발생하면 즉시 "증거 내보내기"',
      body:
        '인터넷에 연결한 상태에서 실행하세요. JSON 본문 · 증명서(txt) · .ots 비트코인 시간증명 3종이 자동 생성됩니다. 출력 폴더를 통째로 학교 보안망에 복사해 두세요.',
    },
    {
      icon: Stamp,
      accent: '#F59E0B',
      title: '4. 학교장 결재 또는 공증으로 신뢰도 보강',
      body:
        'JSON·증명서를 인쇄해 학교장(또는 부장교사) 결재 도장을 받아 두세요. 큰 사건은 공증인 인증을 받으면 민사소송법상 진정성립 추정 효과가 생깁니다.',
    },
    {
      icon: Scale,
      accent: '#8B5CF6',
      title: '5. 학교 법무·교육청 정보보호 담당 자문',
      body:
        '정식 법적 절차에 들어가기 전 학교 변호사 또는 교육청 정보보호 담당과 먼저 협의하세요. 어떤 증거가 필요한지·어떤 방식이 인정되는지 학교마다 다릅니다.',
    },
    {
      icon: Server,
      accent: '#6D28D9',
      title: '6. 원본 DB 파일도 함께 보관 (변경 금지)',
      body:
        '%APPDATA%\\school-desk\\school-desk.db (Windows) 또는 ~/Library/Application Support/school-desk/ (mac) 파일을 변경 없이 보관하세요. 해시체인 재검증과 변조 탐지에 필요합니다.',
    },
  ]

  return (
    <div
      className="flex flex-col"
      style={{
        padding: 22,
        gap: 14,
        borderRadius: 18,
        background: 'var(--bg-widget)',
        border: '1px solid var(--border-widget)',
        boxShadow: '0 24px 48px rgba(15,23,42,0.10)',
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center" style={{ gap: 12 }}>
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            color: '#fff',
            boxShadow: '0 8px 20px rgba(139,92,246,0.32)',
          }}
        >
          <Scale size={20} strokeWidth={2.4} />
        </span>
        <div className="min-w-0">
          <div className="font-bold text-[var(--text-primary)]" style={{ fontSize: 15.5, letterSpacing: '-0.3px' }}>
            법원 증거로 사용하기 — 권장 워크플로우
          </div>
          <div className="text-[var(--text-muted)]" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.4, letterSpacing: '-0.2px' }}>
            기록 → 백업 → 증거 export → 결재·공증 → 자문 → 원본 보관, 6단계로 보강하세요.
          </div>
        </div>
      </div>

      {/* 어떻게 보호되고 있는가 — 기술 요약 */}
      <div
        className="flex items-start"
        style={{
          gap: 11, padding: '12px 14px', borderRadius: 12,
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.25)',
        }}
      >
        <ShieldCheck size={16} strokeWidth={2.4} style={{ color: '#059669', marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 12, color: '#065F46', lineHeight: 1.55, letterSpacing: '-0.2px' }}>
          <b style={{ fontWeight: 800 }}>이미 시스템이 자동으로 해주는 것</b> — 모든 생성·수정·삭제가 SHA-256 해시체인 로그로 append-only 보존되어
          한 행만 변조해도 즉시 탐지됩니다. 증거 export 시 JSON·증명서와 함께 OpenTimestamps .ots 파일(Bitcoin 블록체인에 해시 등록)이 자동 생성되어
          "그 시점 이전에 이미 그 내용이 존재했다"가 수학적으로 증명됩니다.
        </div>
      </div>

      {/* 6단계 */}
      <div className="flex flex-col" style={{ gap: 8 }}>
        {steps.map((s, idx) => (
          <div
            key={idx}
            className="flex items-start"
            style={{
              gap: 12, padding: '12px 14px', borderRadius: 12,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-widget)',
            }}
          >
            <span
              className="flex items-center justify-center shrink-0"
              style={{
                width: 32, height: 32, borderRadius: 10,
                background: `${s.accent}18`,
                color: s.accent,
                marginTop: 1,
              }}
            >
              <s.icon size={15} strokeWidth={2.4} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[var(--text-primary)]" style={{ fontSize: 13, letterSpacing: '-0.2px' }}>
                {s.title}
              </div>
              <div className="text-[var(--text-secondary)]" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.55, letterSpacing: '-0.2px', wordBreak: 'keep-all' }}>
                {s.body}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 한계 — 정직하게 명시 */}
      <div
        className="flex items-start"
        style={{
          gap: 11, padding: '12px 14px', borderRadius: 12,
          background: 'rgba(245,158,11,0.10)',
          border: '1px solid rgba(245,158,11,0.30)',
        }}
      >
        <AlertTriangle size={16} strokeWidth={2.4} style={{ color: '#B45309', marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 12, color: '#78350F', lineHeight: 1.6, letterSpacing: '-0.2px' }}>
          <div style={{ fontWeight: 800, color: '#92400E', marginBottom: 4 }}>이 시스템 단독으로는 결정적 증거가 아닙니다</div>
          <ul style={{ marginTop: 2, paddingLeft: 14, listStyle: 'disc' }}>
            <li>
              <b>OpenTimestamps는 한국 공인 TSA가 아닙니다.</b> 한국 법원이 공식 인정하는 시점확인은 KISA 공인 TSA의 RFC 3161 토큰입니다.
              OTS는 강력한 <b>보조 증거</b>로 활용하세요.
            </li>
            <li>
              <b>작성자 신원·PC 사용자 입증은 외부 자료가 필요합니다.</b> "그 시각 그 PC를 누가 썼는가"는 학교 관리대장·OS 로그인 기록·
              CCTV 등으로 보강해야 합니다.
            </li>
            <li>
              <b>같은 Windows 계정 접근자는 DB 파일에 접근 가능합니다.</b> 단, 해시체인을 다시 만들지 못하므로 변조는 그대로 탐지됩니다.
              개인 PC에서만 사용하고 OS 로그인 비밀번호·디스크 암호화(BitLocker / FileVault)를 켜 두세요.
            </li>
          </ul>
          <div style={{ marginTop: 6, fontWeight: 700 }}>
            그래도 "사후에 만든 기록이 아니다"를 시점적으로 증명하는 <u>매우 강력한 보조 증거</u>입니다.
            학교장 결재·정기 백업·공증을 더하면 실제 법정에서 충분한 가치가 있습니다.
          </div>
        </div>
      </div>

      {/* 학교/PC 이동 시 워크플로우 (개인정보보호법 + 분쟁 대비) */}
      <div
        className="flex flex-col"
        style={{
          gap: 8, padding: '12px 14px', borderRadius: 12,
          background: 'rgba(234,88,12,0.07)',
          border: '1px solid rgba(234,88,12,0.28)',
        }}
      >
        <div className="flex items-center" style={{ gap: 8 }}>
          <Building2 size={14} strokeWidth={2.4} style={{ color: '#C2410C' }} />
          <span className="font-bold" style={{ fontSize: 12.5, color: '#9A3412', letterSpacing: '-0.2px' }}>
            학교 옮길 때 · PC 옮길 때
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: '#7C2D12', lineHeight: 1.6, letterSpacing: '-0.2px' }}>
          이전 학교 학생 기록을 <b>새 학교 PC로 옮기지 마세요</b>. 개인정보보호법상 학교 종료 시 분리 보관이 원칙입니다.
          대신 본인 USB·외장하드에 보관해 두고 분쟁 발생 시 꺼내서 제출하면 됩니다.
        </div>
        <div className="flex flex-col" style={{ gap: 6, marginTop: 2 }}>
          {[
            { Icon: Download, text: '① 이동 직전 마지막 "증거 내보내기" 1회 — 시점 고정' },
            { Icon: Save,     text: '② JSON·증명서·.ots·자동 CSV 폴더 + DB 파일(school-desk.db) 통째로 본인 USB/외장하드에 복사' },
            { Icon: Lock,     text: '③ BitLocker(Win)/FileVault(Mac) 또는 VeraCrypt로 USB 암호화 보관' },
            { Icon: ShieldCheck, text: '④ 새 PC는 SchoolDesk 새로 설치 → 빈 상태로 시작 (이전 학생 정보 가져가지 X)' },
            { Icon: Scale,    text: '⑤ 나중에 그 학교 시절 분쟁이 생기면 보관함에서 꺼내 제출 — 해시체인·OTS 그대로라 시점 입증' },
          ].map((c, i) => (
            <div key={i} className="flex items-start" style={{ gap: 8 }}>
              <c.Icon size={12} strokeWidth={2.4} style={{ color: '#EA580C', flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', letterSpacing: '-0.2px', lineHeight: 1.55 }}>
                {c.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 빠른 시작 체크리스트 */}
      <div
        className="flex flex-col"
        style={{
          gap: 8, padding: '12px 14px', borderRadius: 12,
          background: 'rgba(139,92,246,0.06)',
          border: '1px solid rgba(139,92,246,0.22)',
        }}
      >
        <div className="flex items-center" style={{ gap: 8 }}>
          <FileText size={14} strokeWidth={2.4} style={{ color: '#6D28D9' }} />
          <span className="font-bold" style={{ fontSize: 12.5, color: '#5B21B6', letterSpacing: '-0.2px' }}>
            오늘 바로 할 일
          </span>
        </div>
        {[
          { Icon: Clock, text: '비밀번호 설정 — 4자 이상, 학생이 알기 어려운 것' },
          { Icon: Building2, text: 'OS 로그인 비밀번호 + 화면 잠금 단축키(Win+L) 익히기' },
          { Icon: FileSpreadsheet, text: '설정 → 데이터 → "학생 기록 매주 CSV 자동 백업" 켜두기 (폴더는 학교 보안망 권장)' },
        ].map((c, i) => (
          <div key={i} className="flex items-center" style={{ gap: 9 }}>
            <c.Icon size={13} strokeWidth={2.4} style={{ color: '#7C3AED', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '-0.2px', lineHeight: 1.5 }}>
              {c.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
