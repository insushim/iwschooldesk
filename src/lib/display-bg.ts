import { useCallback, useEffect, useState } from 'react'

/**
 * 디스플레이 모드 배경 프리셋.
 *
 * 전자칠판에서 학생들에게 보여줄 때 교사가 교실 분위기/조명에 맞춰 배경을 고를 수 있다.
 * `bg === null` 이면 위젯의 기본 배경(차분한 라이트)을 사용.
 * `textMode` 는 본문 글자의 기본 대비 색을 결정 — 'light' = 어두운 배경 위 밝은 글자, 'dark' = 밝은 배경 위 어두운 글자.
 */
export type DisplayBgMode = 'light' | 'dark'

export type DisplayBgPreset = {
  id: string
  label: string
  /** CSS background — null 이면 위젯 기본 배경 유지 */
  bg: string | null
  textMode: DisplayBgMode
  /** 팔레트 버튼의 작은 원 미리보기 색 */
  preview: string
  /** 은은한 글로우 오버레이(선택) */
  glow?: string
}

export const DISPLAY_BG_PRESETS: DisplayBgPreset[] = [
  {
    id: 'default',
    label: '기본',
    bg: null,
    textMode: 'dark',
    preview: 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)',
  },
  {
    id: 'indigo',
    label: '네이비',
    bg: 'linear-gradient(135deg, #1E3A8A 0%, #312E81 50%, #4338CA 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #1E3A8A, #4338CA)',
    glow:
      'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.18) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(168,85,247,0.22) 0%, transparent 60%)',
  },
  {
    id: 'sky',
    label: '하늘',
    bg: 'linear-gradient(135deg, #0C4A6E 0%, #0369A1 50%, #0EA5E9 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #0C4A6E, #0EA5E9)',
    glow:
      'radial-gradient(circle at 20% 15%, rgba(255,255,255,0.18) 0%, transparent 50%), radial-gradient(circle at 90% 90%, rgba(56,189,248,0.25) 0%, transparent 60%)',
  },
  {
    id: 'emerald',
    label: '숲',
    bg: 'linear-gradient(135deg, #064E3B 0%, #065F46 50%, #059669 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #064E3B, #10B981)',
    glow:
      'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 90%, rgba(52,211,153,0.25) 0%, transparent 60%)',
  },
  {
    id: 'sunset',
    label: '노을',
    bg: 'linear-gradient(135deg, #7C2D12 0%, #C2410C 50%, #F97316 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #7C2D12, #F97316)',
    glow:
      'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.18) 0%, transparent 50%), radial-gradient(circle at 85% 85%, rgba(251,146,60,0.3) 0%, transparent 60%)',
  },
  {
    id: 'rose',
    label: '벚꽃',
    bg: 'linear-gradient(135deg, #831843 0%, #BE185D 50%, #EC4899 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #831843, #EC4899)',
    glow:
      'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.18) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(244,114,182,0.28) 0%, transparent 60%)',
  },
  {
    id: 'charcoal',
    label: '차콜',
    bg: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #334155 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #0F172A, #334155)',
    glow:
      'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.12) 0%, transparent 55%), radial-gradient(circle at 90% 90%, rgba(148,163,184,0.18) 0%, transparent 60%)',
  },
  {
    id: 'cream',
    label: '크림',
    bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 50%, #FBBF24 100%)',
    textMode: 'dark',
    preview: 'linear-gradient(135deg, #FEF3C7, #FBBF24)',
  },
]

const storageKey = (widgetId: string): string => `widget:${widgetId}:displayBg`

export function getDisplayBgPreset(id: string | null | undefined): DisplayBgPreset {
  if (!id) return DISPLAY_BG_PRESETS[0]
  return DISPLAY_BG_PRESETS.find((p) => p.id === id) ?? DISPLAY_BG_PRESETS[0]
}

/**
 * 위젯별 배경 프리셋 상태를 localStorage에 저장/복원.
 * `widgetId` 는 위젯 종류 식별자(e.g. 'studentcheck', 'goal') + 선택적 instance.
 */
export function useDisplayBg(widgetId: string): {
  preset: DisplayBgPreset
  setPresetId: (id: string) => void
} {
  const [presetId, setPresetIdState] = useState<string>(() => {
    try {
      return window.localStorage.getItem(storageKey(widgetId)) ?? 'default'
    } catch {
      return 'default'
    }
  })

  const setPresetId = useCallback(
    (id: string) => {
      setPresetIdState(id)
      try {
        window.localStorage.setItem(storageKey(widgetId), id)
      } catch {
        /* storage unavailable — silently ignore */
      }
    },
    [widgetId],
  )

  // widgetId 바뀌면(instance 전환) 재로드
  useEffect(() => {
    try {
      setPresetIdState(window.localStorage.getItem(storageKey(widgetId)) ?? 'default')
    } catch {
      setPresetIdState('default')
    }
  }, [widgetId])

  return { preset: getDisplayBgPreset(presetId), setPresetId }
}
