// "HH:MM" strings → minutes, with overnight shifts (22:00–02:00 = 4:00) and no
// break deduction (per the plan's rules: breaks are not subtracted).

export function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export function durationMinutes(start, end) {
  const a = parseHM(start)
  const b = parseHM(end)
  if (a === null || b === null) return null
  return b >= a ? b - a : b + 1440 - a
}

export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}
