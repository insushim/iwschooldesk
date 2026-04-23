import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, screen, shell, session } from 'electron'
import { join } from 'path'
import { execFile } from 'child_process'
import { existsSync, mkdirSync, unlinkSync, appendFileSync } from 'fs'

// ───── Windows Z-order 제어 (네이티브 Win32 FFI) ─────
// blur 시 위젯을 "맨 뒤"로 밀어내기 위해 user32.dll의 SetWindowPos를 사용한다.
// 로드 실패 시 graceful degradation — 위젯은 일반 창처럼 동작.
type SetWindowPosFn = (hwnd: Buffer, insertAfter: number, x: number, y: number, cx: number, cy: number, flags: number) => boolean
let _setWindowPos: SetWindowPosFn | null = null
const HWND_BOTTOM = 1
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOACTIVATE = 0x0010
const SWP_NOOWNERZORDER = 0x0200

function initWin32Z(): void {
  if (process.platform !== 'win32') return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    _setWindowPos = user32.func('__stdcall', 'SetWindowPos',
      'bool', ['void*', 'long', 'int', 'int', 'int', 'int', 'uint']
    ) as unknown as SetWindowPosFn
  } catch (err) {
    // koffi 로드 실패 — 일반 Electron 동작으로 fallback
    console.warn('[z-order] koffi load failed:', err)
  }
}

function pushWindowToBack(win: BrowserWindow): void {
  if (!_setWindowPos || win.isDestroyed()) return
  try {
    const hwnd = win.getNativeWindowHandle()
    _setWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER)
  } catch { /* 무시 */ }
}
import { getDatabase, closeDatabase } from './database/connection'
import { registerIpcHandlers } from './ipc/handlers'
import { seedTemplates, deleteExpiredCheckedItems } from './database/repositories/checklist.repo'
import { getWidgetPositions, saveWidgetPosition, getSetting } from './database/repositories/settings.repo'

const AUTO_START_REG_NAME = 'SchoolDesk'
const AUTO_START_REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const STARTUP_CMD_FILENAME = 'SchoolDesk-AutoStart.cmd'

function logAutoStart(msg: string): void {
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'autostart.log'), `[${new Date().toISOString()}] ${msg}\n`)
  } catch { /* noop */ }
}

function isPortableWin(): boolean {
  return process.platform === 'win32' && !!process.env.PORTABLE_EXECUTABLE_FILE
}

function getStartupFolder(): string {
  // %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
  return join(
    app.getPath('appData'),
    'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup',
  )
}

function getStartupCmdPath(): string {
  return join(getStartupFolder(), STARTUP_CMD_FILENAME)
}

// (writeStartupCmd는 레지스트리 Run 방식으로 통일하면서 제거됨.
//  removeStartupCmd는 legacy 배치파일 정리 목적으로 유지)

function removeStartupCmd(): void {
  try {
    const filePath = getStartupCmdPath()
    if (existsSync(filePath)) {
      unlinkSync(filePath)
      logAutoStart(`startup cmd removed: ${filePath}`)
    }
  } catch (err) {
    logAutoStart(`removeStartupCmd error: ${String(err)}`)
  }
}

function regExePath(): string {
  // reg.exe 절대경로 우선, 실패 시 PATH 검색 fallback
  const win = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows'
  const abs = join(win, 'System32', 'reg.exe')
  return existsSync(abs) ? abs : 'reg'
}

function regAddAutoStart(exePath: string): Promise<void> {
  return new Promise((resolve) => {
    execFile(
      regExePath(),
      [
        'add', AUTO_START_REG_KEY,
        '/v', AUTO_START_REG_NAME,
        '/t', 'REG_SZ',
        '/d', `"${exePath}" --autostart`,
        '/f',
      ],
      { windowsHide: true },
      (err, stdout, stderr) => {
        if (err) logAutoStart(`reg add error: ${err.message} | stderr: ${stderr}`)
        else logAutoStart(`reg add ok: ${stdout.trim()}`)
        resolve()
      },
    )
  })
}

function regDeleteAutoStart(): Promise<void> {
  return new Promise((resolve) => {
    execFile(
      regExePath(),
      ['delete', AUTO_START_REG_KEY, '/v', AUTO_START_REG_NAME, '/f'],
      { windowsHide: true },
      () => resolve(),
    )
  })
}

