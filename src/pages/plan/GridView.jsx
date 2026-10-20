import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X, Plus, Pencil, Copy, Printer } from 'lucide-react'
import { BigButton } from '../../components/UI'
import { writePaths, commitChange } from '../../plan/planStore'
import { formatDuration } from '../../plan/hours'
import {
  isDateKey, dayTitle, weekTitle, mondayOf, addDaysKey, monthOf, monthBounds, shiftMonth, monthTitle, planRange, inPlanRange,
  shiftMinutes,
} from '../../plan/calc'
import { LOCALE, staffLabel, dishLabel } from '../../plan/lang'
import { blocksOf, dishesOf, shiftsOf, commentsOf, buildTablePrint } from '../../plan/exchange'
import { todayKey } from '../../utils/dateUtils'
import { MenuCell, ShiftCell, NoteCell } from './GridCells'
import CopyModal from './CopyModal'
import { printReport } from '../../utils/printReport'

// Every cell gets a full border so the columns read as a table, not a list.
export const TH = 'px-2 py-2 border border-slate-300 dark:border-slate-600'
export const TD = 'px-2 py-2 border border-slate-300 dark:border-slate-600'

// All comments of a day in one place — on the day itself, on a meal, on a
// dish or on a shift — each tagged with what it is about.
export function gatherComments(day, blocks, shifts, ctx) {
  const out = []
  const add = (node, where) => commentsOf(node).forEach((c) => out.push({ where, text: c.text, by: c.by }))
  add(day, '')
  blocks.forEach((b) => {
    add(b, b.name || 'приём')
    dishesOf(b).forEach((d) => add(d, dishLabel(d, ctx.recipeById, ctx.lang)))
  })
  shifts.forEach((s) => add(s, staffLabel(ctx.staffById[s.staffId], ctx.lang) || s.staffName || ''))
  return out
}

// "20 чел." as a clear orange chip, not a faint number after the name.
export function Guests({ n, lang }) {
  return (
    <span className="ml-1.5 inline-block align-middle px-1.5 py-0.5 rounded-md bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 text-xs font-bold whitespace-nowrap">
      {n} {lang === 'de' ? 'Pers.' : 'чел.'}
    </span>
  )
}

// One hours line per shift, so each person has their own figure; both
// columns use the same line height so the lines stay level with the names.
export function shiftHoursText(s) {
  const p = shiftMinutes(s, 'planned')
  const a = shiftMinutes(s, 'actual')
  return { planned: p === null ? '—' : formatDuration(p), actual: a === null || a === 0 ? null : formatDuration(a) }
}

const SPANS = [
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'all', label: 'Весь план' },
]

// Which other plan covers this date (a month plan wins over a free-range one).
function findMoveTarget(plans, currentId, date) {
  const candidates = plans.filter((p) => p.id !== currentId && planRange(p) && inPlanRange(planRange(p), date))
  return candidates.find((p) => p.kind === 'month') || candidates[0] || null
}


