import { formatDuration, parseHM } from './hours'
import {
  isDateKey, dayTitle, weekTitle, mondayOf, shiftMinutes, aggregateByStaff, overlapIds,
} from './calc'
import { LOCALE, tr } from './lang'

// Everything here is pure: plan data in, text / print payload / write-set out.
// `data` is one plan's tree: { [YYYY-MM-DD]: { blocks, shifts, comments } }.

export function sortedEntries(obj, cmp) {
  return Object.entries(obj || {})
    .filter(([, v]) => v && typeof v === 'object')
    .map(([id, v]) => ({ id, ...v }))
    .sort(cmp)
}

export const blocksOf = (day) =>
  sortedEntries(day.blocks, (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.id.localeCompare(b.id))
export const shiftsOf = (day) =>
  sortedEntries(day.shifts, (a, b) => (a.start || '99:99').localeCompare(b.start || '99:99') || (a.staffName || '').localeCompare(b.staffName || '', 'ru'))
export const dishesOf = (block) => sortedEntries(block.dishes, (a, b) => a.id.localeCompare(b.id))
export const commentsOf = (node) => sortedEntries(node.comments, (a, b) => (a.ts || 0) - (b.ts || 0))

export function planDates(data, from, to) {
  return Object.keys(data || {})
    .filter(isDateKey)
    .filter((d) => (!from || d >= from) && (!to || d <= to))
    .sort()
}

// ---------------------------------------------------------------------------
// text for Google Sheets / Excel (tab-separated pastes into cells)
// ---------------------------------------------------------------------------

const cell = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim()
const tsv = (rows) => rows.map((r) => r.map(cell).join('\t')).join('\n')

function staffRu(shift, staffById) {
  return (shift.staffId && staffById[shift.staffId]?.name) || shift.staffName || ''
}

export function shiftsTsv(data, ctx, from, to) {
  const rows = [['Дата', 'Сотрудник', 'Начало', 'Конец', 'Факт начало', 'Факт конец', 'Часы план', 'Часы факт']]
  planDates(data, from, to).forEach((date) => {
    shiftsOf(data[date]).forEach((s) => {
      const p = shiftMinutes(s, 'planned')
      const a = shiftMinutes(s, 'actual')
      rows.push([
        date, staffRu(s, ctx.staffById), s.start, s.end, s.actStart, s.actEnd,
        p === null ? '' : formatDuration(p), a === null ? '' : formatDuration(a),
      ])
    })
  })
  return tsv(rows)
}

export function dishesTsv(data, ctx, from, to) {
  const rows = [['Дата', 'Приём', 'Время', 'Персон', 'Блюдо', 'Блюдо (DE)']]
  planDates(data, from, to).forEach((date) => {
    blocksOf(data[date]).forEach((b) => {
      const dishes = dishesOf(b)
      if (!dishes.length) rows.push([date, b.name, b.time, b.persons, '', ''])
      dishes.forEach((d) => rows.push([date, b.name, b.time, b.persons, d.text, ctx.recipeById[d.recipeId]?.de || '']))
    })
  })
  return tsv(rows)
}

export function hoursRows(shifts, staffList, from, to) {
  const byKey = aggregateByStaff(shifts, from, to)
  const seen = new Set()
  const rows = []
  staffList.forEach((s) => {
    const r = byKey.get(s.id)
    seen.add(s.id)
    rows.push({ key: s.id, staff: s, name: s.name, norm: typeof s.norm === 'number' ? s.norm : null, planned: r ? r.planned : 0, actual: r ? r.actual : 0 })
  })
  byKey.forEach((r, key) => {
    if (!seen.has(key)) rows.push({ key, staff: null, name: r.name || '(?)', norm: null, planned: r.planned, actual: r.actual })
  })
  return rows.filter((r) => r.planned > 0 || r.actual > 0)
}

export function hoursTsv(shifts, staffList, from, to) {
  const rows = [['Сотрудник', 'Норма, ч', 'План', 'Факт']]
  hoursRows(shifts, staffList, from, to).forEach((r) =>
    rows.push([r.name, r.norm === null ? '' : String(r.norm).replace('.', ','), formatDuration(r.planned), formatDuration(r.actual)])
  )
  return tsv(rows)
}

// ---------------------------------------------------------------------------
// import by paste
// ---------------------------------------------------------------------------

export function parseDateCell(raw, defaultYear) {
  const s = String(raw ?? '').trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  let y; let mo; let d
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3] } else {
    m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?\.?$/.exec(s)
    if (!m) return null
    d = +m[1]; mo = +m[2]
    y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : defaultYear
  }
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseTimeCell(raw) {
  const s = String(raw ?? '').trim().replace('.', ':')
  if (!s) return ''
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(s)
  if (!m) return null
  const norm = `${m[1].padStart(2, '0')}:${m[2] || '00'}`
  return parseHM(norm) === null ? null : norm
}

function splitLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => (line.includes('\t') ? line.split('\t') : line.split(';')))
    .map((cells) => cells.map((c) => c.trim()))
    .filter((cells) => cells.some((c) => c !== ''))
}

const norm = (s) => String(s || '').trim().toLowerCase()

// kind: 'shifts' | 'dishes'. Returns { rows, ok, bad } — bad rows carry a
// reason and are simply skipped on import.
export function parsePaste(kind, text, { staffList, recipeList, defaultYear }) {
  const lines = splitLines(text)
  const staffByName = new Map()
  staffList.forEach((s) => {
    staffByName.set(norm(s.name), s)
    if (s.nameDe) staffByName.set(norm(s.nameDe), s)
  })
  const recipeByName = new Map()
  recipeList.forEach((r) => {
    recipeByName.set(norm(r.name), r)
    if (r.de) recipeByName.set(norm(r.de), r)
  })

  const rows = []
  lines.forEach((cells, i) => {
    const date = parseDateCell(cells[0], defaultYear)
    if (!date) {
      // a header line is expected first and is silently skipped
      if (i === 0) return
      rows.push({ line: i + 1, error: `не распознана дата «${cells[0] || ''}»` })
      return
    }
    if (kind === 'shifts') {
      const staff = staffByName.get(norm(cells[1]))
      const start = parseTimeCell(cells[2])
      const end = parseTimeCell(cells[3])
      const actStart = parseTimeCell(cells[4])
      const actEnd = parseTimeCell(cells[5])
      if (!staff) return rows.push({ line: i + 1, error: `сотрудник «${cells[1] || ''}» не найден в справочнике` })
      if (!start || !end) return rows.push({ line: i + 1, error: 'не указано начало или конец смены' })
      if (actStart === null || actEnd === null) return rows.push({ line: i + 1, error: 'фактическое время не распознано' })
      rows.push({ line: i + 1, date, staff, start, end, actStart: actStart || null, actEnd: actEnd || null })
    } else {
      const time = parseTimeCell(cells[2])
      const persons = cells[3] ? parseInt(cells[3], 10) : null
      const text = cells[4]
      if (!text) return rows.push({ line: i + 1, error: 'не указано блюдо' })
      if (time === null) return rows.push({ line: i + 1, error: 'время не распознано' })
      const recipe = recipeByName.get(norm(text))
      rows.push({
        line: i + 1, date, block: cells[1] || '', time, persons: Number.isFinite(persons) && persons > 0 ? persons : null,
        text: recipe ? recipe.name : text, recipeId: recipe ? recipe.id : null,
      })
    }
  })
  return { rows, ok: rows.filter((r) => !r.error), bad: rows.filter((r) => r.error) }
}

