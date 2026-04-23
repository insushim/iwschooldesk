export interface Section {
  id: string
  name: string
  color: string
  icon: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CreateSectionInput {
  name: string
  color?: string
  icon?: string
}

export interface UpdateSectionInput extends Partial<CreateSectionInput> {
  sort_order?: number
}
