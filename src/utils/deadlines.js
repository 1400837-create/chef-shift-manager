import { addDays, biweekKey, daysBetween, formatRu, startOfDay } from './dateUtils'

// Menu must be submitted roughly a month before the month it covers, so the
// natural deadline is the last day of the current month (submitting the
// following month's menu). Returns days remaining + the deadline date.
export function menuDeadlineInfo(now = new Date()) {
  const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const deadline = addDays(firstOfNextMonth, -1) // last day of this month
  const daysLeft = daysBetween(startOfDay(now), deadline)
  return { deadline, daysLeft, label: formatRu(deadline) }
}

// Finance/advance reports run on a 14-day cycle from a fixed epoch. Uses
// addDays (calendar-based, via setDate) rather than raw epoch.getTime() +
// N*86400000 — the latter silently drifts by an hour across each DST
// transition between the epoch and "now", which can push the computed
// deadline onto the wrong calendar day (it was landing a day in the past,
// making the report look permanently overdue).
export function financeDeadlineInfo(now = new Date()) {
  const epoch = new Date(2024, 0, 1)
  const diffDays = daysBetween(epoch, now)
  const period = Math.floor(diffDays / 14)
  const periodEnd = addDays(epoch, (period + 1) * 14 - 1)
  const daysLeft = daysBetween(startOfDay(now), periodEnd)
  return { deadline: periodEnd, daysLeft, label: formatRu(periodEnd), periodKey: biweekKey(now) }
}

export function urgencyColor(daysLeft) {
  if (daysLeft <= 3) return 'red'
  if (daysLeft <= 7) return 'yellow'
  return 'green'
}
