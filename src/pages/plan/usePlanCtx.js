import { useMemo } from 'react'
import { usePlanCollection } from '../../plan/planStore'
import { usePlanLang } from '../../plan/lang'
import { parseHM } from '../../plan/hours'
import { collectShifts, isDateKey, parseDate, dayTitle } from '../../plan/calc'
import { byName } from './shared'
import { makeMealColor, DEFAULT_MEAL_TYPES } from '../../plan/ui'

const MS_DAY = 86400000
const dayDiff = (a, b) => Math.round((parseDate(a) - parseDate(b)) / MS_DAY)

// Everything the plan screens need to show names and dishes: staff, shift
// templates, the recipe list (published by the owner's device), all plans and
// all days of all plans. One place so the schedule tab, the dashboard and the
// pickers all read the same thing.
export function usePlanCtx() {
  const plans = usePlanCollection('plans')
  const staff = usePlanCollection('staff')
  const templatesCol = usePlanCollection('shiftTemplates')
  const mealTplCol = usePlanCollection('mealTemplates')
  const mealTypesCol = usePlanCollection('mealTypes')
  const recipes = usePlanCollection('recipesSlim')
  const lang = usePlanLang()
  const allData = usePlanCollection('planData').data

  const sortedPlans = useMemo(() => [...plans.items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [plans.items])

  const ctx = useMemo(() => {
    const staffList = [...staff.items].filter((s) => s.name).sort(byName)
    const templates = [...templatesCol.items].sort((a, b) => (parseHM(a.start) ?? 0) - (parseHM(b.start) ?? 0))
    const customTypes = [...mealTypesCol.items].filter((t) => t.name).sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'ru'))
    const mealTypes = customTypes.length ? customTypes : DEFAULT_MEAL_TYPES
    const mealColor = makeMealColor(mealTypes)
    const mealTemplates = [...mealTplCol.items].filter((t) => t.name).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    // recipesSlim can come back as an array with holes (Firebase turns small
    // integer keys into one) — skip the empty slots.
    const recipeList = Object.entries(recipes.data || {})
      .map(([id, r]) => (r && r.n ? { id, name: r.n, de: r.d || '', cat: r.c || 'other', desc: r.m || '' } : null))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    const recipeById = {}
    recipeList.forEach((r) => { recipeById[r.id] = r })
    const staffById = {}
    staffList.forEach((s) => { staffById[s.id] = s })
    const planTitles = {}
    sortedPlans.forEach((p) => { planTitles[p.id] = p.title || '' })

    // recipe → every date it is served on, across all plans
    const usage = {}
    Object.values(allData || {}).forEach((days) => {
      Object.entries(days || {}).forEach(([date, day]) => {
        if (!isDateKey(date) || !day || typeof day !== 'object') return
        Object.values(day.blocks || {}).forEach((b) => {
          Object.values((b && b.dishes) || {}).forEach((d) => {
            if (d && d.recipeId) {
              if (!usage[d.recipeId]) usage[d.recipeId] = new Set()
              usage[d.recipeId].add(date)
            }
          })
        })
      })
    })
    const usageDates = {}
    Object.entries(usage).forEach(([id, set]) => { usageDates[id] = [...set].sort() })

    // "this dish is already on the menu a day or two away"
    const repeatNote = (recipeId, date) => {
      const near = (usageDates[recipeId] || []).filter((d) => d !== date && Math.abs(dayDiff(d, date)) <= 2)
      if (!near.length) return null
      const d = near.sort((a, b) => Math.abs(dayDiff(a, date)) - Math.abs(dayDiff(b, date)))[0]
      return dayDiff(d, date) < 0 ? `Уже было: ${dayTitle(d)}` : `Уже будет: ${dayTitle(d)}`
    }

    return {
      staffList, staffById, templates, mealTemplates, mealTypes, mealTypesCustom: customTypes.length > 0, mealColor, recipeList, recipeById, lang, planTitles,
      allShifts: collectShifts(allData), usageDates, repeatNote,
    }
  }, [staff.items, templatesCol.items, mealTplCol.items, mealTypesCol.items, recipes.data, lang, sortedPlans, allData])

  return { ctx, sortedPlans, allData, plansReady: plans.ready }
}
