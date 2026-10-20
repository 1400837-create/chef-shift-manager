import { useMemo, useState } from 'react'
import { Calculator, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { inputClass, ConfirmDeleteButton } from '../../components/UI'
import { writePaths, newId } from '../../plan/planStore'
import { sortedEntries, planDates, blocksOf, dishesOf, cmpId } from '../../plan/exchange'
import { DraftInput, parseNorm } from './shared'

const UNITS = ['кг', 'шт', 'порц', 'л', 'упак']

export const money = (n) =>
  (Math.round((Number.isFinite(n) ? n : 0) * 100) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function costRows(data) {
  return sortedEntries(data.costs, (a, b) => (a.ts || 0) - (b.ts || 0) || cmpId(a, b)).map((r) => ({
    ...r,
    sum: (Number(r.qty) || 0) * (Number(r.price) || 0),
  }))
}

export function costSummary(data) {
  const rows = costRows(data)
  const total = rows.reduce((a, r) => a + r.sum, 0)
  const guests = Number(data.costMeta?.guests) || 0
  const sell = Number(data.costMeta?.sell)
  return {
    rows,
    total,
    guests,
    perGuest: guests > 0 ? total / guests : null,
    sell: Number.isFinite(sell) && sell > 0 ? sell : null,
    margin: guests > 0 && Number.isFinite(sell) && sell > 0 ? sell * guests - total : null,
  }
}

// Manual costing for a plan (typically an event or camp): free lines of
// "what × how much × price per unit", plus guest count for a per-head figure.
// The user asked for manual, not recipe-derived, costing.
export default function CostPanel({ plan, data }) {
  const coll = `planData/${plan.id}`
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', qty: '', unit: 'кг', price: '' })
  const s = useMemo(() => costSummary(data), [data])
  const label = `${plan.title || 'план'}: калькуляция`

  const dishNames = useMemo(() => {
    const set = new Set()
    planDates(data).forEach((d) => blocksOf(data[d]).forEach((b) => dishesOf(b).forEach((x) => x.text && set.add(x.text))))
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [data])

  function add() {
    if (!form.name.trim()) return
    const id = newId(coll)
    writePaths(coll, {
      [`costs/${id}`]: { name: form.name.trim(), qty: parseNorm(form.qty) ?? 0, unit: form.unit, price: parseNorm(form.price) ?? 0, ts: Date.now() },
    }, { action: 'create', entity: 'строку калькуляции', id: plan.id, label: `${label}: ${form.name.trim()}` })
    setForm({ name: '', qty: '', unit: form.unit, price: '' })
  }

  const patch = (r, field, value) =>
    writePaths(coll, { [`costs/${r.id}/${field}`]: value }, { action: 'update', entity: 'строку калькуляции', id: plan.id, label: `${label}: ${r.name}` })
  const meta = (field, value) =>
    writePaths(coll, { [`costMeta/${field}`]: value }, { action: 'update', entity: 'калькуляцию', id: plan.id, label })

  return (
    <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-4 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-left bg-slate-50 dark:bg-slate-900/40">
        {open ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
        <Calculator size={18} className="text-slate-500 dark:text-slate-400" />
        <span className="font-semibold text-slate-800 dark:text-slate-100 text-[15px] flex-1">Калькуляция</span>
        {s.rows.length > 0 && <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{money(s.total)}</span>}
      </button>
      {open && (
        <div className="p-3 animate-fade-up">
          <datalist id="plan-cost-dishes">{dishNames.map((n) => <option key={n} value={n} />)}</datalist>
          <p className="text-xs text-slate-500 mb-3">
            Вручную: что, сколько и по какой цене за единицу (например, «Курица — 12 кг × 6,50»). Сумма и стоимость на гостя считаются сами.
          </p>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Гостей</p>
              <DraftInput inputMode="numeric" value={data.costMeta?.guests} onCommit={(v) => meta('guests', parseNorm(v))} />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Цена продажи на гостя (необяз.)</p>
              <DraftInput inputMode="decimal" value={data.costMeta?.sell} onCommit={(v) => meta('sell', parseNorm(v))} />
            </div>
          </div>

          {s.rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 mb-2">
              <DraftInput value={r.name} list="plan-cost-dishes" onCommit={(v) => { if (v.trim()) patch(r, 'name', v.trim()) }} />
              <div className="grid grid-cols-[1fr_5rem_1fr_auto] gap-2 mt-2 items-end">
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">Кол-во</p>
                  <DraftInput inputMode="decimal" value={r.qty} onCommit={(v) => patch(r, 'qty', parseNorm(v) ?? 0)} />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">Ед.</p>
                  <select className={inputClass} value={r.unit || 'кг'} onChange={(e) => patch(r, 'unit', e.target.value)}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 mb-0.5">Цена за ед.</p>
                  <DraftInput inputMode="decimal" value={r.price} onCommit={(v) => patch(r, 'price', parseNorm(v) ?? 0)} />
                </div>
                <ConfirmDeleteButton
                  onConfirm={() => writePaths(coll, { [`costs/${r.id}`]: null }, { action: 'delete', entity: 'строку калькуляции', id: plan.id, label: `${label}: ${r.name}`, before: r })}
                  size="w-11 h-11"
                />
              </div>
              <p className="text-right text-sm font-semibold text-slate-700 dark:text-slate-200 mt-1.5">= {money(r.sum)}</p>
            </div>
          ))}

          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-2.5 mb-3">
            <input className={inputClass} list="plan-cost-dishes" placeholder="Позиция (блюдо или продукт)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <div className="grid grid-cols-[1fr_5rem_1fr] gap-2 mt-2">
              <input className={inputClass} inputMode="decimal" placeholder="Кол-во" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} />
              <select className={inputClass} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <input className={inputClass} inputMode="decimal" placeholder="Цена за ед." value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
            </div>
            <button onClick={add} disabled={!form.name.trim()} className="mt-2 w-full min-h-[44px] rounded-xl bg-orange-500 active:bg-orange-600 text-white font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40">
              <Plus size={16} /> Добавить позицию
            </button>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-3 text-sm text-slate-700 dark:text-slate-200">
            <p className="flex justify-between"><span>Итого</span><b>{money(s.total)}</b></p>
            {s.perGuest !== null && <p className="flex justify-between"><span>На гостя ({s.guests})</span><b>{money(s.perGuest)}</b></p>}
            {s.margin !== null && (
              <p className="flex justify-between">
                <span>Выручка − себестоимость</span>
                <b className={s.margin < 0 ? 'text-red-600' : 'text-green-600'}>{money(s.margin)}</b>
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
