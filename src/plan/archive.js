import { addDaysKey, planRange, inPlanRange } from './calc'

// Plans that are over drop out of the row of plan buttons on their own once
// this many days have passed since their last day. They are not deleted: the
// «Архив» list still opens them, and their hours still count.
export const AUTO_ARCHIVE_DAYS = 60

// plan.archived: true  — the user moved it to the archive by hand
//                false — the user keeps it in the row (even if it is old)
//                unset — decided by the date
export function isArchived(plan, today) {
  if (plan.archived === true) return true
  if (plan.archived === false) return false
  const r = planRange(plan)
  if (!r) return false
  return addDaysKey(r.to, AUTO_ARCHIVE_DAYS) < today
}

// Plans in calendar order (by their first day); plans without dates last, by creation.
export function sortByPeriod(plans) {
  return [...plans].sort((a, b) => {
    const ra = planRange(a)
    const rb = planRange(b)
    if (ra && rb) return ra.from.localeCompare(rb.from) || ra.to.localeCompare(rb.to)
    if (ra) return -1
    if (rb) return 1
    return (a.createdAt || 0) - (b.createdAt || 0)
  })
}

// The plan the arrows lead to when the current one runs out. dir: 1 = later, -1 = earlier.
// Returns { plan, date } — `date` is where to open it — or null.
export function adjacentPlan(plans, plan, dir) {
  const range = planRange(plan)
  if (!range) return null
  const t = dir > 0 ? addDaysKey(range.to, 1) : addDaysKey(range.from, -1)
  const others = sortByPeriod(plans.filter((p) => p.id !== plan.id && planRange(p)))
  // a plan that covers the day right after (before) this one — a month plan wins
  const covering = others.filter((p) => inPlanRange(planRange(p), t))
  const pick = covering.find((p) => p.kind === 'month') || covering[0]
  if (pick) return { plan: pick, date: t }
  // otherwise the nearest one in that direction
  if (dir > 0) {
    const next = others.find((p) => planRange(p).from > t)
    return next ? { plan: next, date: planRange(next).from } : null
  }
  const prev = [...others].reverse().find((p) => planRange(p).to < t)
  return prev ? { plan: prev, date: planRange(prev).to } : null
}

// The day just past the plan's edge in that direction (for "create the next month").
export function dayBeyond(plan, dir) {
  const range = planRange(plan)
  if (!range) return null
  return dir > 0 ? addDaysKey(range.to, 1) : addDaysKey(range.from, -1)
}
