import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ReactNode } from 'react'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  wide?: boolean
}

export function Dialog({ open, onOpenChange, title, children, wide }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
              <motion.div
                className={`fixed z-50 w-[90vw] ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl bg-[var(--bg-primary)] shadow-2xl border border-[var(--border-widget)]`}
                style={{
                  left: '50%',
                  top: '50%',
                  maxHeight: 'calc(100vh - 80px)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              >
                {/* 헤더 — 항상 고정 */}
                <div className="flex items-center justify-between pt-6 pb-4 shrink-0 border-b border-[var(--border-widget)]" style={{ paddingLeft: 32, paddingRight: 32 }}>
                  <RadixDialog.Title className="text-base font-semibold text-[var(--text-primary)]">
                    {title}
                  </RadixDialog.Title>
                  <RadixDialog.Close className="rounded-full p-1.5 hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-muted)]">
                    <X size={16} />
                  </RadixDialog.Close>
                </div>
                {/* 콘텐츠 — 스크롤 가능 */}
                <div className="py-5 overflow-y-auto flex-1" style={{ paddingLeft: 32, paddingRight: 32 }}>
                  {children}
                </div>
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  )
}
