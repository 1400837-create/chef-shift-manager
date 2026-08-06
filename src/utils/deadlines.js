import { addDays, daysBetween, formatRu, startOfDay } from './dateUtils'

// Menu must be submitted roughly a month before the month it covers, so the
// natural deadline is the last day of the current month (submitting the
// following month's menu). Returns days remaining + the deadline date.
export function menuDeadlineInfo(now = new Date()) {
  const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const deadline = addDays(firstOfNextMonth, -1) // last day of this month
  const daysLeft = daysBetween(startOfDay(now), deadline)
  return { deadline, daysLeft, label: formatRu(deadline) }
}

export function urgencyColor(daysLeft) {
  if (daysLeft <= 3) return 'red'
  if (daysLeft <= 7) return 'yellow'
  return 'green'
}
