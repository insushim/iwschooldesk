/**
 * SchoolDesk 급식 프록시 Worker.
 *
 * 목적: 같은 학교 사용자들이 한 번 받은 급식 데이터를 KV 에 캐싱해 NEIS API 부담을 줄이고,
 *       앱 사용자가 NEIS 인증키를 직접 발급받지 않아도 되게 한다.
 *
 * 캐시 정책:
 *   - 학교 검색: 7일 (학교 정보는 거의 안 바뀜)
 *   - 급식 정보: 25시간 (오늘 데이터 그대로, 자정 넘기면 새로 fetch)
 *
 * 보안:
 *   - 입력 검증: 길이/형식 정규식 (DoS, KV key 폭증 방어)
 *   - Rate limit: IP 분당 30회 (in-memory, isolate별 분산)
 *   - 에러 메시지 sanitize (내부 정보 노출 방지)
 */
export interface Env {
  CACHE: KVNamespace
  NEIS_API_KEY?: string  // 운영 인증키 (Worker secret 으로만 저장)
}

const NEIS_BASE = 'https://open.neis.go.kr/hub'

interface NeisRow { [k: string]: string }
interface NeisSection { head?: unknown; row?: NeisRow[] }

// ─── 입력 검증 ──────────────────────────────────────
const SCHOOL_NAME_MAX = 50
// 한글·영문·숫자·공백·일부 기호 (학교명에 자주 등장: 괄호, 점, 가운뎃점, 하이픈)
const SCHOOL_NAME_RE = /^[가-힣a-zA-Z0-9\s\-_().·]+$/
const SC_CODE_RE = /^[A-Z]\d{2}$/        // 예: B10
const SCHOOL_CODE_RE = /^\d{7,8}$/        // 예: 7081418
const DATE_RE = /^\d{4}-?\d{2}-?\d{2}$/   // YYYY-MM-DD 또는 YYYYMMDD

function validateName(s: string | null | undefined): string | null {
  if (!s) return 'name required'
  const v = s.trim()
  if (v.length === 0) return 'name required'
  if (v.length > SCHOOL_NAME_MAX) return 'name too long'
  if (!SCHOOL_NAME_RE.test(v)) return 'invalid characters in name'
  return null
}
function validateScCode(s: string | null | undefined): string | null {
  if (!s) return 'scCode required'
  if (!SC_CODE_RE.test(s.trim())) return 'invalid scCode'
  return null
}
function validateSchoolCode(s: string | null | undefined): string | null {
  if (!s) return 'schoolCode required'
  if (!SCHOOL_CODE_RE.test(s.trim())) return 'invalid schoolCode'
  return null
}
function validateDate(s: string | null | undefined): string | null {
  if (!s) return 'date required'
  if (!DATE_RE.test(s.trim())) return 'invalid date format'
  return null
}

// ─── Rate limit (in-memory, isolate별) ──────────────
const RATE_WINDOW_MS = 60_000
const RATE_MAX_PER_IP = 30  // 정상 사용은 일일 1~5회. 30회면 매우 여유.
const rateMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string | null): boolean {
  if (!ip) return true  // IP 못 알면 통과 (Cloudflare DDoS 보호 의존)
  const now = Date.now()
  const cur = rateMap.get(ip)
  if (!cur || cur.resetAt < now) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    // 메모리 누수 방어 — Map 크기가 너무 커지면 오래된 항목 GC
    if (rateMap.size > 10000) {
      for (const [k, v] of rateMap) if (v.resetAt < now) rateMap.delete(k)
    }
    return true
  }
  if (cur.count >= RATE_MAX_PER_IP) return false
  cur.count++
  return true
}

// ─── 응답 ──────────────────────────────────────────
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders },
  })
}

// ─── NEIS 호출 ─────────────────────────────────────
async function fetchSchoolInfo(name: string, env: Env): Promise<unknown[]> {
  const params = new URLSearchParams({
    Type: 'json', pIndex: '1', pSize: '20', SCHUL_NM: name,
  })
  if (env.NEIS_API_KEY) params.set('KEY', env.NEIS_API_KEY)
  const r = await fetch(`${NEIS_BASE}/schoolInfo?${params}`, {
    cf: { cacheTtl: 60, cacheEverything: true },
  })
  const data = await r.json() as Record<string, unknown>
  const arr = data.schoolInfo as NeisSection[] | undefined
  if (!Array.isArray(arr)) return []
  const rows = arr.find((s) => s.row)?.row ?? []
  return rows.map((r) => ({
    scCode: r.ATPT_OFCDC_SC_CODE,
    schoolCode: r.SD_SCHUL_CODE,
    name: r.SCHUL_NM,
    type: r.SCHUL_KND_SC_NM,
    address: r.ORG_RDNMA,
  }))
}

