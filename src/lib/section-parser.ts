export type SectionBlock =
  | { kind: 'section'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'spacer' }

const SECTION_RE = /^\s*\[([^\]]+)\]\s*$/
const HEADING_RE = /^\s*#{1,3}\s+(.+?)\s*$/
const BULLET_RE = /^\s*[-•·*]\s+(.+?)\s*$/

/**
 * 일반 텍스트를 섹션/불릿/본문 블록으로 파싱.
 *   [제목]  → 섹션 헤더
 *   ## 제목 → 섹션 헤더 (마크다운 스타일)
 *   - 항목 / • 항목 → 불릿
 *   빈 줄 → 섹션 간 간격
 */
export function parseSectionedText(input: string): SectionBlock[] {
  if (!input) return []
  const lines = input.split(/\r?\n/)
  const blocks: SectionBlock[] = []
  let pendingBlank = false

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.trim() === '') {
      if (blocks.length > 0) pendingBlank = true
      continue
    }
    if (pendingBlank) {
      blocks.push({ kind: 'spacer' })
      pendingBlank = false
    }

    const s = line.match(SECTION_RE) ?? line.match(HEADING_RE)
    if (s) {
      blocks.push({ kind: 'section', text: s[1].trim() })
      continue
    }
    const b = line.match(BULLET_RE)
    if (b) {
      blocks.push({ kind: 'bullet', text: b[1] })
      continue
    }
    blocks.push({ kind: 'text', text: line })
  }
  return blocks
}

/** content 한 줄이 섹션 헤더인지 판정 (체크리스트 아이템용). */
export function isSectionLine(line: string): string | null {
  const s = line.match(SECTION_RE) ?? line.match(HEADING_RE)
  return s ? s[1].trim() : null
}
