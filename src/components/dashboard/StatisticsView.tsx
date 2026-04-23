import { useState, useEffect } from 'react'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { BarChart3, TrendingUp, Award, Clock } from 'lucide-react'
import type { Task } from '../../types/task.types'

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

export function StatisticsView() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.task.list().then((data) => {
      setTasks(data)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
        데이터를 불러오는 중...
      </div>
    )
  }

  const completedTasks = tasks.filter((t) => t.is_completed === 1)
  const totalCompleted = completedTasks.length
  const thisMonthCompleted = completedTasks.filter((t) => {
    if (!t.completed_at) return false
    const d = new Date(t.completed_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  // Category distribution
  const categoryData = Object.entries(
    tasks.reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + 1
      return acc
    }, {})
  ).map(([name, value]) => ({ name, value }))

  // Priority completion rate
  const priorityLabels = ['없음', '낮음', '보통', '높음', '긴급']
  const priorityData = [0, 1, 2, 3, 4].map((p) => {
    const total = tasks.filter((t) => t.priority === p).length
    const completed = tasks.filter((t) => t.priority === p && t.is_completed === 1).length
    return {
      name: priorityLabels[p],
      완료율: total > 0 ? Math.round((completed / total) * 100) : 0,
      total,
    }
  }).filter((d) => d.total > 0)

  // Weekly activity (last 7 days)
  const weekDays = ['일', '월', '화', '수', '목', '금', '토']
  const weekData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    const dayStr = date.toISOString().slice(0, 10)
    const count = completedTasks.filter((t) => t.completed_at?.slice(0, 10) === dayStr).length
    return { name: weekDays[date.getDay()], 완료: count }
  })

  // Status distribution
  const statusCounts = {
    todo: tasks.filter((t) => t.status === 'todo').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  }

  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const avgDaily = thisMonthCompleted > 0 ? (thisMonthCompleted / Math.min(new Date().getDate(), daysInMonth)).toFixed(1) : '0'

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--text-muted)]">
        <BarChart3 size={48} strokeWidth={1.5} />
        <p className="text-base">아직 통계 데이터가 없습니다.</p>
        <p className="text-sm">업무를 추가하고 완료하면 통계를 확인할 수 있어요!</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-6">업무 통계</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-5 mb-6">
        {[
          { icon: CheckSquareIcon, label: '총 완료 업무', value: `${totalCompleted}건`, color: '#10B981' },
          { icon: TrendingUp, label: '이번 달 완료', value: `${thisMonthCompleted}건`, color: '#3B82F6' },
          { icon: Award, label: '평균 일일 완료', value: `${avgDaily}건`, color: '#F59E0B' },
          { icon: Clock, label: '진행 중 업무', value: `${statusCounts.in_progress}건`, color: '#8B5CF6' },
        ].map((card) => (
          <div key={card.label} className="glass p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${card.color}20` }}>
              <card.icon size={20} style={{ color: card.color }} />
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">{card.label}</p>
              <p className="text-lg font-bold text-[var(--text-primary)]">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Weekly Completion */}
        <div className="glass p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">주간 완료 추이</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-widget)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-widget)', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="완료" fill="#2563EB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Category Distribution */}
        <div className="glass p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">카테고리별 분포</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {categoryData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-widget)', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Priority Completion Rate */}
        <div className="glass p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">우선순위별 완료율</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={priorityData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-widget)" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} width={50} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-widget)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${v}%`, '완료율']}
              />
              <Bar dataKey="완료율" fill="#10B981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status Overview */}
        <div className="glass p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">업무 현황</h3>
          <div className="flex flex-col gap-3 mt-2">
            {[
              { label: '할 일', count: statusCounts.todo, color: '#94A3B8' },
              { label: '진행 중', count: statusCounts.in_progress, color: '#F59E0B' },
              { label: '완료', count: statusCounts.done, color: '#10B981' },
            ].map((item) => {
              const total = tasks.length
              const pct = total > 0 ? (item.count / total) * 100 : 0
              return (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-secondary)] w-14">{item.label}</span>
                  <div className="flex-1 h-6 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: item.color }}
                    />
                  </div>
                  <span className="text-xs font-medium text-[var(--text-primary)] w-12 text-right">
                    {item.count}건
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function CheckSquareIcon(props: { size: number; style: React.CSSProperties }) {
  return (
    <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={props.style}>
      <path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}
