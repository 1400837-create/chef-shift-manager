import { formatDuration } from '../../plan/hours'
import { shiftMinutes, addDaysKey } from '../../plan/calc'
import { staffLabel, dishLabel } from '../../plan/lang'
import { dishesOf, commentsOf } from '../../plan/exchange'

// Every cell gets a full border so the columns read as a table, not a list.
export const TH = 'px-2 py-2 border border-slate-300 dark:border-slate-600 sticky top-0 z-20 bg-slate-200 dark:bg-slate-900'
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
