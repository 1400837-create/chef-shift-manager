import { useEffect, useRef, useState } from 'react'
import { Wifi, WifiOff, Undo2, Redo2 } from 'lucide-react'
import { inputClass, Badge } from '../../components/UI'
import { usePlanStatus, flush, usePlanUndo, undoLast, redoLast } from '../../plan/planStore'

// Commits on blur / Enter, not on every keystroke: each commit is a journal
// entry and a network write, and typing "Larin" must not produce five of them.
// Only commits if the user actually edited the field, so a value that changed
// remotely while the field was focused isn't overwritten by a stale draft.
export function DraftInput({ value, onCommit, type = 'text', inputMode, placeholder, className = '', list }) {
  const str = value === null || value === undefined ? '' : String(value)
  const [draft, setDraft] = useState(str)
  const [editing, setEditing] = useState(false)
  const base = useRef(str)
  const latest = useRef({ draft, editing, onCommit })
  latest.current = { draft, editing, onCommit }

  useEffect(() => {
    if (!editing) setDraft(str)
  }, [str, editing])

  // Closing the editor window or switching tab while a field is still focused
  // removes it without a blur event (iOS in particular doesn't blur on a tap
  // outside) — save what was typed instead of silently dropping it.
  useEffect(() => () => {
    const { draft: d, editing: e, onCommit: commit } = latest.current
    if (e && d !== base.current) commit(d)
  }, [])

  return (
    <input
      type={type}
      inputMode={inputMode}
      list={list}
      placeholder={placeholder}
      className={`${inputClass} ${className}`}
      value={draft}
      onFocus={() => { base.current = str; setEditing(true) }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        latest.current.editing = false
        setEditing(false)
        if (draft !== base.current) onCommit(draft)
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
}

export function ConfirmButton({ onConfirm, children, confirmLabel = 'Точно?', className = '', disabled }) {
  const [armed, setArmed] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  function click() {
    if (armed) {
      clearTimeout(timer.current)
      setArmed(false)
      onConfirm()
      return
    }
    setArmed(true)
    timer.current = setTimeout(() => setArmed(false), 3500)
  }
  return (
    <button onClick={click} disabled={disabled} className={`${className} ${armed ? '!bg-red-600 !text-white !border-red-600' : ''}`}>
      {armed ? confirmLabel : children}
    </button>
  )
}

export function useAction() {
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  async function run(fn, okText) {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      if (okText) setMsg({ type: 'ok', text: okText })
    } catch (err) {
      setMsg({ type: 'error', text: err?.message || 'Не получилось' })
    } finally {
      setBusy(false)
    }
  }
  return { msg, setMsg, busy, run }
}

export function Message({ msg }) {
  if (!msg) return null
  const cls = msg.type === 'error'
    ? 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'
    : 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800'
  return <p className={`text-sm border rounded-xl px-3 py-2 mt-2 ${cls}`}>{msg.text}</p>
}

// Icon-only controls for the page header: connection (tap to send what is
// still waiting), step back, step forward. No labels — hover text only.
export function StatusIcons() {
  const s = usePlanStatus()
  const u = usePlanUndo()
  const btn = 'relative w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => { if (s.pending > 0) flush() }}
        className={`${btn} ${s.error ? 'text-red-600' : s.online ? 'text-green-600' : 'text-slate-400'}`}
        title={s.error || (s.pending > 0 ? `Не отправлено: ${s.pending}. Нажмите, чтобы отправить` : s.online ? 'Онлайн, всё отправлено' : 'Нет связи')}
        aria-label="Связь"
      >
        {s.online ? <Wifi size={18} /> : <WifiOff size={18} />}
        {s.pending > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
            {s.pending}
          </span>
        )}
      </button>
      <button
        onClick={() => undoLast()}
        disabled={u.count === 0}
        className={`${btn} text-slate-700 dark:text-slate-200 disabled:opacity-30`}
        title={u.count ? `Назад: ${u.label}` : 'Нечего отменять'}
        aria-label="Назад"
      >
        <Undo2 size={18} />
      </button>
      <button
        onClick={() => redoLast()}
        disabled={u.redoCount === 0}
        className={`${btn} text-slate-700 dark:text-slate-200 disabled:opacity-30`}
        title={u.redoCount ? `Вперёд: ${u.redoLabel}` : 'Нечего возвращать'}
        aria-label="Вперёд"
      >
        <Redo2 size={18} />
      </button>
    </div>
  )
}

