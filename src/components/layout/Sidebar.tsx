import { Home, Calendar, CheckSquare, StickyNote, Table, ListChecks, LayoutGrid, BarChart3, Settings, Moon, Sun, PanelLeftClose, PanelLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { useUIStore, type ViewType } from '../../stores/ui.store'
import { useTheme } from '../../hooks/useTheme'
import { cn } from '../../lib/utils'

const navItems: { view: ViewType; icon: typeof Home; label: string }[] = [
  { view: 'home', icon: Home, label: '홈' },
  { view: 'calendar', icon: Calendar, label: '달력' },
  { view: 'tasks', icon: CheckSquare, label: '업무' },
  { view: 'memos', icon: StickyNote, label: '메모' },
  { view: 'timetable', icon: Table, label: '시간표' },
  { view: 'checklists', icon: ListChecks, label: '체크리스트' },
  { view: 'widgets', icon: LayoutGrid, label: '바탕화면 위젯' },
  { view: 'statistics', icon: BarChart3, label: '통계' },
  { view: 'settings', icon: Settings, label: '설정' },
]

export function Sidebar() {
  const { currentView, setView, sidebarCollapsed, toggleSidebar } = useUIStore()
  const { isDark, setTheme } = useTheme()

  return (
    <motion.aside
      className="h-full flex flex-col bg-[var(--bg-secondary)] border-r border-[var(--border-widget)] shrink-0 select-none"
      animate={{ width: sidebarCollapsed ? 84 : 240 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      // nav/footer 컨테이너 padding 은 실패하기 쉬우니(Tailwind purge, CSS override 등) inline 으로 고정.
      style={{ paddingLeft: 18, paddingRight: 14 }}
    >
      <nav className="flex-1 flex flex-col gap-1" style={{ paddingTop: 20, paddingBottom: 10 }}>
        {navItems.map(({ view, icon: Icon, label }) => {
          const active = currentView === view
          return (
            <button
              key={view}
              onClick={() => setView(view)}
              title={sidebarCollapsed ? label : undefined}
              className={cn(
                'relative flex items-center rounded-[var(--radius-xs)] h-11 text-[15px] transition-all overflow-hidden',
                active
                  ? 'text-[var(--accent)] bg-[var(--accent-light)] font-medium'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-widget)] hover:text-[var(--text-primary)]',
              )}
              style={{
                // 접힘: 아이콘 가운데. 펼침: 좌측 여백을 inline 으로 강제.
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                paddingLeft: sidebarCollapsed ? 0 : 14,
                paddingRight: sidebarCollapsed ? 0 : 14,
                gap: sidebarCollapsed ? 0 : 12,
              }}
            >
              <Icon size={20} className="shrink-0" />
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="whitespace-nowrap"
                >
                  {label}
                </motion.span>
              )}
            </button>
          )
        })}
      </nav>

      <div
        className="flex flex-col gap-1 border-t border-[var(--border-widget)]"
        style={{ paddingTop: 12, paddingBottom: 14 }}
      >
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          title={sidebarCollapsed ? (isDark ? '라이트 모드' : '다크 모드') : undefined}
          className={cn(
            'flex items-center rounded-[var(--radius-xs)] h-10 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-widget)] hover:text-[var(--text-primary)] transition-all',
          )}
          style={{
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            paddingLeft: sidebarCollapsed ? 0 : 14,
            paddingRight: sidebarCollapsed ? 0 : 14,
            gap: sidebarCollapsed ? 0 : 12,
          }}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
          {!sidebarCollapsed && <span>{isDark ? '라이트 모드' : '다크 모드'}</span>}
        </button>
        <button
          onClick={toggleSidebar}
          title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
          className={cn(
            'flex items-center rounded-[var(--radius-xs)] h-10 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-widget)] hover:text-[var(--text-primary)] transition-all',
          )}
          style={{
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            paddingLeft: sidebarCollapsed ? 0 : 14,
            paddingRight: sidebarCollapsed ? 0 : 14,
            gap: sidebarCollapsed ? 0 : 12,
          }}
        >
          {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          {!sidebarCollapsed && <span>사이드바 접기</span>}
        </button>
      </div>
    </motion.aside>
  )
}
