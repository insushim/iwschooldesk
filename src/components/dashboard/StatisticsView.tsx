import { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  BarChart3, TrendingUp, Award, Clock, NotebookPen, CheckCheck,
  Repeat, Flame, ShieldCheck, ListTodo, CheckCircle2, Lock, Users,
} from 'lucide-react'
import { motion } from 'framer-motion'
import type { Task } from '../../types/task.types'
import type { Habit, HabitStats } from '../../types/habit.types'

/**
 * 통계 대시보드 — 모든 영역 통합.
 *  - 업무 · 메모 · 체크리스트 · 루틴 · 습관 · 학생 기록
 *  - 카드 그리드는 화면 폭에 맞춰 auto-fit (위젯과 동일한 톤)
 *  - 학생 기록은 잠금 상태에선 잠김 카드만, 해제하면 풀 통계
 */

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

type ChecklistAgg = {
  id: string
  title: string
  total: number
  done: number
  pct: number
}

type RoutineAgg = {
  id: string
  name: string
  kind: 'personal' | 'classroom'
  itemCount: number
  todayDone: number
  totalCompletions: number
}

type StudentRecordRow = {
  id: string
  student_name: string
  content: string
  tag: string
  is_deleted: number
  created_at: string
  updated_at: string
}

export function StatisticsView() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [memoCount, setMemoCount] = useState(0)
  const [memoThisMonth, setMemoThisMonth] = useState(0)
  const [memoWeekly, setMemoWeekly] = useState<{ name: string; 메모: number }[]>([])
  const [checklists, setChecklists] = useState<ChecklistAgg[]>([])
  const [routines, setRoutines] = useState<RoutineAgg[]>([])
  const [habits, setHabits] = useState<(Habit & HabitStats)[]>([])
  const [habitWeekly, setHabitWeekly] = useState<{ name: string; 체크: number }[]>([])
  const [studentLocked, setStudentLocked] = useState(true)
  const [studentRecords, setStudentRecords] = useState<StudentRecordRow[]>([])
  const [studentByTag, setStudentByTag] = useState<{ name: string; value: number }[]>([])
  const [studentByStudent, setStudentByStudent] = useState<{ name: string; value: number }[]>([])

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 로컬(KST) ymd — toISOString 은 UTC 라 자정~9시 어제 반환 버그.
    const toLocalYmd = (dt: Date): string =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    const todayStr = toLocalYmd(new Date())
    const weekDays = ['일', '월', '화', '수', '목', '금', '토']
    const lastSevenDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      return { ymd: toLocalYmd(d), label: weekDays[d.getDay()] }
    })

    let cancelled = false

    ;(async () => {
      try {
        const [taskList, memoList, checklistList, routineList, habitList, studentSet] = await Promise.all([
          window.api.task.list().catch(() => []),
          window.api.memo.list().catch(() => []),
          window.api.checklist.list().catch(() => []),
          window.api.routine.list().catch(() => []),
          window.api.habit.listWithStats(todayStr).catch(() => []),
          window.api.studentRecord.isPasswordSet().catch(() => false),
        ])
        if (cancelled) return

        setTasks(taskList)

        // ── 메모 통계
        setMemoCount(memoList.length)
        const now = new Date()
        const thisMonth = memoList.filter((m) => {
          if (!m.created_at) return false
          const d = new Date(m.created_at)
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        }).length
        setMemoThisMonth(thisMonth)
        setMemoWeekly(
          lastSevenDays.map(({ ymd, label }) => ({
            name: label,
            메모: memoList.filter((m) => (m.created_at ?? '').slice(0, 10) === ymd).length,
          })),
        )

        // ── 체크리스트 통계 (각 항목별 진행률)
        const checklistAgg = await Promise.all(
          checklistList
            .filter((c) => !c.is_template)
            .map(async (c) => {
              const items = await window.api.checklist.getItems(c.id).catch(() => [])
              const done = items.filter((i) => i.is_checked === 1).length
              return {
                id: c.id,
                title: c.title,
                total: items.length,
                done,
                pct: items.length > 0 ? Math.round((done / items.length) * 100) : 0,
              }
            }),
        )
        if (cancelled) return
        setChecklists(checklistAgg)

        // ── 루틴 통계
        const sevenAgo = lastSevenDays[0].ymd
        const routineAgg = await Promise.all(
          routineList.map(async (r) => {
            const [items, completions] = await Promise.all([
              window.api.routine.getItems(r.id, todayStr).catch(() => []),
              window.api.routine.completionsInRange(r.id, sevenAgo, todayStr).catch(() => []),
            ])
            const todayDone = items.filter((it) => it.is_completed === 1).length
            return {
              id: r.id,
              name: r.title,
              kind: r.kind,
              itemCount: items.length,
              todayDone,
              totalCompletions: completions.length,
            }
          }),
        )
        if (cancelled) return
        setRoutines(routineAgg)

        // ── 습관 통계
        setHabits(habitList)
        // 모든 습관의 최근 7일 합산 히트맵
        const weeklyCounts = lastSevenDays.map(({ label }) => ({ name: label, 체크: 0 }))
        await Promise.all(
          habitList.map(async (h) => {
            const comps = await window.api.habit.completionsInRange(h.id, lastSevenDays[0].ymd, todayStr).catch(() => [])
            for (const c of comps) {
              const idx = lastSevenDays.findIndex((d) => d.ymd === c.date)
              if (idx >= 0) weeklyCounts[idx].체크 += 1
            }
          }),
        )
        if (cancelled) return
        setHabitWeekly(weeklyCounts)

        // ── 학생 기록 (잠금 안 됐을 때만 표시)
        setStudentLocked(studentSet)
        if (!studentSet) {
          // 비밀번호 미설정 = 잠금 해제 상태로 간주
          const list = await window.api.studentRecord.list().catch(() => [])
          setStudentRecords(list)
          aggregateStudentStats(list)
        } else {
          // setPasswordSet === true → 우리는 list 호출 시 main에서 unlocked 만 허용할 가능성 — 시도해보고 실패하면 잠금 표시
          try {
            const list = await window.api.studentRecord.list()
            setStudentRecords(list)
            aggregateStudentStats(list)
            setStudentLocked(false)
          } catch {
            setStudentLocked(true)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    function aggregateStudentStats(list: StudentRecordRow[]): void {
      const tagMap = new Map<string, number>()
      const studentMap = new Map<string, number>()
      for (const r of list) {
        const t = r.tag || '없음'
        tagMap.set(t, (tagMap.get(t) ?? 0) + 1)
        studentMap.set(r.student_name, (studentMap.get(r.student_name) ?? 0) + 1)
      }
      setStudentByTag(Array.from(tagMap.entries()).map(([name, value]) => ({ name, value })))
      setStudentByStudent(
        Array.from(studentMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, value]) => ({ name, value })),
      )
    }

    return () => { cancelled = true }
  }, [])

  // ── 업무 파생 통계
  const taskStats = useMemo(() => {
    const completedTasks = tasks.filter((t) => t.is_completed === 1)
    const totalCompleted = completedTasks.length
    const now = new Date()
    const thisMonthCompleted = completedTasks.filter((t) => {
      if (!t.completed_at) return false
      const d = new Date(t.completed_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const avgDaily = thisMonthCompleted > 0
      ? (thisMonthCompleted / Math.min(now.getDate(), daysInMonth)).toFixed(1)
      : '0'

    const categoryData = Object.entries(
      tasks.reduce<Record<string, number>>((acc, t) => {
        acc[t.category] = (acc[t.category] ?? 0) + 1
        return acc
      }, {}),
    ).map(([name, value]) => ({ name, value }))

    const priorityLabels = ['없음', '낮음', '보통', '높음', '긴급']
    const priorityData = [0, 1, 2, 3, 4]
      .map((p) => {
        const total = tasks.filter((t) => t.priority === p).length
        const completed = tasks.filter((t) => t.priority === p && t.is_completed === 1).length
        return {
          name: priorityLabels[p],
          완료율: total > 0 ? Math.round((completed / total) * 100) : 0,
          total,
        }
      })
      .filter((d) => d.total > 0)

    const weekDays = ['일', '월', '화', '수', '목', '금', '토']
    const weekData = Array.from({ length: 7 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - i))
      // 로컬(KST) ymd — toISOString UTC 버그 방지.
      const dayStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const count = completedTasks.filter((t) => t.completed_at?.slice(0, 10) === dayStr).length
      return { name: weekDays[date.getDay()], 완료: count }
    })

    const statusCounts = {
      todo: tasks.filter((t) => t.status === 'todo').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      done: tasks.filter((t) => t.status === 'done').length,
    }

    return { totalCompleted, thisMonthCompleted, avgDaily, categoryData, priorityData, weekData, statusCounts }
  }, [tasks])

  const habitTotals = useMemo(() => {
    const longest = habits.reduce((acc, h) => Math.max(acc, h.streak_longest), 0)
    const currentMax = habits.reduce((acc, h) => Math.max(acc, h.streak_current), 0)
    const todayDone = habits.filter((h) => h.today_done).length
    const totalDays = habits.reduce((acc, h) => acc + h.total_days, 0)
    return { longest, currentMax, todayDone, totalDays }
  }, [habits])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
        통계를 불러오는 중…
      </div>
    )
  }

  const everythingEmpty =
    tasks.length === 0 &&
    memoCount === 0 &&
    checklists.length === 0 &&
    routines.length === 0 &&
    habits.length === 0 &&
    studentRecords.length === 0

  if (everythingEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--text-muted)]">
        <BarChart3 size={48} strokeWidth={1.5} />
        <p className="text-base">아직 통계 데이터가 없습니다.</p>
        <p className="text-sm">업무·메모·루틴·습관을 시작하면 여기에 모두 보여드릴게요.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto" style={{ padding: '24px 28px 32px' }}>
      <motion.h1
        className="font-bold text-[var(--text-primary)]"
        style={{ fontSize: 22, letterSpacing: '-0.3px', marginBottom: 18 }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        전체 통계
      </motion.h1>

      {/* ─── 상단 요약 카드 ─── */}
      <SectionTitle icon={<TrendingUp size={15} />} title="한눈에 보기" />
      <CardGrid minColumn={200}>
        <SummaryCard icon={CheckCircle2} label="완료한 업무" value={`${taskStats.totalCompleted}건`} accent="#10B981" sub={`이번 달 ${taskStats.thisMonthCompleted}건`} />
        <SummaryCard icon={TrendingUp} label="일일 평균 완료" value={`${taskStats.avgDaily}건`} accent="#3B82F6" sub="이번 달 기준" />
        <SummaryCard icon={NotebookPen} label="메모" value={`${memoCount}개`} accent="#F59E0B" sub={`이번 달 ${memoThisMonth}개 작성`} />
        <SummaryCard icon={CheckCheck} label="체크리스트" value={`${checklists.length}개`} accent="#0EA5E9" sub={`항목 ${checklists.reduce((s, c) => s + c.total, 0)}개`} />
        <SummaryCard icon={Repeat} label="루틴 (개인)" value={`${routines.filter((r) => r.kind === 'personal').length}개`} accent="#8B5CF6" sub={`오늘 체크 ${routines.filter((r) => r.kind === 'personal').reduce((s, r) => s + r.todayDone, 0)}개`} />
        <SummaryCard icon={Users} label="학급 체크" value={`${routines.filter((r) => r.kind === 'classroom').length}개`} accent="#0EA5E9" sub={`오늘 체크 ${routines.filter((r) => r.kind === 'classroom').reduce((s, r) => s + r.todayDone, 0)}개`} />
        <SummaryCard icon={Flame} label="습관" value={`${habits.length}개`} accent="#F97316" sub={`오늘 ${habitTotals.todayDone}/${habits.length} · 최장 ${habitTotals.longest}일`} />
      </CardGrid>

      {/* ─── 업무 통계 ─── */}
      <SectionTitle icon={<ListTodo size={15} style={{ color: '#F97316' }} />} title="업무" mt={28} />
      <CardGrid minColumn={380}>
        <ChartCard title="주간 완료 추이">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={taskStats.weekData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-widget)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="완료" fill="#2563EB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {taskStats.categoryData.length > 0 && (
          <ChartCard title="카테고리별 분포">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={taskStats.categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(((percent as number | undefined) ?? 0) * 100).toFixed(0)}%`}>
                  {taskStats.categoryData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {taskStats.priorityData.length > 0 && (
          <ChartCard title="우선순위별 완료율">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={taskStats.priorityData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-widget)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} width={60} />
                <Tooltip contentStyle={tooltipStyle} formatter={((v: number) => [`${v}%`, '완료율']) as never} />
                <Bar dataKey="완료율" fill="#10B981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <ChartCard title="업무 현황">
          <div className="flex flex-col h-full justify-center" style={{ gap: 14, padding: '14px 4px' }}>
            {[
              { label: '할 일', count: taskStats.statusCounts.todo, color: '#94A3B8' },
              { label: '진행 중', count: taskStats.statusCounts.in_progress, color: '#F59E0B' },
              { label: '완료', count: taskStats.statusCounts.done, color: '#10B981' },
            ].map((item) => {
              const total = tasks.length || 1
              const pct = (item.count / total) * 100
              return (
                <div key={item.label} className="flex items-center" style={{ gap: 12 }}>
                  <span className="text-xs font-bold text-[var(--text-secondary)]" style={{ width: 56 }}>{item.label}</span>
                  <div className="flex-1 h-7 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: item.color }}
                    />
                  </div>
                  <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums" style={{ width: 50, textAlign: 'right' }}>
                    {item.count}건
                  </span>
                </div>
              )
            })}
          </div>
        </ChartCard>
      </CardGrid>

      {/* ─── 메모 통계 ─── */}
      {memoCount > 0 && (
        <>
          <SectionTitle icon={<NotebookPen size={15} style={{ color: '#F59E0B' }} />} title="메모" mt={28} />
          <CardGrid minColumn={380}>
            <ChartCard title="최근 7일 작성">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={memoWeekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-widget)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="메모" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <BigStatCard
              metrics={[
                { label: '총 메모', value: memoCount, accent: '#F59E0B', suffix: '개' },
                { label: '이번 달 작성', value: memoThisMonth, accent: '#10B981', suffix: '개' },
                { label: '최근 7일', value: memoWeekly.reduce((s, d) => s + d.메모, 0), accent: '#2563EB', suffix: '개' },
              ]}
            />
          </CardGrid>
        </>
      )}

      {/* ─── 체크리스트 통계 ─── */}
      {checklists.length > 0 && (
        <>
          <SectionTitle icon={<CheckCheck size={15} style={{ color: '#0EA5E9' }} />} title="체크리스트" mt={28} />
          <CardGrid minColumn={380}>
            <ChartCard title="체크리스트별 완료율">
              <div className="flex flex-col" style={{ gap: 12, padding: '6px 2px' }}>
                {checklists.map((c) => (
                  <div key={c.id} className="flex items-center" style={{ gap: 12 }}>
                    <span className="text-xs font-bold text-[var(--text-secondary)] truncate" style={{ minWidth: 110, maxWidth: 180 }}>
                      {c.title}
                    </span>
                    <div className="flex-1 h-6 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${c.pct}%`,
                          background: `linear-gradient(90deg, #0EA5E9 0%, #0284C7 100%)`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums" style={{ width: 70, textAlign: 'right' }}>
                      {c.done}/{c.total}
                    </span>
                  </div>
                ))}
              </div>
            </ChartCard>
            <BigStatCard
              metrics={[
                { label: '체크리스트', value: checklists.length, accent: '#0EA5E9', suffix: '개' },
                { label: '전체 항목', value: checklists.reduce((s, c) => s + c.total, 0), accent: '#10B981', suffix: '개' },
                { label: '완료 항목', value: checklists.reduce((s, c) => s + c.done, 0), accent: '#F59E0B', suffix: '개' },
              ]}
            />
          </CardGrid>
        </>
      )}

      {/* ─── 개인 루틴 통계 ─── */}
      {routines.some((r) => r.kind === 'personal') && (
        <>
          <SectionTitle icon={<Repeat size={15} style={{ color: '#8B5CF6' }} />} title="개인 루틴" mt={28} />
          <CardGrid minColumn={380}>
            <RoutineKindStats
              rows={routines.filter((r) => r.kind === 'personal')}
              barFrom="#8B5CF6" barTo="#6D28D9"
              metricColors={['#8B5CF6', '#10B981', '#2563EB']}
            />
          </CardGrid>
        </>
      )}

      {/* ─── 학급 체크 통계 ─── */}
      {routines.some((r) => r.kind === 'classroom') && (
        <>
          <SectionTitle icon={<Users size={15} style={{ color: '#0EA5E9' }} />} title="학급 체크" mt={28} />
          <CardGrid minColumn={380}>
            <RoutineKindStats
              rows={routines.filter((r) => r.kind === 'classroom')}
              barFrom="#0EA5E9" barTo="#0284C7"
              metricColors={['#0EA5E9', '#10B981', '#2563EB']}
            />
          </CardGrid>
        </>
      )}

      {/* ─── 습관 통계 ─── */}
      {habits.length > 0 && (
        <>
          <SectionTitle icon={<Flame size={15} style={{ color: '#F97316' }} />} title="습관" mt={28} />
          <CardGrid minColumn={380}>
            <ChartCard title="최근 7일 체크 합계">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={habitWeekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-widget)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="체크" fill="#F97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="습관별 streak">
              <div className="flex flex-col" style={{ gap: 12, padding: '6px 2px' }}>
                {habits.map((h) => {
                  const max = Math.max(habitTotals.longest, 1)
                  const pct = (h.streak_current / max) * 100
                  return (
                    <div key={h.id} className="flex items-center" style={{ gap: 12 }}>
                      <span className="text-xs font-bold text-[var(--text-secondary)] truncate flex items-center" style={{ minWidth: 130, maxWidth: 220, gap: 6 }}>
                        <span style={{ fontSize: 14 }}>{h.icon}</span>
                        {h.title}
                      </span>
                      <div className="flex-1 h-6 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, #F97316 0%, #C2410C 100%)`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums" style={{ width: 60, textAlign: 'right' }}>
                        {h.streak_current}일
                      </span>
                    </div>
                  )
                })}
              </div>
            </ChartCard>

            <BigStatCard
              metrics={[
                { label: '오늘 완료', value: habitTotals.todayDone, accent: '#F97316', suffix: `/${habits.length}개` },
                { label: '역대 최장', value: habitTotals.longest, accent: '#EF4444', suffix: '일' },
                { label: '누적 체크', value: habitTotals.totalDays, accent: '#8B5CF6', suffix: '일' },
              ]}
            />
          </CardGrid>
        </>
      )}

      {/* ─── 학생 기록 통계 ─── */}
      <SectionTitle icon={<ShieldCheck size={15} style={{ color: '#8B5CF6' }} />} title="학생 기록" mt={28} />
      {studentLocked ? (
        <div
          className="glass flex items-center"
          style={{ padding: '22px 24px', gap: 16 }}
        >
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
              color: '#fff',
              boxShadow: '0 8px 20px rgba(239,68,68,0.32)',
            }}
          >
            <Lock size={22} strokeWidth={2.4} />
          </div>
          <div>
            <div className="font-bold text-[var(--text-primary)]" style={{ fontSize: 15, letterSpacing: '-0.2px' }}>
              학생 기록 통계는 잠금 해제 후에 표시돼요
            </div>
            <div className="text-[var(--text-muted)]" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5, letterSpacing: '-0.2px' }}>
              학생 정보 보호를 위해 통계도 잠금 상태에선 노출되지 않습니다. 좌측 사이드바 “학생 기록” 탭에서 비밀번호를 입력해 주세요.
            </div>
          </div>
        </div>
      ) : studentRecords.length === 0 ? (
        <div
          className="glass flex items-center justify-center text-[var(--text-muted)] text-sm"
          style={{ padding: '28px 24px' }}
        >
          아직 학생 기록이 없어요
        </div>
      ) : (
        <CardGrid minColumn={380}>
          <ChartCard title="태그별 분포">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={studentByTag} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(((percent as number | undefined) ?? 0) * 100).toFixed(0)}%`}>
                  {studentByTag.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="학생별 기록 수 (Top 8)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={studentByStudent} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-widget)" />
                <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} width={70} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#8B5CF6" radius={[0, 4, 4, 0]} name="기록 수" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <BigStatCard
            metrics={[
              { label: '총 기록 수', value: studentRecords.length, accent: '#8B5CF6', suffix: '건' },
              { label: '학생 수', value: studentByStudent.length, accent: '#0EA5E9', suffix: '명' },
              { label: '이번 달 추가', value: studentRecords.filter((r) => {
                const d = new Date(r.created_at)
                const now = new Date()
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
              }).length, accent: '#10B981', suffix: '건' },
            ]}
          />
        </CardGrid>
      )}
    </div>
  )
}

/* ─── 공용 컴포넌트 ─── */

const tooltipStyle = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-widget)',
  borderRadius: 10,
  fontSize: 12,
}

function SectionTitle({ icon, title, mt = 0 }: { icon: React.ReactNode; title: string; mt?: number }): React.ReactElement {
  return (
    <div
      className="flex items-center"
      style={{ gap: 8, marginTop: mt, marginBottom: 12 }}
    >
      {icon}
      <h2 className="font-bold text-[var(--text-primary)]" style={{ fontSize: 15.5, letterSpacing: '-0.3px' }}>
        {title}
      </h2>
    </div>
  )
}

function CardGrid({ children, minColumn = 280 }: { children: React.ReactNode; minColumn?: number }): React.ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${minColumn}px, 100%), 1fr))`,
        gap: 16,
      }}
    >
      {children}
    </div>
  )
}

