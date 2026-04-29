import { useState, useEffect, useCallback, useRef } from 'react'
import { Utensils, Search, X, Settings, Monitor, MonitorOff, AlertCircle, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDisplayBg } from '../../lib/display-bg'
import { DisplayBgPicker } from '../ui/DisplayBgPicker'
import { useIAmWallpaper } from '../../hooks/useIAmWallpaper'
import type { MealConfig, MealMenu, NeisSchool } from '../../types/meal.types'

const STORAGE_KEY = 'meal:config:v1'
const CACHE_KEY = 'meal:cache:v1'

interface MealCache {
  schoolCode: string
  ymd: string  // YYYY-MM-DD
  meals: MealMenu[]
  fetchedAt: number  // unix ms — 디버그/통계용
}

// 메뉴명 키워드 → 이모지.
// ★ pickEmoji 가 모듈 로드 시 한 번 길이 내림차순으로 정렬한다 — 짧은 키워드가
//   긴 키워드를 가로채는 false-positive 차단 (예: "오징어채" 의 "어" 가 "오징어" 보다 먼저
//   매치되어 🐟 가 잘못 나오는 버그 방지).
// ★ 1글자 키워드("어"·"감" 등)는 명백한 false-positive 만들어내므로 모두 제외.
//   "국"·"탕"·"찜"·"전"·"무" 같이 한국 급식에 핵심인 1글자만 보존.
const MEAL_EMOJI_MAP: ReadonlyArray<readonly [string, string]> = [
  // ── 밥 / 죽 ──
  ['오므라이스', '🍳'], ['카레라이스', '🍛'], ['카레', '🍛'], ['커리', '🍛'], ['하이라이스', '🍛'],
  ['비빔밥', '🍚'], ['볶음밥', '🍚'], ['덮밥', '🍚'], ['리조또', '🍚'], ['필라프', '🍚'],
  ['주먹밥', '🍙'], ['김밥', '🍙'], ['약밥', '🍙'], ['유부초밥', '🍣'], ['초밥', '🍣'],
  ['누룽지', '🍚'], ['숭늉', '🥣'],
  ['잡곡밥', '🌾'], ['보리밥', '🌾'], ['콩밥', '🌾'], ['흑미밥', '🌾'], ['백미밥', '🌾'],
  ['오곡밥', '🌾'], ['귀리밥', '🌾'], ['현미밥', '🌾'],
  ['전복죽', '🥣'], ['호박죽', '🥣'], ['팥죽', '🥣'], ['닭죽', '🥣'], ['야채죽', '🥣'],
  ['죽', '🥣'], ['수프', '🥣'], ['스프', '🥣'],
  // ── 면류 ──
  ['잡채', '🍜'], ['당면', '🍜'], ['짜장면', '🍜'], ['짜장', '🍜'], ['짬뽕', '🍜'],
  ['짜파게티', '🍜'], ['칼국수', '🍜'], ['수제비', '🍜'], ['라면', '🍜'], ['라볶이', '🍜'],
  ['우동', '🍜'], ['소바', '🍜'], ['쌀국수', '🍜'], ['냉면', '🍜'], ['비빔국수', '🍜'],
  ['잔치국수', '🍜'], ['국수', '🍜'],
  ['스파게티', '🍝'], ['파스타', '🍝'], ['로제', '🍝'], ['크림파스타', '🍝'], ['미트소스', '🍝'],
  ['떡볶이', '🍜'], ['라볶이', '🍜'], ['떡뽀끼', '🍜'],
  // ── 만두 / 핫도그 / 패스트푸드 ──
  ['군만두', '🥟'], ['찐만두', '🥟'], ['물만두', '🥟'], ['김치만두', '🥟'],
  ['만두', '🥟'], ['교자', '🥟'], ['딤섬', '🥟'], ['샤오롱바오', '🥟'],
  ['핫도그', '🌭'], ['소세지', '🌭'], ['소시지', '🌭'], ['프랑크', '🌭'],
  ['피자', '🍕'], ['햄버거', '🍔'], ['치즈버거', '🍔'], ['샌드위치', '🥪'],
  ['타코', '🌮'], ['브리또', '🌯'], ['또띠아', '🌯'], ['케밥', '🌯'],
  // ── 떡 ──
  ['떡꼬치', '🍡'], ['떡국', '🍲'], ['떡만두', '🥟'], ['찹쌀떡', '🍡'],
  ['송편', '🍡'], ['절편', '🍡'], ['인절미', '🍡'], ['시루떡', '🍡'], ['가래떡', '🍡'], ['떡', '🍡'],
  // ── 고기 ──
  ['찜닭', '🍗'], ['닭갈비', '🍗'], ['닭볶음탕', '🍗'], ['닭곰탕', '🍲'], ['닭개장', '🍲'],
  ['치킨', '🍗'], ['후라이드', '🍗'], ['양념치킨', '🍗'], ['깐풍기', '🍗'], ['깐풍', '🍗'],
  ['강정', '🍗'], ['너겟', '🍗'], ['닭', '🍗'], ['오리', '🦆'],
  ['보쌈', '🥩'], ['수육', '🥩'], ['두루치기', '🥩'], ['제육', '🥩'],
  ['LA갈비', '🥩'], ['갈비찜', '🥩'], ['갈비', '🥩'], ['불고기', '🥩'], ['스테이크', '🥩'],
  ['소고기', '🥩'], ['쇠고기', '🥩'], ['돼지고기', '🥩'], ['돼지', '🥩'], ['고기', '🥩'],
  ['삼겹', '🥓'], ['베이컨', '🥓'], ['목살', '🥩'], ['항정살', '🥓'],
  ['미트볼', '🍖'], ['떡갈비', '🍖'], ['함박', '🍖'], ['스팸', '🥫'], ['햄', '🥓'],
  ['돈가스', '🍖'], ['돈까스', '🍖'], ['까스', '🍖'], ['탕수육', '🍖'],
  ['동그랑땡', '🍖'], ['완자', '🍖'], ['미트로프', '🍖'], ['카츠', '🍖'],
  ['산적', '🍢'], ['꼬치', '🍢'], ['데리야끼', '🍢'],
  // ── 해산물 ──
  ['새우튀김', '🍤'], ['새우볶음', '🍤'], ['깐쇼새우', '🍤'], ['새우', '🍤'],
  ['튀김', '🍤'], ['모듬튀김', '🍤'],
  ['고등어', '🐟'], ['갈치', '🐟'], ['연어', '🐟'], ['삼치', '🐟'], ['임연수', '🐟'],
  ['동태', '🐟'], ['명태', '🐟'], ['황태', '🐟'], ['북어', '🐟'], ['멸치', '🐟'],
  ['잔멸치', '🐟'], ['멸치볶음', '🐟'], ['진미채', '🐟'], ['쥐포', '🐟'],
  ['까나리', '🐟'], ['우럭', '🐟'], ['장어', '🐟'], ['붕어', '🐟'], ['생선', '🐟'],
  ['오징어채', '🦑'], ['오징어', '🦑'],
  ['쭈꾸미', '🐙'], ['주꾸미', '🐙'], ['낙지', '🐙'], ['문어', '🐙'],
  ['꽃게', '🦀'], ['게살', '🦀'], ['게', '🦀'],
  ['굴', '🦪'], ['바지락', '🦪'], ['홍합', '🦪'], ['조개', '🦪'], ['전복', '🐚'],
  ['해물', '🦐'], ['어묵', '🍢'], ['오뎅', '🍢'],
  ['회', '🍣'], ['숙회', '🍣'],
  // ── 해조류 ──
  ['미역', '🌿'], ['미역줄기', '🌿'], ['김자반', '🌿'], ['김무침', '🌿'],
  ['파래', '🌿'], ['톳', '🌿'], ['김', '🌿'],
  // ── 두부 / 콩 / 계란 ──
  // 두부는 전용 이모지가 없어 🥘(한식 스튜) 로 fallback — 두부조림·두부부침·순두부찌개 등에 어울림.
  ['연두부', '🥘'], ['순두부', '🍲'], ['두부조림', '🥘'], ['두부부침', '🥞'],
  ['마파두부', '🥘'], ['두부김치', '🥘'], ['두부', '🥘'], ['유부', '🥘'],
  ['콩나물', '🌱'], ['숙주', '🌱'],
  ['콩자반', '🫘'], ['검은콩', '🫘'], ['콩비지', '🫘'], ['청국장', '🍲'], ['콩', '🫘'],
  ['땅콩', '🥜'], ['아몬드', '🥜'], ['견과류', '🌰'], ['믹스넛', '🥜'],
  ['계란말이', '🥚'], ['계란찜', '🥚'], ['계란탕', '🥚'], ['스크램블', '🥚'],
  ['프라이', '🍳'], ['후라이', '🍳'], ['오믈렛', '🥚'],
  ['계란', '🥚'], ['달걀', '🥚'], ['에그', '🥚'], ['메추리알', '🥚'],
  // ── 유제품 / 디저트 ──
  ['우유', '🥛'], ['두유', '🥛'], ['요거트', '🥛'], ['요구르트', '🥛'],
  ['치즈', '🧀'], ['버터', '🧈'],
  ['아이스크림', '🍦'], ['젤리', '🍮'], ['푸딩', '🍮'], ['양갱', '🍮'], ['도토리묵', '🍮'],
  ['빙수', '🍧'], ['팥빙수', '🍧'], ['슬러시', '🥤'],
  // ── 빵 ──
  ['크로와상', '🥐'], ['크루아상', '🥐'], ['바게트', '🥖'], ['모닝빵', '🍞'],
  ['크림빵', '🍞'], ['단팥빵', '🍞'], ['소보로', '🍞'], ['카스테라', '🍞'], ['식빵', '🍞'],
  ['빵', '🍞'], ['토스트', '🍞'], ['머핀', '🧁'], ['컵케이크', '🧁'],
  ['케이크', '🍰'], ['쿠키', '🍪'], ['비스킷', '🍪'], ['초콜릿', '🍫'], ['초코', '🍫'],
  ['도넛', '🍩'], ['도너츠', '🍩'], ['슈크림', '🍩'],
  ['약과', '🍪'], ['한과', '🍪'], ['매작과', '🍪'], ['호두과자', '🍪'],
  ['호떡', '🥞'], ['붕어빵', '🥮'], ['월병', '🥮'],
  // ── 전 / 부침 ──
  ['해물파전', '🥞'], ['파전', '🥞'], ['김치전', '🥞'], ['감자전', '🥞'], ['녹두전', '🥞'],
  ['호박전', '🥞'], ['동태전', '🥞'], ['깻잎전', '🥞'], ['육전', '🥞'],
  ['전병', '🥞'], ['부침', '🥞'], ['지짐', '🥞'],
  ['전', '🥞'],  // 단일자 — 길이정렬로 위 긴 키워드들 뒤에서만 매치됨
  // ── 김치 / 절임 ──
  ['배추김치', '🥬'], ['포기김치', '🥬'], ['열무김치', '🥬'], ['깍두기', '🥬'],
  ['알타리', '🥬'], ['총각김치', '🥬'], ['백김치', '🥬'], ['파김치', '🥬'],
  ['겉절이', '🥗'], ['김치', '🥬'],
  ['단무지', '🟡'], ['오이지', '🥒'], ['장아찌', '🥒'], ['피클', '🥒'], ['짠지', '🥒'],
  // ── 샐러드 / 채소 ──
  ['샐러드', '🥗'], ['생채', '🥗'], ['상추', '🥗'], ['치커리', '🥗'], ['로메인', '🥗'],
  ['시금치', '🥬'], ['시래기', '🥬'], ['배추', '🥬'], ['양배추', '🥬'], ['청경채', '🥬'],
  ['아스파라거스', '🥬'],
  ['브로콜리', '🥦'], ['콜리플라워', '🥦'],
  ['부추', '🌿'], ['깻잎', '🌿'], ['미나리', '🌿'], ['쑥', '🌿'], ['대파', '🌿'],
  ['도라지', '🌿'], ['더덕', '🌿'], ['취나물', '🌿'], ['고사리', '🌿'], ['숙주나물', '🌱'],
  // ── 뿌리채소 ──
  ['감자조림', '🥔'], ['감자볶음', '🥔'], ['감자', '🥔'], ['연근', '🥔'],
  ['고구마', '🍠'], ['옥수수', '🌽'], ['우엉', '🥕'],
  ['양파', '🧅'], ['마늘', '🧄'], ['생강', '🫚'], ['당근', '🥕'],
  ['무말랭이', '🥕'], ['무생채', '🥕'], ['무나물', '🥕'], ['깍두기', '🥕'],
  ['무국', '🍲'], ['뭇국', '🍲'], ['무', '🥕'],
  // ── 버섯 ──
  ['표고버섯', '🍄'], ['느타리', '🍄'], ['새송이', '🍄'], ['팽이버섯', '🍄'],
  ['양송이', '🍄'], ['목이버섯', '🍄'], ['팽이', '🍄'], ['버섯', '🍄'],
  // ── 호박 / 가지 / 오이 ──
  ['단호박', '🎃'], ['애호박', '🥒'], ['호박', '🎃'],
  ['가지볶음', '🍆'], ['가지', '🍆'], ['오이무침', '🥒'], ['오이', '🥒'],
  ['토마토', '🍅'], ['방울토마토', '🍅'], ['파프리카', '🫑'], ['피망', '🫑'],
  ['고추장', '🌶️'], ['청양', '🌶️'], ['풋고추', '🌶️'], ['고추', '🌶️'],
  // ── 과일 ──
  ['수박', '🍉'], ['참외', '🍈'], ['멜론', '🍈'], ['사과', '🍎'], ['바나나', '🍌'],
  ['청포도', '🍇'], ['포도', '🍇'], ['딸기', '🍓'], ['블루베리', '🫐'],
  ['오렌지', '🍊'], ['자몽', '🍊'], ['귤', '🍊'], ['파인애플', '🍍'], ['복숭아', '🍑'],
  ['키위', '🥝'], ['망고', '🥭'], ['체리', '🍒'], ['홍시', '🍑'], ['단감', '🍑'],
  ['배추', '🥬'], ['배', '🍐'],
  ['레몬', '🍋'], ['라임', '🍋'], ['아보카도', '🥑'],
  // ── 음료 / 차 ──
  ['주스', '🧃'], ['오렌지주스', '🧃'], ['사과주스', '🧃'], ['포도주스', '🧃'],
  ['에이드', '🥤'], ['사이다', '🥤'], ['콜라', '🥤'], ['음료', '🥤'], ['미숫가루', '🥤'],
  ['수정과', '🍵'], ['식혜', '🍵'], ['녹차', '🍵'], ['보리차', '🍵'], ['옥수수차', '🍵'],
  ['모카', '☕'], ['커피', '☕'], ['차', '🍵'],
  // ── 국 / 탕 / 찌개 ──
  ['미역국', '🍲'], ['된장국', '🍲'], ['김치국', '🍲'], ['황태국', '🍲'], ['콩나물국', '🍲'],
  ['시래기국', '🍲'], ['우거지국', '🍲'], ['소고기뭇국', '🍲'], ['뭇국', '🍲'], ['미소국', '🍲'],
  ['육개장', '🍲'], ['갈비탕', '🍲'], ['삼계탕', '🍲'], ['설렁탕', '🍲'], ['곰탕', '🍲'],
  ['해장국', '🍲'], ['알탕', '🍲'], ['매운탕', '🍲'], ['지리', '🍲'],
  ['김치찌개', '🍲'], ['된장찌개', '🍲'], ['순두부찌개', '🍲'], ['부대찌개', '🍲'], ['청국장', '🍲'],
  ['전골', '🍲'], ['스튜', '🍲'],
  ['국', '🍲'], ['탕', '🍲'], ['찌개', '🍲'],
  // ── 조리법 / 양념 (일반 fallback) ──
  ['볶음', '🥘'], ['조림', '🥘'], ['찜', '🥘'], ['찌짐', '🥞'],
  ['구이', '🍳'], ['무침', '🥗'], ['숙주무침', '🥗'], ['초무침', '🥗'],
  ['양념', '🥄'], ['소스', '🥄'], ['드레싱', '🥄'], ['마요', '🥄'],
  ['굴소스', '🦪'], ['된장', '🥣'], ['간장', '🥢'],
  ['시럽', '🍯'], ['꿀', '🍯'], ['잼', '🍯'],
  // ── 견과류 / 곡물 ──
  ['호두', '🌰'], ['잣', '🌰'], ['밤', '🌰'], ['은행', '🌰'],
  ['해바라기씨', '🌻'], ['아몬드', '🌰'],
  ['참깨', '🌾'], ['들깨', '🌾'], ['깨', '🌾'],
  ['보리', '🌾'], ['귀리', '🌾'], ['현미', '🌾'], ['찹쌀', '🌾'], ['수수', '🌾'], ['쌀', '🌾'],
  // ── 시리얼 / 기타 ──
  ['시리얼', '🥣'], ['그래놀라', '🥣'], ['뮤즐리', '🥣'], ['오트밀', '🥣'],
  // ── 가장 짧은 매칭 (다른 키워드 모두 시도 후) ──
  ['밥', '🍚'],
]

