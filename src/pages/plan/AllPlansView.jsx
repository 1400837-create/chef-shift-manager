import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle, Printer, EyeOff, Eye } from 'lucide-react'
import { formatDuration, parseHM } from '../../plan/hours'
import {
  dayTitle, weekTitle, mondayOf, addDaysKey, monthOf, monthBounds, shiftMonth, monthTitle, shiftMinutes, isDateKey,
} from '../../plan/calc'
import { LOCALE, staffLabel, dishLabel, tr } from '../../plan/lang'
import { blocksOf, dishesOf, shiftsOf, buildTablePrint } from '../../plan/exchange'
import { printReport } from '../../utils/printReport'
import { todayKey } from '../../utils/dateUtils'
import { mealColor, loadPos, savePos } from '../../plan/ui'
import { usePlanDeviceState } from '../../plan/planRoom'
import { TH, TD, gatherComments, daysBetween, Guests, shiftHoursText } from './GridView'

const PALETTE = [
  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
]

const ALL_POS = '__all'

const SPANS = [
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
]

const isEmpty = (day) =>
  !day || (!Object.keys(day.blocks || {}).length && !Object.keys(day.shifts || {}).length && !Object.keys(day.comments || {}).length)

function interval(s) {
  const a = parseHM(s.start)
  const b = parseHM(s.end)
  if (a === null || b === null) return null
  return [a, b > a ? b : b + 1440]
}

// The same person on two overlapping shifts — in the same plan or across
// plans (a camp and the month running side by side).
function conflictIds(entries) {
  const byPerson = new Map()
  entries.forEach((e) => {
    const key = e.shift.staffId || `n:${e.shift.staffName}`
    if (!byPerson.has(key)) byPerson.set(key, [])
    byPerson.get(key).push(e)
  })
  const bad = new Set()
  byPerson.forEach((list) => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = interval(list[i].shift)
        const b = interval(list[j].shift)
        if (a && b && a[0] < b[1] && b[0] < a[1]) { bad.add(list[i].shift.id); bad.add(list[j].shift.id) }
      }
    }
  })
  return bad
}

