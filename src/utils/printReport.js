// Printing via a hidden "#print-area" overlay + @media print CSS is the
// classic desktop trick, but it is fragile on mobile browsers (the hidden
// app content still reserves layout space, timing between React's commit
// and window.print() is unreliable, etc.) — in testing on a phone it produced
// blank pages. Opening a small, fully self-contained document in a new
// window/tab and printing THAT avoids all of that: nothing from the host
// page's CSS or layout can interfere.

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildTasksHtml(payload) {
  const sections = payload.tasksByCategory.map((cat) => {
    const items = cat.items.length
      ? cat.items.map((text) => `
          <div class="row">
            <span class="box"></span>
            <span>${escapeHtml(text)}</span>
          </div>`).join('')
      : '<p class="muted">—</p>'
    return `<h2>${escapeHtml(cat.label)}</h2>${items}`
  }).join('')

  return `
    <h1>Задачи для Küchenhilfe</h1>
    <p class="muted">${escapeHtml(payload.date)}</p>
    ${sections}
  `
}

function buildMenuHtml(payload) {
  // Each day can have a different number of courses now (default 5, +Add),
  // so a fixed-column table (one column per course slot) no longer fits —
  // instead each (day, course) is its own row, with a bold/bordered "day
  // header" row starting each day's block. Keeps it a single continuous
  // table (clean grid, easy to scan) without assuming a fixed course count.
  const rows = payload.days.map((d) => {
    const filled = d.courses.filter((c) => c.dish)
    const dayLabel = `${escapeHtml(d.day)}, ${escapeHtml(d.weekday)}`
    const dayHeaderRow = `<tr class="day-row"><td colspan="3">${dayLabel}</td></tr>`
    const courseRows = filled.length
      ? filled.map((c) => `
          <tr>
            <td>${escapeHtml(c.label || '—')}</td>
            <td>${escapeHtml(c.dish)}${c.kosher ? ' ✡' : ''}</td>
            <td class="nowrap">${escapeHtml(c.qty || '')}</td>
          </tr>`).join('')
      : '<tr><td colspan="3" class="muted">—</td></tr>'
    return dayHeaderRow + courseRows
  }).join('')

  return `
    <h1>${escapeHtml(payload.title)}</h1>
    <table>
      <thead><tr><th style="width:120px;">Приём пищи</th><th>Блюдо</th><th style="width:90px;">Кол-во</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="muted" style="margin-top:8px;">✡ — кошерное блюдо (кашрут)</p>
  `
}

function buildRecountHtml(payload) {
  const zones = payload.zones.map((zone) => {
    const rows = zone.items.length
      ? zone.items.map((item) => `
          <tr>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.unit)}</td>
            <td>${payload.blank ? '' : escapeHtml(item.qty)}</td>
            <td>${payload.blank ? '' : escapeHtml(item.comment)}</td>
          </tr>`).join('')
      : '<tr><td colspan="4" class="muted">—</td></tr>'

    return `
      <h2>${escapeHtml(zone.label)}</h2>
      <table>
        <thead><tr><th>Продукт</th><th style="width:60px;">Ед.</th><th style="width:80px;">Кол-во</th><th style="width:140px;">Комментарий</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `
  }).join('')

  return `
    <h1>${escapeHtml(payload.title)}</h1>
    ${zones}
    <p style="margin-top:20px;">Подпись Küchenleiterin: ______________________</p>
  `
}