// Only appears when something is wrong; otherwise takes no space.
export function StatusBar() {
  const s = usePlanStatus()
  if (!s.error) return null
  return <p className="text-xs text-red-600 dark:text-red-400 mb-3">{s.error}</p>
}

export function parseNorm(v) {
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export const byName = (a, b) => (a.name || a.label || '').localeCompare(b.name || b.label || '', 'ru')

// ---------------------------------------------------------------------------
// Time entry: only digits are typed, the colon appears by itself.
//   "930" → 9:30 · "1030" → 10:30 · "18" → 18:00 · "9" → 09:00
// A native time picker (clock dial / scroll wheels) is slow for this: the
// plan is filled with many times a day.
// ---------------------------------------------------------------------------

const digitsOf = (text) => String(text ?? '').replace(/\D/g, '').slice(0, 4)

// What to show while typing.
export function formatTimeText(text) {
  const d = digitsOf(text)
  if (d.length <= 2) return d
  if (d.length === 3) return Number(d.slice(0, 2)) <= 23 ? `${d.slice(0, 2)}:${d[2]}` : `${d[0]}:${d.slice(1)}`
  return `${d.slice(0, 2)}:${d.slice(2)}`
}

// Final value: 'HH:MM', '' when empty, null when it isn't a real time.
export function normalizeTime(text) {
  const d = digitsOf(text)
  if (d === '') return ''
  let h
  let m
  if (d.length === 1) { h = Number(d); m = 0 }
  else if (d.length === 2) {
    if (Number(d) <= 23) { h = Number(d); m = 0 } else { h = Number(d[0]); m = Number(d[1]) * 10 }
  } else if (d.length === 3) {
    if (Number(d.slice(0, 2)) <= 23) { h = Number(d.slice(0, 2)); m = Number(d[2]) * 10 } else { h = Number(d[0]); m = Number(d.slice(1)) }
  } else { h = Number(d.slice(0, 2)); m = Number(d.slice(2)) }
  if (h > 23 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Controlled field for forms that keep the text in their own state.
export function TimeInput({ value, onChange, onEnter, className = '', placeholder = 'чч:мм' }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      placeholder={placeholder}
      className={`${inputClass} ${className}`}
      value={value || ''}
      onFocus={(e) => e.target.select()}
      onChange={(e) => onChange(formatTimeText(e.target.value))}
      onBlur={() => {
        const n = normalizeTime(value)
        if (n !== null && n !== (value || '')) onChange(n)
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (onEnter) onEnter(); else e.currentTarget.blur() } }}
    />
  )
}

// Saved-record variant: commits 'HH:MM' (or '' to clear) on blur / Enter and
// quietly puts the old value back if what was typed isn't a time.
export function TimeDraft({ value, onCommit, className = '', placeholder = 'чч:мм' }) {
  const str = value === null || value === undefined ? '' : String(value)
  const [draft, setDraft] = useState(str)
  const [editing, setEditing] = useState(false)
  const latest = useRef({ draft, editing, onCommit, str })
  latest.current = { draft, editing, onCommit, str }

  useEffect(() => {
    if (!editing) setDraft(str)
  }, [str, editing])

  function finish() {
    const { draft: d, onCommit: commit, str: current } = latest.current
    latest.current.editing = false
    setEditing(false)
    const n = normalizeTime(d)
    if (n === null) { setDraft(current); return }
    setDraft(n)
    if (n !== current) commit(n)
  }

  // Same reason as DraftInput: closing a window mid-edit must not lose it.
  useEffect(() => () => {
    const { draft: d, editing: e, onCommit: commit, str: current } = latest.current
    if (!e) return
    const n = normalizeTime(d)
    if (n !== null && n !== current) commit(n)
  }, [])

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      placeholder={placeholder}
      className={`${inputClass} ${className}`}
      value={draft}
      onFocus={(e) => { setEditing(true); e.target.select() }}
      onChange={(e) => setDraft(formatTimeText(e.target.value))}
      onBlur={finish}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
    />
  )
}