// ★ 모듈 로드 시 한 번만 길이 내림차순으로 정렬. 짧은 키워드가 긴 키워드를 가로채는
//   false-positive 차단. (예: "어"(1) 보다 "오징어"(3) 가 먼저 검사돼야 🦑 가 나옴)
//   같은 길이일 때는 array 정의 순서 유지(stable sort).
const MEAL_EMOJI_MAP_SORTED: ReadonlyArray<readonly [string, string]> =
  [...MEAL_EMOJI_MAP].sort((a, b) => b[0].length - a[0].length)

/** 메뉴명에 어울리는 이모지. 매칭 안 되면 식판 느낌의 도시락(🍱)으로 fallback. */
function pickEmoji(name: string): string {
  for (const [kw, emoji] of MEAL_EMOJI_MAP_SORTED) {
    if (name.includes(kw)) return emoji
  }
  return '🍱'  // fallback — 식판/도시락 느낌. 줄맞춤 + 미관 유지.
}

function loadCache(): MealCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as MealCache
  } catch { return null }
}
function saveCache(c: MealCache): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* noop */ }
}

function loadConfig(): MealConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as MealConfig
  } catch { /* noop */ }
  return { school: null }
}
function saveConfig(c: MealConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)) } catch { /* noop */ }
}

