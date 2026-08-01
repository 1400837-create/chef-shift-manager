import { parseLocalDate } from './dateUtils'

const DAY_MS = 24 * 60 * 60 * 1000

// Dates alone (no time-of-day) can't order same-day events — a purchase and
// a recount both dated today are indistinguishable by date. `enteredAt` (a
// real Date.now() timestamp captured when the record was created/edited)
// resolves that, but only within the day its own `dateStr` claims: if the
// record was backdated (typed today for an event last week), enteredAt
// would be "now", far outside that day's window — falling back to the
// day's start keeps backdating working exactly as before. Missing/legacy
// enteredAt (data from before this existed) also falls back to day-start,
// so old data behaves exactly as it did previously.
function effectiveInstant(dateStr, enteredAt) {
  const dayStart = parseLocalDate(dateStr).getTime()
  if (typeof enteredAt === 'number' && enteredAt >= dayStart && enteredAt < dayStart + DAY_MS) {
    return enteredAt
  }
  return dayStart
}

// Running stock balance for one product = the most recent physical recount
// (переучёт) that recorded a quantity for it, plus every purchase (приход)
// after that count's moment, minus every recipe-based consumption (расход)
// after that moment. Recounts are the ground truth "we actually looked and
// counted N" checkpoint; purchases/production are the ledger of what moved
// since then. "Moment" is per-item (recounts.qtyTimestamps) and per-record
// (purchase/production.enteredAt), not just the shared recount date, so a
// recount session spanning many hours (or days) still orders correctly
// against purchases/consumption logged partway through it.
export function computeBalance(productId, { recounts, purchases, productions, recipes, waste }, asOf = new Date()) {
  const asOfMs = asOf.getTime()
  let baselineQty = null
  let baselineInstant = null

  Object.entries(recounts || {}).forEach(([monthKey, r]) => {
    const qty = r?.qty?.[productId]
    if (qty === undefined || qty === '') return
    const dateStr = r.countedAt || `${monthKey}-01`
    const instant = effectiveInstant(dateStr, r.qtyTimestamps?.[productId])
    if (instant <= asOfMs && (baselineInstant === null || instant > baselineInstant)) {
      baselineInstant = instant
      baselineQty = Number(qty) || 0
    }
  })

  if (baselineQty === null) {
    return { balance: null, baselineDate: null, baselineQty: null }
  }

  let total = baselineQty
  // Select inputs always yield string values, while catalog/recipe ids may
  // be numbers (Date.now()) — compare as strings so "12345" and 12345 match.
  const targetId = String(productId)

  ;(purchases || []).forEach((p) => {
    if (String(p.productId) !== targetId) return
    const instant = effectiveInstant(p.date, p.enteredAt)
    if (instant >= baselineInstant && instant <= asOfMs) total += Number(p.qty) || 0
  })

  ;(productions || []).forEach((prod) => {
    const instant = effectiveInstant(prod.date, prod.enteredAt)
    if (instant < baselineInstant || instant > asOfMs) return
    if (prod.recipeId) {
      // Recipe-based расход: one "production" is N runs of a recipe, so
      // subtract each ingredient's qty × how many times it was made.
      const recipe = (recipes || []).find((r) => String(r.id) === String(prod.recipeId))
      if (!recipe) return
      const ingredient = recipe.ingredients.find((i) => String(i.productId) === targetId)
      if (!ingredient) return
      total -= (Number(ingredient.qty) || 0) * (Number(prod.qty) || 1)
    } else if (prod.productId != null) {
      // Direct расход — a product used up outside of any recipe.
      if (String(prod.productId) !== targetId) return
      total -= Number(prod.qty) || 0
    }
  })

  // Documented write-offs (списание с причиной) count as an outflow just
  // like recipe consumption — logging one is what turns an otherwise
  // "unexplained" недостача in the shrinkage report back to zero.
  ;(waste || []).forEach((w) => {
    if (String(w.productId) !== targetId) return
    const instant = effectiveInstant(w.date, w.enteredAt)
    if (instant >= baselineInstant && instant <= asOfMs) total -= Number(w.qty) || 0
  })

  return { balance: total, baselineDate: new Date(baselineInstant), baselineQty }
}
