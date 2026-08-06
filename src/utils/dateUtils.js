// Central date helpers so every module keys its data the same way (YYYY-MM-DD).

export function todayKey(d = new Date()) {
  return toKey(d)
}

export function toKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function monthKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// new Date('YYYY-MM-DD') parses as UTC midnight per spec, which can shift to
// the previous day once converted to local time in negative-UTC-offset
// zones. Inputs from <input type="date"> should go through this instead.
export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d, days) {
  const nd = new Date(d)
  nd.setDate(nd.getDate() + days)
  return nd
}

export function addMonths(d, months) {
  const nd = new Date(d)
  nd.setMonth(nd.getMonth() + months)
  return nd
}

// ISO week number, used to key the weekly deep-cleaning checklist.
export function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export function daysBetween(a, b) {
  const ms = startOfDay(b) - startOfDay(a)
  return Math.round(ms / 86400000)
}

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function formatRu(d) {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatRuShort(d) {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

export const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

// Monday-first weekday index (0..6) for a given date, for calendar grid offset.
export function mondayIndex(d) {
  const day = d.getDay() // 0 = Sunday
  return (day + 6) % 7
}
