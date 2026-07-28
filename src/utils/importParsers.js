// Google Sheets has no CORS-friendly public export endpoint we can safely
// fetch() from a static, backend-less PWA, so import works by paste:
// select the range in Sheets, Ctrl+C, paste here. Sheets copies as
// tab-separated values, so we split on tabs (falling back to comma/semicolon
// for plain CSV paste).

function splitCells(line) {
  if (line.includes('\t')) return line.split('\t')
  if (line.includes(';')) return line.split(';')
  // Pasting a table as plain text (not straight from a spreadsheet cell
  // selection) often collapses tabs into a run of spaces instead — treat
  // 2+ spaces as a column break before falling back to a bare comma split.
  if (/\s{2,}/.test(line)) return line.split(/\s{2,}/)
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

// Rational Chef OS's own recipe fields (oven mode/temp/humidity, kashrut)
// have no equivalent in Kitchen OS's recipe shape, so its export already
// folds those into a single "description" string meant for the comment
// field — this just needs to parse the JSON and pull out name/ingredients/comment.
export function parseRationalChefExport(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return { recipes: [], error: 'Не удалось разобрать данные — проверьте, что скопирован весь текст целиком.' }
  }
  if (!Array.isArray(data)) {
    return { recipes: [], error: 'Ожидался список рецептов.' }
  }
  const recipes = data
    .filter((r) => r && typeof r.name === 'string' && r.name.trim())
    .map((r) => ({
      name: r.name.trim(),
      comment: typeof r.description === 'string' ? r.description : '',
      ingredients: Array.isArray(r.ingredients)
        ? r.ingredients
            .filter((i) => i && i.name)
            .map((i) => ({ ingredientName: String(i.name).trim(), qty: i.qty, unit: (i.unit || '').toString().trim() }))
        : [],
    }))
  return { recipes, error: null }
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

// A pasted "Кол-во" cell is often "4 шт." or "0,5 кг" or "20+ шт." rather than
// a bare number — split off the leading numeric run as qty and keep the rest
// as unit, so a product that doesn't exist yet in the catalog can still be
// auto-created with a sensible unit. Falls back to treating the whole cell
// as qty (e.g. "База") when there's no leading number.
function splitQtyUnit(raw) {
  const s = (raw || '').trim()
  const m = s.match(/^(\d+(?:[.,]\d+)?\+?)\s*(.*)$/)
  if (m) return { qty: m[1].replace(',', '.'), unit: m[2].trim() }
  return { qty: s, unit: '' }
}

// Expects columns: Продукт, Кол-во — one row per item on the shopping list.
// Кол-во may include a unit ("4 шт.", "600 г") — see splitQtyUnit above.
export function parsePlannedPurchaseImport(text) {
  const rows = parseRows(text)
  const result = []
  const skipped = []

  rows.forEach((cells, idx) => {
    const firstCell = (cells[0] || '').toLowerCase()
    if (idx === 0 && (firstCell.includes('продукт') || firstCell.includes('назван') || firstCell.includes('name'))) return

    const name = (cells[0] || '').trim()
    const rawQty = (cells[1] || '').trim()
    if (!name || !rawQty) {
      skipped.push(cells.join(' | '))
      return
    }
    const { qty, unit } = splitQtyUnit(rawQty)
    result.push({ name, qty: qty || rawQty, unit })
  })

  return { items: result, skipped }
}
