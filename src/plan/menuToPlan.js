import { coursesForDay } from '../utils/menuCourses'
import { addDaysKey, isDateKey } from './calc'

// Menu → Plan (the opposite of the plan's «В Меню»): every dish of the chosen
// days in the main app's Меню becomes a dish of one meal per day in a plan.
// Pure functions — they only work out what to write.

const norm = (s) => String(s || '').trim().toLowerCase()

// The key a recipe is published under in the plan room (see publishRecipesSlim).
export const planRecipeKey = (id) => String(id).replace(/[.#$/[\]]/g, '_')

// Menu dishes are free text; one that is exactly a recipe's Russian or German
// name gets linked to it (so the plan shows the German name, ТК, usage notes).
function recipeMatcher(recipes) {
  const byName = new Map()
  ;(recipes || []).forEach((r) => {
    if (r.name) byName.set(norm(r.name), r)
    if (r.nameDe) byName.set(norm(r.nameDe), r)
  })
  return (text) => byName.get(norm(text)) || null
}

// Calendar days from `from` to `to` (inclusive, capped at 93 days).
export function datesBetween(from, to) {
  if (!isDateKey(from) || !isDateKey(to) || to < from) return []
  const out = []
  let d = from
  while (d <= to && out.length < 93) {
    out.push(d)
    d = addDaysKey(d, 1)
  }
  return out
}

// menuData is { 'YYYY-MM': { [dayNumber]: { courses, eventName } } }.
// Returns [{ date, dishes: [{ text, recipeId }], eventName }] for the days of
// the range that have at least one dish.
export function menuDaysToPlan(menuData, from, to, recipes) {
  const match = recipeMatcher(recipes)
  const days = []
  datesBetween(from, to).forEach((date) => {
    const monthKey = date.slice(0, 7)
    const dayNum = Number(date.slice(8))
    const dayData = (menuData || {})[monthKey]?.[dayNum]
    if (!dayData) return
    const dishes = []
    coursesForDay(dayData).forEach((c) => {
      const text = String(c.dish || '').trim()
      if (!text) return
      const rec = match(text)
      dishes.push({ text, recipeId: rec ? planRecipeKey(rec.id) : null })
    })
    if (dishes.length) days.push({ date, dishes, eventName: String(dayData.eventName || '').trim() })
  })
  return days
}

// Paths (relative to `planData/<planId>`) that put the days into the plan.
//   mode 'skip'    — leave days that already have meals alone
//   mode 'append'  — add one more meal to such days
//   mode 'replace' — delete the day's existing meals first
// `existing` is the plan's tree: { [date]: { blocks: { id: … } } }.
export function buildPlanWrite({ days, existing, mode, mealName, mealTime, persons, useEventName, makeId }) {
  const rel = {}
  let written = 0
  days.forEach((d) => {
    const cur = (existing || {})[d.date]
    const curBlocks = Object.keys((cur && cur.blocks) || {})
    if (curBlocks.length && mode === 'skip') return
    if (!cur) rel[`${d.date}/d`] = 1
    if (curBlocks.length && mode === 'replace') curBlocks.forEach((id) => { rel[`${d.date}/blocks/${id}`] = null })
    const bid = makeId()
    const bp = `${d.date}/blocks/${bid}`
    rel[`${bp}/name`] = (useEventName && d.eventName) || mealName || ''
    rel[`${bp}/time`] = mealTime || ''
    if (persons) rel[`${bp}/persons`] = persons
    d.dishes.forEach((dish) => {
      rel[`${bp}/dishes/${makeId()}`] = { text: dish.text, recipeId: dish.recipeId || null }
    })
    written += 1
  })
  return { rel, written }
}