export function daysBetween(from, to) {
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
export default function GridView({ plan, data, ctx, renderDay, plans = [], tree = {} }) {
  const today = todayKey()
  const range = useMemo(() => planRange(plan), [plan])
  const existing = useMemo(() => Object.keys(data).filter(isDateKey).sort(), [data])
  const [span, setSpan] = useState('week')
  const [anchor, setAnchor] = useState(() => {
    if (range) return inPlanRange(range, today) ? today : range.from
    return existing.includes(today) || !existing.length ? today : existing[0]
  })

  // The period was just set or changed: bring the table to it.
  useEffect(() => {
    if (range && !inPlanRange(range, anchor)) setAnchor(inPlanRange(range, today) ? today : range.from)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.from, range?.to])
  const [editing, setEditing] = useState(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [editMode, setEditMode] = useState(() => {
    try { return localStorage.getItem('kitchenPlan_gridEdit') === '1' } catch { return false }
  })
  const coll = `planData/${plan.id}`

  function toggleEdit() {
    const next = !editMode
    setEditMode(next)
    try { localStorage.setItem('kitchenPlan_gridEdit', next ? '1' : '0') } catch { /* preference only */ }
  }
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
    if (range) return [...new Set([...daysBetween(range.from, range.to), ...existing])].sort()
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

  // Days filled in outside this plan's period whose date a different plan covers.
  const strays = useMemo(() => {
    if (!range) return []
    return existing
      .filter((d) => !inPlanRange(range, d))
      .filter((d) => {
        const day = data[d]
        if (!day || !(Object.keys(day.blocks || {}).length || Object.keys(day.shifts || {}).length || Object.keys(day.comments || {}).length)) return false
        const target = findMoveTarget(plans, plan.id, d)
        if (!target) return false
        const there = tree[target.id]?.[d]
        return !(there && (Object.keys(there.blocks || {}).length || Object.keys(there.shifts || {}).length || Object.keys(there.comments || {}).length))
      })
  }, [range, existing, data, plans, plan.id, tree])

  function moveAllStrays() {
    const updates = {}
    strays.forEach((d) => {
      const target = findMoveTarget(plans, plan.id, d)
      updates[`planData/${plan.id}/${d}`] = null
      updates[`planData/${target.id}/${d}`] = data[d]
    })
    commitChange({
      coll: 'planData',
      action: 'update',
      entity: 'дни',
      id: plan.id,
      label: `${plan.title || 'план'}: перенесено ${strays.length} дн. в другие планы`,
      updates,
    })
  }

  function printTable() {
    printReport(buildTablePrint({
      title: plan.title || 'План',
      period: title,
      dates,
      partsOf: (d) => (data[d] ? [{ plan, day: data[d] }] : []),
      ctx,
      lang: ctx.lang,
      showTags: false,
      hideEmpty: false,
    }))
  }

  // A day that was filled in outside this plan's period belongs to another
  // plan; move it there in one step (one journal line, nothing is copied twice).
  function moveDay(date, target) {
    const src = data[date]
    if (!src) return
    const there = tree[target.id]?.[date]
    const thereHasData = there && (Object.keys(there.blocks || {}).length || Object.keys(there.shifts || {}).length || Object.keys(there.comments || {}).length)
    if (thereHasData) {
      window.alert(`В плане «${target.title}» на ${dayTitle(date)} уже есть записи. Сначала освободите этот день там.`)
      return
    }
    commitChange({
      coll: 'planData',
      action: 'update',
      entity: 'день',
      id: date,
      label: `${dayTitle(date)}: из «${plan.title}» в «${target.title}»`,
      updates: { [`planData/${plan.id}/${date}`]: null, [`planData/${target.id}/${date}`]: src },
    })
  }

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

      <div className="grid grid-cols-[1fr_auto_auto] gap-2 mb-3">
        <button
          onClick={toggleEdit}
          className={`min-h-[44px] rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border px-2 ${
            editMode
              ? 'bg-orange-500 border-orange-500 text-white'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          <Pencil size={16} />
          {editMode ? 'Правка включена — выключить' : 'Править в таблице'}
        </button>
        <button
          onClick={() => setCopyOpen(true)}
          className="min-h-[44px] px-3.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
        >
          <Copy size={16} /> Копировать
        </button>
        <button
          onClick={printTable}
          className="min-h-[44px] px-3.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
        >
          <Printer size={16} /> Печать
        </button>
      </div>

      {strays.length > 0 && (
        <div className="mb-3 rounded-xl border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 p-3 text-sm text-slate-800 dark:text-slate-100">
          Есть записи вне периода этого плана: <b>{strays.length}</b> дн. Они относятся к другим планам.
          <div className="mt-2">
            <button onClick={moveAllStrays} className="px-3 min-h-[40px] rounded-lg bg-orange-500 text-white font-semibold">
              Перенести всё в подходящие планы
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <table className={`w-full ${editMode ? "min-w-[1180px]" : "min-w-[920px]"} border-collapse text-sm`}>
          <thead>
            <tr className="bg-slate-200 dark:bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <th className={`${TH} w-28`}>День</th>
              <th className={`${TH} w-[34%]`}>Меню</th>
              <th className={`${TH} w-[24%]`}>Комментарии</th>
              <th className={`${TH} ${editMode ? "w-64" : "w-48"}`}>Сотрудники</th>
              <th className={`${TH} w-20 text-right`}>Часы</th>
            </tr>
          </thead>
          <tbody>
            {dates.length === 0 && (
              <tr><td colSpan={5} className={`${TD} py-6 text-center text-slate-400`}>В плане пока нет дней. Добавьте день, неделю или месяц ниже, в блоке плана.</td></tr>
            )}
            {weeks.map(([monday, list]) => {
              const wt = totals(data, list)
              return [
                span !== 'week' && (
                  <tr key={`w${monday}`} className="bg-slate-100 dark:bg-slate-900/60">
                    <td colSpan={4} className={`${TD} !py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500`}>
                      {ctx.lang === 'de' ? 'Woche' : 'Неделя'} {weekTitle(monday, locale)}
                    </td>
                    <td className={`${TD} !py-1.5 text-right text-xs font-bold text-slate-600 dark:text-slate-300`}>{formatDuration(wt.planned)}</td>
                  </tr>
                ),
                ...list.map((date) => {
                  const day = data[date]
                  const blocks = day ? blocksOf(day) : []
                  const shifts = day ? shiftsOf(day) : []
                  const planned = shifts.reduce((a, s) => a + (shiftMinutes(s, 'planned') || 0), 0)
                  const actual = shifts.reduce((a, s) => a + (shiftMinutes(s, 'actual') || 0), 0)
                  const notes = day ? gatherComments(day, blocks, shifts, ctx) : []
                  const isToday = date === today
                  const outside = !inPlanRange(range, date)
                  const edit = editMode && !outside
                  const hasData = !!day && (blocks.length > 0 || shifts.length > 0 || notes.length > 0)
                  const moveTo = outside && hasData ? findMoveTarget(plans, plan.id, date) : null
                  return (
                    <tr
                      key={date}
                      onClick={edit || outside ? undefined : () => setEditing(date)}
                      className={`align-top ${edit || outside ? '' : 'cursor-pointer active:bg-orange-50 dark:active:bg-slate-700'} ${!day && !edit ? 'text-slate-400' : ''} ${outside ? 'bg-slate-100 dark:bg-slate-900/60 text-slate-400' : ''} ${isToday ? 'bg-orange-50/60 dark:bg-orange-950/20' : ''}`}
                    >
                      <td className={`${TD} font-bold whitespace-nowrap text-slate-800 dark:text-slate-100`}>
                        {dayTitle(date, locale)}
                        {outside && (
                          <span className="block text-[11px] font-normal leading-tight text-slate-500">
                            вне периода плана
                            {hasData && (moveTo
                              ? (
                                <button onClick={() => moveDay(date, moveTo)} className="block mt-0.5 font-semibold text-orange-600 underline text-left">
                                  перенести в «{moveTo.title}»
                                </button>
                              )
                              : <span className="block text-red-600">нет плана на эту дату</span>)}
                          </span>
                        )}
                        {edit && (
                          <button
                            onClick={() => setEditing(date)}
                            className="mt-1 block text-[11px] font-semibold text-orange-600 underline"
                            title="Комментарии к блюдам и сменам, флажок «изменено», удаление дня"
                          >
                            подробно
                          </button>
                        )}
                      </td>
                      <td className={TD}>
                        {edit
                          ? <MenuCell coll={coll} date={date} day={day || {}} ctx={ctx} />
                          : blocks.map((b) => (
                            <div key={b.id} className="mb-1.5 last:mb-0">
                              <p className="font-semibold text-slate-800 dark:text-slate-100">
                                {b.time ? `${b.time} ` : ''}{b.name || '—'}
                                {b.persons ? <Guests n={b.persons} lang={ctx.lang} /> : null}
                              </p>
                              {dishesOf(b).map((d) => (
                                <p key={d.id} className={`pl-2 text-slate-600 dark:text-slate-300 ${d.changed ? '!text-red-600 font-semibold' : ''}`}>
                                  · {dishLabel(d, ctx.recipeById, ctx.lang)}
                                </p>
                              ))}
                            </div>
                          ))}
                      </td>
                      <td className={`${TD} text-xs`}>
                        {edit
                          ? <NoteCell coll={coll} date={date} notes={notes} />
                          : notes.map((n, i) => (
                            <p key={i} className="mb-1 last:mb-0 text-slate-700 dark:text-slate-200">
                              {n.where && <span className="font-semibold text-orange-600">{n.where}: </span>}
                              {n.text}
                              <span className="text-slate-400"> — {n.by}</span>
                            </p>
                          ))}
                      </td>
                      <td className={`${TD} ${edit ? '' : 'whitespace-nowrap'}`}>
                        {edit
                          ? <ShiftCell coll={coll} date={date} day={day || {}} ctx={ctx} />
                          : shifts.map((s) => (
                            <p key={s.id} className="leading-6 text-slate-700 dark:text-slate-200">
                              {staffLabel(ctx.staffById[s.staffId], ctx.lang) || s.staffName || '?'}
                              <span className="text-slate-500"> {s.start}–{s.end}</span>
                            </p>
                          ))}
                      </td>
                      <td className={`${TD} text-right whitespace-nowrap text-slate-700 dark:text-slate-200`}>
                        {edit
                          ? (shifts.length > 0 && <span className="text-xs text-slate-500">всего {formatDuration(planned)}</span>)
                          : shifts.map((s) => {
                            const h = shiftHoursText(s)
                            return (
                              <p key={s.id} className="leading-6 font-semibold">
                                {h.planned}
                                {h.actual && <span className="ml-1 text-xs font-normal text-slate-500">(факт {h.actual})</span>}
                              </p>
                            )
                          })}
                      </td>
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
          {dates.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 dark:bg-slate-900/60 font-bold text-slate-700 dark:text-slate-200">
                <td colSpan={4} className={`${TD} border-t-2 border-t-slate-400`}>Итого за период</td>
                <td className={`${TD} border-t-2 border-t-slate-400 text-right whitespace-nowrap`}>
                  {formatDuration(periodTotal.planned)}
                  {periodTotal.actual > 0 && <span className="block text-xs font-normal text-slate-500">факт {formatDuration(periodTotal.actual)}</span>}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {copyOpen && (
        <CopyModal plan={plan} data={data} range={range} defaultFrom={mondayOf(anchor)} onClose={() => setCopyOpen(false)} />
      )}

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
