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

/**
 * 세련된 디스플레이 배경 프리셋 (v2).
 *
 * 공통 원칙:
 *  - 멀티-스톱 그라디언트(3~5 stops) 로 부드러운 깊이감.
 *  - 레이어드 radial glow — 두세 개 원이 겹쳐 "노이즈/빛" 느낌을 시뮬레이션.
 *  - vignette(원형 어둡기) 로 중앙 텍스트 가독성 확보.
 *  - light 모드(어두운 배경 + 흰 글씨) 는 배경 중앙 톤을 한 단계 어둡게 유지해 대비 보장.
 *  - dark 모드(밝은 배경 + 어두운 글씨) 는 광도 80% 이하 파스텔로 눈부심 억제.
 */
export const DISPLAY_BG_PRESETS: DisplayBgPreset[] = [
  {
    id: 'default',
    label: '기본',
    bg: null,
    textMode: 'dark',
    preview: 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)',
  },
  {
    id: 'pureWhite',
    label: '순백',
    bg: '#FFFFFF',
    textMode: 'dark',
    preview: '#FFFFFF',
  },
  {
    id: 'pureBlack',
    label: '순흑',
    bg: '#000000',
    textMode: 'light',
    preview: '#000000',
  },
  {
    id: 'midnight',
    label: '미드나잇',
    // Apple-dynamic 류 — 깊은 남색 + 중앙 살짝 밝은 블루로 문장 가독성↑.
    bg: 'radial-gradient(ellipse at 50% 40%, #1E3A8A 0%, #0F172A 65%, #020617 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #0F172A, #4338CA)',
    glow:
      'radial-gradient(circle at 20% 15%, rgba(99,102,241,0.35) 0%, transparent 45%),' +
      'radial-gradient(circle at 80% 85%, rgba(168,85,247,0.28) 0%, transparent 50%),' +
      'radial-gradient(circle at 50% 50%, rgba(0,0,0,0.28) 60%, transparent 100%)',
  },
  {
    id: 'aurora',
    label: '오로라',
    bg: 'linear-gradient(135deg, #064E3B 0%, #0C4A6E 35%, #1E3A8A 65%, #312E81 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #10B981, #4338CA)',
    glow:
      'radial-gradient(ellipse at 18% 25%, rgba(16,185,129,0.32) 0%, transparent 55%),' +
      'radial-gradient(ellipse at 82% 80%, rgba(99,102,241,0.32) 0%, transparent 55%),' +
      'radial-gradient(circle at 50% 55%, rgba(0,0,0,0.22) 60%, transparent 100%)',
  },
  {
    id: 'indigo',
    label: '네이비',
    bg: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 45%, #4338CA 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #1E1B4B, #4338CA)',
    glow:
      'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.14) 0%, transparent 50%),' +
      'radial-gradient(circle at 80% 85%, rgba(168,85,247,0.30) 0%, transparent 60%),' +
      'radial-gradient(circle at 50% 55%, rgba(0,0,0,0.20) 65%, transparent 100%)',
  },
  {
    id: 'sky',
    label: '하늘',
    bg: 'linear-gradient(135deg, #0C4A6E 0%, #075985 40%, #0EA5E9 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #0C4A6E, #0EA5E9)',
    glow:
      'radial-gradient(ellipse at 18% 20%, rgba(255,255,255,0.20) 0%, transparent 50%),' +
      'radial-gradient(circle at 88% 88%, rgba(56,189,248,0.28) 0%, transparent 55%),' +
      'radial-gradient(circle at 50% 55%, rgba(0,0,0,0.18) 65%, transparent 100%)',
  },
  {
    id: 'ocean',
    label: '심해',
    bg: 'linear-gradient(180deg, #164E63 0%, #0E7490 45%, #0891B2 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #164E63, #06B6D4)',
    glow:
      'radial-gradient(circle at 30% 25%, rgba(34,211,238,0.30) 0%, transparent 50%),' +
      'radial-gradient(circle at 80% 80%, rgba(255,255,255,0.14) 0%, transparent 55%),' +
      'radial-gradient(circle at 50% 60%, rgba(0,0,0,0.22) 65%, transparent 100%)',
  },
  {
    id: 'forest',
    label: '포레스트',
    bg: 'linear-gradient(135deg, #052E16 0%, #14532D 45%, #166534 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #052E16, #15803D)',
    glow:
      'radial-gradient(circle at 30% 25%, rgba(34,197,94,0.26) 0%, transparent 55%),' +
      'radial-gradient(circle at 80% 85%, rgba(134,239,172,0.20) 0%, transparent 55%),' +
      'radial-gradient(circle at 50% 55%, rgba(0,0,0,0.20) 65%, transparent 100%)',
  },
  {
    id: 'sunset',
    label: '노을',
    bg: 'linear-gradient(135deg, #4C1D95 0%, #9D174D 40%, #C2410C 75%, #F59E0B 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #4C1D95, #F59E0B)',
    glow:
      'radial-gradient(ellipse at 25% 25%, rgba(255,255,255,0.18) 0%, transparent 50%),' +
      'radial-gradient(circle at 82% 82%, rgba(251,146,60,0.32) 0%, transparent 55%),' +
      'radial-gradient(circle at 50% 60%, rgba(0,0,0,0.24) 60%, transparent 100%)',
  },
  {
    id: 'rose',
    label: '로즈골드',
    bg: 'linear-gradient(135deg, #4A044E 0%, #831843 40%, #BE185D 75%, #F472B6 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #4A044E, #EC4899)',
    glow:
      'radial-gradient(circle at 25% 22%, rgba(255,255,255,0.18) 0%, transparent 50%),' +
      'radial-gradient(circle at 82% 85%, rgba(244,114,182,0.30) 0%, transparent 55%),' +
      'radial-gradient(circle at 50% 55%, rgba(0,0,0,0.20) 65%, transparent 100%)',
  },
  {
    id: 'crimson',
    label: '버건디',
    bg: 'linear-gradient(135deg, #450A0A 0%, #7F1D1D 50%, #B91C1C 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #450A0A, #DC2626)',
    glow:
      'radial-gradient(circle at 28% 22%, rgba(254,202,202,0.18) 0%, transparent 55%),' +
      'radial-gradient(circle at 82% 85%, rgba(252,165,165,0.24) 0%, transparent 55%),' +
      'radial-gradient(circle at 50% 60%, rgba(0,0,0,0.22) 65%, transparent 100%)',
  },
  {
    id: 'charcoal',
    label: '차콜',
    bg: 'linear-gradient(135deg, #0A0A0A 0%, #1C1C1C 50%, #2A2A2A 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #0A0A0A, #3F3F46)',
    glow:
      'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.14) 0%, transparent 55%),' +
      'radial-gradient(circle at 85% 85%, rgba(148,163,184,0.18) 0%, transparent 60%),' +
      'radial-gradient(circle at 50% 55%, rgba(0,0,0,0.12) 70%, transparent 100%)',
  },
  {
    id: 'slate',
    label: '슬레이트',
    bg: 'linear-gradient(135deg, #1E293B 0%, #334155 50%, #475569 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #1E293B, #64748B)',
    glow:
      'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.18) 0%, transparent 55%),' +
      'radial-gradient(circle at 85% 85%, rgba(148,163,184,0.22) 0%, transparent 60%),' +
      'radial-gradient(circle at 50% 55%, rgba(0,0,0,0.18) 65%, transparent 100%)',
  },
  {
    id: 'lavender',
    label: '라벤더',
    bg: 'linear-gradient(135deg, #3B0764 0%, #6D28D9 50%, #8B5CF6 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #3B0764, #A78BFA)',
    glow:
      'radial-gradient(circle at 28% 20%, rgba(255,255,255,0.16) 0%, transparent 55%),' +
      'radial-gradient(circle at 82% 85%, rgba(196,181,253,0.32) 0%, transparent 55%),' +
      'radial-gradient(circle at 50% 55%, rgba(0,0,0,0.18) 65%, transparent 100%)',
  },
  {
    id: 'emerald',
    label: '민트글로우',
    bg: 'linear-gradient(135deg, #022C22 0%, #064E3B 45%, #047857 100%)',
    textMode: 'light',
    preview: 'linear-gradient(135deg, #022C22, #10B981)',
    glow:
      'radial-gradient(circle at 30% 22%, rgba(110,231,183,0.28) 0%, transparent 55%),' +
      'radial-gradient(circle at 82% 85%, rgba(52,211,153,0.24) 0%, transparent 55%),' +
      'radial-gradient(circle at 50% 55%, rgba(0,0,0,0.18) 65%, transparent 100%)',
  },
  // ─── 라이트(밝은 배경 + 어두운 글씨) — 눈부심 억제된 파스텔 ───
  {
    id: 'cream',
    label: '크림',
    bg: 'linear-gradient(135deg, #FEFCE8 0%, #FEF3C7 55%, #FDE68A 100%)',
    textMode: 'dark',
    preview: 'linear-gradient(135deg, #FEFCE8, #FBBF24)',
    glow:
      'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.6) 0%, transparent 55%)',
  },
  {
    id: 'peach',
    label: '복숭아',
    bg: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 50%, #FED7AA 100%)',
    textMode: 'dark',
    preview: 'linear-gradient(135deg, #FFF7ED, #FDBA74)',
    glow:
      'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.5) 0%, transparent 55%)',
  },
  {
    id: 'mist',
    label: '안개',
    bg: 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 50%, #CBD5E1 100%)',
    textMode: 'dark',
    preview: 'linear-gradient(135deg, #F1F5F9, #94A3B8)',
    glow:
      'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.5) 0%, transparent 55%)',
  },
  {
    id: 'sage',
    label: '세이지',
    bg: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 50%, #BBF7D0 100%)',
    textMode: 'dark',
    preview: 'linear-gradient(135deg, #F0FDF4, #86EFAC)',
    glow:
      'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.5) 0%, transparent 55%)',
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
