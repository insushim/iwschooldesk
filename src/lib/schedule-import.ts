import * as XLSX from 'xlsx'
import type { ScheduleCategory } from '../types/schedule.types'

/** 파일에서 추출한 일정 한 건. */
export type ImportedEvent = {
  title: string
  startDate: string // yyyy-MM-dd
  endDate?: string
  category?: string
}

/** 대표 결과 타입. */
export type ImportResult =
  | { ok: true; count: number }
  | { ok: false; error: string }

const ALLOWED_CATS: ScheduleCategory[] = [
  '일반', '학교행사', '수업', '회의', '출장', '연수', '개인',
]

function toScheduleCategory(c?: string): ScheduleCategory {
  return ALLOWED_CATS.includes(c as ScheduleCategory) ? (c as ScheduleCategory) : '학교행사'
}

/**
 * 파일을 읽어 DB에 schedules 를 bulk insert.
 * 지원: .csv / .ics / .xlsx / .xls / .docx / .doc / .hwp / .hwpx / .pdf / .txt / .md.
 */
export async function importScheduleFile(file: File): Promise<ImportResult> {
  const lower = file.name.toLowerCase()
  let events: ImportedEvent[] = []
  try {
    assertFileSize(file)
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm') || lower.endsWith('.ods')) {
      events = parseXLSX(await file.arrayBuffer())
    } else if (lower.endsWith('.ics') || lower.endsWith('.ical') || lower.endsWith('.ifb')) {
      events = parseICS(await readTextAutoEncoding(file))
    } else if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      const mammoth = await import('mammoth')
      const { value: text } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
      events = parseTextBlob(text)
    } else if (lower.endsWith('.hwp')) {
      const buf = await file.arrayBuffer()
      const doc = await parseHwpDoc(buf)
      // 1) 학사일정표 전용 그리드 파서: "3월/4월/…" 헤더 행 + 날짜/이벤트 셀 쌍을 직접 해석
      events = parseHwpCalendarTables(doc)
      // 2) 그리드 인식 실패 시 전체 텍스트에서 날짜 추출
      if (events.length === 0) {
        const text = extractTextFromHwp(doc)
        events = parseTextBlob(text)
      }
    } else if (lower.endsWith('.hwpx')) {
      const text = await extractTextFromHwpx(await file.arrayBuffer())
      events = parseTextBlob(text)
    } else if (lower.endsWith('.pdf')) {
      const text = await extractTextFromPdf(await file.arrayBuffer())
      events = parseTextBlob(text)
    } else if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
      events = parseCSV(await readTextAutoEncoding(file))
    } else if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
      events = parseTextBlob(await readTextAutoEncoding(file))
    } else {
      // 확장자 없거나 특수 — 일단 텍스트로 시도
      events = parseCSV(await readTextAutoEncoding(file))
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `파일 파싱 오류: ${msg.slice(0, 160)}` }
  }

  if (events.length === 0) {
    return { ok: false, error: '일정을 못 찾았어요. 날짜(예: 4월 22일 / 4.22 / 2026-04-22)가 포함된 행이 있어야 해요.' }
  }

  let created = 0
  for (const ev of events) {
    try {
      await window.api.schedule.create({
        title: ev.title,
        start_date: ev.startDate,
        end_date: ev.endDate ?? ev.startDate,
        all_day: 1,
        category: toScheduleCategory(ev.category),
      })
      created += 1
    } catch { /* skip invalid */ }
  }
  return { ok: true, count: created }
}

// ─── HWP 텍스트 추출 ─────────────────────────────────────────────────

export async function parseHwpDoc(buf: ArrayBuffer): Promise<HwpLike> {
  const mod = await import('hwp.js')
  const parseHwp =
    (mod as unknown as { default?: (b: unknown, o?: unknown) => unknown; parse?: (b: unknown, o?: unknown) => unknown }).default
    ?? (mod as unknown as { parse?: (b: unknown, o?: unknown) => unknown }).parse
  if (!parseHwp) throw new Error('hwp.js parse 함수를 찾을 수 없어요')
  // cfb.read 는 type 을 명시하지 않으면 input 을 string 으로 간주하고 .replace() 를 호출 → TypeError.
  // Uint8Array 에 맞는 `type: 'array'` 를 반드시 넘겨야 한다.
  return parseHwp(new Uint8Array(buf), { type: 'array' }) as HwpLike
}