// ТТК = технико-технологическая карта — the standard restaurant kitchen
// format: name, photo, ingredients, then a free-text cooking process.
function buildTtkHtml(payload) {
  const cards = payload.recipes.map((r) => {
    const photo = r.photo ? `<img src="${r.photo}" style="max-width:220px;max-height:220px;object-fit:cover;border:1px solid #000;margin-bottom:8px;" />` : ''
    const rows = r.ingredients.length
      ? r.ingredients.map((ing) => `
          <tr>
            <td>${escapeHtml(ing.name)}</td>
            <td style="width:70px;">${escapeHtml(ing.qty)}</td>
            <td style="width:50px;">${escapeHtml(ing.unit)}</td>
          </tr>`).join('')
      : '<tr><td colspan="3" class="muted">—</td></tr>'
    const cost = r.cost !== null && r.cost !== undefined ? `<p class="muted">Себестоимость: ≈ ${escapeHtml(r.cost.toFixed(2))}</p>` : ''

    return `
      <div class="print-no-break" style="margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid #000;">
        <h1>Технико-технологическая карта</h1>
        <h2 style="border:none;">${escapeHtml(r.name)}</h2>
        ${photo}
        <table>
          <thead><tr><th>Ингредиент</th><th>Кол-во</th><th>Ед.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${cost}
        <h2>Технология приготовления</h2>
        <p>${r.comment ? escapeHtml(r.comment).replace(/\n/g, '<br>') : '<span class="muted">—</span>'}</p>
      </div>
    `
  }).join('')

  return cards
}