function regQueryAutoStart(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      regExePath(),
      ['query', AUTO_START_REG_KEY, '/v', AUTO_START_REG_NAME],
      { windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null)
        const m = stdout.match(/REG_SZ\s+(.+)/)
        resolve(m ? m[1].trim() : null)
      },
    )
  })
}

async function applyAutoStart(enabled: boolean): Promise<void> {
  if (process.platform === 'darwin') {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      args: ['--autostart'],
    })
    return
  }
  if (process.platform !== 'win32') return

  if (isPortableWin()) {
    const exePath = process.env.PORTABLE_EXECUTABLE_FILE!
    logAutoStart(`applyAutoStart(portable) enabled=${enabled} exe=${exePath}`)
    // Legacy cleanup: 이전 버전에서 만든 Startup 폴더의 배치파일이 있으면 제거
    // (현재는 레지스트리 Run 키만 사용)
    removeStartupCmd()
    if (enabled) {
      await regAddAutoStart(exePath)
    } else {
      await regDeleteAutoStart()
    }
    return
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    args: ['--autostart'],
  })
}

async function isAutoStartEnabled(): Promise<boolean> {
  if (process.platform === 'darwin') {
    return app.getLoginItemSettings().openAtLogin
  }
  if (process.platform !== 'win32') return false
  if (isPortableWin()) {
    return (await regQueryAutoStart()) !== null
  }
  return app.getLoginItemSettings({ args: ['--autostart'] }).openAtLogin
}

function isLaunchedAtStartup(): boolean {
  if (process.argv.includes('--autostart')) return true
  if (process.platform === 'win32') {
    return app.getLoginItemSettings({ args: ['--autostart'] }).wasOpenedAtLogin
  }
  if (process.platform === 'darwin') {
    return app.getLoginItemSettings().wasOpenedAtLogin
  }
  return false
}

type WidgetType =
  | 'calendar' | 'task' | 'memo' | 'timetable'
  | 'checklist' | 'timer' | 'dday' | 'clock' | 'routine' | 'goal' | 'studentcheck'
  | 'studenttimetable' | 'today' | 'studentrecord'

const WIDGET_DEFAULTS: Record<WidgetType, { w: number; h: number }> = {
  calendar:  { w: 360, h: 420 },
  task:      { w: 340, h: 460 },
  memo:      { w: 320, h: 360 },
  timetable: { w: 280, h: 440 },
  checklist: { w: 320, h: 420 },
  timer:     { w: 300, h: 360 },
  dday:      { w: 320, h: 300 },
  clock:     { w: 300, h: 200 },
  routine:   { w: 340, h: 440 },
  goal:      { w: 340, h: 260 },
  studentcheck: { w: 380, h: 480 },
  studenttimetable: { w: 420, h: 280 },
  today:     { w: 440, h: 320 },
  studentrecord: { w: 380, h: 460 },
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const widgetWindows = new Map<string, BrowserWindow>()
/** Pin ON 상태인 위젯 id 집합. blur 시 뒤로 안 보냄. */
const pinnedWidgets = new Set<string>()
/**
 * 배경화면 모드: 클릭 통과 + z-order 최하단 고정. 키 = widget_id.
 * 값 = periodic re-push interval id. 다른 창이 위로 올라와도 2초마다 HWND_BOTTOM 재적용.
 */
const wallpaperWidgets = new Map<string, NodeJS.Timeout>()
/** 잠금 컴팩트 모드인 위젯 window id 집합 — 이 상태에서 발생한 resize 는 DB 저장 건너뜀. */
const lockedCompactWindows = new Set<number>()
/** 잠금 직전 "확장 상태" 창 높이 저장 — 잠금 해제 시 복구용. key = win.id */
const lockedCompactPrevHeight = new Map<number, number>()

/** 배경화면 모드 ON/OFF. 실패해도 예외 전파 안 함(UX 우선). */
function setWallpaperMode(widgetId: string, on: boolean): void {
  const win = widgetWindows.get(widgetId)
  if (!win || win.isDestroyed()) return

  const existing = wallpaperWidgets.get(widgetId)
  if (existing) { clearInterval(existing); wallpaperWidgets.delete(widgetId) }

  if (on) {
    try {
      // 클릭 통과 — `forward: true` 로 hover 이벤트만 받고 mouse 입력은 아래 창으로 전달.
      win.setIgnoreMouseEvents(true, { forward: true })
      // Pin 해제 (배경 모드에서 Pin 의미 없음)
      pinnedWidgets.delete(widgetId)
      win.setAlwaysOnTop(false)
      win.setSkipTaskbar(true)
      win.setFocusable(false)
      pushWindowToBack(win)
      // 다른 창이 위에 올라오면 주기적으로 다시 맨 뒤로.
      const t = setInterval(() => {
        if (win.isDestroyed()) { clearInterval(t); wallpaperWidgets.delete(widgetId); return }
        pushWindowToBack(win)
      }, 2000)
      wallpaperWidgets.set(widgetId, t)
    } catch { /* OS별 실패는 무시 */ }
    try {
      const widgetType = widgetId.replace(/^widget-/, '').split('-')[0] as WidgetType
      saveWidgetPosition({ widget_id: widgetId, widget_type: widgetType, wallpaper_mode: 1 })
    } catch { /* noop */ }
  } else {
    try {
      win.setIgnoreMouseEvents(false)
      win.setFocusable(true)
      win.setSkipTaskbar(true) // 위젯은 항상 task bar 제외
    } catch { /* noop */ }
    try {
      const widgetType = widgetId.replace(/^widget-/, '').split('-')[0] as WidgetType
      saveWidgetPosition({ widget_id: widgetId, widget_type: widgetType, wallpaper_mode: 0 })
    } catch { /* noop */ }
  }

  // 상태 변경을 대시보드 + 모든 위젯 창에 브로드캐스트.
  // 위젯 창은 자기 widgetId 와 일치하는지 보고 헤더를 숨기거나 복원한다.
  const payload = { widgetId, on }
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('wallpaper-mode-changed', payload) } catch { /* noop */ }
  }
  for (const w of widgetWindows.values()) {
    if (w.isDestroyed()) continue
    try { w.webContents.send('wallpaper-mode-changed', payload) } catch { /* noop */ }
  }
}

