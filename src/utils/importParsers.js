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

// Expects columns: День/Дата, Блюдо 1, Блюдо 2, ... (as many as pasted), [Кошер].
// Dish columns are positional and variable in count — whatever the sheet has.
// If the last column is just a да/yes/kosher-style flag (not a dish name),
// it's read as "kosher" for every dish that day, matching the old fixed
// 4-column format's behaviour.
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

    let dishes = cells.slice(1).map((c) => c.trim())
    let kosher = false
    if (dishes.length > 0 && isTrueFlag(dishes[dishes.length - 1])) {
      kosher = true
      dishes = dishes.slice(0, -1)
    }

    result.push({ day, dishes, kosher })
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

const CATEGORY_ALIASES = [
  { category: 'meat', words: ['мясо', 'говядин', 'свинин', 'баранин', 'телятин', 'meat'] },
  { category: 'poultry', words: ['птиц', 'куриц', 'куриц', 'индейк', 'курин', 'poultry', 'chicken'] },
  { category: 'vegetables', words: ['овощ', 'veget'] },
  { category: 'fruits', words: ['фрукт', 'fruit'] },
  { category: 'spices', words: ['специ', 'spice'] },
  { category: 'dry', words: ['бакале', 'круп', 'dry'] },
]

function matchCategory(cell) {
  const lower = (cell || '').toLowerCase()
  const found = CATEGORY_ALIASES.find((c) => c.words.some((w) => lower.includes(w)))
  return found ? found.category : 'other'
}

// Expects columns: Блюдо, Ингредиент, Кол-во — one row per ingredient, like a
// typical recipe-costing spreadsheet. Rows sharing the same "Блюдо" (case
// insensitive) are grouped into a single recipe, in the order they appear —
// they don't need to be adjacent in the sheet.
export function parseRecipesImport(text) {
  const rows = parseRows(text)
  const order = []
  const byName = new Map()
  const skipped = []

  rows.forEach((cells, idx) => {
    const firstCell = (cells[0] || '').toLowerCase()
    if (idx === 0 && (firstCell.includes('блюдо') || firstCell.includes('рецепт') || firstCell.includes('dish') || firstCell.includes('recipe'))) return

    const dishName = (cells[0] || '').trim()
    const ingredientName = (cells[1] || '').trim()
    const qty = (cells[2] || '').trim()
    if (!dishName || !ingredientName || !qty) {
      skipped.push(cells.join(' | '))
      return
    }

    const key = dishName.toLowerCase()
    if (!byName.has(key)) {
      byName.set(key, { name: dishName, ingredients: [] })
      order.push(key)
    }
    byName.get(key).ingredients.push({ ingredientName, qty })
  })

  return { recipes: order.map((key) => byName.get(key)), skipped }
}

// Expects columns: Название, [Ед. изм.], [Зона: холодильник/морозильник/сухой склад], [Рубрика: мясо/птица/овощи/фрукты/бакалея/специи]
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
    const category = matchCategory(cells[3])
    result.push({ name, unit, zone, category })
  })

  return { items: result, skipped }
}