function buildPurchaseLogHtml(payload) {
  const rows = payload.items.length
    ? payload.items.map((item) => `
        <tr>
          <td>${escapeHtml(item.date)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.qty)} ${escapeHtml(item.unit)}</td>
          <td>${escapeHtml(item.comment)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="muted">Список пуст</td></tr>'

  return `
    <h1>${escapeHtml(payload.title)}</h1>
    <table>
      <thead><tr><th style="width:90px;">Дата</th><th>Продукт</th><th style="width:90px;">Кол-во</th><th style="width:160px;">Комментарий</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

function buildShoppingListHtml(payload) {
  const rows = payload.items.length
    ? payload.items.map((item) => {
        // Shown only when printing the mixed "все магазины" view (see
        // ShoppingList.jsx's printList) — printing one already-filtered
        // store would just repeat the same name on every row.
        const storeMark = item.store
          ? `<b style="color:#c00;">${escapeHtml(item.store)}</b>${item.comment ? '<br>' : ''}`
          : ''
        // "Обратить внимание" marker. A plain "!" in a box rather than a
        // flag glyph: it renders in every print font, unlike ⚑/emoji which
        // can fall back to a tofu box on some printers.
        const flagMark = item.flagged
          ? '<span style="display:inline-block;border:1.5px solid #c00;color:#c00;font-weight:bold;width:13px;text-align:center;line-height:15px;margin-right:5px;">!</span>'
          : ''
        return `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.unit)}</td>
          <td>${escapeHtml(item.qty)}</td>
          <td>${flagMark}${storeMark}${escapeHtml(item.comment || '')}</td>
        </tr>`
      }).join('')
    : '<tr><td colspan="4" class="muted">Список пуст</td></tr>'

  return `
    <h1>${escapeHtml(payload.title)}</h1>
    <table>
      <thead><tr><th>Продукт</th><th style="width:60px;">Ед.</th><th style="width:90px;">Кол-во</th><th style="width:160px;">Комментарий</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

function buildWorkPlanHtml(payload) {
  const L = payload.labels
  const note = (list) => (list && list.length
    ? `<div class="muted" style="font-size:11px;">${list.map((c) => escapeHtml(c)).join('<br>')}</div>`
    : '')

  const weeks = payload.weeks.map((week) => {
    const days = week.days.map((day) => {
      const blockRows = day.blocks.map((b) => {
        const dishes = b.dishes.length
          ? b.dishes.map((d) => `${d.changed ? '<span style="display:inline-block;border:1.5px solid #c00;color:#c00;font-weight:bold;width:13px;text-align:center;line-height:15px;margin-right:5px;" title="' + escapeHtml(L.changed) + '">!</span>' : ''}${escapeHtml(d.text)}${note(d.comments)}`).join('<br>')
          : ''
        return `<tr>
          <td class="nowrap">${escapeHtml(b.time)}</td>
          <td>${escapeHtml(b.name)}</td>
          <td>${escapeHtml(b.persons)}</td>
          <td>${dishes}${note(b.comments)}</td>
        </tr>`
      }).join('')
      const blocks = day.blocks.length
        ? `<table><thead><tr><th style="width:50px;">${escapeHtml(L.time)}</th><th style="width:150px;">${escapeHtml(L.meal)}</th><th style="width:55px;">${escapeHtml(L.persons)}</th><th>${escapeHtml(L.dishes)}</th></tr></thead><tbody>${blockRows}</tbody></table>`
        : ''
      const shiftRows = day.shifts.map((s) => `<tr>
          <td>${escapeHtml(s.staff)}${note(s.comments)}</td>
          <td class="nowrap">${escapeHtml(s.time)}</td>
          <td class="nowrap">${escapeHtml(s.hours)}</td>
          <td class="nowrap">${escapeHtml(s.actual)}</td>
        </tr>`).join('')
      const shifts = day.shifts.length
        ? `<table><thead><tr><th>${escapeHtml(L.staff)}</th><th style="width:100px;">${escapeHtml(L.time)}</th><th style="width:60px;">${escapeHtml(L.hours)}</th><th style="width:150px;">${escapeHtml(L.actual)}</th></tr></thead><tbody>${shiftRows}
            <tr><td colspan="2"><b>${escapeHtml(L.total)}</b></td><td colspan="2"><b>${escapeHtml(day.total)}</b></td></tr></tbody></table>`
        : ''
      return `<div class="print-no-break"><h2>${escapeHtml(day.title)}</h2>${blocks}${shifts}${note(day.dayComments)}</div>`
    }).join('')
    return `<h1 style="margin-top:14px;">${escapeHtml(week.title)}</h1>${days}`
  }).join('')

  const summary = payload.summary.length
    ? `<div class="print-no-break"><h2>${escapeHtml(L.totalPeriod)}</h2><table>
        <thead><tr><th>${escapeHtml(L.staff)}</th><th style="width:70px;">${escapeHtml(L.norm)}</th><th style="width:70px;">${escapeHtml(L.planned)}</th><th style="width:70px;">${escapeHtml(L.actual)}</th></tr></thead>
        <tbody>${payload.summary.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.norm)}</td><td>${escapeHtml(r.planned)}</td><td>${escapeHtml(r.actual)}</td></tr>`).join('')}</tbody></table></div>`
    : ''

  const cost = payload.cost && payload.cost.rows.length
    ? `<div class="print-no-break"><h2>Калькуляция</h2><table>
        <thead><tr><th>Позиция</th><th style="width:90px;">Кол-во</th><th style="width:80px;">Цена</th><th style="width:90px;">Сумма</th></tr></thead>
        <tbody>${payload.cost.rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.qty)}</td><td>${escapeHtml(r.price)}</td><td>${escapeHtml(r.sum)}</td></tr>`).join('')}
        <tr><td colspan="3"><b>Итого</b></td><td><b>${escapeHtml(payload.cost.total)}</b></td></tr>
        ${payload.cost.perGuest ? `<tr><td colspan="3">На гостя</td><td>${escapeHtml(payload.cost.perGuest)}</td></tr>` : ''}
        </tbody></table></div>`
    : ''

  return `<h1 style="font-size:22px;">${escapeHtml(payload.title)}</h1>${weeks || `<p class="muted">${escapeHtml(L.noData)}</p>`}${summary}${cost}`
}

// The week table is printed "fit to sheet": every size inside #fit is in em,
// so the whole table scales with #fit's font-size (see WORK_TABLE_CSS and
// fitWorkTable below). Each week is its own sheet (.wt-page), and the scale is
// chosen so that the fullest week still fits one landscape page.
function buildWorkTableHtml(payload) {
  const L = payload.labels
  const guest = (n) => (n ? `<span class="wt-guest">${escapeHtml(n)} ${escapeHtml(payload.guests)}</span>` : '')
  const flag = (changed) => (changed
    ? `<span class="wt-flag" title="${escapeHtml(L.changed)}">!</span>`
    : '')

  const pages = payload.weeks.map((w) => {
    const rows = w.rows.map((r) => {
      const menu = r.blocks.map((b) => `
        <div class="wt-block">
          ${b.tag ? `<div class="muted wt-tag">${escapeHtml(b.tag)}</div>` : ''}
          <b>${escapeHtml(b.time)} ${escapeHtml(b.name)}</b>${guest(b.persons)}
          ${b.dishes.map((d) => `<div class="wt-dish">${flag(d.changed)}${escapeHtml(d.text)}</div>`).join('')}
        </div>`).join('')
      const notes = r.notes.map((n) => `<div class="wt-note">${escapeHtml(n)}</div>`).join('')
      const staff = r.shifts.map((s) => `<div class="wt-line${s.warn ? ' wt-warn' : ''}">${s.warn ? '&#9888; ' : ''}${escapeHtml(s.staff)} ${escapeHtml(s.time)}</div>`).join('')
      const hours = r.shifts.map((s) => `<div class="wt-line wt-hours">${escapeHtml(s.hours)}</div>`).join('')
      return `<tr class="print-no-break">
        <td class="wt-day">${escapeHtml(r.day)}</td>
        <td>${menu}</td><td>${notes}</td><td>${staff}</td><td>${hours}</td>
      </tr>`
    }).join('')
    return `<h2>${escapeHtml(w.title)}</h2>
      <table>
        <thead><tr>
          <th style="width:6.7em;">${escapeHtml(L.day)}</th><th style="width:38%;">${escapeHtml(L.menu)}</th>
          <th style="width:22%;">${escapeHtml(L.comments)}</th><th style="width:14.5em;">${escapeHtml(L.staff)}</th><th style="width:5.8em;">${escapeHtml(L.hours)}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`
  })

  const head = `<h1>${escapeHtml(payload.title)} <span class="muted wt-period">${escapeHtml(payload.period)}</span></h1>`
  const total = `<p class="wt-total">${escapeHtml(L.total)}: ${escapeHtml(payload.total)}</p>`
  if (!pages.length) pages.push(`<p class="muted">${escapeHtml(L.noData)}</p>`)
  const last = pages.length - 1
  return `<div id="fit">${pages.map((p, i) => `<section class="wt-page">${i === 0 ? head : ''}${p}${i === last ? total : ''}</section>`).join('')}</div>`
}

// ---------------------------------------------------------------------------
// "fit to sheet" for the week table
// ---------------------------------------------------------------------------
// On screen #fit is laid out at a fixed 1000px width with font-size --f px.
// In print it is the full page width with font-size --f × 0.1vw, and in
// Chrome's print layout 100vw = the printable width of the chosen sheet.
// So the print is the on-screen layout scaled to the sheet: same proportions
// on A4 and A3, just bigger. Paper size is NOT fixed in @page any more — it
// comes from the print dialog.

const FIT_REF_WIDTH = 1000
// Printable height / width of a landscape A-series sheet with 8mm margins:
// A4 194/281 = 0.690, A3 281/404 = 0.696. 0.66 leaves room for borders and
// rounding (borders are 1px, they do not scale).
const FIT_MAX_RATIO = 0.66
const FIT_MIN_F = 9 //  ≈ 8pt on A4 — below that the week is allowed to run onto a second sheet
const FIT_MAX_F = 20 // a nearly empty week is not blown up beyond ≈ 1.75× the old size

const WORK_TABLE_CSS = `
  @page { size: landscape; margin: 8mm; }
  body { margin: 0; }
  #fit { --f: 12; width: ${FIT_REF_WIDTH}px; font-size: calc(var(--f) * 1px); }
  @media print { #fit { width: auto; font-size: calc(var(--f) * ${100 / FIT_REF_WIDTH}vw); } }
  #fit h1 { font-size: 1.5em; margin: 0 0 .6em; }
  #fit h2 { font-size: 1.15em; margin: 0 0 .5em; border-bottom: 1px solid #000; padding-bottom: .15em; }
  #fit table { width: 100%; border-collapse: collapse; margin-bottom: .6em; }
  #fit th, #fit td { border: 1px solid #000; padding: .33em .5em; text-align: left; font-size: 1em; }
  .wt-page { display: flow-root; }
  .wt-page + .wt-page { break-before: page; page-break-before: always; }
  .wt-period { font-weight: normal; font-size: .72em; }
  .wt-day { white-space: nowrap; font-weight: bold; }
  .wt-block { margin-bottom: .33em; }
  .wt-tag { font-size: .83em; text-transform: uppercase; }
  .wt-dish { padding-left: .67em; }
  .wt-note { font-size: .83em; margin-bottom: .17em; }
  .wt-line { line-height: 1.5; white-space: nowrap; }
  .wt-hours { text-align: right; font-weight: bold; }
  .wt-warn { color: #c00; font-weight: bold; }
  .wt-total { text-align: right; font-weight: bold; margin: .4em 0 0; }
  .wt-guest { display: inline-block; margin-left: .5em; padding: 0 .4em; border: 1.5px solid #000; border-radius: .33em; font-weight: bold; font-size: .92em; }
  .wt-flag { display: inline-block; border: 1.5px solid #c00; color: #c00; font-weight: bold; width: .92em; text-align: center; line-height: 1.08em; margin-right: .33em; }
`

// Picks the largest --f at which every week (.wt-page) fits one sheet.
// Returns the chosen value. Exported for testing.
export function fitWorkTable(doc) {
  const root = doc.getElementById('fit')
  if (!root) return null
  const pages = Array.from(root.querySelectorAll('.wt-page'))
  const limit = FIT_MAX_RATIO * FIT_REF_WIDTH
  const set = (f) => root.style.setProperty('--f', String(f))
  const fits = (f) => {
    set(f)
    return pages.every((p) => p.getBoundingClientRect().height <= limit)
  }
  if (fits(FIT_MAX_F)) return FIT_MAX_F
  if (!fits(FIT_MIN_F)) { set(FIT_MIN_F); return FIT_MIN_F }
  let lo = FIT_MIN_F
  let hi = FIT_MAX_F
  while (hi - lo > 0.1) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  const f = Math.floor(lo * 10) / 10
  set(f)
  return f
}

const BUILDERS = {
  'work-plan': buildWorkPlanHtml,
  'work-table': buildWorkTableHtml,
  tasks: buildTasksHtml,
  menu: buildMenuHtml,
  recount: buildRecountHtml,
  'shopping-list': buildShoppingListHtml,
  ttk: buildTtkHtml,
  'purchase-log': buildPurchaseLogHtml,
}

// The full self-contained print document. Exported for testing.
export function renderPrintHtml(payload) {
  const builder = BUILDERS[payload.type]
  if (!builder) return null

  const bodyHtml = builder(payload)
  const fitCss = payload.type === 'work-table' ? WORK_TABLE_CSS : ''
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Печать — LA CHEF</title>
<style>
  ${fitCss ? '' : `@page { size: A4 ${payload.landscape ? 'landscape' : 'portrait'}; margin: ${payload.landscape ? '9mm' : '14mm'}; }`}
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 13px; }
  h1 { font-size: 18px; margin: 0 0 10px; }
  h2 { font-size: 14px; margin: 14px 0 6px; border-bottom: 1px solid #000; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; font-size: 12px; }
  .row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
  .box { width: 14px; height: 14px; border: 1.5px solid #000; display: inline-block; flex-shrink: 0; margin-top: 1px; }
  .muted { color: #555; }
  .nowrap { white-space: nowrap; }
  .print-no-break { break-inside: avoid; page-break-inside: avoid; }
  .day-row td { font-weight: bold; background: #eee; border-top: 2px solid #000; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
${fitCss}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

export function printReport(payload) {
  const html = renderPrintHtml(payload)
  if (!html) return

  const win = window.open('', '_blank')
  if (!win) {
    alert('Не удалось открыть окно печати — разрешите всплывающие окна для этого сайта и попробуйте снова.')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    // If measuring fails for any reason the table still prints, just at the
    // default size — never block the print on the fit.
    try { fitWorkTable(win.document) } catch { /* default --f stays */ }
    win.print()
  }, 250)
}
