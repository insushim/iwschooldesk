export interface Memo {
  id: string
  title: string
  content: string
  color: MemoColor
  is_pinned: number
  category: string
  tags: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type MemoColor =
  | '#FEF3C7'
  | '#D1FAE5'
  | '#DBEAFE'
  | '#FCE7F3'
  | '#EDE9FE'
  | '#FFEDD5'
  | '#CFFAFE'
  | '#F1F5F9'

export const MEMO_COLORS: { label: string; value: MemoColor }[] = [
  { label: '노랑', value: '#FEF3C7' },
  { label: '초록', value: '#D1FAE5' },
  { label: '파랑', value: '#DBEAFE' },
  { label: '분홍', value: '#FCE7F3' },
  { label: '보라', value: '#EDE9FE' },
  { label: '주황', value: '#FFEDD5' },
  { label: '하늘', value: '#CFFAFE' },
  { label: '회색', value: '#F1F5F9' },
]

export interface CreateMemoInput {
  title?: string
  content?: string
  color?: MemoColor
  category?: string
  tags?: string[]
}

export interface UpdateMemoInput extends Partial<CreateMemoInput> {
  is_pinned?: number
  sort_order?: number
}

export interface MemoFilter {
  category?: string
  search?: string
  isPinned?: boolean
}
