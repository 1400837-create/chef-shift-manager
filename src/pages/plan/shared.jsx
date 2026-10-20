import { useEffect, useRef, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import { inputClass, Badge } from '../../components/UI'
import { usePlanStatus } from '../../plan/planStore'

// Commits on blur / Enter, not on every keystroke: each commit is a journal
// entry and a network write, and typing "Larin" must not produce five of them.
// Only commits if the user actually edited the field, so a value that changed
// remotely while the field was focused isn't overwritten by a stale draft.
export function DraftInput({ value, onCommit, type = 'text', inputMode, placeholder, className = '', list }) {
  const str = value === null || value === undefined ? '' : String(value)
  const [draft, setDraft] = useState(str)
  const [editing, setEditing] = useState(false)
  const base = useRef(str)

  useEffect(() => {
    if (!editing) setDraft(str)
  }, [str, editing])

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

export function StatusBar() {
  const s = usePlanStatus()
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
      <span className={`flex items-center gap-1 font-semibold ${s.online ? 'text-green-600' : 'text-slate-400'}`}>
        {s.online ? <Wifi size={14} /> : <WifiOff size={14} />}
        {s.online ? 'онлайн' : 'нет связи'}
      </span>
      {s.pending > 0 && <Badge color="orange">Не отправлено: {s.pending}</Badge>}
      {s.error && <span className="text-red-600 dark:text-red-400">{s.error}</span>}
    </div>
  )
}

export function parseNorm(v) {
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export const byName = (a, b) => (a.name || a.label || '').localeCompare(b.name || b.label || '', 'ru')
