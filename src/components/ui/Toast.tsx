import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useUIStore } from '../../stores/ui.store'

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
}

const colors = {
  success: '#10B981',
  error: '#EF4444',
  info: '#3B82F6',
  warning: '#F59E0B',
}

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts)
  const removeToast = useUIStore((s) => s.removeToast)

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = icons[toast.type]
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 100, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              className="glass flex items-center gap-3 px-4 py-3 min-w-[280px] max-w-[380px]"
            >
              <Icon size={18} style={{ color: colors[toast.type], flexShrink: 0 }} />
              <span className="text-sm text-[var(--text-primary)] flex-1">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5"
              >
                <X size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
