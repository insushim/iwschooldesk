import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Pin, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Memo } from '../../types/memo.types'
import { parseSectionedText } from '../../lib/section-parser'
import { useDataChange } from '../../hooks/useDataChange'

export function MemoWidget() {
  const [memos, setMemos] = useState<Memo[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')

  const reloadMemos = useCallback(() => {
    window.api.memo.list().then(setMemos)
  }, [])

  useEffect(() => { reloadMemos() }, [reloadMemos])
  useDataChange('memo', reloadMemos)

  const current = memos[currentIndex]

  const handleSave = async () => {
    if (!current) return
    await window.api.memo.update(current.id, { content: editContent })
    const updated = await window.api.memo.list()
    setMemos(updated)
    setIsEditing(false)
  }

  const handleNew = async () => {
    const m = await window.api.memo.create({ title: '', content: '' })
    const updated = await window.api.memo.list()
    setMemos(updated)
    setCurrentIndex(updated.findIndex((x) => x.id === m.id))
    setEditContent('')
    setIsEditing(true)
  }

  // 하단 빠른 추가 input: 엔터 시 바로 새 메모 생성 + 해당 메모로 전환 + 편집 모드
  const [quickTitle, setQuickTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const handleQuickAdd = async () => {
    const t = quickTitle.trim()
    if (!t) return
    const m = await window.api.memo.create({ title: '', content: t })
    const updated = await window.api.memo.list()
    setMemos(updated)
    setCurrentIndex(updated.findIndex((x) => x.id === m.id))
    setEditContent(t)
    setQuickTitle('')
    setIsEditing(true)
  }

  const handlePin = async () => {
    if (!current) return
    await window.api.memo.update(current.id, { is_pinned: current.is_pinned ? 0 : 1 })
    const updated = await window.api.memo.list()
    setMemos(updated)
  }

  const requestDelete = (): void => {
    if (!current) return
    setConfirmDelete(true)
  }

  const handleDelete = async (): Promise<void> => {
    if (!current) return
    setConfirmDelete(false)
    await window.api.memo.delete(current.id)
    const updated = await window.api.memo.list()
    setMemos(updated)
    setCurrentIndex((prev) => Math.max(0, Math.min(prev, updated.length - 1)))
    setIsEditing(false)
  }

  const blocks = useMemo(() => parseSectionedText(current?.content ?? ''), [current?.content])

  if (memos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-3">
        <p className="text-xs text-[var(--text-muted)]">메모가 없습니다</p>
        <button
          onClick={handleNew}
          className="flex items-center gap-1.5 text-xs text-[var(--accent)] hover:bg-[var(--accent-light)] px-3 py-1.5 rounded-md transition-colors"
        >
          <Plus size={14} />
          새 메모
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-full relative"
      style={{
        background: current?.color
          ? `linear-gradient(180deg, ${current.color} 0%, ${current.color}EA 100%)`
          : 'linear-gradient(180deg, #FEF3C7 0%, #FDE68A 100%)',
      }}
    >
      {/* Header — 인덱스 배지 + 액션 버튼 세련된 배치 */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{ padding: '10px 14px 6px' }}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={handlePin}
            className="p-1.5 rounded-lg transition-all hover:scale-105"
            style={{
              color: current?.is_pinned ? '#B45309' : 'rgba(68,40,10,0.45)',
              backgroundColor: current?.is_pinned ? 'rgba(180,83,9,0.14)' : 'transparent',
            }}
            title={current?.is_pinned ? '핀 해제' : '핀 고정'}
          >
            <Pin size={13} strokeWidth={2.4} fill={current?.is_pinned ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={requestDelete}
            className="p-1.5 rounded-lg transition-all hover:bg-red-500/15 hover:text-red-600 hover:scale-105"
            style={{ color: 'rgba(68,40,10,0.45)' }}
            title="이 메모 삭제"
          >
            <Trash2 size={12.5} strokeWidth={2.3} />
          </button>
        </div>
        <span
          className="tabular-nums"
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            padding: '2px 10px',
            borderRadius: 999,
            backgroundColor: 'rgba(68,40,10,0.10)',
            color: 'rgba(68,40,10,0.72)',
            letterSpacing: '-0.2px',
          }}
        >
          {currentIndex + 1} / {memos.length}
        </span>
        <button
          onClick={handleNew}
          className="flex items-center justify-center transition-all hover:scale-105"
          style={{
            width: 26, height: 26, borderRadius: 8,
            background: 'linear-gradient(135deg, #92400E 0%, #B45309 100%)',
            color: '#fff',
            boxShadow: '0 3px 10px rgba(146,64,14,0.32)',
          }}
          title="새 메모"
        >
          <Plus size={13} strokeWidth={2.6} />
        </button>
      </div>

      {/* Content — 섹션/불릿 시인성 개선 */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '2px 16px 4px' }}>
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onBlur={handleSave}
            autoFocus
            className="w-full h-full resize-none"
            style={{
              // 디스플레이 뷰와 시각 일관성 — 동일 폰트/색/줄간격, 기본 브라우저 스타일 제거.
              fontFamily: 'inherit',
              fontSize: 14.5,
              fontWeight: 500,
              color: '#44280A',
              lineHeight: 1.55,
              letterSpacing: '-0.2px',
              background: 'transparent',
              outline: 'none',
              border: 'none',
              padding: 0,
              margin: 0,
              caretColor: '#92400E',
            }}
            placeholder="메모를 입력하세요...  (팁: [제목] 으로 섹션을, - 또는 • 로 항목 구분)"
          />
        ) : (
          <div
            onClick={() => {
              setEditContent(current?.content ?? '')
              setIsEditing(true)
            }}
            className="cursor-text min-h-[60px]"
            title="클릭하여 편집"
          >
            {blocks.length === 0 ? (
              <span style={{ fontSize: 14, color: 'rgba(68,40,10,0.4)', fontWeight: 500 }}>
                메모를 입력하세요...
              </span>
            ) : (
              blocks.map((b, i) => {
                if (b.kind === 'section') {
                  return (
                    <div
                      key={i}
                      style={{
                        marginTop: i === 0 ? 0 : 12,
                        marginBottom: 6,
                        padding: '5px 10px 5px 8px',
                        borderRadius: 8,
                        background: 'linear-gradient(90deg, rgba(68,40,10,0.10) 0%, rgba(68,40,10,0.02) 70%, transparent 100%)',
                        borderLeft: '3px solid rgba(68,40,10,0.55)',
                        fontSize: 15.5,
                        fontWeight: 900,
                        color: '#44280A',
                        letterSpacing: '-0.025em',
                        lineHeight: 1.2,
                      }}
                    >
                      {b.text}
                    </div>
                  )
                }
                if (b.kind === 'bullet') {
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-2"
                      style={{
                        marginTop: 4,
                        padding: '1px 0 1px 4px',
                        fontSize: 14,
                        color: '#44280A',
                        lineHeight: 1.55,
                        fontWeight: 500,
                        letterSpacing: '-0.2px',
                      }}
                    >
                      <span
                        aria-hidden
                        className="shrink-0"
                        style={{
                          marginTop: 7,
                          width: 5, height: 5, borderRadius: 999,
                          background: 'linear-gradient(135deg, #92400E, #B45309)',
                          flexShrink: 0,
                        }}
                      />
                      <span className="flex-1">{b.text}</span>
                    </div>
                  )
                }
                if (b.kind === 'spacer') {
                  return <div key={i} style={{ height: 7 }} />
                }
                return (
                  <div
                    key={i}
                    style={{
                      fontSize: 14,
                      color: '#44280A',
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      letterSpacing: '-0.2px',
                      fontWeight: 500,
                    }}
                  >
                    {b.text}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Navigation + Quick add — 세련된 pill 스타일 */}
      <div
        className="flex items-center shrink-0"
        style={{
          gap: 6,
          padding: '8px 14px 20px',
          borderTop: '1px solid rgba(68,40,10,0.10)',
        }}
      >
        <button
          onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="rounded-lg transition-all disabled:opacity-25 hover:scale-105 disabled:hover:scale-100 shrink-0"
          style={{
            width: 26, height: 26,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(68,40,10,0.08)',
            color: 'rgba(68,40,10,0.7)',
          }}
          title="이전 메모"
        >
          <ChevronLeft size={14} strokeWidth={2.4} />
        </button>
        <button
          onClick={() => setCurrentIndex(Math.min(memos.length - 1, currentIndex + 1))}
          disabled={currentIndex === memos.length - 1}
          className="rounded-lg transition-all disabled:opacity-25 hover:scale-105 disabled:hover:scale-100 shrink-0"
          style={{
            width: 26, height: 26,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(68,40,10,0.08)',
            color: 'rgba(68,40,10,0.7)',
          }}
          title="다음 메모"
        >
          <ChevronRight size={14} strokeWidth={2.4} />
        </button>
        <div
          className="flex-1 min-w-0 flex items-center"
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            backgroundColor: 'rgba(68,40,10,0.08)',
            border: '1px solid rgba(68,40,10,0.10)',
          }}
        >
          <input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd() }}
            placeholder="새 메모 추가..."
            className="flex-1 min-w-0 bg-transparent outline-none"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#44280A',
              letterSpacing: '-0.2px',
            }}
          />
          <button
            onClick={handleQuickAdd}
            disabled={!quickTitle.trim()}
            className="shrink-0 p-0.5 rounded-full transition-colors disabled:opacity-30"
            style={{
              color: '#B45309',
              backgroundColor: quickTitle.trim() ? 'rgba(180,83,9,0.14)' : 'transparent',
            }}
            title="빠르게 새 메모"
          >
            <Plus size={13} strokeWidth={2.6} />
          </button>
        </div>
      </div>

      {/* 인라인 삭제 확인 */}
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
                padding: 18, maxWidth: 260, margin: 12, borderRadius: 16,
                background: '#FFFBEB',
                boxShadow: '0 20px 48px rgba(15,23,42,0.32)',
                border: '1px solid rgba(68,40,10,0.12)',
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 800, color: '#44280A', marginBottom: 12, letterSpacing: '-0.3px' }}>
                이 메모를 삭제할까요?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1"
                  style={{ padding: '9px 12px', fontSize: 13, fontWeight: 700, borderRadius: 10, backgroundColor: 'rgba(68,40,10,0.08)', color: 'rgba(68,40,10,0.7)', border: '1px solid rgba(68,40,10,0.12)' }}
                >
                  취소
                </button>
                <button
                  onClick={handleDelete}
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
