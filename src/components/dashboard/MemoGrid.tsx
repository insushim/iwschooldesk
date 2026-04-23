import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  Pin,
  Trash2,
  StickyNote,
  Tag,
  FolderOpen,
} from 'lucide-react'
import { useMemos } from '../../hooks/useMemos'
import { useUIStore } from '../../stores/ui.store'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Badge } from '../ui/Badge'
import type { Memo, MemoColor, CreateMemoInput, UpdateMemoInput } from '../../types/memo.types'
import { MEMO_COLORS } from '../../types/memo.types'

const CATEGORY_OPTIONS = ['일반', '업무', '수업', '학급', '아이디어', '개인'] as const

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#374151' : '#F9FAFB'
}

function darkenColor(hex: string, amount: number = 0.3): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount))
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount))
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount))
  return `rgb(${r}, ${g}, ${b})`
}

interface MemoFormState {
  title: string
  content: string
  color: MemoColor
  category: string
  tags: string
}

const defaultForm: MemoFormState = {
  title: '',
  content: '',
  color: '#FEF3C7',
  category: '일반',
  tags: '',
}

export function MemoGrid() {
  const [searchQuery, setSearchQuery] = useState('')
  const { memos, loading, create, update, remove } = useMemos()
  const addToast = useUIStore((s) => s.addToast)

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingMemo, setEditingMemo] = useState<Memo | null>(null)
  const [form, setForm] = useState<MemoFormState>(defaultForm)
  const [memoToDelete, setMemoToDelete] = useState<Memo | null>(null)

  const filteredMemos = useMemo(() => {
    let result = [...memos]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          m.tags.toLowerCase().includes(q)
      )
    }

    result.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

    return result
  }, [memos, searchQuery])

  const handleAdd = () => {
    setEditingMemo(null)
    setForm(defaultForm)
    setEditDialogOpen(true)
  }

  const handleDoubleClick = (memo: Memo) => {
    setEditingMemo(memo)
    setForm({
      title: memo.title,
      content: memo.content,
      color: memo.color,
      category: memo.category || '일반',
      tags: memo.tags || '',
    })
    setEditDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim() && !form.content.trim()) {
      addToast('warning', '제목이나 내용을 입력해주세요.')
      return
    }

    try {
      if (editingMemo) {
        const data: UpdateMemoInput = {
          title: form.title,
          content: form.content,
          color: form.color,
          category: form.category,
          tags: form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }
        await update(editingMemo.id, data)
        addToast('success', '메모가 수정되었습니다.')
      } else {
        const data: CreateMemoInput = {
          title: form.title,
          content: form.content,
          color: form.color,
          category: form.category,
          tags: form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }
        await create(data)
        addToast('success', '새 메모가 추가되었습니다.')
      }
      setEditDialogOpen(false)
    } catch {
      addToast('error', '메모 저장에 실패했습니다.')
    }
  }

  const handleTogglePin = async (memo: Memo, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await update(memo.id, { is_pinned: memo.is_pinned ? 0 : 1 })
      addToast('info', memo.is_pinned ? '고정이 해제되었습니다.' : '메모가 고정되었습니다.')
    } catch {
      addToast('error', '메모 고정에 실패했습니다.')
    }
  }

  const handleDeleteClick = (memo: Memo, e: React.MouseEvent) => {
    e.stopPropagation()
    setMemoToDelete(memo)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!memoToDelete) return
    try {
      await remove(memoToDelete.id)
      addToast('success', '메모가 삭제되었습니다.')
      setDeleteDialogOpen(false)
      setMemoToDelete(null)
    } catch {
      addToast('error', '메모 삭제에 실패했습니다.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-muted)]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full"
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
            style={{ left: 14 }}
          />
          <input
            type="text"
            placeholder="메모 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 40 }}
            className="w-full h-10 pr-3 rounded-[var(--radius-xs)] border border-[var(--border-widget)] bg-[var(--bg-widget)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
          />
        </div>
        <Button onClick={handleAdd} size="md" style={{ paddingLeft: 24, paddingRight: 24 }}>
          <Plus size={16} />
          새 메모
        </Button>
      </div>

      {/* Memo Grid */}
      {filteredMemos.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]"
        >
          <StickyNote size={48} strokeWidth={1.2} className="mb-3 opacity-40" />
          <p className="text-sm">메모가 없습니다. 새 메모를 추가해보세요!</p>
        </motion.div>
      ) : (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          }}
        >
          <AnimatePresence mode="popLayout">
            {filteredMemos.map((memo) => (
              <MemoCard
                key={memo.id}
                memo={memo}
                onDoubleClick={() => handleDoubleClick(memo)}
                onTogglePin={(e) => handleTogglePin(memo, e)}
                onDelete={(e) => handleDeleteClick(memo, e)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Edit / Create Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        title={editingMemo ? '메모 수정' : '새 메모'}
        wide
      >
        <div className="flex flex-col gap-4">
          <Input
            label="제목"
            id="memo-title"
            placeholder="메모 제목"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">내용</label>
            <textarea
              rows={5}
              placeholder="메모 내용을 입력하세요..."
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              className="w-full rounded-[var(--radius-xs)] border border-[var(--border-widget)] bg-[var(--bg-widget)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-none"
            />
          </div>

          {/* Color Picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">색상</label>
            <div className="flex gap-2">
              {MEMO_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c.value }))}
                  className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                  style={{
                    backgroundColor: c.value,
                    borderColor: form.color === c.value ? darkenColor(c.value, 0.4) : 'transparent',
                    boxShadow:
                      form.color === c.value ? `0 0 0 2px ${darkenColor(c.value, 0.2)}` : 'none',
                  }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">카테고리</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="h-9 w-full rounded-[var(--radius-xs)] border border-[var(--border-widget)] bg-[var(--bg-widget)] px-3 text-sm text-[var(--text-primary)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <Input
            label="태그 (쉼표로 구분)"
            id="memo-tags"
            placeholder="태그1, 태그2, 태그3"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
          />

          {/* Preview */}
          <div
            className="rounded-[var(--radius)] p-3 text-sm"
            style={{
              backgroundColor: form.color,
              color: getContrastColor(form.color),
            }}
          >
            <p className="font-medium">{form.title || '미리보기'}</p>
            <p className="mt-1 text-xs opacity-80 line-clamp-2">
              {form.content || '내용이 여기에 표시됩니다.'}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setEditDialogOpen(false)} style={{ paddingLeft: 28, paddingRight: 28 }}>
              취소
            </Button>
            <Button size="sm" onClick={handleSave} style={{ paddingLeft: 28, paddingRight: 28 }}>
              {editingMemo ? '수정' : '추가'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="메모 삭제"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--text-secondary)]">
            &ldquo;{memoToDelete?.title || '제목 없음'}&rdquo; 메모를 삭제하시겠습니까?
            <br />
            삭제된 메모는 복구할 수 없습니다.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleteDialogOpen(false)} style={{ paddingLeft: 28, paddingRight: 28 }}>
              취소
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmDelete} style={{ paddingLeft: 28, paddingRight: 28 }}>
              삭제
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

