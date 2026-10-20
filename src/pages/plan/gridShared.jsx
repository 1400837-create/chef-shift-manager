import { formatDuration } from '../../plan/hours'
import { shiftMinutes, addDaysKey } from '../../plan/calc'
import { staffLabel, dishLabel } from '../../plan/lang'
import { dishesOf, commentsOf } from '../../plan/exchange'
import { MEAL_PALETTE, OTHER_MEAL_COLOR } from '../../plan/ui'

// Every cell gets a full border so the columns read as a table, not a list.
export const TH = 'px-2 py-2 border border-slate-300 dark:border-slate-600 bg-slate-200 dark:bg-slate-900'
export const TD = 'px-2 py-[var(--cell-py,0.5rem)] border border-slate-300 dark:border-slate-600 text-[length:var(--cell-fs,0.875rem)]'

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


export function daysBetween(from, to) {
  const out = []
  for (let d = from; d <= to; d = addDaysKey(d, 1)) out.push(d)
  return out
}

// One dish line in a read-only view: tap opens its tech card (owner device),
// and a small mark says when the same dish is served a day or two away.
export function DishLine({ d, b, date, ctx, bridge }) {
  const rep = d.recipeId && ctx.repeatNote ? ctx.repeatNote(d.recipeId, date) : null
  const canOpen = !!(bridge && d.recipeId && bridge.has(d.recipeId))
  return (
    <p
      onClick={canOpen ? (e) => { e.stopPropagation(); bridge.open(d.recipeId, b.persons) } : undefined}
      className={`pl-2 text-slate-600 dark:text-slate-300 ${d.changed ? '!text-red-600 font-semibold' : ''} ${canOpen ? 'underline decoration-dotted underline-offset-2 cursor-pointer' : ''}`}
    >
      · {dishLabel(d, ctx.recipeById, ctx.lang)}
      {rep && <span className="ml-1 text-[11px] font-semibold text-orange-600" title={rep}>↻ повтор</span>}
    </p>
  )
}

// What the coloured bar at the left of a meal means. The types and their
// colours are editable (Справочники → Типы приёмов).
export function MealLegend({ ctx }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[11px] text-slate-500">
      {ctx.mealTypes.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1">
          <span className={`inline-block w-2.5 h-2.5 rounded-sm ${(MEAL_PALETTE[t.color] || OTHER_MEAL_COLOR).dot}`} />
          {ctx.lang === 'de' && t.nameDe ? t.nameDe : t.name}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className={`inline-block w-2.5 h-2.5 rounded-sm ${OTHER_MEAL_COLOR.dot}`} />
        {ctx.lang === 'de' ? 'Sonstiges' : 'Другое'}
      </span>
    </p>
  )
}
