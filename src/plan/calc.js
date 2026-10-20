import { durationMinutes, parseHM, formatDuration } from './hours'

// Plan data shape (see ScheduleTab):
//   planData/<planId>/<YYYY-MM-DD>/{ d, blocks:{id:{...}}, shifts:{id:{...}}, comments:{...} }
// `tree` below is the whole planData value: { [planId]: { [date]: day } }.

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

export const isDateKey = (k) => DATE_KEY.test(k)

export function parseDate(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function dateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function addDaysKey(key, n) {
  const d = parseDate(key)
  d.setDate(d.getDate() + n)
  return dateKey(d)
}

// Weeks run Monday–Sunday.
export function mondayOf(key) {
  const d = parseDate(key)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return dateKey(d)
}

export const monthOf = (key) => key.slice(0, 7)

export function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthTitle(month, locale = 'ru-RU') {
  const [y, m] = month.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function dayTitle(key, locale = 'ru-RU') {
  const d = parseDate(key)
  const wd = d.toLocaleDateString(locale, { weekday: 'short' })
  const rest = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${rest}`
}

export function weekTitle(mondayKey, locale = 'ru-RU') {
  const a = parseDate(mondayKey)
  const b = parseDate(addDaysKey(mondayKey, 6))
  const fmt = (d) => d.toLocaleDateString(locale,{ day: 'numeric', month: 'short' }).replace('.', '')
  return `${fmt(a)} – ${fmt(b)}`
}

export function shiftMinutes(shift, kind = 'planned') {
  return kind === 'actual'
    ? durationMinutes(shift.actStart, shift.actEnd)
    : durationMinutes(shift.start, shift.end)
}

export function sumMinutes(shifts, kind = 'planned') {
  let total = 0
  shifts.forEach((s) => { total += shiftMinutes(s, kind) || 0 })
  return total
}

// Every shift of every plan, flattened.
export function collectShifts(tree) {
  const out = []
  Object.entries(tree || {}).forEach(([planId, days]) => {
    Object.entries(days || {}).forEach(([date, day]) => {
      if (!isDateKey(date) || !day || typeof day !== 'object') return
      Object.entries(day.shifts || {}).forEach(([id, s]) => {
        if (s && typeof s === 'object') out.push({ ...s, id, planId, date })
      })
    })
  })
  return out
}

// Same person across plans is one row; a deleted staff member's old shifts
// still count (keyed by the name copy stored on the shift).
export function staffKeyOf(shift) {
  return shift.staffId || `name:${shift.staffName || ''}`
}

export function aggregateByStaff(shifts, from, to) {
  const map = new Map()
  shifts.forEach((s) => {
    if (s.date < from || s.date > to) return
    const key = staffKeyOf(s)
    if (!map.has(key)) map.set(key, { key, staffId: s.staffId || null, name: s.staffName || '', planned: 0, actual: 0 })
    const row = map.get(key)
    row.planned += shiftMinutes(s, 'planned') || 0
    row.actual += shiftMinutes(s, 'actual') || 0
  })
  return map
}

function interval(start, end) {
  const a = parseHM(start)
  const b = parseHM(end)
  if (a === null || b === null) return null
  return [a, b > a ? b : b + 1440]
}

function overlaps(a, b) {
  return a && b && a[0] < b[1] && b[0] < a[1]
}

// Rule-based, not clever: people with the most hours still owed to their
// monthly norm come first; anyone already working an overlapping shift that
// day goes last (and is flagged) rather than hidden, since the user may know
// better than the schedule does.
export function suggestStaff({ staff, shifts, date, start, end }) {
  const { from, to } = monthBounds(monthOf(date))
  const planned = aggregateByStaff(shifts, from, to)
  const wanted = interval(start, end)
  return staff
    .map((s) => {
      const row = planned.get(s.id)
      const plannedMin = row ? row.planned : 0
      const norm = typeof s.norm === 'number' ? s.norm : null
      const remainingMin = norm === null ? null : Math.round(norm * 60) - plannedMin
      const sameDay = shifts.filter((x) => x.staffId === s.id && x.date === date)
      const busy = sameDay.some((x) => overlaps(wanted, interval(x.start, x.end)))
      return { staff: s, plannedMin, remainingMin, busy, workingToday: sameDay.length > 0 }
    })
    .sort((a, b) => {
      if (a.busy !== b.busy) return a.busy ? 1 : -1
      const ra = a.remainingMin === null ? -Infinity : a.remainingMin
      const rb = b.remainingMin === null ? -Infinity : b.remainingMin
      if (ra !== rb) return rb - ra
      return (a.staff.name || '').localeCompare(b.staff.name || '', 'ru')
    })
}

// The dates a plan covers: its month, or its own start/end for a camp or
// event. null when none is set (older plans) — then every day is fair game.
export function planRange(plan) {
  if (plan.kind === 'month' && plan.month) return monthBounds(plan.month)
  if (isDateKey(plan.dateFrom || '') && isDateKey(plan.dateTo || '') && plan.dateFrom <= plan.dateTo) {
    return { from: plan.dateFrom, to: plan.dateTo }
  }
  return null
}

export const inPlanRange = (range, date) => !range || (date >= range.from && date <= range.to)

// Shifts of the same person that overlap in time. `list` items need
// { id, staffId, staffName, start, end }; works across plans too.
export function overlapIds(list) {
  const iv = (s) => {
    const a = parseHM(s.start)
    const b = parseHM(s.end)
    return a === null || b === null ? null : [a, b > a ? b : b + 1440]
  }
  const byPerson = new Map()
  list.forEach((s) => {
    const key = s.staffId || `n:${s.staffName}`
    if (!byPerson.has(key)) byPerson.set(key, [])
    byPerson.get(key).push(s)
  })
  const bad = new Set()
  byPerson.forEach((group) => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = iv(group[i])
        const b = iv(group[j])
        if (a && b && a[0] < b[1] && b[0] < a[1]) { bad.add(group[i].id); bad.add(group[j].id) }
      }
    }
  })
  return bad
}

// Things worth a second look before putting someone on a shift: an overlap
// with another shift of theirs (any plan) and going over the monthly norm.
export function assignmentWarnings({ staff, shifts, date, start, end, planTitles = {}, ignoreId = null }) {
  const out = []
  const a = parseHM(start)
  const b = parseHM(end)
  if (a === null || b === null) return out
  const wanted = [a, b > a ? b : b + 1440]
  shifts
    .filter((s) => s.id !== ignoreId && s.date === date && (s.staffId ? s.staffId === staff.id : s.staffName === staff.name))
    .forEach((s) => {
      const x = parseHM(s.start)
      const y = parseHM(s.end)
      if (x === null || y === null) return
      const iv = [x, y > x ? y : y + 1440]
      if (wanted[0] < iv[1] && iv[0] < wanted[1]) {
        out.push(`${staff.name} уже занят(а) в это время: ${s.start}–${s.end}${planTitles[s.planId] ? ` («${planTitles[s.planId]}»)` : ''}`)
      }
    })
  if (typeof staff.norm === 'number') {
    const { from, to } = monthBounds(monthOf(date))
    const planned = aggregateByStaff(shifts.filter((s) => s.id !== ignoreId), from, to).get(staff.id)
    const after = (planned ? planned.planned : 0) + (durationMinutes(start, end) || 0)
    if (after > Math.round(staff.norm * 60)) {
      out.push(`Сверх месячной нормы: будет ${formatDuration(after)} из ${staff.norm} ч`)
    }
  }
  return out
}
