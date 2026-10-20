import { useMemo, useState } from 'react'
import { X, Copy } from 'lucide-react'
import { inputClass, BigButton } from '../../components/UI'
import { commitChange, newId } from '../../plan/planStore'
import { mondayOf, addDaysKey, isDateKey, inPlanRange, dayTitle } from '../../plan/calc'
import { planCopyUpdates } from '../../plan/exchange'

// Copy one day, or a whole Monday–Sunday week, onto other dates of this plan.
export default function CopyModal({ plan, data, range, defaultFrom, onClose }) {
  const [mode, setMode] = useState('week')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(addDaysKey(defaultFrom, 7))
  const [menu, setMenu] = useState(true)
  const [shifts, setShifts] = useState(true)
  const [done, setDone] = useState(null)

  const pairs = useMemo(() => {
    if (!isDateKey(from) || !isDateKey(to)) return []
    if (mode === 'day') return [{ from, to }]
    const a = mondayOf(from)
    const b = mondayOf(to)
    return Array.from({ length: 7 }, (_, i) => ({ from: addDaysKey(a, i), to: addDaysKey(b, i) }))
  }, [mode, from, to])

  const inside = pairs.filter((p) => inPlanRange(range, p.to))
  const outside = pairs.length - inside.length
  const preview = useMemo(
    () => planCopyUpdates({ planId: plan.id, data, pairs: inside, what: { menu, shifts }, makeId: (() => { let n = 0; return () => `x${n++}` })() }),
    [plan.id, data, inside, menu, shifts]
  )

  function run() {
    const res = planCopyUpdates({ planId: plan.id, data, pairs: inside, what: { menu, shifts }, makeId: () => newId(`planData/${plan.id}`) })
    if (!res.copied) return
    commitChange({
      coll: `planData/${plan.id}`,
      action: 'create',
      entity: mode === 'week' ? 'копию недели' : 'копию дня',
      id: plan.id,
      label: `${plan.title || 'план'}: ${dayTitle(from)} → ${dayTitle(to)} (${res.copied} дн.)`,
      updates: res.updates,
    })
    setDone(`Скопировано дней: ${res.copied}${res.skipped ? `, пропущено занятых: ${res.skipped}` : ''}.`)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-800 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 dark:text-slate-100">Дублировать день или неделю</h3>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500"><X size={18} /></button>
        </div>

        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 text-sm font-semibold mb-3">
          {[['week', 'Неделю'], ['day', 'День']].map(([k, l]) => (
            <button key={k} onClick={() => { setMode(k); setDone(null) }} className={`flex-1 min-h-[40px] ${mode === k ? 'bg-slate-800 text-white' : 'text-slate-600 dark:text-slate-300'}`}>{l}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[11px] text-slate-400 mb-0.5">{mode === 'week' ? 'Неделя, где дата' : 'Откуда'}</p>
            <input type="date" className={inputClass} value={from} onChange={(e) => { setFrom(e.target.value); setDone(null) }} />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-0.5">{mode === 'week' ? 'На неделю, где дата' : 'Куда'}</p>
            <input type="date" className={inputClass} value={to} onChange={(e) => { setTo(e.target.value); setDone(null) }} />
          </div>
        </div>

        <div className="flex gap-4 mt-3 text-sm text-slate-700 dark:text-slate-200">
          <label className="flex items-center gap-2"><input type="checkbox" checked={menu} onChange={(e) => setMenu(e.target.checked)} /> Меню</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={shifts} onChange={(e) => setShifts(e.target.checked)} /> Смены</label>
        </div>

        <p className="text-xs text-slate-500 mt-3">
          Будет скопировано дней: <b>{preview.copied}</b>
          {preview.skipped > 0 && <> · пропущено (там уже есть записи): <b>{preview.skipped}</b></>}
          {outside > 0 && <> · вне периода плана: <b>{outside}</b></>}.
          Комментарии, пометки «изменено» и фактическое время не копируются.
        </p>
        {done && <p className="text-sm text-green-700 dark:text-green-400 mt-2">{done}</p>}
        <div className="mt-3">
          <BigButton icon={Copy} onClick={run} disabled={!preview.copied || !!done}>Продублировать</BigButton>
        </div>
      </div>
    </div>
  )
}