type HwpChar = { type: number; value: number | string }
type HwpParagraph = { content?: HwpChar[]; controls?: HwpControl[] }
// TableControl: content = ParagraphList[][] (row × col), ShapeControl: content = ParagraphList[]
type HwpControl = { content?: unknown }
type HwpParagraphList = { attribute?: { column?: number; row?: number }; items?: HwpParagraph[] }
type HwpSection = { content?: HwpParagraph[] }
type HwpLike = { sections?: HwpSection[] }

function charToString(ch: HwpChar): string {
  if (typeof ch.value === 'string') return ch.value
  const n = ch.value
  if (typeof n !== 'number' || n <= 0) return ''
  if (n === 9) return '\t'
  if (n === 10 || n === 13) return '\n'
  if (n < 32) return ''
  try { return String.fromCodePoint(n) } catch { return '' }
}

function extractParagraphText(p: HwpParagraph | undefined): string {
  if (!p) return ''
  let out = ''
  for (const ch of p.content ?? []) out += charToString(ch)
  for (const ctrl of p.controls ?? []) {
    // 1D(ShapeControl) · 2D(TableControl) 둘 다 처리: ParagraphList 를 찾아 items(=paragraphs) 재귀
    const c = ctrl.content
    if (!Array.isArray(c)) continue
    const stack: unknown[] = [...c]
    while (stack.length) {
      const item = stack.shift()
      if (Array.isArray(item)) { stack.unshift(...item); continue }
      const items = (item as HwpParagraphList | null)?.items
      if (Array.isArray(items)) {
        for (const sub of items) out += '\n' + extractParagraphText(sub)
      }
    }
  }
  return out
}

export function extractTextFromHwp(doc: HwpLike): string {
  let text = ''
  for (const section of doc.sections ?? []) {
    for (const para of section.content ?? []) text += extractParagraphText(para) + '\n'
  }
  return text
}

// ─── HWP 학사일정표 그리드 파서 ─────────────────────────────────────
// 한글 학사일정표는 보통 "N 월" 헤더 행 + 아래로 날짜/이벤트가 [day+weekday] [events] 셀 쌍으로 반복됨.
// ParagraphList.attribute.{column,row} 를 이용해 실제 셀 좌표를 복원해서 월·일·이벤트를 뽑는다.

type GridCell = { row: number; col: number; lines: string[] }
type GridTable = { cells: GridCell[]; maxRow: number; maxCol: number }

function collectHwpTables(doc: HwpLike): GridTable[] {
  const tables: GridTable[] = []
  const visit = (p?: HwpParagraph): void => {
    if (!p) return
    for (const ctrl of p.controls ?? []) {
      const c = ctrl.content
      if (!Array.isArray(c)) continue
      if (c.length > 0 && Array.isArray(c[0])) {
        // TableControl: ParagraphList[][]
        const cells: GridCell[] = []
        let maxCol = 0, maxRow = 0
        for (const row of c as unknown[][]) {
          for (const pl of row as HwpParagraphList[]) {
            const col = pl?.attribute?.column ?? 0
            const rr = pl?.attribute?.row ?? 0
            const lines: string[] = []
            for (const q of pl?.items ?? []) {
              const line = extractParagraphText(q).replace(/\s+/g, ' ').trim()
              if (line) lines.push(line)
              visit(q) // 중첩 테이블 대응
            }
            cells.push({ col, row: rr, lines })
            if (col > maxCol) maxCol = col
            if (rr > maxRow) maxRow = rr
          }
        }
        tables.push({ cells, maxRow, maxCol })
      } else {
        // ShapeControl: ParagraphList[]
        for (const pl of c as HwpParagraphList[]) {
          for (const q of pl?.items ?? []) visit(q)
        }
      }
    }
  }
  for (const s of doc.sections ?? []) for (const p of s.content ?? []) visit(p)
  return tables
}

