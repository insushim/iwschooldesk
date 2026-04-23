import { useState, useEffect, useCallback } from 'react'
import type { Task, CreateTaskInput, UpdateTaskInput, TaskFilter } from '../types/task.types'
import { useDataChange } from './useDataChange'

export function useTasks(filters?: TaskFilter) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await window.api.task.list(filters)
    setTasks(data)
    setLoading(false)
  }, [filters])

  useEffect(() => { refresh() }, [refresh])
  useDataChange('task', refresh)

  const create = async (data: CreateTaskInput) => {
    const t = await window.api.task.create(data)
    setTasks((prev) => [...prev, t])
    return t
  }

  const update = async (id: string, data: UpdateTaskInput) => {
    const t = await window.api.task.update(id, data)
    setTasks((prev) => prev.map((x) => (x.id === id ? t : x)))
    return t
  }

  const remove = async (id: string) => {
    await window.api.task.delete(id)
    setTasks((prev) => prev.filter((x) => x.id !== id))
  }

  return { tasks, loading, refresh, create, update, remove }
}