// Turns parsed rows into one multi-path write relative to `planData/<planId>`.
// Dishes join an existing block of the same name on that day when there is one.
export function buildImportUpdates(kind, rows, data, planId, makeId) {
  const base = `planData/${planId}`
  const updates = {}
  const dayAdded = new Set()
  const blockPaths = new Map()

  function ensureDay(date) {
    if (!data[date] && !dayAdded.has(date)) {
      dayAdded.add(date)
      updates[`${base}/${date}/d`] = 1
    }
  }

  rows.forEach((r) => {
    ensureDay(r.date)
    if (kind === 'shifts') {
      updates[`${base}/${r.date}/shifts/${makeId()}`] = {
        staffId: r.staff.id, staffName: r.staff.name, start: r.start, end: r.end,
        actStart: r.actStart, actEnd: r.actEnd,
      }
      return
    }
    const key = `${r.date}|${norm(r.block)}|${r.block ? '' : r.time}`
    let blockId = blockPaths.get(key)
    if (!blockId) {
      const existing = r.block
        ? Object.entries(data[r.date]?.blocks || {}).find(([, b]) => b && norm(b.name) === norm(r.block))
        : null
      if (existing) blockId = existing[0]
      else {
        blockId = makeId()
        const bp = `${base}/${r.date}/blocks/${blockId}`
        // fields written one by one, so each path is a leaf (no parent/child overlap)
        updates[`${bp}/name`] = r.block
        updates[`${bp}/time`] = r.time || ''
        if (r.persons) updates[`${bp}/persons`] = r.persons
      }
      blockPaths.set(key, blockId)
    }
    updates[`${base}/${r.date}/blocks/${blockId}/dishes/${makeId()}`] = { text: r.text, recipeId: r.recipeId }
  })
  return updates
}

// ---------------------------------------------------------------------------
// print payload
// ---------------------------------------------------------------------------

// `lang`: 'ru' | 'de' | 'both'. With 'both' every name reads "русское / deutsch".
export function buildPrintPayload({ plan, data, ctx, shifts, lang, from, to }) {
  const L = (ru, de) => (lang === 'both' ? (de && de !== ru ? `${ru} / ${de}` : ru) : lang === 'de' ? (de || ru) : ru)
  const T = (key) => (lang === 'both' ? `${tr('ru', key)} / ${tr('de', key)}` : tr(lang, key))
  const D = (fn) => (lang === 'both' ? `${fn('ru-RU')} / ${fn('de-DE')}` : fn(LOCALE[lang]))

  const dates = planDates(data, from, to)
  const weeks = new Map()
  dates.forEach((date) => {
    const monday = mondayOf(date)
    if (!weeks.has(monday)) weeks.set(monday, [])
    weeks.get(monday).push(date)
  })

  const staffName = (s) => {
    const rec = s.staffId ? ctx.staffById[s.staffId] : null
    return L(rec?.name || s.staffName || '', rec?.nameDe || '')
  }

  const out = []
  weeks.forEach((days, monday) => {
    out.push({
      title: `${T('week')} ${D((loc) => weekTitle(monday, loc))}`,
      days: days.map((date) => {
        const day = data[date]
        const shiftList = shiftsOf(day)
        let planned = 0
        shiftList.forEach((s) => { planned += shiftMinutes(s, 'planned') || 0 })
        return {
          title: D((loc) => dayTitle(date, loc)),
          blocks: blocksOf(day).map((b) => ({
            time: b.time || '',
            name: b.name || '',
            persons: b.persons || '',
            dishes: dishesOf(b).map((d) => ({
              text: L(d.text || '', ctx.recipeById[d.recipeId]?.de || ''),
              changed: !!d.changed,
              comments: commentsOf(d).map((c) => `${c.text} (${c.by})`),
            })),
            comments: commentsOf(b).map((c) => `${c.text} (${c.by})`),
          })),
          shifts: shiftList.map((s) => {
            const p = shiftMinutes(s, 'planned')
            const a = shiftMinutes(s, 'actual')
            return {
              staff: staffName(s),
              time: `${s.start || ''}–${s.end || ''}`,
              hours: p === null ? '' : formatDuration(p),
              actual: a === null ? '' : `${s.actStart}–${s.actEnd} (${formatDuration(a)})`,
              comments: commentsOf(s).map((c) => `${c.text} (${c.by})`),
            }
          }),
          dayComments: commentsOf(day).map((c) => `${c.text} (${c.by})`),
          total: shiftList.length ? formatDuration(planned) : '',
        }
      }),
    })
  })

  const rangeFrom = dates[0]
  const rangeTo = dates[dates.length - 1]
  const summary = rangeFrom
    ? hoursRows(shifts, ctx.staffList, rangeFrom, rangeTo).map((r) => ({
        name: L(r.staff?.name || r.name, r.staff?.nameDe || ''),
        norm: r.norm === null ? '' : String(r.norm),
        planned: formatDuration(r.planned),
        actual: r.actual ? formatDuration(r.actual) : '',
      }))
    : []

  return {
    type: 'work-plan',
    title: plan.title || T('plan'),
    lang,
    weeks: out,
    summary,
    labels: {
      meals: T('meals'), shifts: T('shifts'), time: T('time'), meal: T('meal'), persons: T('persons'),
      dishes: T('dishes'), staff: T('staff'), hours: T('hours'), norm: T('norm'), planned: T('planned'),
      actual: T('actual'), total: T('total'), totalPeriod: T('totalMonth'), noData: T('noData'),
      changed: T('changed'),
    },
  }
}