function detectAcademicYear(doc: HwpLike): number | null {
  for (const s of doc.sections ?? []) {
    for (const p of s.content ?? []) {
      const t = extractParagraphText(p)
      const m = /(\d{4})\s*학년도/.exec(t)
      if (m) return +m[1]
      // nested: walk controls text too
    }
  }
  // 테이블 내부까지 검색
  const tables = collectHwpTables(doc)
  for (const t of tables) {
    for (const c of t.cells) {
      for (const l of c.lines) {
        const m = /(\d{4})\s*학년도/.exec(l)
        if (m) return +m[1]
      }
    }
  }
  return null
}

export function parseHwpCalendarTables(doc: HwpLike): ImportedEvent[] {
  const tables = collectHwpTables(doc)
  const academicYear = detectAcademicYear(doc) ?? new Date().getFullYear()
  const events: ImportedEvent[] = []
  const pad = (n: number): string => String(n).padStart(2, '0')

  for (const table of tables) {
    const grid: Record<string, string[]> = {}
    for (const c of table.cells) grid[`${c.row}:${c.col}`] = c.lines

    // "N 월" 이 3개 이상 있는 행을 헤더로 본다. 짝수 col 에서 탐색 (col 2k=날짜, 2k+1=이벤트).
    let monthRow = -1
    let monthsByCol: Array<{ col: number; month: number }> = []
    for (let r = 0; r <= table.maxRow; r++) {
      const found: Array<{ col: number; month: number }> = []
      for (let co = 0; co <= table.maxCol; co += 2) {
        const lines = grid[`${r}:${co}`] ?? []
        if (lines.length === 0) continue
        const m = /^(\d{1,2})\s*월$/.exec(lines.join(' ').trim())
        if (m) {
          const mm = +m[1]
          if (mm >= 1 && mm <= 12) found.push({ col: co, month: mm })
        }
      }
      if (found.length >= 3) { monthRow = r; monthsByCol = found; break }
    }
    if (monthRow < 0) continue

    // 월 순서를 보고 연도 할당: 전 월보다 작아지면 다음 학년 (2학기 12→1 전이).
    monthsByCol.sort((a, b) => a.col - b.col)
    const yearForMonth = new Map<number, number>()
    let yr = academicYear
    for (let i = 0; i < monthsByCol.length; i++) {
      if (i > 0 && monthsByCol[i].month < monthsByCol[i - 1].month) yr += 1
      yearForMonth.set(monthsByCol[i].month, yr)
    }

    // 날짜 · 이벤트 행 파싱
    for (let r = monthRow + 1; r <= table.maxRow; r++) {
      for (const { col: dayCol, month } of monthsByCol) {
        const dayLines = grid[`${r}:${dayCol}`] ?? []
        const evtLines = grid[`${r}:${dayCol + 1}`] ?? []
        if (dayLines.length === 0 || evtLines.length === 0) continue
        // 날짜 셀 첫 줄은 보통 "1" / "12" 같은 숫자.
        const mDay = /^(\d{1,2})$/.exec(dayLines[0].trim())
        if (!mDay) continue
        const day = +mDay[1]
        if (day < 1 || day > 31) continue
        const y = yearForMonth.get(month) ?? academicYear
        const startDate = `${y}-${pad(month)}-${pad(day)}`
        for (const raw of evtLines) {
          const title = raw.replace(/^[‣•■□◈◆◇☆★▶▸►\-·\s]+/, '').trim()
          if (!title) continue
          let endDate: string | undefined
          const rng = extractRangeFromTitle(title, startDate)
          if (rng) endDate = rng
          else if (/주간/.test(title)) endDate = addDays(startDate, 4)
          events.push({ title, startDate, endDate, category: '학교행사' })
        }
      }
    }
  }
  return events
}

// ─── Parsers ─────────────────────────────────────────────────────────

