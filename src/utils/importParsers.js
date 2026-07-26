// Google Sheets has no CORS-friendly public export endpoint we can safely
// fetch() from a static, backend-less PWA, so import works by paste:
// select the range in Sheets, Ctrl+C, paste here. Sheets copies as
// tab-separated values, so we split on tabs (falling back to comma/semicolon
// for plain CSV paste).

function splitCells(line) {
  if (line.includes('\t')) return line.split('\t')
  if (line.includes(';')) return line.split(';')
  return line.split(',')
}

function parseRows(text) {
  return text
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => splitCells(line).map((c) => c.trim()))
}

const TRUE_WORDS = ['да', 'yes', 'true', '1', 'кошер', 'kosher', '+']

function isTrueFlag(value) {
  return TRUE_WORDS.includes((value || '').toLowerCase())
}

function extractDayNumber(cell) {
  const match = (cell || '').match(/\d{1,2}/)
  if (!match) return null
  const n = Number(match[0])
  return n >= 1 && n <= 31 ? n : null
}

const HEADER_WORDS = ['день', 'дата', 'суп', 'горячее', 'date', 'day']

// Expects columns: День/Дата, Суп, Горячее, Гарнир, Салат, [Кошер]
export function parseMenuImport(text) {
  const rows = parseRows(text)
  const result = []
  const skipped = []

  rows.forEach((cells, idx) => {
    const firstCell = (cells[0] || '').toLowerCase()
    if (idx === 0 && HEADER_WORDS.some((w) => firstCell.includes(w))) return // skip header row

    const day = extractDayNumber(cells[0])
    if (!day) {
      skipped.push(cells.join(' | '))
      return
    }
    const [, soup = '', main = '', side = '', salad = '', kosherCell = ''] = cells
    const kosher = isTrueFlag(kosherCell)
    result.push({
      day,
      soup: soup.trim(),
      main: main.trim(),
      side: side.trim(),
      salad: salad.trim(),
      kosher,
    })
  })

  return { rows: result, skipped }
}

const ZONE_ALIASES = [
  { zone: 'fridges', words: ['холодильник', 'fridge'] },
  { zone: 'freezers', words: ['морозил', 'freez'] },
  { zone: 'dry', words: ['сухо', 'склад', 'dry'] },
]

function matchZone(cell) {
  const lower = (cell || '').toLowerCase()
  const found = ZONE_ALIASES.find((z) => z.words.some((w) => lower.includes(w)))
  return found ? found.zone : 'dry'
}

// Expects columns: Название, [Ед. изм.], [Зона: холодильник/морозильник/сухой склад]
export function parseRecountCatalogImport(text) {
  const rows = parseRows(text)
  const result = []
  const skipped = []

  rows.forEach((cells, idx) => {
    const firstCell = (cells[0] || '').toLowerCase()
    if (idx === 0 && (firstCell.includes('назван') || firstCell.includes('продукт') || firstCell.includes('name'))) return

    const name = (cells[0] || '').trim()
    if (!name) {
      skipped.push(cells.join(' | '))
      return
    }
    const unit = (cells[1] || 'шт').trim()
    const zone = matchZone(cells[2])
    result.push({ name, unit, zone })
  })

  return { items: result, skipped }
}
