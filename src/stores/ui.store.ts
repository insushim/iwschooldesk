import { create } from 'zustand'

export type ViewType = 'home' | 'calendar' | 'tasks' | 'memos' | 'timetable' | 'checklists' | 'widgets' | 'statistics' | 'settings'

interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
}

interface UIState {
  currentView: ViewType
  sidebarCollapsed: boolean
  quickInputOpen: boolean
  toasts: Toast[]
  setView: (view: ViewType) => void
  toggleSidebar: () => void
  setQuickInputOpen: (open: boolean) => void
  addToast: (type: Toast['type'], message: string) => void
  removeToast: (id: string) => void
}

let toastId = 0

export const useUIStore = create<UIState>((set) => ({
  currentView: 'home',
  sidebarCollapsed: false,
  quickInputOpen: false,
  toasts: [],
  setView: (view) => set({ currentView: view }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setQuickInputOpen: (open) => set({ quickInputOpen: open }),
  addToast: (type, message) => {
    const id = `toast-${++toastId}`
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, 3000)
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))