// ---------------------------------------------------------------------------
// plan → Меню
// ---------------------------------------------------------------------------

// Menu stores, per month and day number, a list of courses {id,label,dish,qty}.
// `qty` doubles as the recipe coefficient there (a recipe is written for 10
// portions), so persons/10 is what makes the plan's ТК scale come out right.
export function buildMenuTransfer(data, ctx, from, to, menuData) {
  const days = []
  planDates(data, from, to).forEach((date) => {
    const courses = []
    blocksOf(data[date]).forEach((b) => {
      const persons = Number(b.persons)
      const qty = Number.isFinite(persons) && persons > 0 ? String(Math.round((persons / 10) * 100) / 100) : ''
      dishesOf(b).forEach((d) => {
        const recipe = d.recipeId ? ctx.recipeById[d.recipeId] : null
        const dish = (recipe ? recipe.name : d.text || '').trim()
        if (dish) courses.push({ label: b.name || '', dish, qty })
      })
    })
    if (!courses.length) return
    const monthKey = date.slice(0, 7)
    const day = Number(date.slice(8, 10))
    const existing = menuData?.[monthKey]?.[day]
    const hasExisting = !!(existing && Array.isArray(existing.courses)
      ? existing.courses.some((c) => c.dish)
      : existing && Object.keys(existing).some((k) => /^(soup|main|side|salad)$/.test(k) && existing[k]))
    days.push({ date, monthKey, day, courses, hasExisting })
  })
  return days
}

// mode: 'skip' (leave filled days alone) | 'replace' | 'append'
export function applyMenuTransfer(prev, days, mode, coursesForDay) {
  const next = { ...prev }
  let stamp = Date.now()
  days.forEach((d) => {
    if (d.hasExisting && mode === 'skip') return
    const month = { ...(next[d.monthKey] || {}) }
    const cur = month[d.day] || {}
    const fresh = d.courses.map((c) => ({ id: `p-${stamp++}`, label: c.label, dish: c.dish, qty: c.qty, kosher: false }))
    const keep = d.hasExisting && mode === 'append' ? coursesForDay(cur).filter((c) => c.dish) : []
    month[d.day] = { ...cur, courses: [...keep, ...fresh] }
    next[d.monthKey] = month
  })
  return next
}

// "10-16", "9:30–17", "10.00 - 18:00" → ['10:00','16:00']; null when unclear.
export function parseRange(raw) {
  const parts = String(raw || '').trim().split(/\s*[-–—]\s*/)
  if (parts.length !== 2) return null
  const a = parseTimeCell(parts[0])
  const b = parseTimeCell(parts[1])
  return a && b ? [a, b] : null
}

// ---------------------------------------------------------------------------
// the table itself, as a landscape print
// ---------------------------------------------------------------------------

