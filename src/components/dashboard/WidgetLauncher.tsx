import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Clock8, CalendarDays, ListTodo, NotebookPen, LayoutPanelLeft,
  CheckCheck, TimerReset, CalendarHeart, LayoutGrid, Power, Repeat, Target, Users,
  GraduationCap, Image as WallpaperIcon, CalendarCheck, ShieldCheck, Utensils,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { WALLPAPER_ELIGIBLE_TYPES, type WidgetType as AppWidgetType } from '../../types/widget.types'

type WidgetType = 'clock' | 'calendar' | 'task' | 'memo' | 'timetable' | 'checklist' | 'timer' | 'dday' | 'routine' | 'goal' | 'studentcheck' | 'studenttimetable' | 'today' | 'studentrecord' | 'meal'

interface WidgetInfo {
  type: WidgetType
  label: string
  desc: string
  icon: typeof Clock8
  color: string
}

const WIDGETS: WidgetInfo[] = [
  { type: 'clock',     label: '시계',       desc: '디지털 시계 + 현재 교시', icon: Clock8,           color: '#2563EB' },
  { type: 'calendar',  label: '달력',       desc: '이번 달 일정 요약',        icon: CalendarDays,     color: '#10B981' },
  { type: 'today',     label: '오늘',       desc: '오늘 특별한 일정 · 학생용',   icon: CalendarCheck,    color: '#F59E0B' },
  { type: 'task',      label: '할일',       desc: '오늘의 업무 보드',          icon: ListTodo,         color: '#F59E0B' },
  { type: 'memo',      label: '메모',       desc: '빠른 포스트잇 메모',        icon: NotebookPen,      color: '#F97316' },
  { type: 'timetable', label: '시간표',     desc: '오늘 수업 시간표',          icon: LayoutPanelLeft,  color: '#6366F1' },
  { type: 'studenttimetable', label: '학생용 시간표', desc: '지금/다음 교시만 크게 · 전자칠판용', icon: GraduationCap, color: '#7C3AED' },
  { type: 'checklist', label: '체크리스트', desc: '진행중인 체크리스트',       icon: CheckCheck,       color: '#14B8A6' },
  { type: 'timer',     label: '타이머',     desc: '포모도로/수업 타이머',      icon: TimerReset,       color: '#EC4899' },
  { type: 'dday',      label: 'D-Day',      desc: '주요 기념일/행사 카운트',   icon: CalendarHeart,    color: '#8B5CF6' },
  { type: 'routine',   label: '루틴',       desc: '매일 반복 체크, 자동 초기화', icon: Repeat,          color: '#8B5CF6' },
  { type: 'goal',      label: '우리반 목표', desc: '학생에게 항상 보여줄 가치 문장', icon: Target,      color: '#0EA5E9' },
  { type: 'studentcheck', label: '학급 체크', desc: '학생이 직접 체크(우유/양치 등) · 자정 초기화', icon: Users, color: '#0EA5E9' },
  { type: 'studentrecord', label: '학생 기록', desc: '비밀번호 잠금 · 수정 로그 자동 기록 (법원 증거용)', icon: ShieldCheck, color: '#8B5CF6' },
  { type: 'meal',      label: '오늘의 급식', desc: 'NEIS API 연동 · 학교 검색 한 번이면 끝', icon: Utensils, color: '#F59E0B' },
]

