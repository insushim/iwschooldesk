import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Plus, FileUp, X, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getCalendarDays, isToday, isSameDay, formatDate, parseISO } from '../../lib/date-utils'
import type { Schedule } from '../../types/schedule.types'
import { useDataChange } from '../../hooks/useDataChange'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'
import { importScheduleFile } from '../../lib/schedule-import'
import { getRedDayInfo, getKoreanHoliday, isDuplicateOfHoliday } from '../../lib/holidays'

/**
 * 달력 위젯 — 교사 참고용.
 *  - 월간 그리드 + 오늘 강조
 *  - 선택 날짜의 일정 리스트
 *  - 파일(.csv / .ics) 로 한 번에 일정 import
 */
export function CalendarWidget() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [importResult, setImportResult] = useState<string | null>(null)
  const [showImportHint, setShowImportHint] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const reloadSchedules = useCallback(() => {
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-31`
    window.api.schedule.list({ startDate, endDate }).then(setSchedules)
  }, [year, month])

  useEffect(() => { reloadSchedules() }, [reloadSchedules])
  useDataChange('schedule', reloadSchedules)
  useAutoRefresh(reloadSchedules)

  const days = useMemo(() => getCalendarDays(year, month), [year, month])

  // 다일 일정은 start~end 구간 모든 날짜에 표시.
  // 단, 제목에 "주간"이 들어간 장기 일정은 주말(토·일)에 표시하지 않는다(학교일만).
  const getSchedulesForDay = (date: Date): Schedule[] => {
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59)
    const dow = date.getDay() // 0=일, 6=토
    return schedules.filter((s) => {
      const start = parseISO(s.start_date)
      const end = s.end_date ? parseISO(s.end_date) : start
      const inRange = start <= dayEnd && end >= dayStart
      if (!inRange) return false
      // "주간" 일정은 평일(월~금)에만
      if (/주간/.test(s.title) && (dow === 0 || dow === 6)) return false
      return true
    })
  }

  const selectedSchedules = selectedDate
    ? getSchedulesForDay(selectedDate).filter(
        (s) => !isDuplicateOfHoliday(s.title, getKoreanHoliday(selectedDate)?.name ?? null)
      )
    : []

  /** 파일을 읽어 일정 bulk 추가. 지원 형식: .csv / .ics / .xlsx / .docx / .hwp. */
  /** 공유 라이브러리 호출 — 에러 상세 그대로 노출. */
  const handleFilePicked = async (file: File): Promise<void> => {
    setImportResult('파일 읽는 중...')
    const result = await importScheduleFile(file)
    if (result.ok) {
      reloadSchedules()
      setImportResult(`${result.count}개 일정 추가됨`)
    } else {
      setImportResult(result.error)
    }
    setTimeout(() => setImportResult(null), 6000)
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{
        // containerType: size → 모든 자식이 cqmin 단위로 위젯 크기 비례 스케일.
        containerType: 'size',
        padding: 'clamp(10px, 2.5cqmin, 20px) clamp(14px, 3.5cqmin, 28px) clamp(16px, 4cqmin, 30px)',
        background: 'radial-gradient(ellipse at 100% 0%, rgba(16,185,129,0.06) 0%, transparent 55%)',
      }}
    >
      {/* Month Navigation — 모든 사이즈 cqmin 기반 */}
      <div className="flex items-center justify-between shrink-0" style={{ marginBottom: 'clamp(6px, 2cqmin, 14px)' }}>
        <button
          onClick={() => setCurrentDate(new Date(year, month - 1))}
          className="flex items-center justify-center rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
          style={{
            width: 'clamp(22px, 6cqmin, 34px)',
            height: 'clamp(22px, 6cqmin, 34px)',
            color: 'var(--text-muted)',
          }}
        >
          <ChevronLeft style={{ width: 'clamp(12px, 3.5cqmin, 20px)', height: 'clamp(12px, 3.5cqmin, 20px)' }} />
        </button>
        <span
          className="tabular-nums"
          style={{
            fontSize: 'clamp(12px, 3.8cqmin, 20px)',
            fontWeight: 900,
            letterSpacing: '-0.035em',
            background: 'linear-gradient(180deg, var(--text-primary) 0%, #10B981 140%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {year}년 {month + 1}월
        </span>
        <div className="flex items-center" style={{ gap: 'clamp(2px, 0.8cqmin, 5px)' }}>
          <button
            onClick={() => setShowImportHint(true)}
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{
              width: 'clamp(22px, 6cqmin, 34px)',
              height: 'clamp(22px, 6cqmin, 34px)',
              color: '#10B981',
              border: '1px solid rgba(16,185,129,0.28)',
            }}
            title="학사일정·교육과정 파일 가져오기"
          >
            <FileUp strokeWidth={2.2} style={{ width: 'clamp(10px, 3cqmin, 16px)', height: 'clamp(10px, 3cqmin, 16px)' }} />
          </button>
          <button
            onClick={async () => {
              if (schedules.length === 0) {
                setImportResult('삭제할 일정이 없어요')
                setTimeout(() => setImportResult(null), 2500)
                return
              }
              if (!window.confirm(`정말 ${schedules.length}개 일정을 모두 삭제할까요?\n\n되돌릴 수 없습니다.`)) return
              const n = await window.api.schedule.deleteAll()
              setImportResult(`${n}개 일정을 삭제했어요`)
              setTimeout(() => setImportResult(null), 3000)
            }}
            className="flex items-center justify-center rounded-lg transition-colors hover:bg-red-500/10"
            style={{
              width: 'clamp(22px, 6cqmin, 34px)',
              height: 'clamp(22px, 6cqmin, 34px)',
              color: '#EF4444',
              border: '1px solid rgba(239,68,68,0.28)',
            }}
            title="모든 일정 삭제 (되돌릴 수 없음)"
          >
            <Trash2 strokeWidth={2.2} style={{ width: 'clamp(10px, 3cqmin, 16px)', height: 'clamp(10px, 3cqmin, 16px)' }} />
          </button>
          <button
            onClick={() => setCurrentDate(new Date(year, month + 1))}
            className="flex items-center justify-center rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
            style={{
              width: 'clamp(22px, 6cqmin, 34px)',
              height: 'clamp(22px, 6cqmin, 34px)',
              color: 'var(--text-muted)',
            }}
          >
            <ChevronRight style={{ width: 'clamp(12px, 3.5cqmin, 20px)', height: 'clamp(12px, 3.5cqmin, 20px)' }} />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.ics,.ical,.xlsx,.xls,.xlsm,.ods,.docx,.doc,.hwp,.hwpx,.pdf,.txt,.md,text/calendar,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFilePicked(f)
            e.target.value = '' // 같은 파일 재선택 가능하도록 리셋
          }}
        />
      </div>

      {/* Import result notification */}
      {importResult && (
        <div
          className="shrink-0"
          style={{
            marginBottom: 6,
            padding: '6px 10px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            backgroundColor: 'rgba(16,185,129,0.14)',
            color: '#047857',
            letterSpacing: '-0.2px',
          }}
        >
          {importResult}
        </div>
      )}

      {/* Day Headers — 학교는 주5일제. 토요일도 일요일과 같이 빨간 날로 표시. */}
      <div className="grid grid-cols-7 shrink-0" style={{ gap: 'clamp(0.5px, 0.3cqmin, 2px)', marginBottom: 'clamp(2px, 0.8cqmin, 5px)' }}>
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div
            key={d}
            className="text-center"
            style={{
              fontSize: 'clamp(9.5px, 2.8cqmin, 15px)',
              fontWeight: 800,
              padding: 'clamp(2px, 0.9cqmin, 5px) 0',
              letterSpacing: '-0.2px',
              color: i === 0 || i === 6 ? '#EF4444' : 'var(--text-secondary)',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid — 각 셀: 날짜 + 그 아래 작은 일정 텍스트 2줄(+추가 개수) */}
      <div className="grid grid-cols-7 flex-1 min-h-0" style={{ gap: 'clamp(1px, 0.5cqmin, 3px)' }}>
        {days.map((date, idx) => {
          const isCurrentMonth = date.getMonth() === month
          const today = isToday(date)
          const selected = selectedDate && isSameDay(date, selectedDate)
          const daySchedules = getSchedulesForDay(date)
          // 공휴일·토·일·재량휴업 여부 — 학교 주5일제라 토요일도 빨간날.
          const redDay = getRedDayInfo(date, daySchedules.map((s) => s.title))
          const holidayName = getKoreanHoliday(date)?.name ?? null
          // 공휴일 빨간 라벨로 이미 표시된 항목은 사용자 일정 칩에서 제외 (중복 방지).
          const visibleSchedules = holidayName
            ? daySchedules.filter((s) => !isDuplicateOfHoliday(s.title, holidayName))
            : daySchedules

          const dateColor = today
            ? '#fff'
            : selected
              ? '#047857'
              : redDay.isOff
                ? '#EF4444'
                : 'var(--text-primary)'

          return (
            <motion.button
              key={idx}
              onClick={() => setSelectedDate(date)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="relative flex flex-col items-stretch transition-all overflow-hidden"
              style={{
                letterSpacing: '-0.02em',
                borderRadius: 'clamp(5px, 1.8cqmin, 12px)',
                padding: 'clamp(2px, 0.9cqmin, 5px) clamp(2px, 0.7cqmin, 4px)',
                opacity: !isCurrentMonth ? 0.38 : 1,
                background: today
                  ? 'linear-gradient(135deg, #10B981 0%, #047857 100%)'
                  : selected
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.14), rgba(16,185,129,0.24))'
                    : 'transparent',
                boxShadow: today ? '0 4px 14px rgba(16,185,129,0.42)' : undefined,
                border: selected && !today ? '1px solid rgba(16,185,129,0.4)' : '1px solid transparent',
                gap: 'clamp(1px, 0.35cqmin, 3px)',
              }}
            >
              <span
                style={{
                  // 기본 날짜 숫자 — 조금 더 키워 가독성 up. clamp 범위 확대.
                  fontSize: 'clamp(12px, 3.7cqmin, 20px)',
                  fontWeight: today ? 900 : 700,
                  color: dateColor,
                  lineHeight: 1,
                  textAlign: 'center',
                  letterSpacing: '-0.02em',
                }}
              >
                {date.getDate()}
              </span>
              {(visibleSchedules.length > 0 || holidayName) && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'clamp(0.5px, 0.25cqmin, 2px)',
                    overflow: 'hidden',
                    minHeight: 0,
                  }}
                >
                  {holidayName && (
                    <div
                      title={holidayName}
                      style={{
                        fontSize: 'clamp(7.5px, 1.8cqmin, 11px)',
                        fontWeight: 800,
                        lineHeight: 1.18,
                        color: today ? '#fff' : '#B91C1C',
                        background: today ? 'rgba(255,255,255,0.22)' : 'rgba(239,68,68,0.14)',
                        padding: 'clamp(1px, 0.3cqmin, 2px) clamp(2px, 0.6cqmin, 4px)',
                        borderRadius: 'clamp(2px, 0.6cqmin, 4px)',
                        textAlign: 'center',
                        whiteSpace: 'normal',
                        wordBreak: 'keep-all',
                        overflowWrap: 'anywhere',
                        letterSpacing: '-0.3px',
                      }}
                    >
                      {holidayName}
                    </div>
                  )}
                  {visibleSchedules.slice(0, holidayName ? 2 : 3).map((s) => {
                    const sc = s.color ?? '#10B981'
                    return (
                      <div
                        key={s.id}
                        title={s.title}
                        style={{
                          fontSize: 'clamp(7.5px, 1.8cqmin, 11px)',
                          fontWeight: 700,
                          lineHeight: 1.18,
                          color: today
                            ? 'rgba(255,255,255,0.96)'
                            : `color-mix(in srgb, ${sc} 62%, #000)`,
                          background: today
                            ? 'rgba(255,255,255,0.22)'
                            : `${sc}1C`,
                          padding: 'clamp(1px, 0.3cqmin, 2px) clamp(2px, 0.6cqmin, 4px)',
                          borderRadius: 'clamp(2px, 0.6cqmin, 4px)',
                          textAlign: 'center',
                          whiteSpace: 'normal',
                          wordBreak: 'keep-all',
                          overflowWrap: 'anywhere',
                          letterSpacing: '-0.3px',
                        }}
                      >
                        {s.title}
                      </div>
                    )
                  })}
                  {(() => {
                    const shown = holidayName ? 2 : 3
                    const remain = visibleSchedules.length - shown
                    if (remain <= 0) return null
                    return (
                      <span
                        style={{
                          fontSize: 'clamp(6.5px, 1.5cqmin, 9.5px)',
                          fontWeight: 800,
                          color: today ? 'rgba(255,255,255,0.88)' : 'var(--text-muted)',
                          lineHeight: 1.1,
                          letterSpacing: '-0.2px',
                          textAlign: 'center',
                        }}
                      >
                        +{remain}
                      </span>
                    )
                  })()}
                </div>
              )}
            </motion.button>
          )
        })}
      </div>

      {/* 날짜 클릭 → 위젯을 덮는 오버레이 시트: 상세 보기 · 추가 · 삭제 */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            key="sched-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: 'rgba(15,23,42,0.30)',
              backdropFilter: 'blur(3px)',
              padding: 'clamp(10px, 3cqmin, 24px)',
              zIndex: 50,
            }}
            onClick={() => { setSelectedDate(null); setAdding(false); setNewTitle('') }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 6, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col w-full"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 'min(420px, 92%)',
                maxHeight: '94%',
                padding: 'clamp(12px, 3cqmin, 18px) clamp(14px, 3.2cqmin, 20px)',
                borderRadius: 16,
                background: 'var(--bg-widget)',
                border: '1px solid var(--border-widget)',
                boxShadow: '0 14px 40px rgba(15,23,42,0.22)',
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <span
                  style={{
                    fontSize: 'clamp(13px, 2.8cqmin, 17px)',
                    fontWeight: 900,
                    letterSpacing: '-0.25px',
                    color: 'var(--text-primary)',
                  }}
                >
                  {formatDate(selectedDate, 'M월 d일')}
                  {(() => {
                    const dow = selectedDate.getDay()
                    const isWeekend = dow === 0 || dow === 6
                    const hol = getKoreanHoliday(selectedDate)
                    const color = isWeekend || hol ? '#EF4444' : 'var(--text-muted)'
                    return (
                      <span style={{ marginLeft: 6, fontSize: '0.8em', fontWeight: 700, color }}>
                        ({['일', '월', '화', '수', '목', '금', '토'][dow]})
                      </span>
                    )
                  })()}
                  {(() => {
                    const hol = getKoreanHoliday(selectedDate)
                    if (!hol) return null
                    return (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: '0.75em',
                          fontWeight: 800,
                          color: '#B91C1C',
                          background: 'rgba(239,68,68,0.12)',
                          padding: '2px 8px',
                          borderRadius: 999,
                          letterSpacing: '-0.2px',
                        }}
                      >
                        {hol.name}
                      </span>
                    )
                  })()}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setAdding(true); setNewTitle('') }}
                    className="flex items-center justify-center hover:opacity-85 transition-opacity"
                    style={{
                      width: 28, height: 28, borderRadius: 9,
                      background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
                      color: '#fff',
                      boxShadow: '0 3px 10px rgba(16,185,129,0.32)',
                    }}
                    title="일정 추가"
                  >
                    <Plus size={14} strokeWidth={2.6} />
                  </button>
                  <button
                    onClick={() => { setSelectedDate(null); setAdding(false); setNewTitle('') }}
                    className="flex items-center justify-center transition-colors"
                    style={{
                      width: 28, height: 28, borderRadius: 9,
                      color: 'var(--text-muted)',
                      background: 'var(--bg-secondary)',
                    }}
                    title="닫기"
                  >
                    <X size={14} strokeWidth={2.4} />
                  </button>
                </div>
              </div>

              {adding && (
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && newTitle.trim() && selectedDate) {
                      const dateStr = formatDate(selectedDate, 'yyyy-MM-dd')
                      await window.api.schedule.create({
                        title: newTitle.trim(),
                        start_date: dateStr,
                        all_day: 1,
                      })
                      reloadSchedules()
                      setAdding(false)
                      setNewTitle('')
                    }
                    if (e.key === 'Escape') { setAdding(false); setNewTitle('') }
                  }}
                  onBlur={() => { if (!newTitle.trim()) setAdding(false) }}
                  placeholder="일정 제목... (Enter)"
                  className="w-full outline-none"
                  style={{
                    fontSize: 14,
                    padding: '9px 12px',
                    marginBottom: 8,
                    borderRadius: 10,
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1.5px solid #10B981',
                    letterSpacing: '-0.2px',
                    fontWeight: 700,
                  }}
                />
              )}

              <div
                className="overflow-y-auto flex flex-col"
                style={{ gap: 4, minHeight: 0, paddingRight: 2 }}
              >
                {selectedSchedules.length === 0 && !adding ? (
                  <div
                    className="text-center"
                    style={{
                      fontSize: 13,
                      color: 'var(--text-muted)',
                      padding: '14px 0',
                      fontWeight: 600,
                      letterSpacing: '-0.2px',
                    }}
                  >
                    일정이 없습니다
                  </div>
                ) : (
                  selectedSchedules.map((s) => {
                    const sc = s.color ?? '#10B981'
                    return (
                      <div
                        key={s.id}
                        className="flex items-center group"
                        style={{
                          gap: 10,
                          padding: '8px 10px',
                          borderRadius: 10,
                          background: `linear-gradient(135deg, ${sc}10 0%, ${sc}1A 100%)`,
                          border: `1px solid ${sc}2E`,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 6, height: 22, borderRadius: 3,
                            backgroundColor: sc,
                            flexShrink: 0,
                            boxShadow: `0 0 0 2px ${sc}22`,
                          }}
                        />
                        <span
                          className="content-wrap flex-1 min-w-0"
                          style={{
                            // 행사 제목 폰트 살짝 업 — 가독성 개선.
                            fontSize: 14.5,
                            fontWeight: 700,
                            color: `color-mix(in srgb, ${sc} 55%, #000)`,
                            letterSpacing: '-0.2px',
                            lineHeight: 1.3,
                          }}
                        >
                          {s.title}
                        </span>
                        <button
                          onClick={async () => {
                            await window.api.schedule.delete(s.id)
                            reloadSchedules()
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shrink-0"
                          style={{
                            width: 24, height: 24, borderRadius: 7,
                            color: '#EF4444',
                            background: 'rgba(239,68,68,0.1)',
                          }}
                          title="삭제"
                        >
                          <Trash2 size={12} strokeWidth={2.4} />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 파일 가져오기 안내 시트 — FileUp 버튼 클릭 시, 어떤 파일을 올려야 하는지 먼저 안내 */}
      <AnimatePresence>
        {showImportHint && (
          <motion.div
            key="import-hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: 'rgba(15,23,42,0.32)',
              backdropFilter: 'blur(3px)',
              padding: 'clamp(10px, 3cqmin, 24px)',
              zIndex: 60,
            }}
            onClick={() => setShowImportHint(false)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 8, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col w-full"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 'min(380px, 92%)',
                padding: 'clamp(14px, 3.2cqmin, 20px) clamp(16px, 3.6cqmin, 22px)',
                borderRadius: 16,
                background: 'var(--bg-widget)',
                border: '1px solid var(--border-widget)',
                boxShadow: '0 14px 40px rgba(15,23,42,0.22)',
              }}
            >
              <div
                className="flex items-center gap-2"
                style={{ marginBottom: 10 }}
              >
                <span
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
                    color: '#fff',
                    boxShadow: '0 3px 10px rgba(16,185,129,0.32)',
                  }}
                >
                  <FileUp size={15} strokeWidth={2.6} />
                </span>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 900,
                    letterSpacing: '-0.25px',
                    color: 'var(--text-primary)',
                  }}
                >
                  학사일정 · 교육과정 파일 올리기
                </span>
              </div>
              <p
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: 'var(--text-secondary)',
                  letterSpacing: '-0.2px',
                  marginBottom: 8,
                  fontWeight: 600,
                }}
              >
                학교에서 받은 <b style={{ color: 'var(--text-primary)' }}>학사일정표·교육과정 파일</b>을 올리면
                날짜와 행사명을 자동으로 읽어 달력에 추가합니다.
              </p>
              <div
                style={{
                  fontSize: 11.5,
                  padding: '8px 10px',
                  borderRadius: 8,
                  backgroundColor: 'rgba(16,185,129,0.10)',
                  border: '1px solid rgba(16,185,129,0.22)',
                  color: '#047857',
                  fontWeight: 700,
                  letterSpacing: '-0.2px',
                  marginBottom: 14,
                }}
              >
                지원 형식 · <span className="tabular-nums">.hwp · .xlsx · .docx · .csv · .ics</span>
                <div style={{ marginTop: 4, fontSize: 11, color: '#059669', fontWeight: 600 }}>
                  "주간"이 들어간 행사는 자동으로 1주일 일정으로 펼쳐져요.
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowImportHint(false)}
                  className="flex-1"
                  style={{
                    padding: '9px 12px',
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 10,
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-widget)',
                  }}
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    setShowImportHint(false)
                    fileInputRef.current?.click()
                  }}
                  className="flex-1"
                  style={{
                    padding: '9px 12px',
                    fontSize: 13,
                    fontWeight: 800,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
                    color: '#fff',
                    boxShadow: '0 4px 12px rgba(16,185,129,0.38)',
                    letterSpacing: '-0.2px',
                  }}
                >
                  파일 선택
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

