import { Minus, Square, X } from 'lucide-react'

export function TitleBar() {
  return (
    <div
      className="drag-region h-10 flex items-center justify-between bg-[var(--bg-primary)] border-b border-[var(--border-widget)] select-none shrink-0"
      style={{ paddingLeft: 32 }}
    >
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-sky-400 flex items-center justify-center">
          <span className="text-white text-xs font-bold">S</span>
        </div>
        <span className="text-xs font-semibold text-[var(--text-secondary)]">SchoolDesk</span>
      </div>
      <div className="no-drag flex items-center">
        <button
          onClick={() => window.api.system.minimize()}
          className="h-10 w-10 flex items-center justify-center hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-muted)]"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => window.api.system.maximize()}
          className="h-10 w-10 flex items-center justify-center hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-muted)]"
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => window.api.system.close()}
          className="h-10 w-10 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors text-[var(--text-muted)]"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