export function parseCSV(text: string): ImportedEvent[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []
  const out: ImportedEvent[] = []
  const hasHeader = /date|title|날짜|제목/i.test(lines[0])
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i])
    if (parts.length < 2) continue
    const [a, b, c, d] = parts
    const aIsDate = isDateLike(a)
    const bIsDate = isDateLike(b)
    let date = ''
    let title = ''
    let endDate: string | undefined
    let category: string | undefined
    if (aIsDate) { date = normalizeDate(a); title = (b ?? '').trim() }
    else if (bIsDate) { date = normalizeDate(b); title = (a ?? '').trim() }
    else continue
    if (c) {
      if (isDateLike(c)) endDate = normalizeDate(c)
      else category = c.trim()
    }
    if (d && !category) category = d.trim()
    if (title && date) {
      const r = extractRangeFromTitle(title, date)
      if (r && !endDate) endDate = r
      else if (!endDate && /주간/.test(title)) endDate = addDays(date, 4)
      out.push({ title, startDate: date, endDate, category })
    }
  }
  return out
}

export function parseICS(text: string): ImportedEvent[] {
  const events: ImportedEvent[] = []
  const blocks = text.split(/BEGIN:VEVENT/i).slice(1)
  for (const block of blocks) {
    const summaryMatch = /SUMMARY:(.+)/i.exec(block)
    const startMatch = /DTSTART(?:;[^:]*)?:(\d{8})(T\d{6}Z?)?/i.exec(block)
    const endMatch = /DTEND(?:;[^:]*)?:(\d{8})(T\d{6}Z?)?/i.exec(block)
    if (!summaryMatch || !startMatch) continue
    const title = summaryMatch[1].trim().replace(/\\,/g, ',').replace(/\\n/g, ' ')
    const s = startMatch[1]
    const startDate = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
    let endDate: string | undefined
    if (endMatch) {
      const e = endMatch[1]
      endDate = `${e.slice(0, 4)}-${e.slice(4, 6)}-${e.slice(6, 8)}`
    }
    events.push({ title, startDate, endDate, category: '학교행사' })
  }
  return events
}

export function parseXLSX(buf: ArrayBuffer): ImportedEvent[] {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const events: ImportedEvent[] = []
  const pad = (n: number): string => String(n).padStart(2, '0')
  const defaultYear = new Date().getFullYear()
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    let ctxYear = defaultYear
    let ctxMonth = 0
    for (const row of rows) {
      let dateStr: string | null = null
      const textParts: string[] = []
      let dayOnly: number | null = null
      for (const cell of row) {
        if (cell instanceof Date) {
          dateStr = dateStr ?? `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`
          ctxYear = cell.getFullYear()
          ctxMonth = cell.getMonth() + 1
          continue
        }
        const raw = String(cell).trim()
        if (!raw) continue
        const yrMon = /^(\d{4})년\s*(\d{1,2})월/.exec(raw)
        if (yrMon) { ctxYear = +yrMon[1]; ctxMonth = +yrMon[2]; continue }
        const monOnly = /^(\d{1,2})월$/.exec(raw)
        if (monOnly) { ctxMonth = +monOnly[1]; continue }
        const md = /^(\d{1,2})[월.\-/]\s?(\d{1,2})일?$/.exec(raw)
        if (md && !dateStr) {
          ctxMonth = +md[1]
          dateStr = `${ctxYear}-${pad(+md[1])}-${pad(+md[2])}`
          continue
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          dateStr = dateStr ?? raw
          ctxYear = +raw.slice(0, 4)
          ctxMonth = +raw.slice(5, 7)
          continue
        }
        if (/^\d{1,2}$/.test(raw)) {
          const n = +raw
          if (n >= 1 && n <= 31) { dayOnly = n; continue }
        }
        if (/^[월화수목금토일]요?일?$/.test(raw)) continue
        textParts.push(raw)
      }
      if (!dateStr && dayOnly !== null && ctxMonth > 0) {
        dateStr = `${ctxYear}-${pad(ctxMonth)}-${pad(dayOnly)}`
      }
      if (!dateStr || textParts.length === 0) continue
      const title = textParts.join(' ').trim()
      if (!title) continue
      let endDate: string | undefined
      const r = extractRangeFromTitle(title, dateStr)
      if (r) endDate = r
      else if (/주간/.test(title)) endDate = addDays(dateStr, 4)
      events.push({ title, startDate: dateStr, endDate, category: '학교행사' })
    }
  }
  return events
}

