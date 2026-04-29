import { contextBridge, ipcRenderer } from 'electron'

/**
 * renderer가 구독 가능한 메인 → 렌더러 이벤트 채널 화이트리스트.
 * renderer가 이 집합 밖의 채널을 api.on()으로 구독하려 하면 조용히 무시한다.
 * (임의 채널 스누핑 방지)
 */
const ALLOWED_RECV_CHANNELS = new Set([
  'data:changed',
  'open-quick-input',
  'school-bell',
])

// (callback, wrapper) 매핑 — off가 등록 시점의 wrapper를 정확히 찾아 제거하기 위함.
// WeakMap이라 callback이 GC되면 자동 정리.
type AnyCb = (...args: unknown[]) => void
const listenerMap = new Map<string, WeakMap<AnyCb, (event: Electron.IpcRendererEvent, ...args: unknown[]) => void>>()

contextBridge.exposeInMainWorld('api', {
  schedule: {
    list: (filters?: unknown) => ipcRenderer.invoke('schedule:list', filters),
    create: (data: unknown) => ipcRenderer.invoke('schedule:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('schedule:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('schedule:delete', id),
    deleteAll: (): Promise<number> => ipcRenderer.invoke('schedule:deleteAll'),
  },
  task: {
    list: (filters?: unknown) => ipcRenderer.invoke('task:list', filters),
    create: (data: unknown) => ipcRenderer.invoke('task:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('task:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('task:delete', id),
    reorder: (items: unknown) => ipcRenderer.invoke('task:reorder', items),
  },
  memo: {
    list: (filters?: unknown) => ipcRenderer.invoke('memo:list', filters),
    create: (data: unknown) => ipcRenderer.invoke('memo:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('memo:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('memo:delete', id),
    reorder: (items: unknown) => ipcRenderer.invoke('memo:reorder', items),
  },
  timetable: {
    getSlots: (set?: string) => ipcRenderer.invoke('timetable:getSlots', set),
    setSlot: (data: unknown) => ipcRenderer.invoke('timetable:setSlot', data),
    deleteSlot: (id: string) => ipcRenderer.invoke('timetable:deleteSlot', id),
    getPeriods: () => ipcRenderer.invoke('timetable:getPeriods'),
    updatePeriods: (periods: unknown) => ipcRenderer.invoke('timetable:updatePeriods', periods),
    getOverrides: (date: string) => ipcRenderer.invoke('timetable:getOverrides', date),
    createOverride: (data: unknown) => ipcRenderer.invoke('timetable:createOverride', data),
    deleteOverride: (id: string) => ipcRenderer.invoke('timetable:deleteOverride', id),
  },
  checklist: {
    list: () => ipcRenderer.invoke('checklist:list'),
    create: (data: unknown) => ipcRenderer.invoke('checklist:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('checklist:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('checklist:delete', id),
    getItems: (id: string) => ipcRenderer.invoke('checklist:getItems', id),
    addItem: (data: unknown) => ipcRenderer.invoke('checklist:addItem', data),
    toggleItem: (id: string) => ipcRenderer.invoke('checklist:toggleItem', id),
    updateItem: (id: string, data: unknown) => ipcRenderer.invoke('checklist:updateItem', id, data),
    deleteItem: (id: string) => ipcRenderer.invoke('checklist:deleteItem', id),
    reorderItems: (items: unknown) => ipcRenderer.invoke('checklist:reorderItems', items),
  },
  section: {
    list: () => ipcRenderer.invoke('section:list'),
    create: (data: unknown) => ipcRenderer.invoke('section:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('section:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('section:delete', id),
    reorder: (items: unknown) => ipcRenderer.invoke('section:reorder', items),
  },
  dday: {
    list: () => ipcRenderer.invoke('dday:list'),
    create: (data: unknown) => ipcRenderer.invoke('dday:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('dday:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('dday:delete', id),
  },
  routine: {
    list: (kind?: 'personal' | 'classroom') => ipcRenderer.invoke('routine:list', kind),
    create: (data: unknown) => ipcRenderer.invoke('routine:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('routine:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('routine:delete', id),
    getItems: (routineId: string, date: string) => ipcRenderer.invoke('routine:getItems', routineId, date),
    addItem: (data: unknown) => ipcRenderer.invoke('routine:addItem', data),
    updateItem: (id: string, content: string) => ipcRenderer.invoke('routine:updateItem', id, content),
    deleteItem: (id: string) => ipcRenderer.invoke('routine:deleteItem', id),
    toggleCompletion: (itemId: string, date: string) => ipcRenderer.invoke('routine:toggleCompletion', itemId, date),
    dayNumber: (startDate: string, today: string) => ipcRenderer.invoke('routine:dayNumber', startDate, today),
    completionsInRange: (routineId: string, fromDate: string, toDate: string) =>
      ipcRenderer.invoke('routine:completionsInRange', routineId, fromDate, toDate),
  },
  goal: {
    list: () => ipcRenderer.invoke('goal:list'),
    create: (data: unknown) => ipcRenderer.invoke('goal:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('goal:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('goal:delete', id),
  },
  studentRecord: {
    list: () => ipcRenderer.invoke('studentRecord:list'),
    create: (data: { student_name: string; content: string; tag?: string }) =>
      ipcRenderer.invoke('studentRecord:create', data),
    update: (id: string, data: { student_name?: string; content?: string; tag?: string }) =>
      ipcRenderer.invoke('studentRecord:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('studentRecord:delete', id),
    isPasswordSet: () => ipcRenderer.invoke('studentRecord:isPasswordSet'),
    setPassword: (newPw: string, curPw?: string) =>
      ipcRenderer.invoke('studentRecord:setPassword', newPw, curPw),
    verifyPassword: (pw: string) => ipcRenderer.invoke('studentRecord:verifyPassword', pw),
    clearPassword: (curPw: string) => ipcRenderer.invoke('studentRecord:clearPassword', curPw),
    exportLogs: () => ipcRenderer.invoke('studentRecord:exportLogs'),
    exportCsv: () => ipcRenderer.invoke('studentRecord:exportCsv'),
  },
  meal: {
    searchSchool: (name: string, apiKey?: string) => ipcRenderer.invoke('meal:searchSchool', name, apiKey),
    fetchToday: (scCode: string, schoolCode: string, ymd: string, apiKey?: string) =>
      ipcRenderer.invoke('meal:fetchToday', scCode, schoolCode, ymd, apiKey),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },
  widget: {
    getPositions: () => ipcRenderer.invoke('widget:getPositions'),
    savePosition: (pos: unknown) => ipcRenderer.invoke('widget:savePosition', pos),
    toggleVisibility: (id: string) => ipcRenderer.invoke('widget:toggleVisibility', id),
    openWindow: (type: string, opts?: { instanceId?: string }) => ipcRenderer.invoke('widget:openWindow', type, opts),
    closeWindow: (type: string) => ipcRenderer.invoke('widget:closeWindow', type),
    isOpen: (type: string) => ipcRenderer.invoke('widget:isOpen', type),
    listOpen: () => ipcRenderer.invoke('widget:listOpen'),
    setOpacity: (value: number) => ipcRenderer.send('widget:setOpacity', value),
    setAlwaysOnTop: (flag: boolean) => ipcRenderer.send('window:always-on-top', flag),
    getAlwaysOnTop: () => ipcRenderer.invoke('widget:getAlwaysOnTop'),
    setFontScale: (scale: number) => ipcRenderer.send('widget:setFontScale', scale),
    getFontScale: () => ipcRenderer.invoke('widget:getFontScale'),
    focusSelf: () => ipcRenderer.send('widget:focusSelf'),
    closeSelf: () => ipcRenderer.send('window:close'),
    // 잠금형 위젯에서만 사용 — compact=true 면 헤더 높이로 축소, false 면 이전 높이 복원.
    // 컴팩트 상태의 리사이즈는 DB 에 저장되지 않음(진짜 창 크기 보존).
    setLockCompact: (compact: boolean) => ipcRenderer.send('widget:setLockCompact', compact),
    // 배경화면 모드
    setWallpaperMode: (widgetId: string, on: boolean) =>
      ipcRenderer.invoke('widget:setWallpaperMode', widgetId, on),
    exitAllWallpaperMode: () => ipcRenderer.invoke('widget:exitAllWallpaperMode'),
    getWallpaperModeMap: (): Promise<string[]> => ipcRenderer.invoke('widget:getWallpaperModeMap'),
    /** main → renderer 브로드캐스트 구독 */
    onWallpaperModeChanged: (cb: (payload: { widgetId: string; on: boolean }) => void) => {
      const listener = (_: Electron.IpcRendererEvent, p: { widgetId: string; on: boolean }) => cb(p)
      ipcRenderer.on('wallpaper-mode-changed', listener)
      return () => ipcRenderer.removeListener('wallpaper-mode-changed', listener)
    },
    // 최소화(= 창 숨김). 복원은 WidgetLauncher 의 토글에서 openWindow → showInactive 로.
    minimizeSelf: () => ipcRenderer.send('window:minimize'),
    // 디스플레이 모드 마스터 토글 — 모든 위젯에 헤더 숨김 상태 동기화.
    setAllDisplayMode: (on: boolean) => ipcRenderer.send('widget:setAllDisplayMode', on),
    onAllDisplayModeChanged: (cb: (payload: { on: boolean }) => void) => {
      const listener = (_: Electron.IpcRendererEvent, p: { on: boolean }) => cb(p)
      ipcRenderer.on('all-display-mode-changed', listener)
      return () => ipcRenderer.removeListener('all-display-mode-changed', listener)
    },
  },
  backup: {
    isConfigured: () => ipcRenderer.invoke('backup:isConfigured'),
    generateMnemonic: (lang?: 'korean' | 'english'): Promise<string> =>
      ipcRenderer.invoke('backup:generateMnemonic', lang),
    verifyMnemonic: (phrase: string, lang?: 'korean' | 'english'): Promise<boolean> =>
      ipcRenderer.invoke('backup:verifyMnemonic', phrase, lang),
    setup: (opts: { password: string; mnemonic: string }) =>
      ipcRenderer.invoke('backup:setup', opts),
    clearSetup: (opts: { password: string }) =>
      ipcRenderer.invoke('backup:clearSetup', opts),
    exportEncrypted: (opts: { password: string }) =>
      ipcRenderer.invoke('backup:exportEncrypted', opts),
    previewEncrypted: (opts: { password?: string; mnemonic?: string }) =>
      ipcRenderer.invoke('backup:previewEncrypted', opts),
    importEncrypted: (opts: { password?: string; mnemonic?: string; replaceLocalSetup?: boolean }) =>
      ipcRenderer.invoke('backup:importEncrypted', opts),
    revealMnemonic: (opts: { password: string }) =>
      ipcRenderer.invoke('backup:revealMnemonic', opts),
    detectCloudFolders: () => ipcRenderer.invoke('backup:detectCloudFolders'),
    getAutoConfig: () => ipcRenderer.invoke('backup:getAutoConfig'),
    setAutoFolder: (opts: { basePath: string }) =>
      ipcRenderer.invoke('backup:setAutoFolder', opts),
    pickAutoFolder: () => ipcRenderer.invoke('backup:pickAutoFolder'),
    setAutoFrequency: (opts: { frequency: 'off' | 'daily' | 'weekly' }) =>
      ipcRenderer.invoke('backup:setAutoFrequency', opts),
    runAutoNow: () => ipcRenderer.invoke('backup:runAutoNow'),
    listBackupsInFolder: (opts: { folder?: string } = {}) =>
      ipcRenderer.invoke('backup:listBackupsInFolder', opts),
    importFromPath: (opts: {
      filePath: string
      password?: string
      mnemonic?: string
      replaceLocalSetup?: boolean
    }) => ipcRenderer.invoke('backup:importFromPath', opts),
  },
  system: {
    minimize: () => ipcRenderer.send('window:minimize'),
    close: () => ipcRenderer.send('window:close'),
    maximize: () => ipcRenderer.send('window:maximize'),
    setAlwaysOnTop: (flag: boolean) => ipcRenderer.send('window:always-on-top', flag),
    showNotification: (title: string, body: string) => ipcRenderer.invoke('notification:show', title, body),
    // 벨 이벤트를 모든 창(메인 + 위젯들)에 브로드캐스트 → 듀얼 모니터의 시계 위젯에 시각 알림 표시.
    broadcastBell: (payload: { kind: 'start' | 'end'; periodLabel: string; periodNumber: number }) =>
      ipcRenderer.send('bell:broadcast', payload),
    exportData: () => ipcRenderer.invoke('data:export'),
    // 주의: filePath 인자는 더 이상 사용하지 않는다. main이 내부에서 파일 선택 대화상자를 직접 띄우고,
    // renderer가 임의 경로를 지정할 수 없도록 차단한다. 인자는 무시된다.
    importData: (_filePath?: string) => ipcRenderer.invoke('data:import'),
    selectFile: () => ipcRenderer.invoke('system:selectFile'),
    getAppVersion: () => ipcRenderer.invoke('system:getAppVersion'),
    setAutoStart: (enabled: boolean) => ipcRenderer.invoke('system:setAutoStart', enabled),
    isLaunchedAtStartup: () => ipcRenderer.invoke('system:isLaunchedAtStartup'),
    isAutoStartEnabled: () => ipcRenderer.invoke('system:isAutoStartEnabled'),
    isPortable: () => ipcRenderer.invoke('system:isPortable'),
  },
  // on()이 등록할 때 wrapper(_event ⇒ callback)를 만들기 때문에,
  // off()에서 원본 callback을 그대로 removeListener에 넘기면 매칭 실패 → 누수.
  // 채널별로 callback → wrapper 매핑을 유지해서 off에서 정확히 같은 wrapper를 제거한다.
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_RECV_CHANNELS.has(channel)) return
    const wrapper = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    let perChannel = listenerMap.get(channel)
    if (!perChannel) { perChannel = new WeakMap(); listenerMap.set(channel, perChannel) }
    // 동일 callback에 대한 이전 wrapper가 남아있으면 우선 제거(중복 등록 방지)
    const prev = perChannel.get(callback)
    if (prev) { try { ipcRenderer.removeListener(channel, prev) } catch { /* ignore */ } }
    perChannel.set(callback, wrapper)
    ipcRenderer.on(channel, wrapper)
  },
  off: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_RECV_CHANNELS.has(channel)) return
    const perChannel = listenerMap.get(channel)
    const wrapper = perChannel?.get(callback)
    if (wrapper) {
      ipcRenderer.removeListener(channel, wrapper)
      perChannel!.delete(callback)
    }
  },
})
