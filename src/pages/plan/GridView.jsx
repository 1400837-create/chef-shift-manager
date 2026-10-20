import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X, MessageSquare, Plus } from 'lucide-react'
import { BigButton } from '../../components/UI'
import { writePaths } from '../../plan/planStore'
import { formatDuration } from '../../plan/hours'
import {
  isDateKey, dayTitle, weekTitle, mondayOf, addDaysKey, monthOf, monthBounds, shiftMonth, monthTitle,
  shiftMinutes,
} from '../../plan/calc'
import { LOCALE, staffLabel, dishLabel } from '../../plan/lang'
import { blocksOf, dishesOf, shiftsOf } from '../../plan/exchange'
import { todayKey } from '../../utils/dateUtils'

const SPANS = [
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'all', label: 'Весь план' },
]

function daysBetween(from, to) {
  const out = []
  for (let d = from; d <= to; d = addDaysKey(d, 1)) out.push(d)
  return out
}

function totals(data, dates) {
  let planned = 0
  let actual = 0
  dates.forEach((date) => {
    shiftsOf(data[date] || {}).forEach((s) => {
      planned += shiftMinutes(s, 'planned') || 0
      actual += shiftMinutes(s, 'actual') || 0
    })
  })
  return { planned, actual }
}

// The whole period on one screen, spreadsheet-style: one row per day with the
// meals and dishes, who works and when, and the day's hours. Tapping a row
// opens the full editor for that day.
export default function GridView({ plan, data, ctx, renderDay }) {
  const today = todayKey()
  const existing = useMemo(() => Object.keys(data).filter(isDateKey).sort(), [data])
  const [span, setSpan] = useState('week')
  const [anchor, setAnchor] = useState(() => {
    if (plan.kind === 'month' && plan.month && monthOf(today) !== plan.month) return `${plan.month}-01`
    return existing.includes(today) || !existing.length ? today : existing[0]
  })
  const [editing, setEditing] = useState(null)
  const locale = LOCALE[ctx.lang]

  const dates = useMemo(() => {
    if (span === 'week') {
      const m = mondayOf(anchor)
      return daysBetween(m, addDaysKey(m, 6))
    }
    if (span === 'month') {
      const { from, to } = monthBounds(monthOf(anchor))
      return daysBetween(from, to)
    }
    return existing
  }, [span, anchor, existing])

  const weeks = useMemo(() => {
    const map = new Map()
    dates.forEach((d) => {
      const m = mondayOf(d)
      if (!map.has(m)) map.set(m, [])
      map.get(m).push(d)
    })
    return [...map.entries()]
  }, [dates])

  function step(dir) {
    setAnchor((a) => (span === 'month' ? `${shiftMonth(monthOf(a), dir)}-01` : addDaysKey(a, 7 * dir)))
  }

  const periodTotal = totals(data, dates)
  const title = span === 'week'
    ? weekTitle(mondayOf(anchor), locale)
    : span === 'month' ? monthTitle(monthOf(anchor), locale) : plan.title || ''

  function createDay(date) {
    writePaths(`planData/${plan.id}`, { [`${date}/d`]: 1 }, { action: 'create', entity: 'день', id: date, label: dayTitle(date) })
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        {span !== 'all' && (
          <button onClick={() => step(-1)} className="w-11 h-11 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <ChevronLeft size={20} />
          </button>
        )}
        <p className="flex-1 text-center font-bold text-slate-800 dark:text-slate-100">{title}</p>
        {span !== 'all' && (
          <button onClick={() => step(1)} className="w-11 h-11 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <ChevronRight size={20} />
          </button>
        )}
      </div>
      <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 text-sm font-semibold mb-3">
        {SPANS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSpan(s.key)}
            className={`flex-1 min-h-[40px] ${span === s.key ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2 w-24">День</th>
              <th className="px-2 py-2">Приёмы и меню</th>
              <th className="px-2 py-2 w-48">Сотрудники</th>
              <th className="px-2 py-2 w-20 text-right">Часы</th>
            </tr>
          </thead>
          <tbody>
            {dates.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">В плане пока нет дней. Добавьте день, неделю или месяц выше.</td></tr>
            )}
            {weeks.map(([monday, list]) => {
              const wt = totals(data, list)
              return [
                span !== 'week' && (
                  <tr key={`w${monday}`} className="bg-slate-50 dark:bg-slate-900/40">
                    <td colSpan={3} className="px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {ctx.lang === 'de' ? 'Woche' : 'Неделя'} {weekTitle(monday, locale)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-xs font-bold text-slate-600 dark:text-slate-300">{formatDuration(wt.planned)}</td>
                  </tr>
                ),
                ...list.map((date) => {
                  const day = data[date]
                  const blocks = day ? blocksOf(day) : []
                  const shifts = day ? shiftsOf(day) : []
                  const planned = shifts.reduce((a, s) => a + (shiftMinutes(s, 'planned') || 0), 0)
                  const actual = shifts.reduce((a, s) => a + (shiftMinutes(s, 'actual') || 0), 0)
                  const commentCount = day ? Object.keys(day.comments || {}).length : 0
                  const isToday = date === today
                  return (
                    <tr
                      key={date}
                      onClick={() => setEditing(date)}
                      className={`border-t border-slate-100 dark:border-slate-700 align-top cursor-pointer active:bg-orange-50 dark:active:bg-slate-700 ${!day ? 'text-slate-400' : ''} ${isToday ? 'bg-orange-50/60 dark:bg-orange-950/20' : ''}`}
                    >
                      <td className="px-2 py-2 font-bold whitespace-nowrap text-slate-800 dark:text-slate-100">
                        {dayTitle(date, locale)}
                        {commentCount > 0 && <MessageSquare size={12} className="inline ml-1 text-orange-500" />}
                      </td>
                      <td className="px-2 py-2">
                        {blocks.map((b) => (
                          <div key={b.id} className="mb-1.5 last:mb-0">
                            <p className="font-semibold text-slate-800 dark:text-slate-100">
                              {b.time ? `${b.time} ` : ''}{b.name || '—'}
                              {b.persons ? <span className="font-normal text-slate-500"> · {b.persons}</span> : null}
                            </p>
                            {dishesOf(b).map((d) => (
                              <p key={d.id} className={`pl-2 text-slate-600 dark:text-slate-300 ${d.changed ? '!text-red-600 font-semibold' : ''}`}>
                                · {dishLabel(d, ctx.recipeById, ctx.lang)}
                              </p>
                            ))}
                          </div>
                        ))}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {shifts.map((s) => (
                          <p key={s.id} className="text-slate-700 dark:text-slate-200">
                            {staffLabel(ctx.staffById[s.staffId], ctx.lang) || s.staffName || '?'}
                            <span className="text-slate-500"> {s.start}–{s.end}</span>
                          </p>
                        ))}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {shifts.length > 0 && formatDuration(planned)}
                        {actual > 0 && <span className="block text-xs text-slate-500">факт {formatDuration(actual)}</span>}
                      </td>
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
          {dates.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 font-bold text-slate-700 dark:text-slate-200">
                <td colSpan={3} className="px-2 py-2">Итого за период</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {formatDuration(periodTotal.planned)}
                  {periodTotal.actual > 0 && <span className="block text-xs font-normal text-slate-500">факт {formatDuration(periodTotal.actual)}</span>}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setEditing(null)}>
          <div
            className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-slate-100 dark:bg-slate-900 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end mb-1">
              <button onClick={() => setEditing(null)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 text-slate-500">
                <X size={20} />
              </button>
            </div>
            {data[editing]
              ? renderDay(editing, () => setEditing(null))
              : (
                <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 text-center">
                  <p className="font-bold text-slate-800 dark:text-slate-100 mb-1">{dayTitle(editing, locale)}</p>
                  <p className="text-sm text-slate-500 mb-3">Этого дня в плане ещё нет.</p>
                  <BigButton icon={Plus} onClick={() => createDay(editing)}>Создать день</BigButton>
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  )
}