// `partsOf(date)` → [{ plan, day }] for that date (one plan, or all of them).
// `showTags` adds the plan's name above its blocks (the all-plans view).
export function buildTablePrint({ title, period, dates, partsOf, ctx, lang, showTags, hideEmpty }) {
  const L = (ru, de) => (lang === 'both' ? (de && de !== ru ? `${ru} / ${de}` : ru) : lang === 'de' ? (de || ru) : ru)
  const T = (key) => (lang === 'both' ? `${tr('ru', key)} / ${tr('de', key)}` : tr(lang, key))
  const D = (fn) => (lang === 'both' ? `${fn('ru-RU')} / ${fn('de-DE')}` : fn(LOCALE[lang]))

  const weeks = new Map()
  dates.forEach((d) => {
    const m = mondayOf(d)
    if (!weeks.has(m)) weeks.set(m, [])
    weeks.get(m).push(d)
  })

  let totalMin = 0
  const outWeeks = []
  weeks.forEach((days, monday) => {
    const rows = []
    days.forEach((date) => {
      const parts = partsOf(date)
      const empty = parts.every(({ day }) => !Object.keys(day.blocks || {}).length && !Object.keys(day.shifts || {}).length && !Object.keys(day.comments || {}).length)
      if (empty && hideEmpty) return
      const allShifts = parts.flatMap(({ day }) => shiftsOf(day))
      const bad = overlapIds(allShifts)
      const notes = []
      const blocks = []
      const shifts = []
      parts.forEach(({ plan, day }) => {
        blocksOf(day).forEach((b, idx) => {
          blocks.push({
            tag: showTags && idx === 0 ? plan.title || '' : '',
            time: b.time || '',
            name: b.name || '',
            persons: b.persons || '',
            dishes: dishesOf(b).map((d) => ({ text: L(d.text || '', ctx.recipeById[d.recipeId]?.de || ''), changed: !!d.changed })),
          })
          commentsOf(b).forEach((c) => notes.push(`${b.name || ''}: ${c.text} (${c.by})`))
          dishesOf(b).forEach((d) => commentsOf(d).forEach((c) => notes.push(`${d.text}: ${c.text} (${c.by})`)))
        })
        commentsOf(day).forEach((c) => notes.push(`${c.text} (${c.by})`))
        shiftsOf(day).forEach((s) => {
          const rec = s.staffId ? ctx.staffById[s.staffId] : null
          const p = shiftMinutes(s, 'planned')
          const a = shiftMinutes(s, 'actual')
          totalMin += p || 0
          commentsOf(s).forEach((c) => notes.push(`${rec?.name || s.staffName || ''}: ${c.text} (${c.by})`))
          shifts.push({
            staff: L(rec?.name || s.staffName || '', rec?.nameDe || ''),
            time: `${s.start || ''}–${s.end || ''}`,
            hours: p === null ? '' : formatDuration(p) + (a ? ` (${formatDuration(a)})` : ''),
            warn: bad.has(s.id),
          })
        })
      })
      rows.push({ day: D((loc) => dayTitle(date, loc)), blocks, notes, shifts })
    })
    if (rows.length) outWeeks.push({ title: `${T('week')} ${D((loc) => weekTitle(monday, loc))}`, rows })
  })

  return {
    type: 'work-table',
    landscape: true,
    title,
    period,
    weeks: outWeeks,
    total: formatDuration(totalMin),
    guests: lang === 'both' ? `${tr('ru', 'guests')} / ${tr('de', 'guests')}` : tr(lang, 'guests'),
    labels: { day: T('day'), menu: T('menu'), comments: T('comments'), staff: T('staff'), hours: T('hours'), total: T('totalMonth'), conflict: T('conflict'), noData: T('noData'), changed: T('changed') },
  }
}

// ---------------------------------------------------------------------------
// copy a day / a week onto other dates of the same plan
// ---------------------------------------------------------------------------

const hasContent = (d) => !!d && (Object.keys(d.blocks || {}).length > 0 || Object.keys(d.shifts || {}).length > 0)