/** 배경 모드인 위젯 전체 해제 — 탈출용 단축키/트레이에서 호출. */
function exitAllWallpaperMode(): void {
  for (const widgetId of Array.from(wallpaperWidgets.keys())) {
    setWallpaperMode(widgetId, false)
  }
}

/**
 * 창 보안 강화: Electron 보안 권장사항 Phase 3~6
 * - 외부 네비게이션 차단
 * - window.open은 기본 브라우저로만 열기
 * - 권한 요청 기본 거부 (로컬 앱은 어떤 permission도 불필요)
 */
function hardenBrowserWindow(win: BrowserWindow): void {
  // (1) window.open / target="_blank" → 외부 URL은 기본 브라우저로 넘기고 새 Electron 창은 거부
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => { /* noop */ })
    }
    return { action: 'deny' }
  })

  // (2) renderer가 다른 URL로 navigate 시도하면 차단. file:// 내부 이동만 허용.
  win.webContents.on('will-navigate', (event, url) => {
    const allowedPrefixes = [
      process.env.ELECTRON_RENDERER_URL ?? '',
      'file://',
    ]
    const ok = allowedPrefixes.some((p) => p && url.startsWith(p))
    if (!ok) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {})
    }
  })

  // (3) webview attach 거부 — 앱이 webview 태그를 쓰지 않음
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())
}

// 위젯이 여러 개 연속으로 뜰 때 마다 메인 창을 맨 앞으로 재정렬.
// debounce로 마지막 호출에만 moveTop 실행.
let mainOnTopTimer: NodeJS.Timeout | null = null
function scheduleMainWindowOnTop(): void {
  if (mainOnTopTimer) clearTimeout(mainOnTopTimer)
  mainOnTopTimer = setTimeout(() => {
    mainOnTopTimer = null
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (!mainWindow.isVisible() || mainWindow.isMinimized()) return
    mainWindow.moveTop()
  }, 180)
}

function loadRendererUrl(win: BrowserWindow, hash = ''): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL + hash)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: hash.replace(/^#/, '') })
  }
}

