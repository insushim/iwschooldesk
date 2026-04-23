import { useState, useRef, useCallback, useEffect } from 'react'
import { playBellSound } from '../lib/sound'
import { useAppStore } from '../stores/app.store'

type TimerMode = 'pomodoro' | 'class' | 'free'
type TimerState = 'idle' | 'running' | 'paused'
type PomodoroPhase = 'work' | 'break' | 'longBreak'

interface TimerConfig {
  workMinutes: number
  breakMinutes: number
  longBreakMinutes: number
}

export function useTimer(config: TimerConfig = { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 }) {
  const [mode, setMode] = useState<TimerMode>('pomodoro')
  const [state, setState] = useState<TimerState>('idle')
  const [secondsLeft, setSecondsLeft] = useState(config.workMinutes * 60)
  const [totalSeconds, setTotalSeconds] = useState(config.workMinutes * 60)
  const [pomodoroCount, setPomodoroCount] = useState(0)
  const [phase, setPhase] = useState<PomodoroPhase>('work')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    clearTimer()
    setState('running')
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearTimer()
          setState('idle')

          const settings = useAppStore.getState().settings
          const notify = (title: string, body: string) => {
            if (settings?.notification_enabled !== false) {
              window.api.system.showNotification(title, body)
            }
            if (settings?.notification_sound !== false) {
              playBellSound()
            }
          }

          if (mode === 'pomodoro') {
            if (phase === 'work') {
              const newCount = pomodoroCount + 1
              setPomodoroCount(newCount)
              if (newCount % 4 === 0) {
                setPhase('longBreak')
                const total = config.longBreakMinutes * 60
                setTotalSeconds(total)
                notify('집중 완료 🔔', '긴 휴식 시간이에요. 잘 쉬세요')
                return total
              } else {
                setPhase('break')
                const total = config.breakMinutes * 60
                setTotalSeconds(total)
                notify('집중 완료 🔔', '잠깐 쉬어요')
                return total
              }
            } else {
              setPhase('work')
              const total = config.workMinutes * 60
              setTotalSeconds(total)
              notify('휴식 끝 🔔', '다시 집중할 시간이에요')
              return total
            }
          }

          notify(
            '타이머 완료 🔔',
            phase === 'work' ? '휴식 시간이에요! 잘했어요' : '다시 집중할 시간이에요'
          )
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [clearTimer, mode, phase, pomodoroCount, config])

  const pause = useCallback(() => {
    clearTimer()
    setState('paused')
  }, [clearTimer])

  const reset = useCallback(() => {
    clearTimer()
    setState('idle')
    setPhase('work')
    setPomodoroCount(0)
    const total = config.workMinutes * 60
    setSecondsLeft(total)
    setTotalSeconds(total)
  }, [clearTimer, config])

  const setFreeTime = useCallback((minutes: number) => {
    clearTimer()
    setState('idle')
    setMode('free')
    const total = minutes * 60
    setSecondsLeft(total)
    setTotalSeconds(total)
  }, [clearTimer])

  const setFreeTimeSeconds = useCallback((totalSec: number) => {
    clearTimer()
    setState('idle')
    setMode('free')
    const clamped = Math.max(1, Math.min(99 * 60 + 59, Math.floor(totalSec)))
    setSecondsLeft(clamped)
    setTotalSeconds(clamped)
  }, [clearTimer])

  useEffect(() => {
    return clearTimer
  }, [clearTimer])

  const progress = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  return {
    mode, setMode,
    state, phase,
    secondsLeft, totalSeconds, progress,
    pomodoroCount,
    display, minutes, seconds,
    start, pause, reset, setFreeTime, setFreeTimeSeconds,
  }
}
