import { useEffect, useRef, useState } from 'react'
import { Check, Printer, Trash2 } from 'lucide-react'

export function Section({ title, icon: Icon, children, right }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={18} className="text-slate-500" />}
          <h2 className="font-semibold text-slate-800 text-[15px]">{title}</h2>
        </div>
        {right}
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

export function CheckRow({ label, checked, onChange, tone = 'default' }) {
  const toneClasses = checked
    ? 'bg-green-50 border-green-300'
    : tone === 'urgent'
    ? 'bg-red-50 border-red-200'
    : 'bg-white border-slate-200'

  return (
    <label
      className={`flex items-center gap-3 w-full min-h-[52px] px-3 py-2.5 mb-2 rounded-xl border cursor-pointer select-none active:scale-[0.99] transition-all ${toneClasses}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        className={`shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center ${
          checked ? 'bg-green-600 border-green-600' : 'border-slate-300 bg-white'
        }`}
      >
        {checked && <Check size={18} strokeWidth={3} className="text-white" />}
      </span>
      <span className={`text-[15px] leading-snug ${checked ? 'text-green-800 line-through' : 'text-slate-700'}`}>
        {label}
      </span>
    </label>
  )
}

export function Badge({ children, color = 'slate' }) {
  const colors = {
    slate: 'bg-slate-100 text-slate-600',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-800',
    green: 'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colors[color]}`}>
      {children}
    </span>
  )
}

export function BigButton({ children, onClick, color = 'orange', icon: Icon, type = 'button', full = true, disabled }) {
  const colors = {
    orange: 'bg-orange-500 active:bg-orange-600 text-white',
    slate: 'bg-slate-700 active:bg-slate-800 text-white',
    green: 'bg-green-600 active:bg-green-700 text-white',
    red: 'bg-red-600 active:bg-red-700 text-white',
    outline: 'bg-white border-2 border-slate-300 active:bg-slate-100 text-slate-700',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${full ? 'w-full' : ''} flex items-center justify-center gap-2 min-h-[52px] px-4 rounded-xl font-semibold text-[15px] transition-colors disabled:opacity-50 ${colors[color]}`}
    >
      {Icon && <Icon size={20} />}
      {children}
    </button>
  )
}

export function Field({ label, children }) {
  return (
    <div className="mb-3">
      {label && <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>}
      {children}
    </div>
  )
}

export function PrintButton({ onClick, label = 'Печать' }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-slate-100 active:bg-slate-200 text-slate-600 text-xs font-semibold"
    >
      <Printer size={15} /> {label}
    </button>
  )
}

// Tap once to arm ("Точно?" for ~2.5s), tap again to actually delete. Avoids
// a modal dialog while still protecting against stray taps with wet/gloved
// hands — a real risk on this app's mobile-in-kitchen tap targets.
export function ConfirmDeleteButton({ onConfirm, size = 'w-9 h-9', iconSize = 16 }) {
  const [confirming, setConfirming] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function handleClick(e) {
    e.stopPropagation()
    if (confirming) {
      clearTimeout(timerRef.current)
      setConfirming(false)
      onConfirm()
      return
    }
    setConfirming(true)
    timerRef.current = setTimeout(() => setConfirming(false), 2500)
  }

  if (confirming) {
    return (
      <button
        onClick={handleClick}
        className={`${size} shrink-0 flex items-center justify-center rounded-lg bg-red-600 active:bg-red-700 text-white text-[10px] font-bold px-1 leading-none`}
      >
        Точно?
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      className={`${size} shrink-0 flex items-center justify-center text-slate-400 active:text-red-600`}
    >
      <Trash2 size={iconSize} />
    </button>
  )
}

export const inputClass =
  'w-full min-h-[48px] px-3 rounded-xl border border-slate-300 bg-white text-[15px] focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400'