function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#F8FAFC',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // preload가 contextBridge + ipcRenderer만 사용하므로 OS sandbox 활성화 가능 (defense in depth)
      sandbox: true,
      // 명시적 보안 강화 (Electron 기본값이지만 배포 감사 목적)
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      // 창이 숨겨지거나 뒤로 가도 타이머/오디오가 멈추지 않도록
      backgroundThrottling: false,
    },
  })

  const startMinimized = process.argv.includes('--autostart')
  mainWindow.on('ready-to-show', () => {
    if (!startMinimized) mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow?.hide()
  })

  loadRendererUrl(mainWindow)

  return mainWindow
}

function clampToScreen(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const displays = screen.getAllDisplays()
  const onScreen = displays.some((d) => {
    const b = d.bounds
    return x + w > b.x && x < b.x + b.width && y + h > b.y && y < b.y + b.height
  })
  if (onScreen) return { x, y }
  const primary = screen.getPrimaryDisplay().workArea
  return { x: primary.x + 80, y: primary.y + 80 }
}

const WIDGET_ORDER: WidgetType[] = [
  'clock', 'calendar', 'today', 'task', 'memo',
  'timetable', 'studenttimetable', 'checklist', 'timer', 'dday',
  'routine', 'goal', 'studentcheck',
]

function getSpreadPosition(widgetType: WidgetType, w: number, h: number): { x: number; y: number } {
  const work = screen.getPrimaryDisplay().workArea
  const idx = WIDGET_ORDER.indexOf(widgetType)
  const safeIdx = idx < 0 ? widgetWindows.size : idx
  const gap = 16
  const cols = Math.max(1, Math.floor((work.width - 40) / (w + gap)))
  const col = safeIdx % cols
  const row = Math.floor(safeIdx / cols)
  const x = work.x + 20 + col * (w + gap)
  const y = work.y + 20 + row * (h + gap + 40)
  return clampToScreen(x, y, w, h)
}

