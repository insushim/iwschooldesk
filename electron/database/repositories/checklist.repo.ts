import { v4 as uuid } from 'uuid'
import { getDatabase } from '../connection'
import { ALLOWED_UPDATE_FIELDS } from '../allowed-fields'
import type { Checklist, ChecklistItem, CreateChecklistInput, UpdateChecklistInput, CreateChecklistItemInput } from '../../../src/types/checklist.types'

export function listChecklists(): Checklist[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM checklists ORDER BY sort_order ASC, created_at DESC').all() as Checklist[]
}

export function createChecklist(data: CreateChecklistInput): Checklist {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

  db.prepare(`
    INSERT INTO checklists (id, title, description, color, is_template, category, section_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.title, data.description ?? '', data.color ?? '#2563EB', data.is_template ?? 0, data.category ?? '일반', data.section_id ?? null, now, now)

  return db.prepare('SELECT * FROM checklists WHERE id = ?').get(id) as Checklist
}

export function updateChecklist(id: string, data: UpdateChecklistInput): Checklist {
  const db = getDatabase()
  const fields: string[] = []
  const params: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (!ALLOWED_UPDATE_FIELDS.checklists.has(key)) continue
    fields.push(`${key} = ?`)
    params.push(value)
  }

  fields.push("updated_at = datetime('now','localtime')")
  params.push(id)

  db.prepare(`UPDATE checklists SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  return db.prepare('SELECT * FROM checklists WHERE id = ?').get(id) as Checklist
}

export function deleteChecklist(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM checklists WHERE id = ?').run(id)
}

export function getChecklistItems(checklistId: string): ChecklistItem[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY sort_order ASC').all(checklistId) as ChecklistItem[]
}

export function addChecklistItem(data: CreateChecklistItemInput): ChecklistItem {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM checklist_items WHERE checklist_id = ?').get(data.checklist_id) as { m: number | null })?.m ?? 0

  db.prepare(`
    INSERT INTO checklist_items (id, checklist_id, content, sort_order, due_date, assignee, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.checklist_id, data.content, maxOrder + 1, data.due_date ?? null, data.assignee ?? '', now)

  return db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id) as ChecklistItem
}

export function toggleChecklistItem(id: string): ChecklistItem {
  const db = getDatabase()
  // 체크하면 checked_at 기록, 해제하면 null. 24시간 경과 후 자동 삭제의 근거가 됨.
  db.prepare(`
    UPDATE checklist_items
    SET is_checked = CASE WHEN is_checked = 0 THEN 1 ELSE 0 END,
        checked_at = CASE WHEN is_checked = 0 THEN datetime('now','localtime') ELSE NULL END
    WHERE id = ?
  `).run(id)
  return db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id) as ChecklistItem
}

/** 체크된 지 24시간 이상 지난 항목을 일괄 삭제. 반환값은 삭제된 row 수. */
export function deleteExpiredCheckedItems(): number {
  const db = getDatabase()
  const res = db.prepare(`
    DELETE FROM checklist_items
    WHERE is_checked = 1
      AND checked_at IS NOT NULL
      AND datetime(checked_at, '+24 hours') <= datetime('now','localtime')
  `).run()
  return res.changes ?? 0
}

export function deleteChecklistItem(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM checklist_items WHERE id = ?').run(id)
}

export function updateChecklistItem(
  id: string,
  data: { content?: string; due_date?: string | null; assignee?: string }
): ChecklistItem {
  const db = getDatabase()
  const fields: string[] = []
  const values: (string | null)[] = []
  if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content) }
  if (data.due_date !== undefined) { fields.push('due_date = ?'); values.push(data.due_date) }
  if (data.assignee !== undefined) { fields.push('assignee = ?'); values.push(data.assignee) }
  if (fields.length > 0) {
    values.push(id)
    db.prepare(`UPDATE checklist_items SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }
  return db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id) as ChecklistItem
}

export function reorderChecklistItems(items: { id: string; sort_order: number }[]): void {
  const db = getDatabase()
  const stmt = db.prepare('UPDATE checklist_items SET sort_order = ? WHERE id = ?')
  const transaction = db.transaction(() => {
    for (const item of items) {
      stmt.run(item.sort_order, item.id)
    }
  })
  transaction()
}

export function seedTemplates(): void {
  const db = getDatabase()
  const existing = db.prepare('SELECT COUNT(*) as c FROM checklists WHERE is_template = 1').get() as { c: number }
  if (existing.c > 0) return

  const templates = [
    {
      title: '월초 업무 체크리스트',
      category: '업무',
      items: ['출석부 정리 및 확인', '학급 경영록 기록', '월간 학습 진도표 확인', '생활기록부 점검', '학교생활 안전교육 실시', '급식 지도 계획 확인', '학부모 알림장 발송', '교실 환경 정비', '이달의 행사 일정 확인', '교과 평가 계획 점검']
    },
    {
      title: '학기말 성적 처리',
      category: '업무',
      items: ['수행평가 성적 입력', '지필평가 채점 완료', 'NEIS 성적 입력', '성적 오류 검증', '성적 확인서 출력/검토', '학부모 성적 통지', '생활기록부 세부능력특기사항 작성', '행동발달 종합의견 작성', '출결 현황 최종 확인', '성적 관련 민원 대응 준비']
    },
    {
      title: '현장학습 준비',
      category: '점검',
      items: ['현장학습 계획서 작성', '학부모 동의서 수합', '차량 예약 확인', '보험 가입 확인', '인솔교사 배정 확인', '비상연락망 작성', '안전교육 실시', '점심/간식 준비 확인', '우천 시 대체 계획', '응급처치 키트 준비']
    },
    {
      title: '학부모 상담 준비',
      category: '학급',
      items: ['상담 일정 안내 발송', '상담 시간표 작성', '학생별 상담 자료 준비', '성적/생활 현황 정리', '교실 상담 환경 정비', '상담 기록지 준비', '특이사항 학생 메모', '상담 후 기록 정리']
    }
  ]

  const transaction = db.transaction(() => {
    for (const tmpl of templates) {
      const clId = uuid()
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
      db.prepare(`
        INSERT INTO checklists (id, title, color, is_template, category, created_at, updated_at)
        VALUES (?, ?, '#2563EB', 1, ?, ?, ?)
      `).run(clId, tmpl.title, tmpl.category, now, now)

      tmpl.items.forEach((content, idx) => {
        const itemId = uuid()
        db.prepare(`
          INSERT INTO checklist_items (id, checklist_id, content, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(itemId, clId, content, idx, now)
      })
    }
  })
  transaction()
}