function todayYmd(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const MEAL_ORDER: Record<string, number> = { '조식': 0, '중식': 1, '석식': 2 }
function sortMeals(meals: MealMenu[]): MealMenu[] {
  return [...meals].sort((a, b) => (MEAL_ORDER[a.mealType] ?? 9) - (MEAL_ORDER[b.mealType] ?? 9))
}

export function MealWidget() {
  const [config, setConfig] = useState<MealConfig>(() => loadConfig())
  const [meals, setMeals] = useState<MealMenu[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)

  // 학교 검색 모달
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<NeisSchool[]>([])
  const [searching, setSearching] = useState(false)

  // 디스플레이/배경화면 모드
  const [displayMode, setDisplayMode] = useState(false)
  const iAmWallpaper = useIAmWallpaper('meal')
  const { preset: displayBg, setPresetId: setDisplayBgId } = useDisplayBg('meal')
  const myWidgetId = useRef<string>('widget-meal')

  // wallpaper / 마스터 디스플레이 모드 sync
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const map = await window.api.widget.getWallpaperModeMap()
        if (!cancelled && Array.isArray(map) && map.includes(myWidgetId.current)) setDisplayMode(true)
      } catch { /* noop */ }
    })()
    const offWallpaper = window.api.widget.onWallpaperModeChanged?.((p) => {
      if (p.widgetId === myWidgetId.current) setDisplayMode(p.on)
    })
    const offAll = window.api.widget.onAllDisplayModeChanged?.((p) => {
      setDisplayMode(!!p.on)
    })
    return () => {
      cancelled = true
      if (offWallpaper) offWallpaper()
      if (offAll) offAll()
    }
  }, [])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('widget:displayMode', { detail: { on: displayMode } }))
  }, [displayMode])

  const reload = useCallback(async () => {
    if (!config.school) return
    const today = todayYmd()
    const schoolCode = config.school.schoolCode

    // ① 캐시 hit — 같은 학교, 같은 날짜면 호출 안 함 (NEIS API 부하 절감 → 무인증 풀에서도 1만명 동시 사용 가능).
    const cached = loadCache()
    if (cached && cached.schoolCode === schoolCode && cached.ymd === today) {
      setMeals(cached.meals)
      const lunchIdx = cached.meals.findIndex((x) => x.mealType === '중식')
      setActiveIdx(lunchIdx >= 0 ? lunchIdx : 0)
      if (cached.meals.length === 0) setError('오늘은 급식이 없어요')
      else setError(null)
      return
    }

    // ② 캐시 miss — 호출 + 저장
    setLoading(true)
    setError(null)
    try {
      const m = await window.api.meal.fetchToday(
        config.school.scCode, schoolCode, today, config.apiKey,
      )
      const sorted = sortMeals(m)
      setMeals(sorted)
      saveCache({ schoolCode, ymd: today, meals: sorted, fetchedAt: Date.now() })
      const lunchIdx = sorted.findIndex((x) => x.mealType === '중식')
      setActiveIdx(lunchIdx >= 0 ? lunchIdx : 0)
      if (sorted.length === 0) setError('오늘은 급식이 없어요')
    } catch {
      // 네트워크 실패 — stale 캐시(어제·이전)라도 같은 학교면 표시.
      if (cached && cached.schoolCode === schoolCode) {
        setMeals(cached.meals)
        setError('네트워크 오류 — 캐시된 정보 표시 중')
      } else {
        setError('급식을 불러오지 못했어요')
      }
    } finally {
      setLoading(false)
    }
  }, [config.school, config.apiKey])

  useEffect(() => { reload() }, [reload])
  // 자정 넘기면 자동 갱신
  useEffect(() => {
    const t = setInterval(() => { reload() }, 6 * 60 * 60 * 1000)  // 6시간마다
    return () => clearInterval(t)
  }, [reload])

  const search = async (): Promise<void> => {
    if (!searchTerm.trim()) return
    setSearching(true)
    try {
      // Cloudflare Worker 가 NEIS 인증키 보유. 사용자가 키 입력할 필요 없음.
      const r = await window.api.meal.searchSchool(searchTerm.trim())
      setSearchResults(r)
    } finally { setSearching(false) }
  }
  const selectSchool = (school: NeisSchool): void => {
    const next: MealConfig = { ...config, school }
    setConfig(next)
    saveConfig(next)
    setSearchOpen(false)
    setSearchTerm('')
    setSearchResults([])
  }
  const clearSchool = (): void => {
    const next: MealConfig = { ...config, school: null }
    setConfig(next)
    saveConfig(next)
    setMeals([])
  }

  const isLightText = displayBg.textMode === 'light'
  const rootBg = displayMode && displayBg.bg
    ? displayBg.bg
    : 'radial-gradient(ellipse at 80% 0%, rgba(245,158,11,0.10) 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(244,114,182,0.06) 0%, transparent 50%)'

  // ─── 학교 미설정 — 첫 사용 안내 ───
  if (!config.school && !searchOpen) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-center"
        style={{ padding: 'clamp(14px, 2.4vw, 28px)' }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            color: '#fff', boxShadow: '0 8px 22px rgba(245,158,11,0.42)',
            marginBottom: 12,
          }}
        >
          <Utensils strokeWidth={2.2} size={26} />
        </div>
        <p className="text-sm font-bold text-[var(--text-primary)] mb-1">오늘의 급식</p>
        <p className="text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
          학교를 선택하면 매일 자동으로 급식이 나와요
        </p>
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold transition-transform hover:scale-[1.02]"
          style={{
            padding: '10px 18px', borderRadius: 10,
            backgroundColor: '#F59E0B', color: '#fff',
            boxShadow: '0 4px 12px rgba(245,158,11,0.36)',
          }}
        >
          <Search size={13} strokeWidth={2.4} /> 학교 검색하기
        </button>
      </div>
    )
  }

  // ─── 학교 검색 모달 ───
  if (searchOpen) {
    return (
      <div className="flex flex-col h-full" style={{ padding: '14px 16px' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-[var(--text-primary)]">학교 검색</span>
          <button
            onClick={() => setSearchOpen(false)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <input
            autoFocus
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="학교명 (예: 서울초등학교)"
            className="flex-1 text-xs bg-[var(--bg-secondary)] rounded-md px-2.5 py-1.5 outline-none text-[var(--text-primary)]"
          />
          <button
            onClick={search}
            disabled={!searchTerm.trim() || searching}
            className="shrink-0 flex items-center justify-center hover:opacity-85 disabled:opacity-40"
            style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#F59E0B', color: '#fff' }}
          >
            {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} strokeWidth={2.4} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {searchResults.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)] text-center py-6">
              {searchTerm.trim() ? '검색 결과가 없어요. 정확한 학교명으로 다시 시도해 주세요.' : '학교명을 입력하고 검색해 보세요'}
            </p>
          ) : (
            <ul className="space-y-1">
              {searchResults.map((s) => (
                <li key={`${s.scCode}-${s.schoolCode}`}>
                  <button
                    onClick={() => selectSchool(s)}
                    className="w-full text-left transition-colors hover:bg-[var(--bg-secondary)]"
                    style={{ padding: '8px 10px', borderRadius: 8 }}
                  >
                    <div className="text-[11px] font-semibold text-[var(--text-primary)]">{s.name}</div>
                    {s.address && (
                      <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                        {s.type ? `${s.type} · ` : ''}{s.address}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  // ─── 정상 표시 ───
  const active = meals[activeIdx]

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        padding: 'clamp(12px, 2vw, 22px) clamp(16px, 2.4vw, 26px) clamp(14px, 2.4vw, 24px)',
        background: rootBg,
        transition: 'background 320ms ease',
        color: isLightText ? '#fff' : undefined,
      }}
    >
      {displayMode && displayBg.glow && (
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: displayBg.glow }} />
      )}

      {/* 우상단 컨트롤 — wallpaper 모드면 숨김 */}
      {!iAmWallpaper && (
        <div
          className="absolute top-2 right-2 z-50 flex items-center gap-1.5"
          style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as React.CSSProperties}
        >
          {displayMode && <DisplayBgPicker current={displayBg} onPick={setDisplayBgId} />}
          <button
            onClick={() => {
              const next = !displayMode
              setDisplayMode(next)
              try { window.api.widget.setAllDisplayMode?.(next) } catch { /* noop */ }
            }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-secondary)]"
            style={{
              color: isLightText ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)',
              border: isLightText ? '1px solid rgba(255,255,255,0.18)' : '1px solid var(--border-widget)',
            }}
            title={displayMode ? '디스플레이 모드 해제' : '디스플레이 모드'}
          >
            {displayMode ? <MonitorOff size={13} strokeWidth={2.2} /> : <Monitor size={13} strokeWidth={2.2} />}
          </button>
          {!displayMode && (
            <button
              onClick={() => { setApiKeyDraft(config.apiKey ?? ''); setSearchOpen(true) }}
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
              title="학교 변경"
            >
              <Settings size={13} strokeWidth={2.2} />
            </button>
          )}
        </div>
      )}

      {/* 헤더 — 학교명 + 날짜 */}
      <div className="flex items-center gap-2.5 shrink-0 mb-3" style={{ paddingRight: !iAmWallpaper ? 76 : 0 }}>
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 30, height: 30, borderRadius: 9,
            background: isLightText ? 'rgba(255,255,255,0.18)' : 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            color: '#fff', boxShadow: isLightText ? 'none' : '0 4px 12px rgba(245,158,11,0.32)',
          }}
        >
          <Utensils size={16} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            style={{
              fontSize: 'clamp(12px, 1.4vw, 16px)', fontWeight: 800, letterSpacing: '-0.02em',
              color: isLightText ? '#fff' : 'var(--text-primary)',
            }}
          >
            {config.school?.name ?? ''}
          </div>
          <div
            className="text-[10px]"
            style={{ color: isLightText ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}
          >
            {todayYmd().replace(/-/g, '.')}
          </div>
        </div>
      </div>

      {/* 식사 탭 (조식/중식/석식) */}
      {meals.length > 1 && (
        <div className="flex items-center gap-1 mb-2 shrink-0">
          {meals.map((m, i) => (
            <button
              key={m.mealType + i}
              onClick={() => setActiveIdx(i)}
              className="text-[11px] font-semibold transition-colors"
              style={{
                padding: '4px 10px', borderRadius: 999,
                backgroundColor: i === activeIdx
                  ? (isLightText ? 'rgba(255,255,255,0.22)' : '#F59E0B')
                  : (isLightText ? 'rgba(255,255,255,0.08)' : 'var(--bg-secondary)'),
                color: i === activeIdx
                  ? (isLightText ? '#fff' : '#fff')
                  : (isLightText ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)'),
              }}
            >
              {m.mealType}
            </button>
          ))}
        </div>
      )}

      {/* 본문 — 디스플레이 모드면 콘텐츠를 세로 중앙 정렬해 하단 빈 공간 제거. */}
      <div
        className="flex-1 overflow-y-auto"
        style={displayMode ? { display: 'flex', flexDirection: 'column', justifyContent: 'center' } : undefined}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <AlertCircle size={20} className="text-[var(--text-muted)]" />
            <p className="text-[11px] text-[var(--text-muted)]">{error}</p>
          </div>
        ) : active ? (
          <AnimatePresence mode="wait">
            <motion.ul
              key={active.mealType + active.date}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{
                display: 'grid',
                // 한 줄에 2개씩 — 폭이 좁아지면 1열로 자동 fallback.
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 'clamp(6px, 1vw, 12px)',
              }}
            >
              {active.dishes.map((dish, i) => {
                const emoji = pickEmoji(dish)
                return (
                  <li
                    key={i}
                    style={{
                      // 글씨 크기 ↑ — 이전 13~17px → 16~22px.
                      fontSize: 'clamp(16px, 2vw, 22px)',
                      fontWeight: 700,
                      color: isLightText ? '#fff' : 'var(--text-primary)',
                      padding: 'clamp(8px, 1.2vw, 14px) clamp(10px, 1.4vw, 16px)',
                      borderRadius: 10,
                      background: isLightText ? 'rgba(255,255,255,0.12)' : 'rgba(245,158,11,0.08)',
                      borderLeft: `3px solid ${isLightText ? 'rgba(255,255,255,0.5)' : '#F59E0B'}`,
                      letterSpacing: '-0.015em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'clamp(6px, 0.8vw, 10px)',
                      lineHeight: 1.25,
                      wordBreak: 'keep-all',
                      overflowWrap: 'break-word',
                    }}
                  >
                    {/* 이모지 슬롯 — pickEmoji 가 항상 fallback 반환하므로 모든 메뉴에 이모지가 붙어 줄맞춤 자동. */}
                    <span
                      aria-hidden
                      style={{
                        fontSize: 'clamp(20px, 2.4vw, 28px)',
                        flexShrink: 0,
                        lineHeight: 1,
                      }}
                    >
                      {emoji}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>{dish}</span>
                  </li>
                )
              })}
              {active.calInfo && (
                <li
                  style={{
                    gridColumn: '1 / -1',
                    fontSize: '10.5px',
                    color: isLightText ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)',
                    textAlign: 'right',
                    marginTop: 2,
                  }}
                >
                  {active.calInfo}
                </li>
              )}
            </motion.ul>
          </AnimatePresence>
        ) : null}
      </div>
    </div>
  )
}
