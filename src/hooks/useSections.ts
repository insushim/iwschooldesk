import { useState, useEffect, useCallback } from 'react'
import type { Section, CreateSectionInput, UpdateSectionInput } from '../types/section.types'

export function useSections() {
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await window.api.section.list()
    setSections(data)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const create = async (data: CreateSectionInput) => {
    const s = await window.api.section.create(data)
    setSections((prev) => [...prev, s].sort((a, b) => a.sort_order - b.sort_order))
    return s
  }

  const update = async (id: string, data: UpdateSectionInput) => {
    const s = await window.api.section.update(id, data)
    setSections((prev) => prev.map((x) => (x.id === id ? s : x)))
    return s
  }

  const remove = async (id: string) => {
    await window.api.section.delete(id)
    setSections((prev) => prev.filter((x) => x.id !== id))
  }

  const reorder = async (items: { id: string; sort_order: number }[]) => {
    await window.api.section.reorder(items)
    await refresh()
  }

  return { sections, loading, refresh, create, update, remove, reorder }
}
