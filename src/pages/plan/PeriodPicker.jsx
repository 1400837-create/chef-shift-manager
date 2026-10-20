import { inputClass } from '../../components/UI'
import { monthBounds, monthOf, mondayOf, addDaysKey, isDateKey } from '../../plan/calc'

// "From – To" dates with three quick presets. `bounds` is the whole span the
// data covers (for the "all" preset).
export default function PeriodPicker({ from, to, onChange, bounds }) {
  const set = (f, t) => onChange({ from: f, to: t < f ? f : t })
  const anchor = isDateKey(from) ? from : (bounds?.from || '')
  const preset = 'px-2.5 min-h-[32px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300'

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[11px] text-slate-400 mb-0.5">С</p>
          <input type="date" className={inputClass} value={from || ''} onChange={(e) => e.target.value && set(e.target.value, to || e.target.value)} />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-0.5">По</p>
          <input type="date" className={inputClass} min={from || undefined} value={to || ''} onChange={(e) => e.target.value && set(from || e.target.value, e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <button
          className={preset}
          disabled={!anchor}
          onClick={() => { const m = mondayOf(anchor); set(m, addDaysKey(m, 6)) }}
        >
          Неделя
        </button>
        <button
          className={preset}
          disabled={!anchor}
          onClick={() => { const b = monthBounds(monthOf(anchor)); set(b.from, b.to) }}
        >
          Месяц
        </button>
        {bounds?.from && (
          <button className={preset} onClick={() => set(bounds.from, bounds.to)}>Весь план</button>
        )}
      </div>
    </div>
  )
}
