import { useState, useEffect, useRef } from 'react'
import { Megaphone, Pencil, Check, X } from 'lucide-react'
import { useIAmWallpaper } from '../../hooks/useIAmWallpaper'

const STORAGE_KEY = 'noticeboard:content'

/**
 * 알림판 위젯 — 전자칠판에 학생들에게 보여줄 공지/할말.
 *
 * - 단일 텍스트 저장(localStorage). 위젯 여러 개 띄워도 storage event 로 sync.
 * - 일반 모드: 헤더 + 본문(클릭하면 인라인 편집).
 * - 배경화면/디스플레이 모드: 헤더 숨고 큰 글씨 풀스크린. 클릭으로 편집 가능.
 * - 학급체크 패턴 — 배경화면 모드 ON 시 자동 디스플레이 모드 진입(WidgetShell 이 헤더 숨김).
 */
export function NoticeBoardWidget() {
  const [content, setContent] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? '' } catch { return '' }
  })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 배경화면 모드일 때 — 클릭 통과라 편집 불가. 헤더 자동 숨김(WidgetShell 이 처리).
  const iAmWallpaper = useIAmWallpaper('noticeboard')

  // 디스플레이 모드(마스터 브로드캐스트) 동기화 — wallpaper 와 별개로 displayMode ON 가능.
  const [displayMode, setDisplayMode] = useState(false)
  useEffect(() => {
    const off = window.api.widget.onAllDisplayModeChanged?.((p) => setDisplayMode(!!p.on))
    return () => { if (off) off() }
  }, [])

  // 배경화면 모드 ON 시 자체 디스플레이 모드도 ON — 헤더 숨김 신호를 WidgetShell 에 전달.
  useEffect(() => {
    if (iAmWallpaper) setDisplayMode(true)
  }, [iAmWallpaper])

  // displayMode → WidgetShell 헤더 숨김 신호
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('widget:displayMode', { detail: { on: displayMode } }))
  }, [displayMode])

  // 다른 위젯 창에서 변경되면 sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === STORAGE_KEY) setContent(e.newValue ?? '')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // 편집 진입 시 textarea focus.
  useEffect(() => {
    if (!editing) return
    const t = setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    }, 30)
    return () => clearTimeout(t)
  }, [editing])

  const save = (): void => {
    const next = draft
    setContent(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
    setEditing(false)
  }

  const cancel = (): void => {
    setDraft(content)
    setEditing(false)
  }

  const startEdit = (): void => {
    if (iAmWallpaper) return // 클릭 통과 — 편집 불가
    setDraft(content)
    setEditing(true)
  }

  // 화면 가득한 큰 글씨 모드 — 디스플레이/배경화면.
  const big = displayMode || iAmWallpaper

  const toggleDisplayMode = (): void => {
    const next = !displayMode
    setDisplayMode(next)
    try { window.api.widget.setAllDisplayMode?.(next) } catch { /* noop */ }
  }

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        padding: big ? 'clamp(16px, 3vw, 36px)' : '14px 18px 22px 18px',
        background: big
          ? 'radial-gradient(ellipse at 30% 0%, rgba(220,38,38,0.10) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(217,119,6,0.08) 0%, transparent 50%)'
          : 'radial-gradient(ellipse at 0% 0%, rgba(220,38,38,0.06) 0%, transparent 55%)',
      }}
    >
      {/* 일반 모드 헤더 — 큰 모드(디스플레이/배경)에선 shell 헤더가 숨겨지므로 본문 맨 위에 표시. */}
      {!big && (
        <div className="flex items-center gap-2 shrink-0 mb-2">
          <span
            className="flex items-center justify-center shrink-0"
            style={{
              width: 26, height: 26, borderRadius: 8,
              background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
              color: '#fff',
              boxShadow: '0 3px 10px rgba(220,38,38,0.32)',
            }}
          >
            <Megaphone size={14} strokeWidth={2.4} />
          </span>
          <span
            className="flex-1 text-[var(--text-primary)]"
            style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-0.02em' }}
          >
            알림판
          </span>
          {!editing && (
            <button
              onClick={startEdit}
              className="flex items-center justify-center transition-colors text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
              style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--border-widget)' }}
              title="공지 편집"
            >
              <Pencil size={13} strokeWidth={2.2} />
            </button>
          )}
        </div>
      )}

      {/* 본문 */}
      <div
        className="flex-1 flex items-center justify-center min-h-0 relative"
        onClick={() => { if (!editing && !iAmWallpaper) startEdit() }}
        style={{ cursor: !editing && !iAmWallpaper ? 'text' : undefined }}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); cancel() }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() }
            }}
            className="w-full h-full outline-none resize-none bg-transparent"
            placeholder="공지 / 안내 / 학생들에게 보여줄 텍스트를 적어주세요…"
            style={{
              fontSize: big ? 'clamp(28px, 6vw, 80px)' : 16,
              fontWeight: big ? 900 : 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
              color: 'var(--text-primary)',
              textAlign: 'center',
              padding: big ? 'clamp(20px, 3vw, 40px)' : '12px 14px',
              borderRadius: big ? 16 : 10,
              border: big ? '2px dashed rgba(220,38,38,0.32)' : '1.5px solid #DC2626',
              background: big ? 'rgba(255,255,255,0.55)' : 'var(--bg-secondary)',
              backdropFilter: big ? 'blur(8px)' : undefined,
            }}
          />
        ) : content ? (
          <div
            className="w-full"
            style={{
              fontSize: big ? 'clamp(28px, 6vw, 80px)' : 17,
              fontWeight: big ? 900 : 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.3,
              color: 'var(--text-primary)',
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
              wordBreak: 'keep-all',
              overflowWrap: 'anywhere',
              textShadow: big ? '0 2px 14px rgba(220,38,38,0.12)' : undefined,
            }}
          >
            {content}
          </div>
        ) : (
          <div
            className="w-full text-center"
            style={{
              fontSize: big ? 'clamp(16px, 2.4vw, 32px)' : 13,
              fontWeight: 700,
              color: 'var(--text-muted)',
              letterSpacing: '-0.02em',
              padding: big ? 'clamp(24px, 4vw, 48px)' : 20,
              borderRadius: big ? 16 : 10,
              border: '2px dashed rgba(220,38,38,0.32)',
              background: big ? 'rgba(255,255,255,0.4)' : 'transparent',
            }}
          >
            {iAmWallpaper
              ? '배경화면 모드에선 편집할 수 없어요'
              : '여기를 클릭해 공지를 적어주세요'}
          </div>
        )}
      </div>

      {/* 편집 액션 — 저장/취소. 편집 중에만 우하단. */}
      {editing && (
        <div
          className="absolute flex items-center gap-1.5 z-20"
          style={{ bottom: 8, right: 8, WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as React.CSSProperties}
        >
          <button
            onClick={cancel}
            className="flex items-center justify-center transition-colors"
            style={{
              width: 30, height: 30, borderRadius: 9,
              color: 'var(--text-muted)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-widget)',
            }}
            title="취소 (Esc)"
          >
            <X size={14} strokeWidth={2.4} />
          </button>
          <button
            onClick={save}
            className="flex items-center justify-center transition-all hover:scale-105"
            style={{
              width: 30, height: 30, borderRadius: 9,
              color: '#fff',
              background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
              boxShadow: '0 3px 10px rgba(220,38,38,0.42)',
            }}
            title="저장 (Cmd/Ctrl + Enter)"
          >
            <Check size={14} strokeWidth={2.6} />
          </button>
        </div>
      )}

      {/* 디스플레이 모드 진입 토글 — 일반 모드에서만 우상단에 작게.
          편집 중이거나 큰 모드일 땐 표시 X(혼란 방지). */}
      {!big && !editing && !iAmWallpaper && (
        <button
          onClick={toggleDisplayMode}
          className="absolute flex items-center justify-center transition-colors text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
          style={{
            top: 8, right: 8,
            width: 22, height: 22, borderRadius: 7,
            border: '1px solid var(--border-widget)',
            background: 'transparent',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          title="디스플레이 모드 — 큰 글씨 풀스크린. 모든 위젯 동일 적용."
        >
          <Megaphone size={11} strokeWidth={2.2} />
        </button>
      )}
    </div>
  )
}
