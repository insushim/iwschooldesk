/**
 * 학급명렬표 파일에서 학생 이름을 자동 추출.
 * 지원: .xlsx / .xls / .csv / .txt / .docx / .doc / .hwp
 *
 * 로직:
 *  - 파일에서 텍스트(또는 셀) 추출
 *  - 한글 2~4자 또는 영문 "Firstname Lastname" 패턴 매칭
 *  - 헤더·번호·학년·반 같은 제외 토큰 필터
 *  - 중복 제거, 등장 순서 보존
 */
import * as XLSX from 'xlsx'
import {
  parseHwpDoc, extractTextFromHwp, extractTextFromHwpx,
  extractTextFromPdf, readTextAutoEncoding, assertFileSize,
} from './schedule-import'

export type ImportStudentsResult =
  | { ok: true; names: string[]; fileName: string }
  | { ok: false; error: string }

// 한글 이름: 2~5자. 드물게 6자(복성+이름) 허용.
const KOREAN_NAME_RE = /^[가-힣]{2,6}$/
// 영문 이름: "Firstname Lastname" 또는 단일 단어 (대문자로 시작)
const ENGLISH_NAME_RE = /^[A-Z][a-zA-Z]{1,}(?:[\s\-'][A-Z][a-zA-Z]{1,})*$/
// 한자(CJK) 2~4자 이름 — 다문화 가정, 중국/일본 국적 학생 대응. 보수적으로 4자 이하.
const CJK_NAME_RE = /^[一-鿿]{2,4}$/
// 가타카나/히라가나 혼합 (일본어) — 외국인 학생 이름
const JAPANESE_NAME_RE = /^[぀-ゟ゠-ヿ]{2,8}$/

/** 학생 이름이 아니라 확실한 헤더/속성 단어들 (완전 일치할 때만 제외) */
const EXCLUDED_EXACT = new Set([
  '번호', '연번', '성명', '이름', '학번', '반', '학년', '학급', '담임',
  '학생', '성별', '생년월일', '주민등록번호', '주소', '연락처', '전화',
  '비고', '특이사항', '특기사항', '메모', '소속', '학과', '과정',
  '남', '여', '남자', '여자', '해당없음',
  '명렬표', '학급명렬표', '출석부', '출석',
  // 주 7일
  '월', '화', '수', '목', '금', '토', '일',
])

/** "1번", "01", "학년반: 6-2", "2026학년도" 같이 숫자·기호가 섞인 메타 텍스트를 걸러낸다. */
function isLikelyMetaToken(s: string): boolean {
  // 순수 숫자
  if (/^\d+$/.test(s)) return true
  // 날짜/연월일 패턴
  if (/^\d{4}[-./]\d{1,2}([-./]\d{1,2})?$/.test(s)) return true
  // "6학년 2반" 같은 학교 메타
  if (/학년|학반|학번/.test(s) && s.length <= 10) return true
  // 특수문자 섞인 짧은 토큰
  if (/[()[\]{}:;,./#%&*+=?<>|~_]/.test(s)) return true
  return false
}

function filterName(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  // 전각 공백/중간점/·/ 등 normalize 후 trim
  const t = String(raw)
    .replace(/[　 ]/g, ' ') // 전각/NBSP 공백 → 일반 공백
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return null
  if (EXCLUDED_EXACT.has(t)) return null
  if (isLikelyMetaToken(t)) return null
  if (KOREAN_NAME_RE.test(t)) return t
  if (CJK_NAME_RE.test(t)) return t
  if (JAPANESE_NAME_RE.test(t)) return t
  if (ENGLISH_NAME_RE.test(t) && t.length <= 40) return t
  // "홍·길동" 처럼 중간점 섞인 2~3파트 한글 이름 — 중간점 제거하고 재검사
  if (/^[가-힣·\s]{2,8}$/.test(t)) {
    const flat = t.replace(/[·\s]/g, '')
    if (KOREAN_NAME_RE.test(flat)) return flat
  }
  return null
}

function dedupePreserveOrder(arr: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of arr) {
    if (!seen.has(x)) { seen.add(x); out.push(x) }
  }
  return out
}

function parseXlsxNames(ab: ArrayBuffer): string[] {
  const wb = XLSX.read(ab, { type: 'array' })
  const names: string[] = []
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    for (const row of rows) {
      if (!Array.isArray(row)) continue
      for (const cell of row) {
        const name = filterName(cell)
        if (name) names.push(name)
      }
    }
  }
  return names
}

function parseTextNames(text: string): string[] {
  const names: string[] = []
  // 공백·탭·개행·쉼표·세미콜론·슬래시 등 일반 구분자로 토큰화
  const tokens = text.split(/[\s,;/|\t\n\r]+/)
  for (const tok of tokens) {
    const name = filterName(tok)
    if (name) names.push(name)
  }
  return names
}

export async function importStudentsFile(file: File): Promise<ImportStudentsResult> {
  const lower = file.name.toLowerCase()
  try {
    assertFileSize(file)
    let names: string[] = []
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm') || lower.endsWith('.ods')) {
      names = parseXlsxNames(await file.arrayBuffer())
    } else if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      const mammoth = await import('mammoth')
      const { value: text } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
      names = parseTextNames(text)
    } else if (lower.endsWith('.hwp')) {
      const doc = await parseHwpDoc(await file.arrayBuffer())
      const text = extractTextFromHwp(doc)
      names = parseTextNames(text)
    } else if (lower.endsWith('.hwpx')) {
      const text = await extractTextFromHwpx(await file.arrayBuffer())
      names = parseTextNames(text)
    } else if (lower.endsWith('.pdf')) {
      const text = await extractTextFromPdf(await file.arrayBuffer())
      names = parseTextNames(text)
    } else if (
      lower.endsWith('.csv') || lower.endsWith('.tsv') ||
      lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')
    ) {
      names = parseTextNames(await readTextAutoEncoding(file))
    } else {
      return {
        ok: false,
        error: '지원하지 않는 파일 형식이에요. 지원: .xlsx .xls .ods .hwp .hwpx .pdf .docx .doc .csv .tsv .txt .md',
      }
    }

    names = dedupePreserveOrder(names)
    if (names.length === 0) {
      return { ok: false, error: '파일에서 학생 이름을 찾지 못했어요. 이름이 한 셀/한 줄에 한 명씩 있는지 확인해 주세요.' }
    }
    return { ok: true, names, fileName: file.name }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `파일 파싱 오류: ${msg.slice(0, 160)}` }
  }
}