/* ---------- Memo Card ---------- */

interface MemoCardProps {
  memo: Memo
  onDoubleClick: () => void
  onTogglePin: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
}

function MemoCard({ memo, onDoubleClick, onTogglePin, onDelete }: MemoCardProps) {
  const textColor = getContrastColor(memo.color)
  const tags = memo.tags
    ? memo.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : []

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -2, boxShadow: '0 8px 25px rgba(0,0,0,0.12)' }}
      transition={{ duration: 0.2 }}
      onDoubleClick={onDoubleClick}
      className="relative rounded-[var(--radius)] p-4 cursor-pointer select-none group"
      style={{
        backgroundColor: memo.color,
        color: textColor,
        minHeight: memo.content.length > 80 ? 200 : 160,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      {/* Action Buttons */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onTogglePin}
          className="p-1 rounded-full hover:bg-black/10 transition-colors"
          title={memo.is_pinned ? '고정 해제' : '고정'}
        >
          <Pin
            size={14}
            style={{
              color: textColor,
              opacity: memo.is_pinned ? 1 : 0.5,
              fill: memo.is_pinned ? textColor : 'none',
            }}
          />
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded-full hover:bg-black/10 transition-colors"
          title="삭제"
        >
          <Trash2 size={14} style={{ color: textColor, opacity: 0.6 }} />
        </button>
      </div>

      {/* Pin indicator */}
      {memo.is_pinned === 1 && (
        <Pin
          size={12}
          className="absolute top-2 left-2"
          style={{ color: textColor, fill: textColor, opacity: 0.6 }}
        />
      )}

      {/* Content */}
      <div className="flex flex-col gap-1.5 mt-1">
        {memo.title && (
          <h3 className="font-semibold text-sm leading-tight line-clamp-2 pr-10">{memo.title}</h3>
        )}
        {memo.content && (
          <p className="text-xs leading-relaxed opacity-80 line-clamp-5 whitespace-pre-wrap">
            {memo.content}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="absolute bottom-3 left-4 right-4 flex items-center gap-1.5 flex-wrap">
        {memo.category && (
          <span className="flex items-center gap-0.5 text-xs opacity-60">
            <FolderOpen size={10} />
            {memo.category}
          </span>
        )}
        {tags.length > 0 && (
          <span className="flex items-center gap-0.5 text-xs opacity-60">
            <Tag size={10} />
            {tags.slice(0, 3).join(', ')}
            {tags.length > 3 && ` +${tags.length - 3}`}
          </span>
        )}
      </div>
    </motion.div>
  )
}
