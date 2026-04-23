import { create } from 'zustand'
import type { AppSettings } from '../types/settings.types'

interface AppState {
  settings: AppSettings | null
  isLoading: boolean
  loadSettings: () => Promise<void>
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
}

export const useAppStore = create<AppState>((set) => ({
  settings: null,
  isLoading: true,
  loadSettings: async () => {
    set({ isLoading: true })
    const settings = await window.api.settings.getAll()
    set({ settings, isLoading: false })
  },
  updateSetting: async (key, value) => {
    await window.api.settings.set(key, value)
    if (key === 'auto_start') {
      try {
        await window.api.system.setAutoStart(!!value)
      } catch { /* ignore */ }
    }
    set((state) => ({
      settings: state.settings ? { ...state.settings, [key]: value } : null,
    }))
  },
}))