function createWidgetWindow(widgetType: WidgetType, instanceId?: string): BrowserWindow | null {
  // 동일 widgetType의 다중 인스턴스를 지원하기 위해 instanceId(예: routine id)가 있으면
  // widget id와 url hash에 함께 반영. 기본 인스턴스는 기존과 동일한 'widget-<type>'.
  const widgetId = instanceId ? `widget-${widgetType}-${instanceId}` : `widget-${widgetType}`

  const existing = widgetWindows.get(widgetId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return existing
  }

  const positions = getWidgetPositions()
  const saved = positions.find((p) => p.widget_id === widgetId)
  const defaults = WIDGET_DEFAULTS[widgetType]

  const width = saved?.width ?? defaults.w
  const height = saved?.height ?? defaults.h
  const hasSavedPos = typeof saved?.x === 'number' && typeof saved?.y === 'number'
  const { x, y } = hasSavedPos
    ? clampToScreen(saved!.x!, saved!.y!, width, height)
    : getSpreadPosition(widgetType, width, height)
  const opacity = saved?.opacity ?? 0.97
  // 위젯은 '일할 때 방해 안 되도록' 무조건 맨 뒤에서 시작.
  // 사용자가 세션 중 Pin 버튼으로 임시로 위로 올릴 수 있지만, 다음 실행 땐 다시 맨 뒤.
  const alwaysOnTop = false

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 220,
    minHeight: 160,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop,
    skipTaskbar: true,
    resizable: true,
    roundedCorners: true,
    show: false,
    // focusable=true: 위젯 클릭 시 편집 가능.
    // 대신 blur 이벤트에서 Win32 API로 창을 맨 뒤로 밀어내서 "자동 뒤로 숨김" 효과.
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // preload가 contextBridge + ipcRenderer만 사용하므로 OS sandbox 활성화 가능 (defense in depth)
      sandbox: true,
      // 명시적 보안 강화 (Electron 기본값이지만 배포 감사 목적)
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      // 위젯이 뒤로 가도 타이머/오디오 정상 작동 — 벨소리가 안 울리는 문제 방지
      backgroundThrottling: false,
    },
  })

  win.setOpacity(opacity)
  // 저장된 글씨 크기 배율 복원 (기본 1.0)
  const savedFontScale = (saved as { font_scale?: number } | undefined)?.font_scale ?? 1.0
  win.webContents.on('did-finish-load', () => {
    try { win.webContents.setZoomFactor(savedFontScale) } catch { /* ignore */ }
  })
  loadRendererUrl(win, instanceId ? `#widget=${widgetType}&instance=${encodeURIComponent(instanceId)}` : `#widget=${widgetType}`)

  win.on('ready-to-show', () => {
    // showInactive: 위젯이 포커스를 훔치지 않고 조용히 뒤에서 뜸.
    win.showInactive()
    // 첫 표시 후 맨 뒤로 한 번 밀기 (다른 작업 창들 뒤로)
    setTimeout(() => pushWindowToBack(win), 50)
    // 여러 위젯이 연속 뜰 때 메인 창이 뒤로 밀리지 않도록 마지막에 맨 앞으로.
    scheduleMainWindowOnTop()
  })

  // blur(다른 창 클릭) 시 자동으로 맨 뒤로 밀어냄. Pin ON이면 유지.
  let blurDebounce: NodeJS.Timeout | null = null
  win.on('blur', () => {
    if (blurDebounce) clearTimeout(blurDebounce)
    blurDebounce = setTimeout(() => {
      if (win.isDestroyed() || win.isFocused()) return
      if (pinnedWidgets.has(widgetId)) return
      pushWindowToBack(win)
    }, 200)
  })
  win.on('focus', () => {
    if (blurDebounce) { clearTimeout(blurDebounce); blurDebounce = null }
  })

  const persistBounds = () => {
    if (win.isDestroyed()) return
    const b = win.getBounds()
    saveWidgetPosition({
      widget_id: widgetId,
      widget_type: widgetType,
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      is_visible: 1,
      always_on_top: alwaysOnTop ? 1 : 0,
      opacity,
    })
  }

  let moveDebounce: NodeJS.Timeout | null = null
  const debouncedPersist = () => {
    if (moveDebounce) clearTimeout(moveDebounce)
    moveDebounce = setTimeout(() => {
      // 잠금 컴팩트 모드 중인 창은 크기가 인위적으로 줄어들어 있으므로 DB에 저장하지 않음.
      if (lockedCompactWindows.has(win.id)) return
      persistBounds()
    }, 400)
  }
  win.on('move', debouncedPersist)
  win.on('resize', debouncedPersist)

  const capturedWinId = win.id
  win.on('closed', () => {
    widgetWindows.delete(widgetId)
    pinnedWidgets.delete(widgetId)
    lockedCompactWindows.delete(capturedWinId)
    lockedCompactPrevHeight.delete(capturedWinId)
    const t = wallpaperWidgets.get(widgetId)
    if (t) { clearInterval(t); wallpaperWidgets.delete(widgetId) }
    saveWidgetPosition({ widget_id: widgetId, widget_type: widgetType, is_visible: 0 })
  })

  widgetWindows.set(widgetId, win)
  saveWidgetPosition({
    widget_id: widgetId,
    widget_type: widgetType,
    x, y, width, height,
    is_visible: 1,
    always_on_top: alwaysOnTop ? 1 : 0,
    opacity,
  })

  // 저장된 배경화면 모드가 있으면 자동 적용 — 앱 재시작 후에도 그대로 유지.
  const savedWallpaper = (saved as { wallpaper_mode?: number } | undefined)?.wallpaper_mode
  if (savedWallpaper === 1) {
    // `ready-to-show` 직후 적용 — show() 먼저 끝나야 HWND가 유효.
    win.once('ready-to-show', () => {
      setTimeout(() => setWallpaperMode(widgetId, true), 120)
    })
  }
  return win
}

function closeWidgetWindow(widgetType: WidgetType): void {
  const widgetId = `widget-${widgetType}`
  const win = widgetWindows.get(widgetId)
  if (win && !win.isDestroyed()) win.close()
}

function restoreVisibleWidgets(): void {
  const positions = getWidgetPositions()
  for (const p of positions) {
    if (p.is_visible !== 1) continue
    // widget_id가 'widget-<type>-<instanceId>' 형태면 instanceId 추출.
    // 기본 인스턴스('widget-<type>')는 instanceId=undefined.
    const prefix = `widget-${p.widget_type}`
    const instanceId = p.widget_id.startsWith(prefix + '-')
      ? p.widget_id.slice(prefix.length + 1)
      : undefined
    createWidgetWindow(p.widget_type as WidgetType, instanceId)
  }
}