// pairs: [{ from, to }]. Comments, "changed" flags and actual times are not
// carried over — it is a fresh day built from the same menu and staffing.
// A target day that already has meals or shifts is left alone.
export function planCopyUpdates({ planId, data, pairs, what, makeId }) {
  const base = `planData/${planId}`
  const updates = {}
  let copied = 0
  let skipped = 0
  pairs.forEach(({ from, to }) => {
    const src = data[from]
    if (!src) return
    const hasMenu = what.menu && Object.keys(src.blocks || {}).length > 0
    const hasShifts = what.shifts && Object.keys(src.shifts || {}).length > 0
    if (!hasMenu && !hasShifts) return
    if (hasContent(data[to])) { skipped += 1; return }
    if (hasMenu) {
      blocksOf(src).forEach((b) => {
        const bid = makeId()
        const bp = `${base}/${to}/blocks/${bid}`
        updates[`${bp}/name`] = b.name || ''
        updates[`${bp}/time`] = b.time || ''
        if (b.persons) updates[`${bp}/persons`] = b.persons
        dishesOf(b).forEach((d) => { updates[`${bp}/dishes/${makeId()}`] = { text: d.text, recipeId: d.recipeId || null } })
      })
    }
    if (hasShifts) {
      shiftsOf(src).forEach((s) => {
        updates[`${base}/${to}/shifts/${makeId()}`] = { staffId: s.staffId || null, staffName: s.staffName || null, start: s.start, end: s.end }
      })
    }
    copied += 1
  })
  return { updates, copied, skipped }
}

// ---------------------------------------------------------------------------
// plain text for messengers (WhatsApp / Telegram): a day, or a whole period
// ---------------------------------------------------------------------------

export function dayText({ date, parts, ctx, lang }) {
  const loc = LOCALE[lang === 'de' ? 'de' : 'ru']
  const L = (staff, rec) => (lang === 'de' && rec?.nameDe ? rec.nameDe : staff)
  const lines = [dayTitle(date, loc)]
  const multi = parts.length > 1
  parts.forEach(({ plan, day }) => {
    if (multi && (blocksOf(day).length || shiftsOf(day).length)) lines.push(`[${plan.title || ''}]`)
    blocksOf(day).forEach((b) => {
      const guests = b.persons ? ` — ${b.persons} ${tr(lang, 'guests')}` : ''
      lines.push(`${b.time ? `${b.time} ` : ''}${b.name || '—'}${guests}`)
      dishesOf(b).forEach((d) => {
        const rec = d.recipeId ? ctx.recipeById[d.recipeId] : null
        lines.push(`  • ${lang === 'de' && rec?.de ? rec.de : d.text}`)
      })
    })
  })
  const shifts = parts.flatMap(({ day }) => shiftsOf(day))
  if (shifts.length) {
    lines.push(`${tr(lang, 'shifts')}:`)
    shifts.forEach((s) => {
      const rec = s.staffId ? ctx.staffById[s.staffId] : null
      const p = shiftMinutes(s, 'planned')
      lines.push(`  ${L(rec?.name || s.staffName || '?', rec)} ${s.start || ''}–${s.end || ''}${p === null ? '' : ` (${formatDuration(p)})`}`)
    })
  }
  const notes = []
  parts.forEach(({ day }) => {
    commentsOf(day).forEach((c) => notes.push(`${c.text} (${c.by})`))
    blocksOf(day).forEach((b) => {
      commentsOf(b).forEach((c) => notes.push(`${b.name || ''}: ${c.text} (${c.by})`))
      dishesOf(b).forEach((d) => commentsOf(d).forEach((c) => notes.push(`${d.text}: ${c.text} (${c.by})`)))
    })
    shiftsOf(day).forEach((s) => commentsOf(s).forEach((c) => notes.push(`${s.staffName || ''}: ${c.text} (${c.by})`)))
  })
  if (notes.length) {
    lines.push(`${tr(lang, 'comments')}:`)
    notes.forEach((n) => lines.push(`  ${n}`))
  }
  return lines.join('\n')
}

export function periodText({ title, dates, partsOf, ctx, lang, hideEmpty = true }) {
  const blocks = []
  dates.forEach((date) => {
    const parts = partsOf(date)
    const has = parts.some(({ day }) => Object.keys(day.blocks || {}).length || Object.keys(day.shifts || {}).length)
    if (!has && hideEmpty) return
    blocks.push(dayText({ date, parts, ctx, lang }))
  })
  return `${title}\n\n${blocks.join('\n\n') || tr(lang, 'noData')}`
}
