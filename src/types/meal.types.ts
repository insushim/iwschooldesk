export interface MealMenu {
  date: string  // YYYY-MM-DD
  mealType: '조식' | '중식' | '석식' | string
  dishes: string[]  // 알레르기 마크 제거된 메뉴 항목들
  rawText: string   // 원문 (알레르기 표시 포함, '< br/>' 그대로)
  calInfo?: string  // 칼로리 정보 (예: "682.4 Kcal")
}

export interface NeisSchool {
  scCode: string      // ATPT_OFCDC_SC_CODE — 시도교육청 코드
  schoolCode: string  // SD_SCHUL_CODE — 학교 표준코드
  name: string        // SCHUL_NM — 학교명
  type?: string       // SCHUL_KND_SC_NM — 학교종류 (초/중/고)
  address?: string    // ORG_RDNMA — 도로명 주소
}

export interface MealConfig {
  apiKey?: string             // NEIS 인증키 (선택 — 없으면 일일 1만 건 제한 공용)
  school: NeisSchool | null   // 선택된 학교
}
