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
  // so a fixed-column table no longer fits — list each day's courses instead.
  const days = payload.days.map((d) => {
    const filled = d.courses.filter((c) => c.dish)
    const rows = filled.length
      ? filled.map((c) => `<div>${escapeHtml(c.label)}: ${escapeHtml(c.dish)}${c.kosher ? ' ✡' : ''}</div>`).join('')
      : '<div class="muted">—</div>'
    return `
      <div class="print-no-break" style="margin-bottom:10px;">
        <b>${escapeHtml(d.day)}. ${escapeHtml(d.weekday)}</b>
        ${rows}
      </div>`
  }).join('')

  return `
    <h1>${escapeHtml(payload.title)}</h1>
    ${days}
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
          </tr>`).join('')
      : '<tr><td colspan="3" class="muted">—</td></tr>'

    return `
      <h2>${escapeHtml(zone.label)}</h2>
      <table>
        <thead><tr><th>Продукт</th><th style="width:60px;">Ед.</th><th style="width:90px;">Кол-во</th></tr></thead>
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

function buildShoppingListHtml(payload) {
  const rows = payload.items.length
    ? payload.items.map((item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.unit)}</td>
          <td>${escapeHtml(item.qty)}</td>
        </tr>`).join('')
    : '<tr><td colspan="3" class="muted">Список пуст</td></tr>'

  return `
    <h1>${escapeHtml(payload.title)}</h1>
    <table>
      <thead><tr><th>Продукт</th><th style="width:60px;">Ед.</th><th style="width:90px;">Кол-во</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

const BUILDERS = {
  tasks: buildTasksHtml,
  menu: buildMenuHtml,
  recount: buildRecountHtml,
  'shopping-list': buildShoppingListHtml,
}

export function printReport(payload) {
  const builder = BUILDERS[payload.type]
  if (!builder) return

  const bodyHtml = builder(payload)
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Печать — Kitchen OS</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 13px; }
  h1 { font-size: 18px; margin: 0 0 10px; }
  h2 { font-size: 14px; margin: 14px 0 6px; border-bottom: 1px solid #000; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; font-size: 12px; }
  .row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
  .box { width: 14px; height: 14px; border: 1.5px solid #000; display: inline-block; flex-shrink: 0; margin-top: 1px; }
  .muted { color: #555; }
  .nowrap { white-space: nowrap; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) {
    alert('Не удалось открыть окно печати — разрешите всплывающие окна для этого сайта и попробуйте снова.')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 250)
}
