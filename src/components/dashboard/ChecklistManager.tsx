import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Trash2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  LayoutTemplate,
  Square,
  CheckSquare2,
  Settings2,
} from 'lucide-react'
import { useChecklists, useChecklistItems } from '../../hooks/useChecklists'
import { useSections } from '../../hooks/useSections'
import { useUIStore } from '../../stores/ui.store'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Badge } from '../ui/Badge'
import { SectionManagerDialog } from './SectionManagerDialog'
import type { Checklist, ChecklistCategory, CreateChecklistInput } from '../../types/checklist.types'
import type { Section } from '../../types/section.types'
import { CATEGORY_COLORS } from '../../lib/constants'

const CATEGORY_OPTIONS: ChecklistCategory[] = ['일반', '업무', '학급', '점검', '개인']

function getProgressColor(progress: number): string {
  if (progress > 80) return '#10B981'
  if (progress > 50) return '#F59E0B'
  return '#3B82F6'
}

export function ChecklistManager() {
  const { checklists, loading, create, remove } = useChecklists()
  const { sections } = useSections()
  const addToast = useUIStore((s) => s.addToast)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sectionMgrOpen, setSectionMgrOpen] = useState(false)
  const [checklistToDelete, setChecklistToDelete] = useState<Checklist | null>(null)
  const [createForm, setCreateForm] = useState<{
    title: string
    description: string
    category: ChecklistCategory
    section_id: string | null
    is_template: number
  }>({
    title: '',
    description: '',
    category: '일반',
    section_id: null,
    is_template: 0,
  })

  const templates = useMemo(
    () => checklists.filter((c) => c.is_template === 1),
    [checklists]
  )
  const activeChecklists = useMemo(
    () => checklists.filter((c) => c.is_template !== 1),
    [checklists]
  )

  const handleCreateFromTemplate = async (template: Checklist) => {
    try {
      const data: CreateChecklistInput = {
        title: template.title,
        description: template.description,
        color: template.color,
        category: template.category,
        section_id: template.section_id ?? null,
        is_template: 0,
      }
      const created = await create(data)
      addToast('success', `"${template.title}" 체크리스트가 생성되었습니다.`)
      setExpandedId(created.id)
    } catch {
      addToast('error', '체크리스트 생성에 실패했습니다.')
    }
  }

  const handleCreate = async () => {
    if (!createForm.title.trim()) {
      addToast('warning', '제목을 입력해주세요.')
      return
    }
    try {
      const data: CreateChecklistInput = {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        category: createForm.category,
        section_id: createForm.section_id,
        is_template: createForm.is_template,
      }
      const created = await create(data)
      addToast('success', '체크리스트가 생성되었습니다.')
      setCreateDialogOpen(false)
      setCreateForm({ title: '', description: '', category: '일반', section_id: null, is_template: 0 })
      if (data.is_template !== 1) {
        setExpandedId(created.id)
      }
    } catch {
      addToast('error', '체크리스트 생성에 실패했습니다.')
    }
  }

  const handleDeleteClick = (checklist: Checklist, e: React.MouseEvent) => {
    e.stopPropagation()
    setChecklistToDelete(checklist)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!checklistToDelete) return
    try {
      await remove(checklistToDelete.id)
      addToast('success', '체크리스트가 삭제되었습니다.')
      setDeleteDialogOpen(false)
      setChecklistToDelete(null)
      if (expandedId === checklistToDelete.id) {
        setExpandedId(null)
      }
    } catch {
      addToast('error', '체크리스트 삭제에 실패했습니다.')
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
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

  const isEmpty = templates.length === 0 && activeChecklists.length === 0

  return (
    <div className="flex flex-col gap-6 p-6 pr-10">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)] mb-1">체크리스트</h1>
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <ClipboardList size={14} />
            <span className="text-xs">
              {activeChecklists.length}개 체크리스트 · {templates.length}개 템플릿
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={() => setSectionMgrOpen(true)}
            style={{
              borderColor: 'rgba(15,23,42,0.12)',
              paddingLeft: '22px',
              paddingRight: '22px',
              height: '42px',
            }}
          >
            <Settings2 size={14} />
            섹션 관리
          </Button>
          <Button
            size="md"
            onClick={() => setCreateDialogOpen(true)}
            style={{
              paddingLeft: '24px',
              paddingRight: '24px',
              height: '42px',
            }}
          >
            <Plus size={16} />
            새 체크리스트
          </Button>
        </div>
      </div>

      {isEmpty ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]"
        >
          <CheckSquare size={48} strokeWidth={1.2} className="mb-3 opacity-40" />
          <p className="text-sm">체크리스트가 없습니다. 템플릿에서 새로 만들어보세요!</p>
        </motion.div>
      ) : (
        <>
          {/* Templates Section */}
          {templates.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <LayoutTemplate size={14} className="text-[var(--text-muted)]" />
                <span className="text-xs font-semibold text-[var(--text-secondary)]">
                  템플릿에서 생성
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">클릭해서 새 체크리스트 만들기</span>
              </div>
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
              >
                {templates.map((template) => {
                  const cColor = CATEGORY_COLORS[template.category]
                  return (
                    <motion.button
                      key={template.id}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleCreateFromTemplate(template)}
                      className="relative flex flex-col text-left cursor-pointer group overflow-hidden"
                      style={{
                        padding: '18px 20px',
                        gap: 12,
                        borderRadius: '14px',
                        border: '1px solid rgba(15,23,42,0.1)',
                        backgroundColor: 'var(--bg-widget)',
                        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                        transition: 'box-shadow 0.2s, border-color 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = `0 8px 24px -8px ${cColor}40, 0 2px 6px rgba(15,23,42,0.06)`
                        e.currentTarget.style.borderColor = `${cColor}66`
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.04)'
                        e.currentTarget.style.borderColor = 'rgba(15,23,42,0.1)'
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          top: 0, left: 0, bottom: 0,
                          width: '3px',
                          backgroundColor: cColor,
                        }}
                      />
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex items-center justify-center shrink-0"
                          style={{
                            width: 34, height: 34,
                            borderRadius: '10px',
                            backgroundColor: `${cColor}18`,
                            color: cColor,
                          }}
                        >
                          <Plus size={17} strokeWidth={2.4} />
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 700 }} className="text-[var(--text-primary)] line-clamp-1">
                          {template.title}
                        </span>
                      </div>
                      {template.description && (
                        <p style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-[var(--text-muted)] line-clamp-2">
                          {template.description}
                        </p>
                      )}
                      <div>
                        <Badge color={cColor}>{template.category}</Badge>
                      </div>
                      <button
                        onClick={(e) => handleDeleteClick(template, e)}
                        className="absolute top-2.5 right-2.5 p-1.5 rounded-full opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-red-50 hover:text-red-500 transition-all text-[var(--text-muted)]"
                        title="템플릿 삭제"
                      >
                        <Trash2 size={12} />
                      </button>
                    </motion.button>
                  )
                })}
              </div>
            </section>
          )}

          {/* Active Checklists grouped by section */}
          {activeChecklists.length > 0 && (
            <GroupedChecklists
              checklists={activeChecklists}
              sections={sections}
              expandedId={expandedId}
              onToggleExpand={toggleExpand}
              onDelete={handleDeleteClick}
            />
          )}
        </>
      )}

      {/* Create Dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title="새 체크리스트"
      >
        <div className="flex flex-col gap-5">
          <Input
            label="제목"
            id="checklist-title"
            placeholder="체크리스트 제목"
            value={createForm.title}
            onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
          />

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--text-secondary)]">설명</label>
            <textarea
              rows={3}
              placeholder="체크리스트 설명 (선택)"
              value={createForm.description}
              onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-[var(--radius-xs)] border border-[var(--border-widget)] bg-[var(--bg-widget)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">섹션</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCreateForm((f) => ({ ...f, section_id: null }))}
                className="px-4 py-2 rounded-full text-xs font-medium transition-all"
                style={{
                  backgroundColor: createForm.section_id === null ? '#94A3B8' : '#94A3B820',
                  color: createForm.section_id === null ? '#fff' : 'var(--text-secondary)',
                }}
              >
                섹션 없음
              </button>
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCreateForm((f) => ({ ...f, section_id: s.id }))}
                  className="px-4 py-2 rounded-full text-xs font-medium transition-all flex items-center gap-1.5"
                  style={{
                    backgroundColor: createForm.section_id === s.id ? s.color : `${s.color}20`,
                    color: createForm.section_id === s.id ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {s.icon && <span>{s.icon}</span>}
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">카테고리(보조)</label>
            <select
              value={createForm.category}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, category: e.target.value as ChecklistCategory }))
              }
              className="h-9 w-full rounded-[var(--radius-xs)] border border-[var(--border-widget)] bg-[var(--bg-widget)] px-3 text-sm text-[var(--text-primary)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={createForm.is_template === 1}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, is_template: e.target.checked ? 1 : 0 }))
              }
              className="w-4 h-4 rounded accent-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text-secondary)]">템플릿으로 저장</span>
          </label>

          <div className="flex justify-end gap-3 pt-3">
            <Button variant="secondary" size="md" style={{ paddingLeft: 24, paddingRight: 24 }} onClick={() => setCreateDialogOpen(false)}>
              취소
            </Button>
            <Button size="md" style={{ paddingLeft: 24, paddingRight: 24 }} onClick={handleCreate}>
              생성
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="체크리스트 삭제"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--text-secondary)]">
            &ldquo;{checklistToDelete?.title}&rdquo;을(를) 삭제하시겠습니까?
            <br />
            삭제된 체크리스트는 복구할 수 없습니다.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeleteDialogOpen(false)}>
              취소
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmDelete}>
              삭제
            </Button>
          </div>
        </div>
      </Dialog>

      <SectionManagerDialog open={sectionMgrOpen} onOpenChange={setSectionMgrOpen} />
    </div>
  )
}

/* ---------- Grouped Checklists by Section ---------- */

interface GroupedChecklistsProps {
  checklists: Checklist[]
  sections: Section[]
  expandedId: string | null
  onToggleExpand: (id: string) => void
  onDelete: (c: Checklist, e: React.MouseEvent) => void
}

function GroupedChecklists({
  checklists,
  sections,
  expandedId,
  onToggleExpand,
  onDelete,
}: GroupedChecklistsProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const bySection = new Map<string, Checklist[]>()
    for (const c of checklists) {
      const key = c.section_id || '__none__'
      if (!bySection.has(key)) bySection.set(key, [])
      bySection.get(key)!.push(c)
    }
    const result: { id: string; name: string; color: string; icon: string; items: Checklist[] }[] = []
    for (const s of sections) {
      const items = bySection.get(s.id)
      if (items && items.length > 0) {
        result.push({ id: s.id, name: s.name, color: s.color, icon: s.icon, items })
      }
    }
    const noneItems = bySection.get('__none__')
    if (noneItems && noneItems.length > 0) {
      result.push({ id: '__none__', name: '섹션 없음', color: '#94A3B8', icon: '', items: noneItems })
    }
    return result
  }, [checklists, sections])

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const collapsed = collapsedSections.has(g.id)
        return (
          <section key={g.id} className="flex flex-col gap-2.5">
            <button
              onClick={() => toggleSection(g.id)}
              className="flex items-center gap-2 py-1 text-left hover:opacity-85 transition-opacity"
            >
              <motion.div animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.15 }}>
                <ChevronDown size={14} className="text-[var(--text-muted)]" />
              </motion.div>
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold"
                style={{
                  padding: '5px 12px',
                  borderRadius: '8px',
                  backgroundColor: `${g.color}15`,
                  color: g.color,
                  border: `1px solid ${g.color}30`,
                }}
              >
                {g.icon && <span>{g.icon}</span>}
                <span>{g.name}</span>
              </span>
              <span className="text-[11px] text-[var(--text-muted)] font-medium">{g.items.length}개</span>
            </button>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col gap-3 overflow-hidden"
                >
                  {g.items.map((checklist) => (
                    <ChecklistCard
                      key={checklist.id}
                      checklist={checklist}
                      isExpanded={expandedId === checklist.id}
                      onToggle={() => onToggleExpand(checklist.id)}
                      onDelete={(e) => onDelete(checklist, e)}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )
      })}
    </div>
  )
}