export function parseTextBlob(text: string): ImportedEvent[] {
  const events: ImportedEvent[] = []
  const defaultYear = new Date().getFullYear()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const rawLines = text.split(/\r?\n|\r|\t/).map((l) => l.trim()).filter(Boolean)
  let ctxYear = defaultYear
  let ctxMonth = 0
  for (const line of rawLines) {
    if (line.length > 400) continue
    const yrH = /(\d{4})\s*년/.exec(line)
    if (yrH) ctxYear = +yrH[1]
    const monH = /^(\d{1,2})월\s*$/.exec(line)
    if (monH) { ctxMonth = +monH[1]; continue }
    const rangeRe = /(\d{1,2})\s*[월./]\s*(\d{1,2})\s*일?\s*[(]?[월화수목금토일]?[)]?\s*[~\-–—～∼]\s*(?:(\d{1,2})\s*[월./]\s*)?(\d{1,2})\s*일?/
    const rm = rangeRe.exec(line)
    if (rm) {
      const m1 = +rm[1], d1 = +rm[2]
      const m2 = rm[3] ? +rm[3] : m1
      const d2 = +rm[4]
      if (isValidMD(m1, d1) && isValidMD(m2, d2)) {
        const startDate = `${ctxYear}-${pad(m1)}-${pad(d1)}`
        const endDate = `${ctxYear}-${pad(m2)}-${pad(d2)}`
        const title = cleanTitle(line.replace(rm[0], ''))
        if (title) events.push({ title, startDate, endDate, category: '학교행사' })
        ctxMonth = m1
        continue
      }
    }
    let dateStr: string | null = null
    const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(line)
    if (iso) {
      const m = +iso[2], d = +iso[3]
      if (isValidMD(m, d)) dateStr = `${iso[1]}-${pad(m)}-${pad(d)}`
    }
    if (!dateStr) {
      const md = /(\d{1,2})\s*[월./]\s*(\d{1,2})\s*일?/.exec(line)
      if (md) {
        const m = +md[1], d = +md[2]
        if (isValidMD(m, d)) {
          dateStr = `${ctxYear}-${pad(m)}-${pad(d)}`
          ctxMonth = m
        }
      }
    }
    if (!dateStr) continue
    const title = cleanTitle(
      line
        .replace(/\d{4}-\d{1,2}-\d{1,2}/, '')
        .replace(/\d{1,2}\s*[월./]\s*\d{1,2}\s*일?/, '')
        .replace(/\([월화수목금토일]\)/g, '')
        .replace(/[월화수목금토일]요일/g, '')
    )
    if (!title) continue
    let endDate: string | undefined
    const t = extractRangeFromTitle(title, dateStr)
    if (t) endDate = t
    else if (/주간/.test(title)) endDate = addDays(dateStr, 4)
    events.push({ title, startDate: dateStr, endDate, category: '학교행사' })
  }
  return events
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuote = !inQuote; continue }
    if (ch === ',' && !inQuote) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function isDateLike(s: string | undefined): boolean {
  if (!s) return false
  return /^\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(s.trim())
}

