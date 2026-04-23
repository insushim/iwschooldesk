import { useState, useEffect, useMemo, useRef } from 'react'
import { Lock, Unlock, ShieldCheck, Plus, Trash2, Download, Key, X, Check, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDataChange } from '../../hooks/useDataChange'

/**
 * 학생 기록 위젯.
 *  - 비밀번호로 내용 잠금 (학생이 못 보게). 잠금 중엔 헤더/잠금 아이콘만.
 *  - 모든 수정(생성·변경·삭제)에 타임스탬프 + 해시체인 로그 기록 → 법원 증거.
 *  - "로그 내보내기" 버튼으로 JSON 파일 저장 (main 에 dialog).
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
  | { kind: 'setup' }        // 아직 비밀번호 미설정
  | { kind: 'locked' }       // 비밀번호 설정됨, 잠김
  | { kind: 'unlocked' }     // 잠금 해제

export function StudentRecordWidget() {
  const [mode, setMode] = useState<Mode>({ kind: 'loading' })
  const [records, setRecords] = useState<StudentRecord[]>([])
  const [pwInput, setPwInput] = useState('')
  const [pwInput2, setPwInput2] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [changePwOpen, setChangePwOpen] = useState(false)

  // form
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

  // 잠금 UI: 헤더만 있는 기본 상태 vs 비밀번호 입력 박스 펼침 상태
  const [showPwPrompt, setShowPwPrompt] = useState(false)

  // 유휴 자동 잠금 — 해제 상태에서 10분간 상호작용이 없으면 자동으로 잠금으로 되돌림.
  // 학생들이 있는 교실에서 선생님이 잠시 자리를 비울 때 대비.
  const AUTO_LOCK_MS = 10 * 60 * 1000
  const idleTimerRef = useRef<number | null>(null)
  const resetIdleTimer = (): void => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = window.setTimeout(() => {
      setMode((m) => (m.kind === 'unlocked' ? { kind: 'locked' } : m))
    }, AUTO_LOCK_MS)
  }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind])

  // 초기 상태: 비밀번호 설정 여부 확인 → locked 시작 (or setup)
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

  // 잠금/셋업 모드 ↔ 해제 모드 전환 시 창 크기 자동 조절.
  // 잠금 상태에선 헤더만 보이도록 창을 72px 로 줄임. 해제하면 이전 높이로 복원.
  // showPwPrompt 가 켜지면 입력칸 공간 확보를 위해 160px 정도.
  useEffect(() => {
    const isLocked = mode.kind === 'locked' || mode.kind === 'setup'
    if (!isLocked) {
      // 펼침 상태로 복원
      window.api.widget.setLockCompact(false)
      setShowPwPrompt(false)
      return
    }
    // 잠금 상태: showPwPrompt 에 따라 높이 다르게
    // 실제 창 setSize 는 main에서 "컴팩트=true"면 72 고정. 입력 박스 열릴 때만 추가 공간이 필요.
    // 단순화를 위해: 입력박스 열림/닫힘에 따라 false/true 토글
    if (showPwPrompt) {
      // 입력 박스 보여야 하므로 컴팩트 해제하되 이전 height 에 근접한 최소값 필요.
      // 간단히 여기선: compact 풀고 제어 없이 내용이 자라도록 둠(창 크기는 그대로 유지)
      window.api.widget.setLockCompact(false)
    } else {
      window.api.widget.setLockCompact(true)
    }
  }, [mode.kind, showPwPrompt])

  // 언락 상태에서만 기록 로드
  useEffect(() => {
    if (mode.kind !== 'unlocked') { setRecords([]); return }
    window.api.studentRecord.list().then(setRecords).catch(() => setRecords([]))
  }, [mode.kind])

  useDataChange('studentrecord', () => {
    if (mode.kind === 'unlocked') {
      window.api.studentRecord.list().then(setRecords).catch(() => setRecords([]))
    }
  })

  // 잠금 진입 시 입력 포커스
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
    setAdding(false); setEditingId(null)
  }

  const handleAdd = async () => {
    if (!newName.trim() || !newContent.trim()) return
    try {
      await window.api.studentRecord.create({
        student_name: newName.trim(),
        content: newContent.trim(),
        tag: newTag.trim() || undefined,
      })
      setNewName(''); setNewContent(''); setNewTag('')
      setAdding(false)
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
      const res = await window.api.studentRecord.exportLogs() as
        | { ok: true; count: number; path: string }
        | { ok: false; reason: string }
      if (res.ok) {
        setExportToast(`${res.count}개 로그를 저장했어요`)
      } else if (res.reason !== 'canceled') {
        setExportToast('저장에 실패했어요')
      }
      setTimeout(() => setExportToast(null), 4000)
    } catch {
      setExportToast('저장에 실패했어요')
      setTimeout(() => setExportToast(null), 4000)
    }
  }

  const grouped = useMemo(() => {
    const m = new Map<string, StudentRecord[]>()
    for (const r of records) {
      const arr = m.get(r.student_name) ?? []
      arr.push(r)
      m.set(r.student_name, arr)
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }, [records])

  const tagColor = (tag: string): string => {
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

  // ─── 잠김/셋업 모드: 헤더 + 잠금 UI 만. 내용 노출 없음 ───
  if (mode.kind === 'loading') {
    return <div className="flex items-center justify-center h-full text-xs text-[var(--text-muted)]">불러오는 중…</div>
  }

  if (mode.kind === 'setup' || mode.kind === 'locked') {
    const isSetup = mode.kind === 'setup'
    return (
      <div
        className="flex flex-col relative overflow-hidden"
        style={{
          height: '100%',
          padding: '12px 16px',
          background: 'radial-gradient(ellipse at 0% 0%, rgba(239,68,68,0.06) 0%, transparent 60%)',
        }}
      >
        {/* 헤더만. 클릭하면 아래로 입력 박스 펼쳐짐. */}
        <div className="flex items-center gap-2 shrink-0" style={{ minHeight: 44 }}>
          <span
            className="flex items-center justify-center shrink-0"
            style={{
              width: 28, height: 28, borderRadius: 9,
              background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
              color: '#fff',
              boxShadow: '0 3px 10px rgba(239,68,68,0.30)',
            }}
          >
            <Lock size={13} strokeWidth={2.6} />
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="truncate"
              style={{ fontSize: 13.5, fontWeight: 900, letterSpacing: '-0.3px', color: 'var(--text-primary)' }}
            >
              학생 기록 · {isSetup ? '비밀번호 설정' : '잠금'}
            </div>
          </div>
          <button
            onClick={() => {
              setShowPwPrompt((v) => !v)
              setPwError(null)
            }}
            className="shrink-0 font-bold flex items-center gap-1 transition-all hover:opacity-90"
            style={{
              padding: '6px 12px', fontSize: 11.5, borderRadius: 9,
              background: showPwPrompt
                ? 'var(--bg-secondary)'
                : 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
              color: showPwPrompt ? 'var(--text-secondary)' : '#fff',
              border: showPwPrompt ? '1px solid var(--border-widget)' : 'none',
              letterSpacing: '-0.2px',
              boxShadow: showPwPrompt ? 'none' : '0 3px 10px rgba(239,68,68,0.30)',
            }}
          >
            {showPwPrompt ? (
              <><X size={11} strokeWidth={2.6} />취소</>
            ) : (
              <><Unlock size={11} strokeWidth={2.6} />{isSetup ? '비밀번호 설정' : '비밀번호 입력'}</>
            )}
          </button>
        </div>

        {/* 입력 박스 — 헤더 버튼 눌렀을 때만 */}
        <AnimatePresence>
          {showPwPrompt && (
            <motion.div
              key="pw-prompt"
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col shrink-0"
              style={{ marginTop: 10, gap: 6 }}
            >
              {isSetup ? (
                <>
                  <input
                    ref={unlockInputRef}
                    type="password"
                    placeholder="새 비밀번호 (4자 이상)"
                    value={pwInput}
                    onChange={(e) => setPwInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSetupPassword()}
                    className="w-full outline-none"
                    style={{
                      padding: '9px 11px', fontSize: 13,
                      borderRadius: 9, border: '1.5px solid var(--border-widget)',
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)', letterSpacing: '-0.2px',
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
                      padding: '9px 11px', fontSize: 13,
                      borderRadius: 9, border: '1.5px solid var(--border-widget)',
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)', letterSpacing: '-0.2px',
                    }}
                  />
                  <button
                    onClick={handleSetupPassword}
                    className="w-full font-bold"
                    style={{
                      padding: '9px', borderRadius: 9, fontSize: 12.5,
                      background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
                      color: '#fff', boxShadow: '0 4px 12px rgba(239,68,68,0.32)', letterSpacing: '-0.2px',
                    }}
                  >
                    설정하고 시작
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={unlockInputRef}
                    type="password"
                    placeholder="비밀번호"
                    value={pwInput}
                    onChange={(e) => setPwInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                    className="flex-1 min-w-0 outline-none"
                    style={{
                      padding: '9px 11px', fontSize: 13,
                      borderRadius: 9, border: '1.5px solid var(--border-widget)',
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)', letterSpacing: '-0.2px',
                    }}
                  />
                  <button
                    onClick={handleUnlock}
                    className="shrink-0 font-bold flex items-center gap-1"
                    style={{
                      padding: '9px 12px', fontSize: 12.5, borderRadius: 9,
                      background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
                      color: '#fff', boxShadow: '0 4px 12px rgba(239,68,68,0.32)', letterSpacing: '-0.2px',
                    }}
                  >
                    <Unlock size={12} strokeWidth={2.6} />해제
                  </button>
                </div>
              )}
              {pwError && (
                <div
                  className="flex items-center gap-1.5"
                  style={{ fontSize: 11, color: '#EF4444', fontWeight: 700, letterSpacing: '-0.2px', marginTop: 2 }}
                >
                  <AlertCircle size={11} /> {pwError}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ─── unlocked 모드 ───
  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        padding: '14px 22px 24px',
        background: 'radial-gradient(ellipse at 100% 0%, rgba(139,92,246,0.05) 0%, transparent 55%)',
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-1.5 shrink-0" style={{ marginBottom: 10 }}>
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 26, height: 26, borderRadius: 8,
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            color: '#fff',
            boxShadow: '0 3px 10px rgba(139,92,246,0.32)',
          }}
        >
          <ShieldCheck size={13} strokeWidth={2.6} />
        </span>
        <span
          className="flex-1 min-w-0 truncate"
          style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.25px', color: 'var(--text-primary)' }}
        >
          학생 기록
        </span>
        <button
          onClick={handleExport}
          className="flex items-center justify-center hover:bg-[var(--bg-secondary)] transition-colors"
          style={{ width: 28, height: 28, borderRadius: 8, color: '#0284C7', border: '1px solid rgba(2,132,199,0.28)' }}
          title="로그 내보내기 (JSON, 해시체인 포함)"
        >
          <Download size={13} strokeWidth={2.4} />
        </button>
        <button
          onClick={() => setChangePwOpen(true)}
          className="flex items-center justify-center hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-muted)]"
          style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-widget)' }}
          title="비밀번호 변경"
        >
          <Key size={12} strokeWidth={2.4} />
        </button>
        <button
          onClick={handleLock}
          className="flex items-center justify-center transition-colors"
          style={{
            width: 28, height: 28, borderRadius: 8,
            color: '#fff',
            background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
            boxShadow: '0 3px 10px rgba(239,68,68,0.32)',
          }}
          title="즉시 잠금"
        >
          <Lock size={12} strokeWidth={2.6} />
        </button>
      </div>

      {exportToast && (
        <div
          className="shrink-0"
          style={{
            marginBottom: 6, padding: '6px 10px', borderRadius: 8,
            fontSize: 11.5, fontWeight: 700, letterSpacing: '-0.2px',
            backgroundColor: 'rgba(2,132,199,0.12)', color: '#0369A1',
          }}
        >
          {exportToast}
        </div>
      )}

      {/* 기록 추가 */}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-1.5 shrink-0 hover:opacity-90 transition-opacity"
          style={{
            marginBottom: 8, padding: '8px 10px', borderRadius: 10,
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            color: '#fff', boxShadow: '0 4px 12px rgba(139,92,246,0.32)',
            fontSize: 12.5, fontWeight: 800, letterSpacing: '-0.2px',
          }}
        >
          <Plus size={13} strokeWidth={2.6} /> 기록 추가
        </button>
      ) : (
        <div
          className="flex flex-col shrink-0"
          style={{
            marginBottom: 10, padding: 10, gap: 6,
            borderRadius: 12, background: 'var(--bg-secondary)',
            border: '1px solid rgba(139,92,246,0.28)',
          }}
        >
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="학생 이름"
              className="flex-1 min-w-0 outline-none"
              style={{
                fontSize: 12.5, padding: '7px 10px', borderRadius: 8,
                background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                color: 'var(--text-primary)', fontWeight: 700, letterSpacing: '-0.2px',
              }}
            />
            <select
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              className="outline-none"
              style={{
                fontSize: 12, padding: '7px 8px', borderRadius: 8,
                background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '-0.2px',
              }}
            >
              <option value="">태그</option>
              <option value="생활">생활</option>
              <option value="학습">학습</option>
              <option value="상담">상담</option>
              <option value="출결">출결</option>
              <option value="칭찬">칭찬</option>
              <option value="지도">지도</option>
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
              fontSize: 12.5, padding: '8px 10px', borderRadius: 8, minHeight: 52,
              background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
              color: 'var(--text-primary)', letterSpacing: '-0.2px', fontWeight: 500, lineHeight: 1.5,
            }}
          />
          <div className="flex gap-1.5">
            <button
              onClick={() => { setAdding(false); setNewName(''); setNewContent(''); setNewTag('') }}
              className="flex-1 flex items-center justify-center"
              style={{
                padding: '7px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'var(--bg-widget)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-widget)', letterSpacing: '-0.2px',
              }}
            >
              취소
            </button>
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newContent.trim()}
              className="flex-1 flex items-center justify-center gap-1 disabled:opacity-40"
              style={{
                padding: '7px', borderRadius: 8, fontSize: 12, fontWeight: 800,
                background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                color: '#fff', letterSpacing: '-0.2px',
              }}
            >
              <Check size={12} strokeWidth={2.8} /> 저장
            </button>
          </div>
        </div>
      )}

      {/* 기록 리스트 (학생별 그룹) */}
      <div className="flex-1 overflow-y-auto flex flex-col" style={{ gap: 10 }}>
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-[var(--text-muted)]">
            <ShieldCheck size={28} strokeWidth={1.8} />
            <span className="text-xs font-semibold" style={{ letterSpacing: '-0.2px' }}>
              아직 기록이 없어요
            </span>
          </div>
        ) : (
          grouped.map(([name, list]) => (
            <div key={name}>
              <div
                style={{
                  fontSize: 12, fontWeight: 900, letterSpacing: '-0.2px',
                  color: 'var(--text-primary)', padding: '4px 4px 6px',
                  borderBottom: '1px solid var(--border-widget)', marginBottom: 6,
                }}
              >
                {name} <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>· {list.length}건</span>
              </div>
              <AnimatePresence>
                {list.map((r) => {
                  const tc = tagColor(r.tag)
                  const isEditing = editingId === r.id
                  const ts = r.updated_at
                  return (
                    <motion.div
                      key={r.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 30 }}
                      className="group"
                      style={{
                        marginBottom: 5, padding: '8px 10px', borderRadius: 10,
                        background: 'var(--bg-secondary)',
                        border: '1px solid transparent',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
                      }}
                    >
                      {isEditing ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-1.5">
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 min-w-0 outline-none"
                              style={{
                                fontSize: 12.5, padding: '6px 9px', borderRadius: 7,
                                background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                                color: 'var(--text-primary)', fontWeight: 700,
                              }}
                            />
                            <select
                              value={editTag}
                              onChange={(e) => setEditTag(e.target.value)}
                              className="outline-none"
                              style={{
                                fontSize: 12, padding: '6px 7px', borderRadius: 7,
                                background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                                color: 'var(--text-secondary)', fontWeight: 700,
                              }}
                            >
                              <option value="">태그</option>
                              <option value="생활">생활</option>
                              <option value="학습">학습</option>
                              <option value="상담">상담</option>
                              <option value="출결">출결</option>
                              <option value="칭찬">칭찬</option>
                              <option value="지도">지도</option>
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
                              fontSize: 12.5, padding: '7px 9px', borderRadius: 7, minHeight: 48,
                              background: 'var(--bg-widget)', border: '1px solid var(--border-widget)',
                              color: 'var(--text-primary)', lineHeight: 1.5,
                            }}
                          />
                          <div className="flex gap-1.5">
                            <button
                              onClick={cancelEdit}
                              className="flex-1 flex items-center justify-center"
                              style={{
                                padding: '6px', borderRadius: 7, fontSize: 11.5, fontWeight: 700,
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
                                padding: '6px', borderRadius: 7, fontSize: 11.5, fontWeight: 800,
                                background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                                color: '#fff',
                              }}
                            >
                              저장
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start gap-2">
                            {r.tag && (
                              <span
                                className="shrink-0"
                                style={{
                                  fontSize: 10, fontWeight: 800,
                                  padding: '2px 7px', borderRadius: 999,
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
                                fontSize: 13, fontWeight: 500, lineHeight: 1.55,
                                color: 'var(--text-primary)', letterSpacing: '-0.2px',
                                whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
                              }}
                            >
                              {r.content}
                            </p>
                            <button
                              onClick={() => setConfirmDeleteId(r.id)}
                              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              style={{
                                width: 22, height: 22, borderRadius: 6,
                                color: '#EF4444', background: 'rgba(239,68,68,0.1)',
                              }}
                              title="삭제"
                            >
                              <Trash2 size={11} strokeWidth={2.4} />
                            </button>
                          </div>
                          <div
                            className="flex items-center gap-1 tabular-nums"
                            style={{
                              marginTop: 4, fontSize: 10,
                              color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '-0.2px',
                            }}
                          >
                            {ts}
                          </div>
                        </>
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>

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
                padding: 18, maxWidth: 280, margin: 12, borderRadius: 16,
                background: 'var(--bg-widget)',
                boxShadow: '0 20px 48px rgba(15,23,42,0.32)',
                border: '1px solid rgba(15,23,42,0.08)',
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                이 기록을 삭제할까요?
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.45 }}>
                삭제도 로그에 남습니다 (복구 불가, 기록만 증거).
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1"
                  style={{
                    padding: '9px', fontSize: 12.5, fontWeight: 700, borderRadius: 10,
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
                    padding: '9px', fontSize: 12.5, fontWeight: 800, borderRadius: 10,
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
          <ChangePasswordPanel
            onClose={() => setChangePwOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── 비밀번호 변경 패널 ───
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
          padding: 18, maxWidth: 300, width: '88%', gap: 8, borderRadius: 16,
          background: 'var(--bg-widget)', boxShadow: '0 20px 48px rgba(15,23,42,0.32)',
          border: '1px solid rgba(15,23,42,0.08)',
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>비밀번호 변경</span>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={14} />
          </button>
        </div>
        <input
          type="password" value={cur} onChange={(e) => setCur(e.target.value)}
          placeholder="현재 비밀번호"
          className="w-full outline-none"
          style={{ fontSize: 13, padding: '9px 11px', borderRadius: 9, background: 'var(--bg-secondary)', border: '1px solid var(--border-widget)', color: 'var(--text-primary)' }}
        />
        <input
          type="password" value={next1} onChange={(e) => setNext1(e.target.value)}
          placeholder="새 비밀번호 (4자 이상)"
          className="w-full outline-none"
          style={{ fontSize: 13, padding: '9px 11px', borderRadius: 9, background: 'var(--bg-secondary)', border: '1px solid var(--border-widget)', color: 'var(--text-primary)' }}
        />
        <input
          type="password" value={next2} onChange={(e) => setNext2(e.target.value)}
          placeholder="새 비밀번호 확인"
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="w-full outline-none"
          style={{ fontSize: 13, padding: '9px 11px', borderRadius: 9, background: 'var(--bg-secondary)', border: '1px solid var(--border-widget)', color: 'var(--text-primary)' }}
        />
        {err && (
          <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 700, letterSpacing: '-0.2px' }}>
            {err}
          </div>
        )}
        <button
          onClick={save}
          className="font-bold"
          style={{
            padding: '9px', fontSize: 13, borderRadius: 9, marginTop: 4,
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
