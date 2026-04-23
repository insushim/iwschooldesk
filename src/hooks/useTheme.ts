import { useEffect } from 'react'
import { useAppStore } from '../stores/app.store'

export function useTheme() {
  const settings = useAppStore((s) => s.settings)
  const updateSetting = useAppStore((s) => s.updateSetting)
  const theme = settings?.theme ?? 'system'

  useEffect(() => {
    const applyTheme = (t: string) => {
      if (t === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
      } else {
        document.documentElement.setAttribute('data-theme', t)
      }
    }

    applyTheme(theme)

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  const setTheme = (t: 'light' | 'dark' | 'system') => {
    updateSetting('theme', t)
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  return { theme, setTheme, isDark }
}