function findTrayIconPath(): string | null {
  // 개발 / 패키징(asar) / extraResources 등 다양한 배포 형태를 모두 커버한다.
  const candidates = [
    join(__dirname, '../../resources/tray-icon.png'),
    join(process.resourcesPath || '', 'tray-icon.png'),
    join(process.resourcesPath || '', 'app.asar.unpacked/resources/tray-icon.png'),
    join(app.getAppPath(), 'resources/tray-icon.png'),
  ]
  for (const p of candidates) {
    try { if (p && existsSync(p)) return p } catch { /* ignore */ }
  }
  return null
}

function createTray(): void {
  const iconPath = findTrayIconPath()
  let trayIcon: Electron.NativeImage = nativeImage.createEmpty()
  if (iconPath) {
    try {
      const img = nativeImage.createFromPath(iconPath)
      if (!img.isEmpty()) trayIcon = img
    } catch { /* ignore */ }
  }
  // 최종 fallback: 1x1 투명 PNG (적어도 플레이스홀더로는 동작)
  if (trayIcon.isEmpty()) {
    trayIcon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    )
  }
  tray = new Tray(trayIcon)
  tray.setToolTip('SchoolDesk — 선생님의 똑똑한 도우미')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '대시보드 열기',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: '빠른 입력 (Ctrl+K)',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.webContents.send('open-quick-input')
        }
      },
    },
    { type: 'separator' },
    {
      label: '모든 위젯 맨 뒤로 보내기',
      click: () => {
        for (const [id, w] of widgetWindows) {
          if (w.isDestroyed()) continue
          w.setAlwaysOnTop(false)
          pinnedWidgets.delete(id)
          pushWindowToBack(w)
        }
      },
    },
    {
      label: '모든 위젯 맨 앞에 고정',
      click: () => {
        for (const [id, w] of widgetWindows) {
          if (w.isDestroyed()) continue
          w.setAlwaysOnTop(true)
          pinnedWidgets.add(id)
        }
      },
    },
    { type: 'separator' },
    {
      label: '배경화면 모드 전체 해제  (Ctrl+Alt+Shift+W)',
      click: () => exitAllWallpaperMode(),
    },
    {
      label: '모든 위젯 닫기',
      click: () => {
        for (const w of widgetWindows.values()) {
          if (!w.isDestroyed()) w.close()
        }
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        for (const w of widgetWindows.values()) {
          if (!w.isDestroyed()) w.destroy()
        }
        mainWindow?.destroy()
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })
}

function registerShortcuts(): void {
  globalShortcut.register('CommandOrControl+K', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.webContents.send('open-quick-input')
    }
  })
  // 배경화면 모드는 클릭 통과라 한 번 켜면 UI로 해제 불가 — 탈출용 글로벌 단축키.
  globalShortcut.register('CommandOrControl+Alt+Shift+W', () => {
    if (wallpaperWidgets.size === 0) return
    exitAllWallpaperMode()
  })
}

function getWidgetWindowForEvent(e: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): BrowserWindow | null {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return null
  for (const w of widgetWindows.values()) {
    if (w === win) return w
  }
  return null
}

