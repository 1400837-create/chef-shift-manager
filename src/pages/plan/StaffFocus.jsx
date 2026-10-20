import { useMemo, useState } from 'react'
import { getPlanConfig, getSession } from '../../plan/planRoom'
import { aggregateByStaff, monthBounds, monthOf } from '../../plan/calc'
import { formatDuration } from '../../plan/hours'
import { staffLabel } from '../../plan/lang'

// "Show me one person": every other person's lines fade out and a summary
// says how many hours this person has in the period and in the month.

// A staff member opening the plan sees their own shifts first — matched by the
// name they log in with (exact, case-insensitive), nothing is guessed.
export function useFocusState(ctx) {
  const [focus, setFocus] = useState(() => {
    const cfg = getPlanConfig()
    if (!cfg || cfg.role !== 'staff') return ''
    const name = String(getSession()?.name || '').trim().toLowerCase()
    const mine = ctx.staffList.find((s) => (s.name || '').trim().toLowerCase() === name)
    return mine ? mine.id : ''
  })
  return [focus, setFocus]
}

// Compact drop-down that sits in the toolbar row.
export function StaffSelect({ ctx, value, onChange }) {
  if (ctx.staffList.length === 0) return null
  return (
    <select
      className="min-h-[36px] min-w-[9rem] flex-1 max-w-[16rem] px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Показать смены одного сотрудника"
    >
      <option value="">Все сотрудники</option>
      {ctx.staffList.map((s) => <option key={s.id} value={s.id}>{staffLabel(s, ctx.lang)}</option>)}
    </select>
  )
}

export function StaffSummary({ ctx, value, dates }) {
  const person = value ? ctx.staffById[value] : null
  const stats = useMemo(() => {
    if (!person || !dates.length) return null
    const from = dates[0]
    const to = dates[dates.length - 1]
    const period = aggregateByStaff(ctx.allShifts, from, to).get(person.id)
    const { from: mf, to: mt } = monthBounds(monthOf(from))
    const month = aggregateByStaff(ctx.allShifts, mf, mt).get(person.id)
    return {
      period: period ? period.planned : 0,
      periodActual: period ? period.actual : 0,
      month: month ? month.planned : 0,
    }
  }, [person, dates, ctx.allShifts])

  if (!person || !stats) return null
  return (
    <p className="mb-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100">
      <b>{staffLabel(person, ctx.lang)}</b>: за период <b>{formatDuration(stats.period)}</b>
      {stats.periodActual > 0 && <> (факт {formatDuration(stats.periodActual)})</>}
      {' · '}за месяц <b>{formatDuration(stats.month)}</b>
      {typeof person.norm === 'number' && <> из {person.norm} ч</>}
    </p>
  )
}