/* ---------- Checklist Card ---------- */

interface ChecklistCardProps {
  checklist: Checklist
  isExpanded: boolean
  onToggle: () => void
  onDelete: (e: React.MouseEvent) => void
}

function ChecklistCard({ checklist, isExpanded, onToggle, onDelete }: ChecklistCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      style={{
        borderRadius: '14px',
        border: '1px solid rgba(15,23,42,0.1)',
        backgroundColor: 'var(--bg-widget)',
        boxShadow: isExpanded
          ? '0 6px 20px -6px rgba(37,99,235,0.15), 0 2px 4px rgba(15,23,42,0.04)'
          : '0 1px 2px rgba(15,23,42,0.04)',
        overflow: 'hidden',
        transition: 'box-shadow 0.2s',
      }}
    >
      {/* Card Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 text-left cursor-pointer hover:bg-[var(--bg-secondary)]/50 transition-colors group"
        style={{ padding: '16px 20px' }}
      >
        <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight size={16} className="text-[var(--text-muted)]" />
        </motion.div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
              {checklist.title}
            </span>
            <Badge color={CATEGORY_COLORS[checklist.category]}>{checklist.category}</Badge>
          </div>

          <ChecklistProgressBar checklistId={checklist.id} />
        </div>

        <button
          onClick={onDelete}
          className="p-1.5 rounded-full opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-red-50 transition-all text-[var(--text-muted)] hover:text-red-500"
          title="삭제"
        >
          <Trash2 size={14} />
        </button>
      </button>

      {/* Expanded Items */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ChecklistItemsList checklistId={checklist.id} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ---------- Progress Bar (thin inline) ---------- */

function ChecklistProgressBar({ checklistId }: { checklistId: string }) {
  const { items, progress } = useChecklistItems(checklistId)

  if (items.length === 0) return null

  const color = getProgressColor(progress)

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
      <span className="text-xs font-medium text-[var(--text-muted)] min-w-[32px] text-right">
        {progress}%
      </span>
    </div>
  )
}

/* ---------- Checklist Items List ---------- */

function ChecklistItemsList({ checklistId }: { checklistId: string }) {
  const { items, loading, addItem, toggleItem, deleteItem } = useChecklistItems(checklistId)
  const addToast = useUIStore((s) => s.addToast)
  const [newItemText, setNewItemText] = useState('')

  const handleAdd = async () => {
    if (!newItemText.trim()) return
    try {
      await addItem({ checklist_id: checklistId, content: newItemText.trim() })
      setNewItemText('')
    } catch {
      addToast('error', '항목 추가에 실패했습니다.')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleAdd()
    }
  }

  const handleToggle = async (id: string) => {
    try {
      await toggleItem(id)
    } catch {
      addToast('error', '항목 변경에 실패했습니다.')
    }
  }

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteItem(id)
    } catch {
      addToast('error', '항목 삭제에 실패했습니다.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4 text-[var(--text-muted)]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full"
        />
      </div>
    )
  }

  return (
    <div className="border-t border-[var(--border-widget)]">
      {/* Items */}
      <div className="divide-y divide-[var(--border-widget)]">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10, height: 0 }}
              className="flex items-center gap-3 px-5 py-3 group/item hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <button
                onClick={() => handleToggle(item.id)}
                className="flex-shrink-0 cursor-pointer text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              >
                {item.is_checked ? (
                  <CheckSquare2 size={18} className="text-[#10B981]" />
                ) : (
                  <Square size={18} />
                )}
              </button>
              <span
                className={`flex-1 text-sm transition-all ${
                  item.is_checked
                    ? 'line-through text-[var(--text-muted)]'
                    : 'text-[var(--text-primary)]'
                }`}
              >
                {item.content}
              </span>
              <button
                onClick={() => handleDeleteItem(item.id)}
                className="p-1 rounded-full opacity-0 group-hover/item:opacity-50 hover:!opacity-100 text-[var(--text-muted)] hover:text-red-500 transition-all"
                title="항목 삭제"
              >
                <Trash2 size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add new item */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-t border-[var(--border-widget)] bg-[var(--bg-secondary)]">
        <Plus size={16} className="text-[var(--text-muted)] flex-shrink-0" />
        <input
          type="text"
          placeholder="새 항목 추가..."
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent border-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        {newItemText.trim() && (
          <Button size="sm" variant="ghost" onClick={handleAdd}>
            추가
          </Button>
        )}
      </div>
    </div>
  )
}