function registerWindowIpc(): void {
  ipcMain.on('window:minimize', (e) => {
    const widget = getWidgetWindowForEvent(e)
    ;(widget ?? mainWindow)?.minimize()
  })
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', (e) => {
    const widget = getWidgetWindowForEvent(e)
    if (widget) widget.close()
    else mainWindow?.hide()
  })
  ipcMain.on('window:always-on-top', (e, flag: boolean) => {
    const widget = getWidgetWindowForEvent(e)
    const target = widget ?? mainWindow
    if (!target) return
    target.setAlwaysOnTop(flag)
    // 위젯 핀 상태 갱신: ON이면 blur 시 뒤로 밀어내지 않음.
    if (widget) {
      for (const [id, w] of widgetWindows) {
        if (w === widget) {
          if (flag) pinnedWidgets.add(id)
          else {
            pinnedWidgets.delete(id)
            // Pin 해제 시 즉시 뒤로 밀기
            setTimeout(() => pushWindowToBack(widget), 50)
          }
          break
        }
      }
    }
  })
  ipcMain.on('widget:setOpacity', (e, value: number) => {
    const widget = getWidgetWindowForEvent(e)
    widget?.setOpacity(Math.max(0.2, Math.min(1, value)))
  })
  ipcMain.on('widget:startDrag', (e) => {
    const widget = getWidgetWindowForEvent(e)
    if (!widget) return
    // placeholder for future native drag
  })

  ipcMain.handle('widget:openWindow', (_e, type: WidgetType, opts?: { instanceId?: string }) => {
    createWidgetWindow(type, opts?.instanceId)
  })
  ipcMain.handle('widget:closeWindow', (_e, type: WidgetType) => {
    closeWidgetWindow(type)
  })
  ipcMain.handle('widget:isOpen', (_e, type: WidgetType) => {
    const w = widgetWindows.get(`widget-${type}`)
    return !!(w && !w.isDestroyed())
  })
  ipcMain.handle('widget:getAlwaysOnTop', (e) => {
    const w = getWidgetWindowForEvent(e) ?? BrowserWindow.fromWebContents(e.sender)
    return w?.isAlwaysOnTop() ?? false
  })
  // 위젯 창 자신에게 OS-level 포커스를 강제. renderer의 window.focus()는 Windows의
  // 포그라운드 락 때문에 종종 무시되는데, main 프로세스의 BrowserWindow.focus()는
  // 자기 자신이 띄운 창이므로 대부분 통과한다. window.confirm 등 모달 후에 호출.
  ipcMain.on('widget:focusSelf', (e) => {
    const w = getWidgetWindowForEvent(e) ?? BrowserWindow.fromWebContents(e.sender)
    if (!w || w.isDestroyed()) return
    try {
      if (w.isMinimized()) w.restore()
      w.focus()
      // 추가 안전장치: 일시 alwaysOnTop → 곧바로 원상복귀. Windows 포그라운드 락 우회 기법.
      const wasOnTop = w.isAlwaysOnTop()
      if (!wasOnTop) {
        w.setAlwaysOnTop(true)
        setTimeout(() => { if (!w.isDestroyed()) w.setAlwaysOnTop(false) }, 50)
      }
    } catch { /* ignore */ }
  })

  // 학생 기록 위젯 등: 잠금 상태일 때 창을 헤더만 보이도록 컴팩트하게 줄였다가
  // 잠금 해제 시 원래 높이로 복원. 컴팩트 상태의 resize 는 DB에 저장되지 않음.
  ipcMain.on('widget:setLockCompact', (e, compact: boolean) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w || w.isDestroyed()) return
    const winId = w.id
    try {
      if (compact) {
        if (!lockedCompactPrevHeight.has(winId)) {
          const [, curH] = w.getSize()
          lockedCompactPrevHeight.set(winId, curH)
        }
        lockedCompactWindows.add(winId)
        // 최소 높이를 헤더 수준으로 낮춰야 setSize 가 먹음.
        w.setMinimumSize(220, 68)
        const [curW] = w.getSize()
        w.setSize(curW, 72)
      } else {
        lockedCompactWindows.delete(winId)
        w.setMinimumSize(220, 160) // 일반 위젯 기본 최소
        const prev = lockedCompactPrevHeight.get(winId)
        if (prev && prev > 72) {
          const [curW] = w.getSize()
          w.setSize(curW, prev)
        }
        lockedCompactPrevHeight.delete(winId)
      }
    } catch { /* ignore */ }
  })

  ipcMain.on('widget:setFontScale', (e, scale: number) => {
    const w = getWidgetWindowForEvent(e)
    if (!w) return
    const clamped = Math.max(0.7, Math.min(1.6, Number(scale) || 1))
    try { w.webContents.setZoomFactor(clamped) } catch { /* ignore */ }
    // DB에 저장
    for (const [id, win] of widgetWindows) {
      if (win === w) {
        const t = id.replace(/^widget-/, '') as WidgetType
        try {
          saveWidgetPosition({ widget_id: id, widget_type: t, font_scale: clamped } as unknown as Parameters<typeof saveWidgetPosition>[0])
        } catch { /* ignore */ }
        break
      }
    }
  })
  ipcMain.handle('widget:getFontScale', (e) => {
    const w = getWidgetWindowForEvent(e) ?? BrowserWindow.fromWebContents(e.sender)
    try { return w?.webContents.getZoomFactor() ?? 1 } catch { return 1 }
  })
  ipcMain.handle('widget:listOpen', () => {
    const open: string[] = []
    for (const [id, w] of widgetWindows) {
      if (!w.isDestroyed()) open.push(id.replace(/^widget-/, ''))
    }
    return open
  })

  // ─── 배경화면 모드 ───────────────────────────────────────
  ipcMain.handle('widget:setWallpaperMode', (_e, widgetId: string, on: boolean) => {
    if (typeof widgetId !== 'string' || !widgetId.startsWith('widget-')) return false
    setWallpaperMode(widgetId, !!on)
    return true
  })
  ipcMain.handle('widget:exitAllWallpaperMode', () => {
    exitAllWallpaperMode()
    return true
  })
  ipcMain.handle('widget:getWallpaperModeMap', () => {
    return Array.from(wallpaperWidgets.keys())
  })
}