function SummaryCard({
  icon: Icon, label, value, accent, sub,
}: {
  icon: typeof TrendingUp
  label: string
  value: string
  accent: string
  sub?: string
}): React.ReactElement {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass flex items-center"
      style={{ padding: '16px 18px', gap: 14 }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 44, height: 44, borderRadius: 13,
          background: `linear-gradient(135deg, ${accent}22 0%, ${accent}10 100%)`,
          color: accent,
        }}
      >
        <Icon size={20} strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[var(--text-muted)] truncate" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '-0.2px' }}>
          {label}
        </div>
        <div className="font-black text-[var(--text-primary)] tabular-nums" style={{ fontSize: 22, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
          {value}
        </div>
        {sub && (
          <div className="text-[var(--text-muted)] truncate" style={{ fontSize: 11, fontWeight: 600, marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass flex flex-col"
      style={{ padding: 18 }}
    >
      <h3 className="font-bold text-[var(--text-primary)]" style={{ fontSize: 13.5, letterSpacing: '-0.2px', marginBottom: 12 }}>
        {title}
      </h3>
      <div className="flex-1 min-h-0">{children}</div>
    </motion.div>
  )
}

function BigStatCard({
  metrics,
}: {
  metrics: { label: string; value: number; accent: string; suffix: string }[]
}): React.ReactElement {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass flex flex-col"
      style={{ padding: 18, gap: 12 }}
    >
      <h3 className="font-bold text-[var(--text-primary)]" style={{ fontSize: 13.5, letterSpacing: '-0.2px', marginBottom: 4 }}>
        요약
      </h3>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${metrics.length}, 1fr)`, gap: 12 }}>
        {metrics.map((m) => (
          <div
            key={m.label}
            className="flex flex-col"
            style={{
              padding: 14,
              borderRadius: 12,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-widget)',
              gap: 4,
            }}
          >
            <div className="text-[var(--text-muted)]" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 'normal', textTransform: 'uppercase' }}>
              {m.label}
            </div>
            <div className="flex items-baseline" style={{ gap: 3 }}>
              <span className="tabular-nums font-black" style={{ fontSize: 28, color: m.accent, letterSpacing: '-0.04em', lineHeight: 1 }}>
                {m.value}
              </span>
              <span className="font-bold text-[var(--text-secondary)]" style={{ fontSize: 12 }}>
                {m.suffix}
              </span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

function RoutineKindStats({
  rows, barFrom, barTo, metricColors,
}: {
  rows: RoutineAgg[]
  barFrom: string
  barTo: string
  metricColors: [string, string, string]
}): React.ReactElement {
  return (
    <>
      <ChartCard title="항목별 오늘 진행">
        <div className="flex flex-col" style={{ gap: 12, padding: '6px 2px' }}>
          {rows.map((r) => {
            const pct = r.itemCount > 0 ? Math.round((r.todayDone / r.itemCount) * 100) : 0
            return (
              <div key={r.id} className="flex items-center" style={{ gap: 12 }}>
                <span className="text-xs font-bold text-[var(--text-secondary)] truncate" style={{ minWidth: 110, maxWidth: 180 }}>
                  {r.name}
                </span>
                <div className="flex-1 h-6 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${barFrom} 0%, ${barTo} 100%)`,
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums" style={{ width: 70, textAlign: 'right' }}>
                  {r.todayDone}/{r.itemCount}
                </span>
              </div>
            )
          })}
        </div>
      </ChartCard>
      <BigStatCard
        metrics={[
          { label: '개수', value: rows.length, accent: metricColors[0], suffix: '개' },
          { label: '오늘 체크', value: rows.reduce((s, r) => s + r.todayDone, 0), accent: metricColors[1], suffix: '개' },
          { label: '최근 7일 누적', value: rows.reduce((s, r) => s + r.totalCompletions, 0), accent: metricColors[2], suffix: '회' },
        ]}
      />
    </>
  )
}

// 사용하지 않는 시각 보조 컴포넌트 — 향후 확장 대비. 빌드 영향 X
void Award; void Clock; void BarChart3
