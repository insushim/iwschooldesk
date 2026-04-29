import { useEffect, useRef, useMemo } from 'react'
import { TitleBar } from './components/layout/TitleBar'
import { Sidebar } from './components/layout/Sidebar'
import { QuickInput } from './components/layout/QuickInput'
import { ToastContainer } from './components/ui/Toast'
import { WidgetShell } from './components/layout/WidgetShell'
import { DashboardHome } from './components/dashboard/DashboardHome'
import { CalendarView } from './components/dashboard/CalendarView'
import { TaskBoard } from './components/dashboard/TaskBoard'
import { MemoGrid } from './components/dashboard/MemoGrid'
import { TimetableEditor } from './components/dashboard/TimetableEditor'
import { ChecklistManager } from './components/dashboard/ChecklistManager'
import { WidgetLauncher } from './components/dashboard/WidgetLauncher'
import { StatisticsView } from './components/dashboard/StatisticsView'
import { SettingsPanel } from './components/dashboard/SettingsPanel'
import { CalendarWidget } from './components/widgets/CalendarWidget'
import { TaskWidget } from './components/widgets/TaskWidget'
import { MemoWidget } from './components/widgets/MemoWidget'
import { TimetableWidget } from './components/widgets/TimetableWidget'
import { ChecklistWidget } from './components/widgets/ChecklistWidget'
import { TimerWidget } from './components/widgets/TimerWidget'
import { DDayWidget } from './components/widgets/DDayWidget'
import { ClockWidget } from './components/widgets/ClockWidget'
import { RoutineWidget } from './components/widgets/RoutineWidget'
import { GoalWidget } from './components/widgets/GoalWidget'
import { StudentCheckWidget } from './components/widgets/StudentCheckWidget'
import { StudentTimetableWidget } from './components/widgets/StudentTimetableWidget'
import { TodayWidget } from './components/widgets/TodayWidget'
import { StudentRecordWidget } from './components/widgets/StudentRecordWidget'
import { MealWidget } from './components/widgets/MealWidget'
import { useUIStore } from './stores/ui.store'
import { useAppStore } from './stores/app.store'
import { useTheme } from './hooks/useTheme'
import { playSchoolBell } from './lib/school-bell'
import {
  Clock8, CalendarDays, ListTodo, NotebookPen,
  LayoutPanelLeft, CheckCheck, TimerReset, CalendarHeart, Repeat, Target, Users,
  GraduationCap, CalendarCheck, ShieldCheck, Utensils,
} from 'lucide-react'

const views = {
  home: DashboardHome,
  calendar: CalendarView,
  tasks: TaskBoard,
  memos: MemoGrid,
  timetable: TimetableEditor,
  checklists: ChecklistManager,
  widgets: WidgetLauncher,
  statistics: StatisticsView,
  settings: SettingsPanel,
}

const ICON_PROPS = { size: 13, strokeWidth: 2.2 }
const WIDGET_REGISTRY: Record<string, { title: string; icon: JSX.Element; iconColor: string; Component: () => JSX.Element }> = {
  clock:     { title: '시계',       icon: <Clock8 {...ICON_PROPS} />,          iconColor: '#2563EB', Component: ClockWidget },
  calendar:  { title: '달력',       icon: <CalendarDays {...ICON_PROPS} />,    iconColor: '#10B981', Component: CalendarWidget },
  task:      { title: '할일',       icon: <ListTodo {...ICON_PROPS} />,        iconColor: '#F59E0B', Component: TaskWidget },
  memo:      { title: '메모',       icon: <NotebookPen {...ICON_PROPS} />,     iconColor: '#F97316', Component: MemoWidget },
  timetable: { title: '시간표',     icon: <LayoutPanelLeft {...ICON_PROPS} />, iconColor: '#6366F1', Component: TimetableWidget },
  studenttimetable: { title: '학생용 시간표', icon: <GraduationCap {...ICON_PROPS} />, iconColor: '#7C3AED', Component: StudentTimetableWidget },
  checklist: { title: '체크리스트', icon: <CheckCheck {...ICON_PROPS} />,      iconColor: '#14B8A6', Component: ChecklistWidget },
  timer:     { title: '타이머',     icon: <TimerReset {...ICON_PROPS} />,      iconColor: '#EC4899', Component: TimerWidget },
  dday:      { title: 'D-Day',      icon: <CalendarHeart {...ICON_PROPS} />,   iconColor: '#8B5CF6', Component: DDayWidget },
  routine:   { title: '루틴',       icon: <Repeat {...ICON_PROPS} />,          iconColor: '#8B5CF6', Component: RoutineWidget },
  goal:      { title: '우리반 목표', icon: <Target {...ICON_PROPS} />,          iconColor: '#0EA5E9', Component: GoalWidget },
  studentcheck: { title: '학급 체크', icon: <Users {...ICON_PROPS} />,           iconColor: '#0EA5E9', Component: StudentCheckWidget },
  today:     { title: '오늘',       icon: <CalendarCheck {...ICON_PROPS} />,    iconColor: '#F59E0B', Component: TodayWidget },
  studentrecord: { title: '학생 기록', icon: <ShieldCheck {...ICON_PROPS} />,   iconColor: '#8B5CF6', Component: StudentRecordWidget },
  meal:      { title: '오늘의 급식', icon: <Utensils {...ICON_PROPS} />,        iconColor: '#F59E0B', Component: MealWidget },
}