// ─── 싱글 인스턴스 락 ─────────────────────────────
// 이미 실행 중인 경우 두 번째 프로세스는 즉시 종료 → 트레이 아이콘 중복 방지.
const gotInstanceLock = app.requestSingleInstanceLock()
if (!gotInstanceLock) {
  app.quit()
  process.exit(0)
}
app.on('second-instance', () => {
  // 사용자가 exe를 (다른 폴더·다른 상황에서) 한 번 더 실행하면:
  //  1) 메인 창 복구/포커스
  //  2) 저장된 위젯 중 닫힌 것들을 되살려 "exe 재실행 = 전부 복원" UX 보장
  //     (포터블 exe가 실행 위치와 관계없이 %APPDATA% DB를 공유하므로, 다른 폴더에서 재실행 해도 같은 앱)
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
  try { restoreVisibleWidgets() } catch { /* ignore */ }
})

app.whenReady().then(async () => {
  getDatabase()
  seedTemplates()
  initWin32Z() // Win32 FFI 초기화 (Windows만). 실패 시 graceful.

  // ─── 세션 전역 보안 강화 ─────────────────────────────
  // 프로덕션 빌드에서는 기본 애플리케이션 메뉴(View → Toggle DevTools 포함)를 제거한다.
  // 개발 중엔 DevTools가 필요하므로 유지.
  if (!process.env.ELECTRON_RENDERER_URL) {
    Menu.setApplicationMenu(null)
  }

  // 권한 요청 전부 거부 (카메라/마이크/알림/지리/미디어 등 어떤 권한도 앱이 필요 없음)
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(false))
  // permission check도 거부 (더 엄격)
  session.defaultSession.setPermissionCheckHandler(() => false)

  // ─── 새로 생성되는 모든 웹콘텐츠에 보안 규칙 자동 적용 ───
  app.on('web-contents-created', (_event, contents) => {
    const win = BrowserWindow.fromWebContents(contents)
    if (win) hardenBrowserWindow(win)
  })

  // 체크한 지 24시간 지난 체크리스트 항목 자동 정리
  const cleanupExpired = () => {
    try {
      const removed = deleteExpiredCheckedItems()
      if (removed > 0) {
        // 위젯에 변경 알림 → 자동 refetch
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) {
            try { w.webContents.send('data:changed', 'checklist') } catch { /* ignore */ }
          }
        }
      }
    } catch { /* ignore */ }
  }
  cleanupExpired()
  setInterval(cleanupExpired, 60 * 60 * 1000) // 매 1시간

  registerIpcHandlers()
  registerWindowIpc()

  try {
    const autoStart = getSetting('auto_start') as unknown as boolean
    // Portable 모드에서 exe가 다른 폴더로 옮겨졌을 수 있으므로 매 부팅마다 재적용해 레지스트리 경로를 갱신한다.
    await applyAutoStart(!!autoStart)
  } catch { /* ignore */ }

  ipcMain.handle('system:setAutoStart', async (_e, enabled: boolean) => {
    await applyAutoStart(!!enabled)
    return await isAutoStartEnabled()
  })

  ipcMain.handle('system:isAutoStartEnabled', () => isAutoStartEnabled())
  ipcMain.handle('system:isLaunchedAtStartup', () => isLaunchedAtStartup())
  ipcMain.handle('system:isPortable', () => isPortableWin())

  createMainWindow()
  createTray()
  registerShortcuts()
  restoreVisibleWidgets()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  closeDatabase()
  // 트레이 아이콘 명시적 정리 — 비정상 종료 시 좀비 아이콘 방지
  try { tray?.destroy() } catch { /* ignore */ }
  tray = null
})

app.on('will-quit', () => {
  try { tray?.destroy() } catch { /* ignore */ }
  tray = null
})

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
  }
})
