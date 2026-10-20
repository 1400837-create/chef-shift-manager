import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react'
import { Section, Badge } from '../../components/UI'
import { usePlanCollection } from '../../plan/planStore'
import { formatDuration } from '../../plan/hours'
import {
  monthOf, monthBounds, shiftMonth, monthTitle, mondayOf, addDaysKey, weekTitle,
  collectShifts, aggregateByStaff,
} from '../../plan/calc'
import { todayKey } from '../../utils/dateUtils'
import { byName } from './shared'

const normMinutes = (norm) => (typeof norm === 'number' ? Math.round(norm * 60) : null)

function status(plannedMin, norm) {
  const n = normMinutes(norm)
  if (n === null) return { color: 'slate', text: 'норма не задана' }
  const diff = plannedMin - n
  if (diff > 0) return { color: 'red', text: `сверх нормы +${formatDuration(diff)}` }
  if (diff < 0) return { color: 'yellow', text: `не хватает ${formatDuration(-diff)}` }
  return { color: 'green', text: 'по норме' }
}

function weeksOfMonth(from, to) {
  const out = []
  let monday = mondayOf(from)
  while (monday <= to) {
    out.push(monday)
    monday = addDaysKey(monday, 7)
  }
  return out
}

function StaffRow({ row, weeks, shifts }) {
  const [open, setOpen] = useState(false)
  const st = status(row.planned, row.norm)
  const perWeek = useMemo(
    () => (open
      ? weeks.map((monday) => {
          const map = aggregateByStaff(shifts, monday, addDaysKey(monday, 6))
          const r = map.get(row.key)
          return { monday, planned: r ? r.planned : 0, actual: r ? r.actual : 0 }
        })
      : []),
    [open, weeks, shifts, row.key]
  )

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 mb-2 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left px-3 py-2.5 flex items-center gap-2">
        {open ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            {row.name}{row.removed ? ' (удалён)' : ''}
          </p>
          <p className="text-xs text-slate-500">
            Норма {row.norm !== null ? `${row.norm} ч` : '—'} · План <b>{formatDuration(row.planned)}</b>
            {row.actual > 0 && <> · Факт <b>{formatDuration(row.actual)}</b></>}
          </p>
        </div>
        <Badge color={st.color}>{st.text}</Badge>
      </button>
      {open && (
        <div className="border-t border-slate-100 dark:border-slate-700 px-3 py-2 bg-slate-50 dark:bg-slate-900/30">
          {perWeek.map((w) => (
            <div key={w.monday} className="flex justify-between text-sm py-1 text-slate-600 dark:text-slate-300">
              <span>{weekTitle(w.monday)}</span>
              <span>
                план <b>{formatDuration(w.planned)}</b>
                {w.actual > 0 && <> · факт <b>{formatDuration(w.actual)}</b></>}
              </span>
            </div>
          ))}
          <p className="text-[11px] text-slate-400 mt-1">Недели считаются целиком (пн–вс), даже если они захватывают соседний месяц.</p>
        </div>
      )}
    </div>
  )
}

export default function HoursTab() {
  const staff = usePlanCollection('staff')
  const tree = usePlanCollection('planData').data
  const [month, setMonth] = useState(() => monthOf(todayKey()))
  const { from, to } = monthBounds(month)

  const shifts = useMemo(() => collectShifts(tree), [tree])
  const weeks = useMemo(() => weeksOfMonth(from, to), [from, to])

  const { rows, total, warnings } = useMemo(() => {
    const byKey = aggregateByStaff(shifts, from, to)
    const list = []
    const seen = new Set()
    staff.items.forEach((s) => {
      if (!s.name) return
      const r = byKey.get(s.id)
      seen.add(s.id)
      list.push({
        key: s.id, name: s.name, norm: typeof s.norm === 'number' ? s.norm : null,
        planned: r ? r.planned : 0, actual: r ? r.actual : 0, removed: false,
      })
    })
    // Shifts of people who have since left the directory still count.
    byKey.forEach((r, key) => {
      if (seen.has(key)) return
      list.push({ key, name: r.name || '(без имени)', norm: null, planned: r.planned, actual: r.actual, removed: true })
    })
    list.sort(byName)
    const t = list.reduce((a, r) => ({ planned: a.planned + r.planned, actual: a.actual + r.actual }), { planned: 0, actual: 0 })
    const warn = list.filter((r) => normMinutes(r.norm) !== null && r.planned > normMinutes(r.norm))
    return { rows: list, total: t, warnings: warn }
  }, [staff.items, shifts, from, to])

  const weekTotals = useMemo(
    () => weeks.map((monday) => {
      let planned = 0
      let actual = 0
      aggregateByStaff(shifts, monday, addDaysKey(monday, 6)).forEach((r) => { planned += r.planned; actual += r.actual })
      return { monday, planned, actual }
    }),
    [weeks, shifts]
  )

  const visible = rows.filter((r) => r.planned > 0 || r.actual > 0 || r.norm !== null)

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="w-11 h-11 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <ChevronLeft size={20} />
        </button>
        <p className="flex-1 text-center font-bold text-slate-800 dark:text-slate-100">{monthTitle(month)}</p>
        <button onClick={() => setMonth((m) => shiftMonth(m, 1))} className="w-11 h-11 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <ChevronRight size={20} />
        </button>
      </div>

      <Section title="Итого за месяц">
        <div className="flex gap-6 text-sm text-slate-700 dark:text-slate-200">
          <p>План: <b className="text-lg">{formatDuration(total.planned)}</b> ч</p>
          <p>Факт: <b className="text-lg">{formatDuration(total.actual)}</b> ч</p>
        </div>
        <p className="text-xs text-slate-400 mt-1">Перерывы не вычитаются. Учитываются все планы (месяц, лагерь, мероприятия).</p>
      </Section>

      {warnings.length > 0 && (
        <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 mb-4 text-sm text-red-800 dark:text-red-200">
          <p className="font-semibold flex items-center gap-1.5 mb-1"><AlertTriangle size={16} /> Запланировано больше нормы</p>
          {warnings.map((r) => (
            <p key={r.key}>{r.name}: {formatDuration(r.planned)} из {r.norm} ч (+{formatDuration(r.planned - normMinutes(r.norm))})</p>
          ))}
        </div>
      )}

      <Section title="По неделям">
        {weekTotals.map((w) => (
          <div key={w.monday} className="flex justify-between text-sm py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0 text-slate-700 dark:text-slate-200">
            <span>{weekTitle(w.monday)}</span>
            <span>
              план <b>{formatDuration(w.planned)}</b>
              {w.actual > 0 && <> · факт <b>{formatDuration(w.actual)}</b></>}
            </span>
          </div>
        ))}
      </Section>

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Сотрудники</p>
      {visible.length === 0 && <p className="text-sm text-slate-400 text-center py-4">В этом месяце смен и норм пока нет.</p>}
      {visible.map((r) => <StaffRow key={r.key} row={r} weeks={weeks} shifts={shifts} />)}
    </div>
  )
}