export function WidgetLauncher() {
  const [openSet, setOpenSet] = useState<Set<string>>(new Set())
  const [wallpaperSet, setWallpaperSet] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [list, wpMap] = await Promise.all([
      window.api.widget.listOpen(),
      window.api.widget.getWallpaperModeMap().catch(() => [] as string[]),
    ])
    setOpenSet(new Set(list))
    // wpMap 은 `widget-<type>` 형태의 widget_id 리스트. 여기선 widget type만 추출.
    const types = wpMap.map((id) => {
      const rest = id.replace(/^widget-/, '')
      return rest.split('-')[0]
    })
    setWallpaperSet(new Set(types))
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 1500)
    // main이 모드 변경 이벤트를 쏘면 즉시 갱신
    const off = window.api.widget.onWallpaperModeChanged(() => { refresh() })
    return () => { clearInterval(t); off() }
  }, [refresh])

  const toggleWallpaper = async (type: WidgetType, next: boolean): Promise<void> => {
    // 기본 인스턴스 widget_id = `widget-<type>`. 배경 모드는 먼저 창이 열려있어야 함.
    if (!openSet.has(type)) {
      await window.api.widget.openWindow(type)
      // 창이 뜨는 순간을 기다림
      await new Promise((r) => setTimeout(r, 250))
    }
    await window.api.widget.setWallpaperMode(`widget-${type}`, next)
    await refresh()
  }

  const toggle = async (type: WidgetType) => {
    if (openSet.has(type)) {
      await window.api.widget.closeWindow(type)
    } else {
      await window.api.widget.openWindow(type)
    }
    await refresh()
  }

  const closeAll = async () => {
    for (const w of WIDGETS) {
      if (openSet.has(w.type)) await window.api.widget.closeWindow(w.type)
    }
    await refresh()
  }

  const openAll = async () => {
    for (const w of WIDGETS) {
      if (!openSet.has(w.type)) await window.api.widget.openWindow(w.type)
    }
    await refresh()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 pr-10 max-w-5xl">
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <LayoutGrid size={20} className="text-[var(--accent)]" />
              <h1 className="text-xl font-bold text-[var(--text-primary)]">바탕화면 위젯</h1>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              필요한 위젯을 켜서 바탕화면에 띄우세요. 드래그로 위치 이동, 헤더 아이콘으로 투명도·항상 위 설정이 가능합니다.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openAll}
              style={{
                padding: '10px 18px',
                borderColor: 'rgba(37,99,235,0.3)',
                backgroundColor: 'var(--accent-light)',
                color: 'var(--accent)',
              }}
              className="flex items-center gap-1.5 rounded-lg text-xs font-semibold border hover:opacity-85 transition-all whitespace-nowrap"
            >
              <LayoutGrid size={12} />
              <span className="whitespace-nowrap">전체 켜기</span>
            </button>
            <button
              onClick={closeAll}
              style={{
                padding: '10px 18px',
                borderColor: 'rgba(15,23,42,0.12)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
              }}
              className="flex items-center gap-1.5 rounded-lg text-xs font-semibold border hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 transition-all whitespace-nowrap"
            >
              <Power size={12} />
              <span className="whitespace-nowrap">전체 끄기</span>
            </button>
          </div>
        </div>

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
        >
          {WIDGETS.map((w) => {
            const Icon = w.icon
            const isOpen = openSet.has(w.type)
            const wallpaperEligible = WALLPAPER_ELIGIBLE_TYPES.has(w.type as AppWidgetType)
            const isWallpaper = wallpaperSet.has(w.type)
            return (
              <motion.div
                key={w.type}
                whileHover={{ y: -2 }}
                className={cn(
                  'relative flex flex-col items-start gap-2.5 rounded-[var(--radius)] border text-left transition-all',
                  isOpen ? 'shadow-lg' : 'hover:shadow-md'
                )}
                style={{
                  padding: '18px',
                  backgroundColor: isWallpaper
                    ? `${w.color}1F`
                    : isOpen ? `${w.color}12` : 'var(--bg-widget)',
                  borderColor: isWallpaper ? w.color : isOpen ? w.color : 'rgba(15,23,42,0.1)',
                  borderWidth: isOpen || isWallpaper ? '1.5px' : '1px',
                }}
              >
                {/* 헤더(아이콘+켜짐/꺼짐) — 이 영역이 주 토글 */}
                <button
                  onClick={() => toggle(w.type)}
                  disabled={loading}
                  className="flex items-center justify-between w-full text-left"
                  style={{ cursor: 'pointer' }}
                >
                  <span
                    className="flex items-center justify-center"
                    style={{
                      width: 40, height: 40,
                      borderRadius: 12,
                      background: `linear-gradient(135deg, ${w.color}28 0%, ${w.color}12 100%)`,
                      color: w.color,
                      border: `1px solid ${w.color}22`,
                    }}
                  >
                    <Icon size={19} strokeWidth={2.1} />
                  </span>
                  <span
                    className="text-[10px] font-semibold rounded-full"
                    style={{
                      padding: '3px 10px',
                      backgroundColor: isOpen ? w.color : 'transparent',
                      color: isOpen ? '#fff' : 'var(--text-muted)',
                      border: isOpen ? 'none' : '1px solid rgba(15,23,42,0.12)',
                    }}
                  >
                    {isOpen ? '켜짐' : '꺼짐'}
                  </span>
                </button>
                <div
                  onClick={() => toggle(w.type)}
                  className="cursor-pointer"
                >
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{w.label}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">{w.desc}</div>
                </div>

                {/* 배경화면 모드 토글 — 지원 위젯에만 노출 */}
                {wallpaperEligible && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleWallpaper(w.type, !isWallpaper)
                    }}
                    disabled={loading}
                    title={
                      isWallpaper
                        ? '배경화면 모드 해제 — 다시 클릭 가능해짐'
                        : '배경화면 모드 — 클릭 통과 + 항상 맨 뒤. 해제는 Ctrl+Alt+Shift+W'
                    }
                    className="flex items-center gap-1.5 w-full mt-1 transition-colors"
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '-0.2px',
                      background: isWallpaper
                        ? `linear-gradient(135deg, ${w.color} 0%, ${w.color}CC 100%)`
                        : `${w.color}12`,
                      color: isWallpaper ? '#fff' : w.color,
                      border: isWallpaper ? 'none' : `1px solid ${w.color}33`,
                      boxShadow: isWallpaper ? `0 4px 12px ${w.color}55` : 'none',
                    }}
                  >
                    <WallpaperIcon size={12} strokeWidth={2.3} />
                    <span>{isWallpaper ? '배경화면 모드 켜짐' : '배경화면 모드'}</span>
                  </button>
                )}
              </motion.div>
            )
          })}
        </div>

        <div className="mt-8 p-4 rounded-[var(--radius)] border border-[var(--border-widget)] bg-[var(--bg-secondary)]">
          <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">💡 팁</div>
          <ul className="text-xs text-[var(--text-muted)] space-y-1.5 list-disc list-inside">
            <li>위젯 창은 위치·크기·투명도가 자동 저장되고 다음 실행 시 복원됩니다.</li>
            <li>헤더의 📌 핀 버튼으로 "항상 위"를 켜고 끌 수 있습니다.</li>
            <li>헤더의 👁 눈 버튼으로 투명도를 30~100% 사이에서 조정할 수 있습니다.</li>
            <li>
              <b>배경화면 모드</b>는 시간표·학급 체크·달력·우리반 목표·학생용 시간표·D-Day·시계·타이머에만 제공됩니다.
              켜면 클릭이 바로 통과해서 다른 창이 자유롭게 그 위에 올라옵니다. 해제는 카드의 토글 또는 <b>Ctrl+Alt+Shift+W</b>.
            </li>
            <li>트레이 아이콘 우클릭 → "배경화면 모드 전체 해제" / "모든 위젯 닫기"로 한 번에 정리 가능.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