// Everything that happens on each day, from every plan at once: the month,
// camps, events. Read-only — each item carries its plan's tag; tap the tag
// to open that plan and edit there.
export default function AllPlansView({ plans, tree, ctx, onOpenPlan }) {
  const today = todayKey()
  const locale = LOCALE[ctx.lang]
  const code = usePlanDeviceState().config?.code
  const saved = loadPos(code, ALL_POS)
  const [span, setSpan] = useState(() => (saved?.span === "month" ? "month" : "week"))
  const [anchor, setAnchor] = useState(() => (isDateKey(saved?.anchor || "") ? saved.anchor : today))
  useEffect(() => { savePos(code, ALL_POS, { span, anchor }) }, [code, span, anchor])
  const [hideEmpty, setHideEmpty] = useState(false)

  const colorOf = useMemo(() => {
    const map = {}
    plans.forEach((p, i) => { map[p.id] = PALETTE[i % PALETTE.length] })
    return map
  }, [plans])

  const dates = useMemo(() => {
    if (span === 'week') {
      const m = mondayOf(anchor)
      return daysBetween(m, addDaysKey(m, 6))
    }
    const { from, to } = monthBounds(monthOf(anchor))
    return daysBetween(from, to)
  }, [span, anchor])

  const weeks = useMemo(() => {
    const map = new Map()
    dates.forEach((d) => {
      const m = mondayOf(d)
      if (!map.has(m)) map.set(m, [])
      map.get(m).push(d)
    })
    return [...map.entries()]
  }, [dates])

  const step = (dir) => setAnchor((a) => (span === 'month' ? `${shiftMonth(monthOf(a), dir)}-01` : addDaysKey(a, 7 * dir)))

  useEffect(() => {
    function onKey(e) {
      const el = e.target
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const title = span === 'week' ? weekTitle(mondayOf(anchor), locale) : monthTitle(monthOf(anchor), locale)

  // One entry per plan that has something on the date.
  const dayParts = (date) => plans
    .map((p) => ({ plan: p, day: tree[p.id]?.[date] }))
    .filter((x) => !isEmpty(x.day))

  const dayMinutes = (parts) => parts.reduce((sum, { day }) => sum + shiftsOf(day).reduce((a, s) => a + (shiftMinutes(s, 'planned') || 0), 0), 0)
  const periodTotal = dates.reduce((a, d) => a + dayMinutes(dayParts(d)), 0)

  function printAll() {
    printReport(buildTablePrint({
      title: tr(ctx.lang, 'allPlans'),
      period: title,
      dates,
      partsOf: dayParts,
      ctx,
      lang: ctx.lang,
      showTags: true,
      hideEmpty,
    }))
  }

  const Tag = ({ plan }) => (
    <button
      onClick={() => onOpenPlan(plan.id)}
      className={`inline-block max-w-full truncate align-middle px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${colorOf[plan.id]}`}
      title="Открыть этот план"
    >
      {plan.title || 'план'}
    </button>
  )

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => step(-1)} className="w-11 h-11 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <ChevronLeft size={20} />
        </button>
        <p className="flex-1 text-center font-bold text-slate-800 dark:text-slate-100">{title}</p>
        <button onClick={() => step(1)} className="w-11 h-11 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 text-sm font-semibold mb-2">
        {SPANS.map((s) => (
          <button
            key={s.key}
            onClick={() => { setSpan(s.key); setHideEmpty(s.key === 'month') }}
            className={`flex-1 min-h-[40px] ${span === s.key ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={() => setHideEmpty((v) => !v)}
          className="min-h-[44px] rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
        >
          {hideEmpty ? <Eye size={16} /> : <EyeOff size={16} />}
          {hideEmpty ? 'Показать пустые дни' : 'Скрыть пустые дни'}
        </button>
        <button
          onClick={printAll}
          className="min-h-[44px] rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
        >
          <Printer size={16} /> Печать
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3 items-center text-xs text-slate-500">
        <span>Планы:</span>
        {plans.map((p) => <Tag key={p.id} plan={p} />)}
        <span className="basis-full">Здесь всё из всех планов за период. Правится в самом плане: нажмите на его метку.</span>
      </div>

      <div className="overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 max-h-[calc(100dvh-var(--app-header-h,64px)-9.5rem)]">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-200 dark:bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <th className={`${TH} w-28 left-0 z-30`}>День</th>
              <th className={`${TH} w-[34%]`}>Меню</th>
              <th className={`${TH} w-[24%]`}>Комментарии</th>
              <th className={`${TH} w-56`}>Сотрудники</th>
              <th className={`${TH} w-20 text-right`}>Часы</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map(([monday, list0]) => {
              const list = hideEmpty ? list0.filter((d) => dayParts(d).length > 0) : list0
              if (!list.length) return null
              return [
              span !== 'week' && (
                <tr key={`w${monday}`} className="bg-slate-100 dark:bg-slate-900/60">
                  <td colSpan={5} className={`${TD} !py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500`}>
                    {ctx.lang === 'de' ? 'Woche' : 'Неделя'} {weekTitle(monday, locale)}
                  </td>
                </tr>
              ),
              ...list.map((date) => {
                const parts = dayParts(date)
                const shifts = parts.flatMap(({ plan, day }) => shiftsOf(day).map((shift) => ({ plan, shift })))
                const bad = conflictIds(shifts)
                return (
                  <tr key={date} className={`align-top ${date === today ? 'bg-orange-50/60 dark:bg-orange-950/20' : ''}`}>
                    <td className={`${TD} sticky left-0 z-10 font-bold whitespace-nowrap text-slate-800 dark:text-slate-100 ${date === today ? "bg-orange-50 dark:bg-slate-800" : "bg-white dark:bg-slate-800"}`}>{dayTitle(date, locale)}</td>
                    <td className={TD}>
                      {parts.map(({ plan, day }) => {
                        const blocks = blocksOf(day)
                        if (!blocks.length) return null
                        return (
                          <div key={plan.id} className="mb-2 last:mb-0">
                            <Tag plan={plan} />
                            {blocks.map((b) => (
                              <div key={b.id} className={`mt-1 border-l-4 pl-2 ${mealColor(b.name).bar}`}>
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
                          </div>
                        )
                      })}
                    </td>
                    <td className={`${TD} text-xs`}>
                      {parts.map(({ plan, day }) => {
                        const notes = gatherComments(day, blocksOf(day), shiftsOf(day), ctx)
                        return notes.map((n, i) => (
                          <p key={`${plan.id}-${i}`} className="mb-1 text-slate-700 dark:text-slate-200">
                            {n.where && <span className="font-semibold text-orange-600">{n.where}: </span>}
                            {n.text}
                            <span className="text-slate-400"> — {n.by}</span>
                          </p>
                        ))
                      })}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {shifts.map(({ plan, shift }) => (
                        <p key={`${plan.id}-${shift.id}`} className={`leading-6 ${bad.has(shift.id) ? 'text-red-600 font-semibold' : 'text-slate-700 dark:text-slate-200'}`}>
                          {bad.has(shift.id) && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" title="Пересечение со второй сменой этого человека" />}
                          {staffLabel(ctx.staffById[shift.staffId], ctx.lang) || shift.staffName || '?'}
                          <span className={bad.has(shift.id) ? '' : 'text-slate-500'}> {shift.start}–{shift.end}</span>
                          <span className={`ml-1 inline-block w-2 h-2 rounded-full align-middle ${colorOf[plan.id].split(' ')[0]}`} title={plan.title} />
                        </p>
                      ))}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap text-slate-700 dark:text-slate-200`}>
                      {shifts.map(({ plan, shift }) => {
                        const h = shiftHoursText(shift)
                        return (
                          <p key={`${plan.id}-${shift.id}`} className={`leading-6 font-semibold ${bad.has(shift.id) ? 'text-red-600' : ''}`}>
                            {h.planned}
                            {h.actual && <span className="ml-1 text-xs font-normal text-slate-500">(факт {h.actual})</span>}
                          </p>
                        )
                      })}
                    </td>
                  </tr>
                )
              }),
            ]})}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 dark:bg-slate-900/60 font-bold text-slate-700 dark:text-slate-200">
              <td colSpan={4} className={`${TD} border-t-2 border-t-slate-400`}>Итого за период</td>
              <td className={`${TD} border-t-2 border-t-slate-400 text-right whitespace-nowrap`}>{formatDuration(periodTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
