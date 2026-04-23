import { useState, useEffect, useRef } from 'react'
import { Search, Calendar, CheckSquare, StickyNote, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '../../stores/ui.store'

type CommandType = 'schedule' | 'task' | 'memo' | 'search'

interface ParsedCommand {
  type: CommandType
  text: string
  tags?: string[]
  priority?: number
}

function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim()
  if (trimmed.startsWith('일정 ') || trimmed.startsWith('일정:')) {
    return { type: 'schedule', text: trimmed.replace(/^일정[: ]/, '').trim() }
  }
  if (trimmed.startsWith('할일 ') || trimmed.startsWith('할일:')) {
    let text = trimmed.replace(/^할일[: ]/, '').trim()
    const tags: string[] = []
    let priority = 2

    text = text.replace(/#(\S+)/g, (_, tag) => { tags.push(tag); return '' })
    if (text.includes('!긴급') || text.includes('!4')) { priority = 4; text = text.replace(/!긴급|!4/g, '') }
    else if (text.includes('!높음') || text.includes('!3')) { priority = 3; text = text.replace(/!높음|!3/g, '') }
    else if (text.includes('!낮음') || text.includes('!1')) { priority = 1; text = text.replace(/!낮음|!1/g, '') }

    return { type: 'task', text: text.trim(), tags, priority }
  }
  if (trimmed.startsWith('메모 ') || trimmed.startsWith('메모:')) {
    return { type: 'memo', text: trimmed.replace(/^메모[: ]/, '').trim() }
  }
  return { type: 'search', text: trimmed }
}

export function QuickInput() {
  const { quickInputOpen, setQuickInputOpen, addToast, setView } = useUIStore()
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (quickInputOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      setInput('')
    }
  }, [quickInputOpen])

  useEffect(() => {
    const handler = (_e: Event) => setQuickInputOpen(true)
    window.api.on('open-quick-input', handler)
    return () => { window.api.off('open-quick-input', handler) }
  }, [setQuickInputOpen])

  const handleSubmit = async () => {
    if (!input.trim()) return
    const cmd = parseCommand(input)

    switch (cmd.type) {
      case 'schedule': {
        const now = new Date()
        await window.api.schedule.create({
          title: cmd.text,
          start_date: now.toISOString().slice(0, 16),
        })
        addToast('success', `일정이 추가되었습니다: ${cmd.text}`)
        break
      }
      case 'task': {
        await window.api.task.create({
          title: cmd.text,
          tags: cmd.tags,
          priority: (cmd.priority ?? 2) as 0 | 1 | 2 | 3 | 4,
        })
        addToast('success', `할일이 추가되었습니다: ${cmd.text}`)
        break
      }
      case 'memo': {
        await window.api.memo.create({ content: cmd.text })
        addToast('success', `메모가 추가되었습니다`)
        break
      }
      case 'search': {
        setView('tasks')
        addToast('info', `"${cmd.text}" 검색`)
        break
      }
    }

    setInput('')
    setQuickInputOpen(false)
  }

  const parsedType = input.trim() ? parseCommand(input).type : null

  return (
    <AnimatePresence>
      {quickInputOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/30" onClick={() => setQuickInputOpen(false)} />
          <motion.div
            className="relative w-[560px] bg-[var(--bg-primary)] rounded-[var(--radius)] shadow-2xl border border-[var(--border-widget)] overflow-hidden"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Search size={18} className="text-[var(--text-muted)] shrink-0" />
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit()
                  if (e.key === 'Escape') setQuickInputOpen(false)
                }}
                placeholder="일정, 할일, 메모를 입력하거나 검색하세요..."
                className="flex-1 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              {input && (
                <button onClick={() => setInput('')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Command type indicator */}
            <div className="px-4 py-2.5 border-t border-[var(--border-widget)] flex items-center gap-3">
              {parsedType && (
                <div className="flex items-center gap-1.5">
                  {parsedType === 'schedule' && <Calendar size={13} className="text-blue-500" />}
                  {parsedType === 'task' && <CheckSquare size={13} className="text-green-500" />}
                  {parsedType === 'memo' && <StickyNote size={13} className="text-amber-500" />}
                  {parsedType === 'search' && <Search size={13} className="text-[var(--text-muted)]" />}
                  <span className="text-xs text-[var(--text-secondary)]">
                    {parsedType === 'schedule' ? '일정 추가' : parsedType === 'task' ? '할일 추가' : parsedType === 'memo' ? '메모 추가' : '검색'}
                  </span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span>"일정 제목" — 일정 추가</span>
                <span>"할일 제목 #태그 !높음" — 할일</span>
                <span>"메모 내용" — 메모</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