function parseWidgetHash(): string | null {
  const match = window.location.hash.match(/widget=([a-z]+)/)
  return match ? match[1] : null
}

// 학교 종소리는 src/lib/school-bell.ts로 이전 — 12음 멜로디 + reverb

export default function App() {
  useTheme()

  const widgetType = useMemo(() => parseWidgetHash(), [])

  if (widgetType && WIDGET_REGISTRY[widgetType]) {
    const entry = WIDGET_REGISTRY[widgetType]
    const W = entry.Component
    return (
      <WidgetShell
        title={entry.title}
        icon={entry.icon}
        iconColor={entry.iconColor}
        widgetType={widgetType}
      >
        <W />
      </WidgetShell>
    )
  }

  return <DashboardApp />
}

function DashboardApp() {
  const currentView = useUIStore((s) => s.currentView)
  const setQuickInputOpen = useUIStore((s) => s.setQuickInputOpen)
  const loadSettings = useAppStore((s) => s.loadSettings)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const bellFiredRef = useRef(new Set<string>())
  useEffect(() => {
    const checkBell = async () => {
      try {
        // 설정에서 알림 끄면 bell 체크 자체 중단
        const settings = useAppStore.getState().settings
        if (settings?.notification_enabled === false) return

        const periods = await window.api.timetable.getPeriods()
        const bellRaw = await window.api.settings.get('bell_settings' as 'theme')
        const bellSettings = (bellRaw && typeof bellRaw === 'object')
          ? (bellRaw as Record<string, { startBell: boolean; endBell: boolean }>)
          : {}

        const now = new Date()
        if (now.getDay() < 1 || now.getDay() > 5) return
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

        // DB에 같은 start_time으로 중복 저장된 period가 있어도 첫 번째 하나만 사용
        const byStart = new Map<string, typeof periods[0]>()
        const byEnd = new Map<string, typeof periods[0]>()
        for (const p of periods) {
          if (p.is_break) continue
          if (!byStart.has(p.start_time)) byStart.set(p.start_time, p)
          if (!byEnd.has(p.end_time)) byEnd.set(p.end_time, p)
        }

        const startP = byStart.get(timeStr)
        if (startP) {
          const cfg = bellSettings[startP.id] ?? { startBell: true, endBell: true }
          // key에 period.id를 넣지 않고 timeStr만 사용 → 시간당 1회 발사 보장
          const key = `start-${timeStr}`
          if (cfg.startBell && !bellFiredRef.current.has(key)) {
            bellFiredRef.current.add(key)
            playSchoolBell('start')
            window.api.system.showNotification('수업 시작', `${startP.label} 수업이 시작됩니다`)
            // 모든 창(특히 듀얼 모니터 전자칠판의 시계 위젯)에도 시각 알림 전파
            window.api.system.broadcastBell({ kind: 'start', periodLabel: startP.label, periodNumber: startP.period })
          }
        }

        const endP = byEnd.get(timeStr)
        if (endP) {
          const cfg = bellSettings[endP.id] ?? { startBell: true, endBell: true }
          const key = `end-${timeStr}`
          if (cfg.endBell && !bellFiredRef.current.has(key)) {
            bellFiredRef.current.add(key)
            playSchoolBell('end')
            window.api.system.broadcastBell({ kind: 'end', periodLabel: endP.label, periodNumber: endP.period })
          }
        }

        if (bellFiredRef.current.size > 50) bellFiredRef.current.clear()
      } catch { /* ignore */ }
    }
    const timer = setInterval(checkBell, 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setQuickInputOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setQuickInputOpen])

  const ViewComponent = views[currentView]

  return (
    <div className="flex flex-col h-screen">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden bg-[var(--bg-primary)]">
          <ViewComponent />
        </main>
      </div>
      <QuickInput />
      <ToastContainer />
    </div>
  )
}
