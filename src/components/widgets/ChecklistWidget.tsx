import { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Check, ChevronDown, Sparkles, X, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Checklist, ChecklistItem } from '../../types/checklist.types'
import { isSectionLine } from '../../lib/section-parser'
import { useDataChange } from '../../hooks/useDataChange'

/** url hash 에서 instance(=checklist id) 추출. 없으면 null → 첫 번째 자동 선택. */
function getInstanceIdFromHash(): string | null {
  const m = window.location.hash.match(/instance=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

export function ChecklistWidget() {
  const lockedInstanceId = useRef<string | null>(getInstanceIdFromHash()).current
  const [allLists, setAllLists] = useState<Checklist[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(lockedInstanceId)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [createMode, setCreateMode] = useState<null | 'new' | 'template'>(null)
  const [newListTitle, setNewListTitle] = useState('')
  // 섹션 헤더별 "여기에 추가" 인라인 입력. key는 해당 섹션 헤더 item id.
  const [addUnderSection, setAddUnderSection] = useState<string | null>(null)
  const [underSectionText, setUnderSectionText] = useState('')
  const newListInputRef = useRef<HTMLInputElement>(null)

  // createMode === 'new' 진입 시 입력 포커스 강제. main 프로세스의 focusSelf로
  // Windows 포그라운드 락을 우회해 OS-level 포커스 복원.
  useEffect(() => {
    if (createMode !== 'new') return
    window.api.widget.focusSelf()
    const t = setTimeout(() => {
      newListInputRef.current?.focus()
    }, 80)
    return () => clearTimeout(t)
  }, [createMode])

  const checklists = allLists.filter((c) => !c.is_template)
  const templates = allLists.filter((c) => c.is_template)

  const reload = async () => {
    const data = await window.api.checklist.list()
    setAllLists(data)
    return data
  }

  useEffect(() => {
    reload().then((data) => {
      // instance 잠긴 창: 해당 리스트가 없어지면 창 자동 닫기.
      if (lockedInstanceId) {
        const exists = data.some((c) => c.id === lockedInstanceId)
        if (!exists && data.length > 0) {
          setTimeout(() => { try { window.api.widget.closeSelf() } catch { /* ignore */ } }, 0)
        }
        return
      }
      const active = data.filter((c) => !c.is_template)
      if (active.length > 0 && !selectedId) setSelectedId(active[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedId) {
      window.api.checklist.getItems(selectedId).then(setItems)
    }
  }, [selectedId])

  // 대시보드에서 체크리스트 편집 시 위젯 자동 갱신
  useDataChange('checklist', () => {
    reload()
    if (selectedId) {
      window.api.checklist.getItems(selectedId).then(setItems)
    }
  })

  const countable = items.filter((i) => !isSectionLine(i.content))
  const doneCount = countable.filter((i) => i.is_checked).length
  const progress = countable.length > 0
    ? Math.round((doneCount / countable.length) * 100)
    : 0
  const progressColor = progress >= 80 ? '#10B981' : progress >= 50 ? '#F59E0B' : '#2563EB'

  const handleToggle = async (itemId: string) => {
    const updated = await window.api.checklist.toggleItem(itemId)
    setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)))
  }

  // 섹션별 진척도(현재 섹션 헤더 이후 다음 섹션 전까지의 일반 항목 기준)
  const sectionStats = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>()
    let cur: string | null = null
    for (const it of items) {
      if (isSectionLine(it.content)) {
        cur = it.id
        map.set(cur, { done: 0, total: 0 })
      } else if (cur) {
        const s = map.get(cur)
        if (s) {
          s.total += 1
          if (it.is_checked) s.done += 1
        }
      }
    }
    return map
  }, [items])

  // 하단 입력창은 "섹션 추가" 전용. 일반 항목은 각 섹션 옆 + 버튼으로 추가한다.
  const handleAddSection = async () => {
    if (!newContent.trim() || !selectedId) return
    const raw = newContent.trim()
    // 이미 [...] 또는 ## 로 감싸져 있으면 그대로, 아니면 [...]로 래핑
    const content = /^\[.+\]$/.test(raw) || /^#{1,3}\s+/.test(raw) ? raw : `[${raw}]`
    const item = await window.api.checklist.addItem({ checklist_id: selectedId, content })
    setItems((prev) => [...prev, item])
    setNewContent('')
  }

  const handleDeleteItem = async (itemId: string) => {
    await window.api.checklist.deleteItem(itemId)
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  // 특정 섹션 헤더 바로 다음 위치에 새 아이템 삽입
  const handleAddUnderSection = async (sectionId: string, content: string) => {
    if (!content.trim() || !selectedId) return
    const trimmed = content.trim()
    // 1) addItem 호출 (백엔드는 sort_order를 맨 끝에 둠)
    const newItem = await window.api.checklist.addItem({ checklist_id: selectedId, content: trimmed })

    // 2) 프런트엔드에서 섹션 헤더 바로 다음 위치로 이동
    const sectionIdx = items.findIndex((i) => i.id === sectionId)
    if (sectionIdx === -1) {
      setItems((prev) => [...prev, newItem])
    } else {
      const next = [...items]
      next.splice(sectionIdx + 1, 0, newItem)
      setItems(next)

      // 3) reorderItems로 sort_order를 새 인덱스로 일괄 업데이트
      await window.api.checklist.reorderItems(
        next.map((it, idx) => ({ id: it.id, sort_order: idx })),
      )
    }
    setAddUnderSection(null)
    setUnderSectionText('')
  }

  const requestDeleteList = (): void => {
    if (!selectedId) return
    setConfirmDelete(true)
  }

  const handleDeleteList = async (): Promise<void> => {
    if (!selectedId) return
    setConfirmDelete(false)
    await window.api.checklist.delete(selectedId)
    if (lockedInstanceId && lockedInstanceId === selectedId) {
      try { window.api.widget.closeSelf() } catch { /* ignore */ }
      return
    }
    const data = await reload()
    const active = data.filter((c) => !c.is_template)
    setSelectedId(active.length > 0 ? active[0].id : null)
    setItems([])
  }

  const startEdit = (item: ChecklistItem) => {
    setEditingId(item.id)
    setEditingContent(item.content)
  }

  const commitEdit = async () => {
    if (!editingId) return
    const trimmed = editingContent.trim()
    if (trimmed) {
      const updated = await window.api.checklist.updateItem(editingId, { content: trimmed })
      setItems((prev) => prev.map((i) => (i.id === editingId ? updated : i)))
    }
    setEditingId(null)
    setEditingContent('')
  }

  const selected = checklists.find((c) => c.id === selectedId)

  const createBlank = async () => {
    const title = newListTitle.trim() || '새 체크리스트'
    const c = await window.api.checklist.create({ title, category: '일반', is_template: 0 })
    const data = await reload()
    setCreateMode(null)
    setNewListTitle('')
    // 기본 창(미잠금)에서 첫 리스트면 자기 창 유지, 이상이면 새 창. 잠긴 창이면 항상 새 창.
    const activeCount = data.filter((x) => !x.is_template).length
    if (!lockedInstanceId && activeCount === 1) {
      setSelectedId(c.id)
      return
    }
    try { await window.api.widget.openWindow('checklist', { instanceId: c.id }) } catch { /* ignore */ }
  }

  const createFromTemplate = async (t: Checklist) => {
    const c = await window.api.checklist.create({
      title: t.title,
      description: t.description,
      color: t.color,
      category: t.category,
      section_id: t.section_id ?? null,
      is_template: 0,
    })
    const tItems = await window.api.checklist.getItems(t.id)
    for (const ti of tItems) {
      await window.api.checklist.addItem({ checklist_id: c.id, content: ti.content })
    }
    const data = await reload()
    setCreateMode(null)
    const activeCount = data.filter((x) => !x.is_template).length
    if (!lockedInstanceId && activeCount === 1) {
      setSelectedId(c.id)
      return
    }
    try { await window.api.widget.openWindow('checklist', { instanceId: c.id }) } catch { /* ignore */ }
  }

  /** 다른 체크리스트로 전환 — 새 창 spawn. */
  const handleSwitchChecklist = (nextId: string): void => {
    if (!nextId || nextId === selectedId) return
    window.api.widget.openWindow('checklist', { instanceId: nextId }).catch(() => {})
  }

  // ───── 비어 있을 때 빈 상태 화면 ─────
  if (checklists.length === 0 && createMode === null) {
    return (
      <div className="flex flex-col h-full" style={{ padding: '18px 18px 22px' }}>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div
            className="flex items-center justify-center"
            style={{
              width: 48, height: 48, borderRadius: 14,
              backgroundColor: 'var(--accent-light)', color: 'var(--accent)',
            }}
          >
            <Sparkles size={22} />
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-medium">체크리스트가 비어있어요</p>
        </div>
        <div className="flex flex-col gap-2" style={{ marginTop: 10 }}>
          <button
            onClick={() => setCreateMode('new')}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold transition-all hover:opacity-90"
            style={{
              padding: '10px 14px', borderRadius: 10,
              backgroundColor: 'var(--accent)', color: '#fff',
            }}
          >
            <Plus size={14} strokeWidth={2.6} /> 새 체크리스트
          </button>
          {templates.length > 0 && (
            <button
              onClick={() => setCreateMode('template')}
              className="flex items-center justify-center gap-1.5 text-xs font-semibold transition-all"
              style={{
                padding: '10px 14px', borderRadius: 10,
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid rgba(15,23,42,0.1)',
              }}
            >
              <Sparkles size={12} /> 템플릿에서 만들기
            </button>
          )}
        </div>
      </div>
    )
  }

  // ───── 새 체크리스트 생성 ─────
  if (createMode === 'new') {
    return (
      <div className="flex flex-col h-full" style={{ padding: '18px 18px 22px', gap: 12 }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--text-primary)]">새 체크리스트</span>
          <button onClick={() => { setCreateMode(null); setNewListTitle('') }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={14} />
          </button>
        </div>
        <input
          ref={newListInputRef}
          value={newListTitle}
          onChange={(e) => setNewListTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createBlank(); if (e.key === 'Escape') setCreateMode(null) }}
          placeholder="제목을 입력하세요..."
          className="w-full text-xs outline-none"
          style={{
            padding: '10px 12px', borderRadius: 10,
            border: '1px solid var(--accent)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          onClick={createBlank}
          className="text-xs font-semibold hover:opacity-90"
          style={{ padding: '10px', borderRadius: 10, backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          만들기
        </button>
      </div>
    )
  }

  // ───── 템플릿 선택 ─────
  if (createMode === 'template') {
    return (
      <div className="flex flex-col h-full" style={{ padding: '14px 14px 22px' }}>
        <div className="flex items-center justify-between mb-2" style={{ padding: '0 4px' }}>
          <span className="text-xs font-semibold text-[var(--text-primary)]">템플릿 선택</span>
          <button onClick={() => setCreateMode(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => createFromTemplate(t)}
              className="text-left hover:bg-[var(--bg-secondary)] transition-colors"
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(15,23,42,0.08)' }}
            >
              <div className="text-xs font-semibold text-[var(--text-primary)]">{t.title}</div>
              {t.description && (
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">{t.description}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ───── 메인 뷰 ─────
  return (
    // shell-radius 22px 때문에 좌/하단 모서리 22×22 영역이 clip됨.
    // inline padding으로 좌/우 26px + 하단 28px — 곡선 바깥 확실히 확보.
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        padding: '14px 26px 28px 26px',
        background: 'radial-gradient(ellipse at 100% 0%, rgba(37,99,235,0.05) 0%, transparent 55%)',
      }}
    >
      {/* 한 줄 헤더 — [타이틀 select (클릭=다른 리스트 새 창)] [템플릿] [+새] [🗑] */}
      <div className="flex items-center shrink-0 mb-3" style={{ gap: 6 }}>
        {/* 타이틀 = select. 표시 div 위에 투명 select overlay — 그라디언트 텍스트 + 드롭다운 둘 다. */}
        <div className="relative shrink min-w-0 flex-1">
          <div
            className="truncate w-full pointer-events-none"
            title={selected?.title}
            style={{
              fontSize: 'clamp(14px, 1.7vw, 22px)',
              fontWeight: 900,
              letterSpacing: '-0.035em',
              lineHeight: 1.1,
              paddingRight: 16,
              background: 'linear-gradient(180deg, var(--text-primary) 0%, var(--accent) 140%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {selected?.title ?? '체크리스트'}
          </div>
          <ChevronDown size={12} strokeWidth={2.4} className="absolute top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" style={{ right: 1 }} />
          <select
            value={selectedId ?? ''}
            onChange={(e) => handleSwitchChecklist(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            title="다른 체크리스트 — 새 창에서 열립니다"
          >
            {checklists.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setCreateMode('new')}
          className="shrink-0 flex items-center justify-center hover:opacity-85 transition-opacity"
          style={{
            width: 30, height: 30, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--accent) 0%, #4338CA 100%)',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(37,99,235,0.35)',
          }}
          title="새 체크리스트 만들기"
        >
          <Plus size={14} strokeWidth={2.6} />
        </button>
        {templates.length > 0 && (
          <button
            onClick={() => setCreateMode('template')}
            className="shrink-0 flex items-center justify-center hover:bg-[var(--bg-secondary)] transition-colors"
            style={{
              width: 30, height: 30, borderRadius: 10,
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-widget)',
            }}
            title="템플릿에서 만들기"
          >
            <Sparkles size={13} />
          </button>
        )}
        <button
          onClick={requestDeleteList}
          className="shrink-0 flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-colors text-[var(--text-muted)]"
          style={{
            width: 30, height: 30, borderRadius: 10,
            border: '1px solid var(--border-widget)',
          }}
          title="현재 체크리스트 삭제"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* 진행률 바 — 그라디언트 + 부드러운 그림자 */}
      <div className="mb-3">
        <div
          className="relative h-2.5 rounded-full overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.06)',
          }}
        >
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${progressColor}, ${progressColor}DD)`,
              boxShadow: `0 0 12px ${progressColor}55`,
            }}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between" style={{ padding: '0 2px' }}>
          <span className="text-[10px] font-medium tabular-nums" style={{ color: 'var(--text-muted)', letterSpacing: '-0.2px' }}>
            {doneCount} / {countable.length} 완료
          </span>
          <span
            className="text-[11px] font-bold tabular-nums"
            style={{ color: progressColor, letterSpacing: '-0.3px' }}
          >
            {progress}%
          </span>
        </div>
      </div>

      {/* 항목들 */}
      <div className="flex-1 overflow-y-auto space-y-1">
        <AnimatePresence>
          {items.map((item, idx) => {
            const sectionTitle = isSectionLine(item.content)

            // 섹션 헤더 — 좌측 그라디언트 악센트 바 + 콜러드 배경 tint로 시각적으로 강하게 구분
            if (sectionTitle) {
              const isAddingHere = addUnderSection === item.id
              return (
                <div key={item.id}>
                  <motion.div
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      marginTop: idx === 0 ? 0 : 14,
                      padding: '6px 10px 6px 8px',
                      borderRadius: 10,
                      background: 'linear-gradient(90deg, rgba(37,99,235,0.10) 0%, rgba(37,99,235,0.02) 60%, transparent 100%)',
                      borderLeft: '3px solid var(--accent)',
                    }}
                    className="group flex items-center gap-1.5"
                  >
                    {editingId === item.id ? (
                      <input
                        autoFocus
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit()
                          if (e.key === 'Escape') { setEditingId(null); setEditingContent('') }
                        }}
                        className="flex-1 text-[13px] font-bold bg-[var(--bg-secondary)] rounded px-1.5 py-0.5 outline-none text-[var(--text-primary)] border border-[var(--accent)]"
                      />
                    ) : (
                      <>
                        <div
                          onDoubleClick={() => startEdit(item)}
                          title="더블클릭하여 수정  ( [제목] 형식을 유지하면 섹션 헤더 )"
                          className="flex-1 cursor-text truncate"
                          style={{
                            fontSize: 15,
                            fontWeight: 900,
                            letterSpacing: '-0.025em',
                            color: 'var(--text-primary)',
                            lineHeight: 1.2,
                          }}
                        >
                          {sectionTitle}
                        </div>
                        {(() => {
                          const st = sectionStats.get(item.id)
                          if (!st || st.total === 0) return null
                          const allDone = st.done === st.total
                          return (
                            <span
                              className="shrink-0 tabular-nums"
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: 999,
                                color: allDone ? '#047857' : 'var(--accent)',
                                background: allDone ? 'rgba(16,185,129,0.14)' : 'rgba(37,99,235,0.10)',
                                border: `1px solid ${allDone ? 'rgba(16,185,129,0.28)' : 'rgba(37,99,235,0.22)'}`,
                                letterSpacing: '-0.2px',
                              }}
                              title={allDone ? '모두 완료' : `${st.done} / ${st.total} 완료`}
                            >
                              {st.done} / {st.total}
                            </span>
                          )
                        })()}
                      </>
                    )}
                    <button
                      onClick={() => {
                        setAddUnderSection(item.id)
                        setUnderSectionText('')
                      }}
                      className="shrink-0 p-1 rounded text-[var(--accent)] hover:bg-[var(--accent-light)] transition-colors opacity-60 group-hover:opacity-100"
                      title="이 섹션에 항목 추가"
                    >
                      <Plus size={12} strokeWidth={2.6} />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="shrink-0 p-1 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="섹션 삭제"
                    >
                      <X size={11} strokeWidth={2.5} />
                    </button>
                  </motion.div>

                  {/* 섹션 아래 인라인 추가 입력 */}
                  {isAddingHere && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex items-center gap-2 py-1 pl-6"
                    >
                      <span className="w-4 h-4 rounded border border-[var(--accent)] shrink-0" />
                      <input
                        autoFocus
                        value={underSectionText}
                        onChange={(e) => setUnderSectionText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddUnderSection(item.id, underSectionText)
                          if (e.key === 'Escape') { setAddUnderSection(null); setUnderSectionText('') }
                        }}
                        onBlur={() => {
                          if (underSectionText.trim()) {
                            handleAddUnderSection(item.id, underSectionText)
                          } else {
                            setAddUnderSection(null)
                          }
                        }}
                        placeholder="이 섹션에 추가...  (Enter 저장, Esc 취소)"
                        className="flex-1 text-xs bg-[var(--bg-secondary)] rounded px-1.5 py-0.5 outline-none text-[var(--text-primary)] border border-[var(--accent)]"
                      />
                    </motion.div>
                  )}
                </div>
              )
            }

            // 일반 체크 아이템 — 카드형 + 네모진 체크박스 + 섹션별 구분
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: 20 }}
                className="group flex items-center gap-2.5 transition-all"
                style={{
                  padding: '8px 11px',
                  marginTop: 3,
                  marginLeft: 10, // 섹션 헤더 악센트와 시각적 인덴트
                  borderRadius: 10,
                  background: item.is_checked
                    ? 'transparent'
                    : 'var(--bg-secondary)',
                  border: '1px solid transparent',
                  boxShadow: item.is_checked ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.28)',
                }}
                onMouseEnter={(e) => {
                  if (!item.is_checked) {
                    e.currentTarget.style.border = '1px solid rgba(37,99,235,0.22)'
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0.12) 100%)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!item.is_checked) {
                    e.currentTarget.style.border = '1px solid transparent'
                    e.currentTarget.style.background = 'var(--bg-secondary)'
                  }
                }}
              >
                <button
                  onClick={() => handleToggle(item.id)}
                  className="flex items-center justify-center shrink-0 transition-all hover:scale-105"
                  style={{
                    width: 22, height: 22,
                    borderRadius: 7,
                    border: item.is_checked ? 'none' : '1.8px solid var(--text-muted)',
                    background: item.is_checked
                      ? 'linear-gradient(135deg, var(--accent) 0%, #4338CA 100%)'
                      : 'transparent',
                    boxShadow: item.is_checked ? '0 3px 10px rgba(37,99,235,0.42), inset 0 1px 0 rgba(255,255,255,0.28)' : 'none',
                  }}
                >
                  {item.is_checked ? <Check size={14} className="text-white" strokeWidth={3.2} /> : null}
                </button>
                {editingId === item.id ? (
                  <input
                    autoFocus
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit()
                      if (e.key === 'Escape') { setEditingId(null); setEditingContent('') }
                    }}
                    className="flex-1 text-xs bg-[var(--bg-secondary)] rounded px-1.5 py-0.5 outline-none text-[var(--text-primary)] border border-[var(--accent)]"
                  />
                ) : (
                  <span
                    onDoubleClick={() => startEdit(item)}
                    title="더블클릭하여 수정 ( [제목] 형식으로 바꾸면 섹션 헤더 )"
                    className="flex-1 cursor-text"
                    style={{
                      fontSize: 14,
                      lineHeight: 1.5,
                      letterSpacing: '-0.2px',
                      fontWeight: item.is_checked ? 500 : 700,
                      color: item.is_checked ? 'var(--text-muted)' : 'var(--text-primary)',
                      textDecoration: item.is_checked ? 'line-through' : undefined,
                      opacity: item.is_checked ? 0.7 : 1,
                    }}
                  >
                    {item.content}
                  </span>
                )}
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="shrink-0 p-0.5 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                  title="항목 삭제"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* 빠른 추가 */}
      <div className="mt-2 flex items-center gap-1 border-t border-[var(--border-widget)] pt-2">
        <input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
          placeholder="섹션 추가... (예: 회수)"
          className="flex-1 min-w-0 text-xs bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        <button
          onClick={handleAddSection}
          disabled={!newContent.trim()}
          className="text-[var(--accent)] hover:bg-[var(--accent-light)] rounded p-1 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          title="섹션 추가"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* 인라인 삭제 확인 오버레이 — 네이티브 confirm 포커스 락 회피 */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center"
            style={{
              background: 'rgba(15,23,42,0.45)',
              backdropFilter: 'blur(4px)',
              borderRadius: 'var(--shell-radius)',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(false) }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 6 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 6 }}
              transition={{ duration: 0.16 }}
              style={{
                padding: 18, maxWidth: 280, margin: 12, borderRadius: 16,
                background: 'var(--bg-widget)',
                boxShadow: '0 20px 48px rgba(15,23,42,0.32)',
                border: '1px solid rgba(15,23,42,0.08)',
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6, letterSpacing: '-0.3px' }}>
                이 체크리스트를 삭제할까요?
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.45, letterSpacing: '-0.2px' }}>
                항목도 함께 지워져요.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1"
                  style={{ padding: '9px 12px', fontSize: 13, fontWeight: 700, borderRadius: 10, backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-widget)' }}
                >
                  취소
                </button>
                <button
                  onClick={handleDeleteList}
                  className="flex-1"
                  style={{ padding: '9px 12px', fontSize: 13, fontWeight: 800, borderRadius: 10, background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)', color: '#fff', boxShadow: '0 4px 12px rgba(239,68,68,0.38)' }}
                >
                  삭제
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