async function fetchMealInfo(scCode: string, schoolCode: string, ymd: string, env: Env): Promise<unknown[]> {
  const ymdClean = ymd.replace(/-/g, '')
  const params = new URLSearchParams({
    Type: 'json', pIndex: '1', pSize: '20',
    ATPT_OFCDC_SC_CODE: scCode, SD_SCHUL_CODE: schoolCode, MLSV_YMD: ymdClean,
  })
  if (env.NEIS_API_KEY) params.set('KEY', env.NEIS_API_KEY)
  const r = await fetch(`${NEIS_BASE}/mealServiceDietInfo?${params}`, {
    cf: { cacheTtl: 60, cacheEverything: true },
  })
  const data = await r.json() as Record<string, unknown>
  const arr = data.mealServiceDietInfo as NeisSection[] | undefined
  if (!Array.isArray(arr)) return []
  const rows = arr.find((s) => s.row)?.row ?? []
  const dateStr = ymdClean.length === 8
    ? `${ymdClean.slice(0, 4)}-${ymdClean.slice(4, 6)}-${ymdClean.slice(6, 8)}`
    : ymdClean
  return rows.map((r) => {
    const rawText = r.DDISH_NM ?? ''
    const dishes = rawText
      .split(/<br\s*\/?>/i)
      .map((s) => s.replace(/\s*\([0-9.\s]+\)\s*$/, '').trim())
      .filter(Boolean)
    return {
      date: dateStr,
      mealType: r.MMEAL_SC_NM ?? '중식',
      dishes,
      // rawText 는 응답에서 제거 — 클라이언트가 dangerouslySetInnerHTML 로 잘못 쓸 가능성 차단.
      calInfo: r.CAL_INFO,
    }
  })
}

// ─── 라우터 ────────────────────────────────────────
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
    if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)

    // Rate limit
    const ip = req.headers.get('CF-Connecting-IP')
    if (!checkRateLimit(ip)) return json({ error: 'rate limit exceeded' }, 429)

    const url = new URL(req.url)

    try {
      // 학교 검색 ─ /school?name=한가람초
      if (url.pathname === '/school') {
        const name = url.searchParams.get('name')
        const err = validateName(name)
        if (err) return json({ error: err }, 400)
        const trimmed = name!.trim()
        // v2: rawText 제거 + 입력검증 추가된 응답 스키마.
        const cacheKey = `school:v2:${trimmed.toLowerCase()}`
        const cached = await env.CACHE.get(cacheKey, 'json')
        if (cached) return json(cached)
        const result = await fetchSchoolInfo(trimmed, env)
        await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 7 * 24 * 3600 })
        return json(result)
      }

      // 급식 ─ /meal?scCode=B10&schoolCode=7010001&date=2026-04-27
      if (url.pathname === '/meal') {
        const scCode = url.searchParams.get('scCode')
        const schoolCode = url.searchParams.get('schoolCode')
        const date = url.searchParams.get('date')
        const errs = [validateScCode(scCode), validateSchoolCode(schoolCode), validateDate(date)].filter(Boolean)
        if (errs.length) return json({ error: errs[0] }, 400)
        const sc = scCode!.trim()
        const sch = schoolCode!.trim()
        const dt = date!.trim()
        const ymdClean = dt.replace(/-/g, '')
        // v2: rawText 제거된 응답 스키마.
        const cacheKey = `meal:v2:${sc}:${sch}:${ymdClean}`
        const cached = await env.CACHE.get(cacheKey, 'json')
        if (cached) return json(cached)
        const result = await fetchMealInfo(sc, sch, dt, env)
        await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 25 * 3600 })
        return json(result)
      }

      // 헬스체크
      if (url.pathname === '/' || url.pathname === '/health') {
        return json({ ok: true, service: 'schooldesk-meal' })
      }

      return json({ error: 'not found' }, 404)
    } catch (e) {
      // 내부 에러는 서버 로그에만 — 클라이언트엔 일반 메시지.
      console.error('worker error:', e)
      return json({ error: 'internal error' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