function normalizeDate(s: string): string {
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(s.trim())
  if (!m) return ''
  const [, y, mo, d] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export function extractRangeFromTitle(title: string, startDateStr: string): string | null {
  const m = /(\d{1,2})[./](\d{1,2})\s*[~\-–—～∼]\s*(?:(\d{1,2})[./])?(\d{1,2})/.exec(title)
  if (!m) return null
  const year = startDateStr.slice(0, 4)
  const endMonth = m[3] ? +m[3] : +m[1]
  const endDay = +m[4]
  return `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isValidMD(m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= 31
}

function cleanTitle(s: string): string {
  return s.replace(/^[\s\-:,~·|│▪■□◈◆◇☆★]+|[\s\-:,~·|│▪■□◈◆◇☆★]+$/g, '').trim()
}

// ─── 공용 파일 유틸 ────────────────────────────────────────
/** 과도하게 큰 파일 거부 (메모리 보호). 기본 40MB. */
export const MAX_IMPORT_BYTES = 40 * 1024 * 1024

export function assertFileSize(file: File, limit = MAX_IMPORT_BYTES): void {
  if (file.size > limit) {
    throw new Error(`파일이 너무 커요 (${Math.round(file.size / (1024 * 1024))}MB). ${Math.round(limit / (1024 * 1024))}MB 이하만 읽을 수 있어요.`)
  }
  if (file.size === 0) throw new Error('빈 파일이에요.')
}

/**
 * 한국 학교 환경에서 오는 CSV/TXT 는 UTF-8 과 EUC-KR(=CP949) 둘 다 흔하다.
 * 휴리스틱: BOM 우선 → UTF-8 엄격 디코드 시도 → 실패 시 EUC-KR → 최후로 loose UTF-8.
 */
export async function readTextAutoEncoding(file: File): Promise<string> {
  const ab = await file.arrayBuffer()
  const u8 = new Uint8Array(ab)
  // UTF-8 BOM
  if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(u8.slice(3))
  }
  // UTF-16 BE/LE BOM
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.slice(2))
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.slice(2))
  // UTF-8 엄격 — 유효하지 않으면 throw
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(ab)
  } catch {
    // EUC-KR / CP949 — 한글 윈도우 표준
    try {
      return new TextDecoder('euc-kr').decode(ab)
    } catch {
      // 최후 loose UTF-8 (깨진 바이트는 치환)
      return new TextDecoder('utf-8').decode(ab)
    }
  }
}

/**
 * PDF 텍스트 추출. unpdf 사용 — 순수 JS, WASM 없음.
 * 레이아웃에 따라 토큰 순서가 엇갈릴 수 있으나, 학사일정·학급명렬처럼
 * 텍스트 기반 문서는 대부분 읽힌다.
 */
export async function extractTextFromPdf(ab: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  try {
    const doc = await getDocumentProxy(new Uint8Array(ab))
    const { text } = await extractText(doc, { mergePages: true })
    return Array.isArray(text) ? text.join('\n') : (text as string) ?? ''
  } catch (err) {
    throw new Error(`PDF 읽기 실패: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ─── HWPX (한글 2010+ 최신 포맷: ZIP + XML) ─────────────────
/**
 * HWPX 파일에서 전체 텍스트를 추출.
 *
 * HWPX 는 OOXML 계열 컨테이너로 Zip 압축된 XML 묶음:
 *   Contents/section0.xml, Contents/section1.xml, ...
 * 각 섹션의 XML 은 HWPML 4 네임스페이스(hp:) 를 사용.
 *   - <hp:t>텍스트</hp:t>   : 텍스트 노드
 *   - <hp:p>...</hp:p>      : 문단 (경계에 개행)
 *   - <hp:tr>...</hp:tr>    : 테이블 행 (경계에 개행)
 *   - <hp:cell>...</hp:cell>: 테이블 셀 (경계에 탭)
 *
 * 학급명렬표·학사일정 둘 다 "텍스트 추출 → 기존 파서로 넘기기" 로 충분히 커버.
 */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([\da-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&') // & 마지막
}

export async function extractTextFromHwpx(ab: ArrayBuffer): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const u8 = new Uint8Array(ab)
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(u8)
  } catch (err) {
    throw new Error(`HWPX 압축 해제 실패: ${err instanceof Error ? err.message : String(err)}`)
  }
  // 섹션 파일만 추림(Contents/section*.xml). HWPX 버전에 따라 'contents/' 소문자일 수도 있어 대소문자 무시.
  const sectionKeys = Object.keys(files)
    .filter((k) => /(^|\/)section\d+\.xml$/i.test(k))
    .sort((a, b) => {
      const na = parseInt(a.match(/section(\d+)\.xml$/i)?.[1] ?? '0', 10)
      const nb = parseInt(b.match(/section(\d+)\.xml$/i)?.[1] ?? '0', 10)
      return na - nb
    })
  if (sectionKeys.length === 0) {
    // 섹션 파일이 없으면 Contents/content.hpf 의 spine 에서 경로를 얻을 수도 있으나,
    // 표준 경로가 안 맞는 케이스는 드물다. 있는 .xml 전부 fallback 스캔.
    const xmlKeys = Object.keys(files).filter((k) => k.toLowerCase().endsWith('.xml'))
    if (xmlKeys.length === 0) throw new Error('HWPX 안에 읽을 XML 섹션이 없어요.')
    sectionKeys.push(...xmlKeys)
  }

  const chunks: string[] = []
  for (const key of sectionKeys) {
    const xml = strFromU8(files[key])
    chunks.push(extractTextFromHwpxXml(xml))
  }
  return chunks.join('\n')
}

/**
 * HWPX section XML 하나에서 텍스트 추출.
 * 1차: `<hp:t>…</hp:t>` 를 직접 뽑아내서 문단/테이블 경계에 개행/탭 삽입.
 *      (정규표현식 단순 치환보다 순서·누락에 훨씬 견고)
 * 2차 fallback: 태그 전체 제거.
 */
function extractTextFromHwpxXml(xml: string): string {
  const out: string[] = []
  // 개행/탭 토큰 — 마지막에 치환되도록 특수 마커 사용
  const NL = '\x01' // end-of-paragraph / row / linebreak
  const TAB = '\x02' // end-of-cell

  // hp: 접두사 없이 쓰이는 변형(HWPX 2022+ 무-prefix 또는 다른 ns 접두사)도 커버
  const replaceClose = (tag: string, mark: string) => {
    const re = new RegExp(`<\\/([a-z]+:)?${tag}>`, 'gi')
    xml = xml.replace(re, `${mark}</$1${tag}>`)
  }
  replaceClose('p', NL)
  replaceClose('tr', NL)
  replaceClose('cell', TAB)
  xml = xml.replace(/<([a-z]+:)?linebreak\s*\/?>(?:<\/([a-z]+:)?linebreak>)?/gi, NL)
  xml = xml.replace(/<([a-z]+:)?tab\s*\/?>(?:<\/([a-z]+:)?tab>)?/gi, TAB)

  // <hp:t ...>내용</hp:t> 만 뽑아서 순차 누적. 속성은 무시, 내부 nested inline 태그는 안에서 제거.
  const tRe = /<([a-z]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/([a-z]+:)?t>/gi
  let lastEnd = 0
  let match: RegExpExecArray | null
  while ((match = tRe.exec(xml)) !== null) {
    // hp:t 바깥의 marker 들(NL/TAB)도 순서 보존
    const between = xml.slice(lastEnd, match.index)
    const betweenMarks = between.replace(/[^\x01\x02]/g, '')
    if (betweenMarks) out.push(betweenMarks)
    const inner = match[2].replace(/<[^>]+>/g, '')
    out.push(inner)
    lastEnd = match.index + match[0].length
  }
  const tail = xml.slice(lastEnd)
  const tailMarks = tail.replace(/[^\x01\x02]/g, '')
  if (tailMarks) out.push(tailMarks)

  let joined = out.join('')
  // hp:t 가 전혀 없는 XML이면 태그 제거 fallback
  if (!joined.trim()) {
    joined = xml.replace(/<[^>]+>/g, '')
  }
  joined = decodeXmlEntities(joined)
    .replace(new RegExp(NL, 'g'), '\n')
    .replace(new RegExp(TAB, 'g'), '\t')
    // 연속 개행 정리 (3개 이상 → 2개)
    .replace(/\n{3,}/g, '\n\n')
  return joined
}
