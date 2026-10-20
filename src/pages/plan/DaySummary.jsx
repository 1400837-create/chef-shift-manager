import { AlertTriangle } from 'lucide-react'
import { staffLabel, dishLabel } from '../../plan/lang'
import { blocksOf, dishesOf, shiftsOf } from '../../plan/exchange'
import { overlapIds } from '../../plan/calc'
import { Guests, shiftHoursText, gatherComments, DishLine } from './gridShared'

// One day, read-only and compact: meals with guests and dishes, who works and
// for how long, comments. Used by the phone cards, the dashboard and the
// all-plans cards.
//   parts: [{ plan, day }]   showTags: label blocks with their plan's name
//   repeats: (recipeId, date) → text|null   onDish(dish): make dishes tappable
export default function DaySummary({ date, parts, ctx, showTags = false, onOpenPlan, bridge, focusStaff }) {
  const allShifts = parts.flatMap(({ day }) => shiftsOf(day))
  const bad = overlapIds(allShifts)
  const notes = parts.flatMap(({ day }) => gatherComments(day, blocksOf(day), shiftsOf(day), ctx))
  const hasBlocks = parts.some(({ day }) => blocksOf(day).length > 0)
  const hasShifts = allShifts.length > 0

  return (
    <div className="text-sm">
      {parts.map(({ plan, day }) => {
        const blocks = blocksOf(day)
        if (!blocks.length) return null
        return (
          <div key={plan.id} className="mb-2">
            {showTags && (
              <button
                onClick={(e) => { e.stopPropagation(); if (onOpenPlan) onOpenPlan(plan.id) }}
                className="mb-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                {plan.title || 'план'}
              </button>
            )}
            {blocks.map((b) => (
              <div key={b.id} className={`mb-1.5 border-l-4 pl-2 ${ctx.mealColor(b.name).bar}`}>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {b.time ? `${b.time} ` : ''}{b.name || '—'}
                  {b.persons ? <Guests n={b.persons} lang={ctx.lang} /> : null}
                </p>
                {dishesOf(b).map((d) => <DishLine key={d.id} d={d} b={b} date={date} ctx={ctx} bridge={bridge} />)}
              </div>
            ))}
          </div>
        )
      })}

      {hasShifts && (
        <div className="mt-1 pt-1 border-t border-slate-100 dark:border-slate-700">
          {parts.flatMap(({ day }) => shiftsOf(day)).map((s) => {
            const h = shiftHoursText(s)
            const dim = focusStaff && s.staffId !== focusStaff
            return (
              <p key={s.id} className={`flex items-baseline justify-between gap-2 leading-6 ${bad.has(s.id) ? 'text-red-600 font-semibold' : 'text-slate-700 dark:text-slate-200'} ${dim ? 'opacity-35' : ''}`}>
                <span className="min-w-0 truncate">
                  {bad.has(s.id) && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />}
                  {staffLabel(ctx.staffById[s.staffId], ctx.lang) || s.staffName || '?'}
                  <span className="text-slate-500 font-normal"> {s.start}–{s.end}</span>
                </span>
                <span className="shrink-0 font-semibold">
                  {h.planned}{h.actual && <span className="ml-1 text-xs font-normal text-slate-500">({h.actual})</span>}
                </span>
              </p>
            )
          })}
        </div>
      )}

      {notes.length > 0 && (
        <div className="mt-1 pt-1 border-t border-slate-100 dark:border-slate-700 text-xs">
          {notes.map((n, i) => (
            <p key={i} className="mb-0.5 text-slate-700 dark:text-slate-200">
              {n.where && <span className="font-semibold text-orange-600">{n.where}: </span>}
              {n.text}<span className="text-slate-400"> — {n.by}</span>
            </p>
          ))}
        </div>
      )}

      {!hasBlocks && !hasShifts && notes.length === 0 && <p className="text-slate-400">Пусто</p>}
    </div>
  )
}
