import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Lock, Unlock, ShieldCheck, Plus, Trash2, Download, Key, X, Check, AlertCircle,
  FileSpreadsheet, Search, Pencil, Users,
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
  | { kind: 'setup' }
  | { kind: 'locked' }
  | { kind: 'unlocked' }

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
    window.api.studentRecord.isPasswordSet().then((set) => {
      if (!alive) return
      setMode(set ? { kind: 'locked' } : { kind: 'setup' })
    }).catch(() => {
      if (alive) setMode({ kind: 'setup' })
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (mode.kind !== 'unlocked') { setRecords([]); return }
    window.api.studentRecord.list().then(setRecords).catch(() => setRecords([]))
  }, [mode.kind])

  useDataChange('studentrecord', () => {
    if (mode.kind === 'unlocked') {
      window.api.studentRecord.list().then(setRecords).catch(() => setRecords([]))
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

  // ─── setup / locked: 중앙 잠금 화면 ───
  if (mode.kind === 'setup' || mode.kind === 'locked') {
    const isSetup = mode.kind === 'setup'
    return (
      <div
        className="flex items-center justify-center h-full overflow-y-auto"
        style={{
          padding: 24,
          background: 'radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.07) 0%, transparent 55%)',
        }}
      >
        <div
          className="flex flex-col items-center"
          style={{
            width: '100%', maxWidth: 420, padding: 28, gap: 16,
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
                    return (
                      <motion.div
                        key={r.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 30 }}
                        className="group"
                        style={{
                          padding: '11px 13px', borderRadius: 11,
                          background: 'var(--bg-secondary)',
                          border: '1px solid transparent',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
                        }}
                      >
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
