import { useState, useEffect, useCallback } from 'react'
import type { Checklist, ChecklistItem, CreateChecklistInput, CreateChecklistItemInput } from '../types/checklist.types'
import { useDataChange } from './useDataChange'

export function useChecklists() {
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await window.api.checklist.list()
    setChecklists(data)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useDataChange('checklist', refresh)

  const create = async (data: CreateChecklistInput) => {
    const c = await window.api.checklist.create(data)
    setChecklists((prev) => [...prev, c])
    return c
  }

  const remove = async (id: string) => {
    await window.api.checklist.delete(id)
    setChecklists((prev) => prev.filter((x) => x.id !== id))
  }

  return { checklists, loading, refresh, create, remove }
}

export function useChecklistItems(checklistId: string | null) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!checklistId) return
    setLoading(true)
    const data = await window.api.checklist.getItems(checklistId)
    setItems(data)
    setLoading(false)
  }, [checklistId])

  useEffect(() => { refresh() }, [refresh])
  useDataChange('checklist', refresh)

  const addItem = async (data: CreateChecklistItemInput) => {
    const item = await window.api.checklist.addItem(data)
    setItems((prev) => [...prev, item])
    return item
  }

  const toggleItem = async (id: string) => {
    const item = await window.api.checklist.toggleItem(id)
    setItems((prev) => prev.map((x) => (x.id === id ? item : x)))
    return item
  }

  const deleteItem = async (id: string) => {
    await window.api.checklist.deleteItem(id)
    setItems((prev) => prev.filter((x) => x.id !== id))
  }

  const progress = items.length > 0 ? Math.round((items.filter((i) => i.is_checked).length / items.length) * 100) : 0

  return { items, loading, refresh, addItem, toggleItem, deleteItem, progress }
}
