/**
 * 안전한 JSON.parse 래퍼. 손상된 JSON·null·undefined 입력 시 fallback 반환.
 * 사용처: localStorage 값, DB column 값, 백업 파일 plaintext 등 신뢰할 수 없는 입력.
 */
export function safeJsonParse<T>(text: string | null | undefined, fallback: T): T {
  if (text == null || text === '') return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}
