import { biweekKey, daysBetween, formatRu, startOfDay } from './dateUtils'

// Menu must be submitted roughly a month before the month it covers, so the
// natural deadline is the last day of the current month (submitting the
// following month's menu). Returns days remaining + the deadline date.
export function menuDeadlineInfo(now = new Date()) {
  const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const deadline = new Date(firstOfNextMonth.getTime() - 86400000) // last day of this month
  const daysLeft = daysBetween(startOfDay(now), deadline)
  return { deadline, daysLeft, label: formatRu(deadline) }
}

// Finance/advance reports run on a 14-day cycle from a fixed epoch.
export function financeDeadlineInfo(now = new Date()) {
  const epoch = new Date(2024, 0, 1)
  const diffDays = Math.floor((startOfDay(now) - startOfDay(epoch)) / 86400000)
  const period = Math.floor(diffDays / 14)
  const periodEnd = new Date(epoch.getTime() + (period + 1) * 14 * 86400000 - 86400000)
  const daysLeft = daysBetween(startOfDay(now), periodEnd)
  return { deadline: periodEnd, daysLeft, label: formatRu(periodEnd), periodKey: biweekKey(now) }
}

export function urgencyColor(daysLeft) {
  if (daysLeft <= 3) return 'red'
  if (daysLeft <= 7) return 'yellow'
  return 'green'
}
