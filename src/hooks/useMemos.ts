import { useState, useEffect, useCallback } from 'react'
import type { Memo, CreateMemoInput, UpdateMemoInput, MemoFilter } from '../types/memo.types'

export function useMemos(filters?: MemoFilter) {
  const [memos, setMemos] = useState<Memo[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await window.api.memo.list(filters)
    setMemos(data)
    setLoading(false)
  }, [filters])

  useEffect(() => { refresh() }, [refresh])

  const create = async (data: CreateMemoInput) => {
    const m = await window.api.memo.create(data)
    setMemos((prev) => [m, ...prev])
    return m
  }

  const update = async (id: string, data: UpdateMemoInput) => {
    const m = await window.api.memo.update(id, data)
    setMemos((prev) => prev.map((x) => (x.id === id ? m : x)))
    return m
  }

  const remove = async (id: string) => {
    await window.api.memo.delete(id)
    setMemos((prev) => prev.filter((x) => x.id !== id))
  }

  return { memos, loading, refresh, create, update, remove }
}
