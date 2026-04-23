import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Check, X as XIcon, Pencil } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useUIStore } from '../../stores/ui.store'
import { useSections } from '../../hooks/useSections'
import type { Section } from '../../types/section.types'

const COLOR_PALETTE = [
  '#EF4444', '#F59E0B', '#2563EB', '#10B981', '#14B8A6',
  '#8B5CF6', '#6366F1', '#F97316', '#EC4899', '#84CC16',
  '#94A3B8', '#0EA5E9',
]

const EMOJI_PALETTE = ['📥', '📄', '💼', '💰', '👦', '📅', '🕘', '📑', '🎓', '🏫', '📌', '⭐', '📋', '🧾', '🗂', '🔔']

interface SectionManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SectionManagerDialog({ open, onOpenChange }: SectionManagerDialogProps) {
  const { sections, create, update, remove } = useSections()
  const addToast = useUIStore((s) => s.addToast)

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(COLOR_PALETTE[2])
  const [newIcon, setNewIcon] = useState('📌')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; color: string; icon: string }>({
    name: '', color: '#3B82F6', icon: '',
  })

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      addToast('warning', '섹션 이름을 입력하세요')
      return
    }
    try {
      await create({ name, color: newColor, icon: newIcon })
      setNewName('')
      addToast('success', `"${name}" 섹션이 추가되었어요`)
    } catch {
      addToast('error', '섹션 추가에 실패했어요')
    }
  }

  const startEdit = (s: Section) => {
    setEditingId(s.id)
    setEditForm({ name: s.name, color: s.color, icon: s.icon })
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = async (id: string) => {
    const name = editForm.name.trim()
    if (!name) {
      addToast('warning', '섹션 이름을 입력하세요')
      return
    }
    try {
      await update(id, { name, color: editForm.color, icon: editForm.icon })
      setEditingId(null)
      addToast('success', '섹션이 수정되었어요')
    } catch {
      addToast('error', '섹션 수정에 실패했어요')
    }
  }

  const handleRemove = async (s: Section) => {
    if (!window.confirm(`"${s.name}" 섹션을 삭제할까요?\n연결된 할일·체크리스트는 "섹션 없음"으로 이동합니다.`)) return
    try {
      await remove(s.id)
      addToast('success', '섹션이 삭제되었어요')
    } catch {
      addToast('error', '삭제에 실패했어요')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="섹션 관리" wide>
      <div className="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">
        {/* 추가 폼 */}
        <div className="flex flex-col gap-3 p-4 rounded-[var(--radius)] border border-[var(--border-widget)] bg-[var(--bg-secondary)]">
          <span className="text-xs font-medium text-[var(--text-secondary)]">새 섹션 추가</span>
          <div className="flex items-center gap-2">
            <IconPicker value={newIcon} onChange={setNewIcon} />
            <Input
              id="new-section-name"
              placeholder="섹션 이름 (예: 학부모 상담)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  handleCreate()
                }
              }}
            />
          </div>
          <ColorRow value={newColor} onChange={setNewColor} />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleCreate}
              className="whitespace-nowrap"
              style={{ padding: '10px 22px', fontSize: 13, gap: 8 }}
            >
              <Plus size={14} strokeWidth={2.4} />
              <span className="whitespace-nowrap">추가</span>
            </Button>
          </div>
        </div>

        {/* 목록 */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            섹션 {sections.length}개
          </span>
          <AnimatePresence>
            {sections.map((s) => (
              <motion.div
                key={s.id}
                layout
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 p-3 rounded-[var(--radius-sm)] border border-[var(--border-widget)] bg-[var(--bg-widget)]"
              >
                {editingId === s.id ? (
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <IconPicker
                        value={editForm.icon}
                        onChange={(icon) => setEditForm((f) => ({ ...f, icon }))}
                      />
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className="flex-1 h-9 rounded-[var(--radius-xs)] border border-[var(--border-widget)] bg-[var(--bg-secondary)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </div>
                    <ColorRow
                      value={editForm.color}
                      onChange={(color) => setEditForm((f) => ({ ...f, color }))}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={cancelEdit}
                        className="p-2 rounded-full hover:bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                      >
                        <XIcon size={14} />
                      </button>
                      <button
                        onClick={() => saveEdit(s.id)}
                        className="p-2 rounded-full bg-[var(--accent)] text-white hover:opacity-90"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span
                      className="flex items-center justify-center w-8 h-8 rounded-full text-lg"
                      style={{ backgroundColor: `${s.color}25` }}
                    >
                      {s.icon || '📌'}
                    </span>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">
                      {s.name}
                    </span>
                    <button
                      onClick={() => startEdit(s)}
                      className="p-1.5 rounded-full hover:bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                      title="수정"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleRemove(s)}
                      className="p-1.5 rounded-full hover:bg-red-50 text-[var(--text-muted)] hover:text-red-500"
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="secondary" size="md" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function ColorRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {COLOR_PALETTE.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full transition-transform hover:scale-110"
          style={{
            backgroundColor: c,
            outline: value === c ? '2px solid var(--text-primary)' : 'none',
            outlineOffset: 2,
          }}
          title={c}
        />
      ))}
    </div>
  )
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)

  // 외부 클릭 시 닫기
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((p) => !p)
        }}
        className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-xs)] border border-[var(--border-widget)] bg-[var(--bg-widget)] text-lg hover:bg-[var(--bg-secondary)]"
        title="아이콘 선택"
      >
        {value || '📌'}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 p-2 grid grid-cols-4 gap-1 rounded-[var(--radius-sm)] border border-[var(--border-widget)] bg-[var(--bg-widget)] shadow-xl"
          style={{ zIndex: 1000 }}
        >
          {EMOJI_PALETTE.map((e) => (
            <button
              key={e}
              type="button"
              onClick={(ev) => {
                ev.stopPropagation()
                onChange(e)
                setOpen(false)
              }}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--bg-secondary)] text-lg"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
