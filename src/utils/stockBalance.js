import { parseLocalDate } from './dateUtils'

// Running stock balance for one product = the most recent physical recount
// (переучёт) that recorded a quantity for it, plus every purchase (приход)
// after that count's date, minus every recipe-based consumption (расход)
// after that date. Recounts are the ground truth "we actually looked and
// counted N" checkpoint; purchases/production are the ledger of what moved
// since then.
export function computeBalance(productId, { recounts, purchases, productions, recipes }, asOf = new Date()) {
  let baselineQty = null
  let baselineDate = null

  Object.entries(recounts || {}).forEach(([monthKey, r]) => {
    const qty = r?.qty?.[productId]
    if (qty === undefined || qty === '') return
    const dateStr = r.countedAt || `${monthKey}-01`
    const d = parseLocalDate(dateStr)
    if (d <= asOf && (!baselineDate || d > baselineDate)) {
      baselineDate = d
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

  // Dates carry no time-of-day, so a purchase/production logged for the same
  // calendar day as the recount is indistinguishable from "at the same
  // moment" — treat it as on-or-after (>=), not strictly after, or it gets
  // silently dropped from the balance (reported: recount 25kg + same-day
  // purchase +100kg still showed 25kg).
  ;(purchases || []).forEach((p) => {
    if (String(p.productId) !== targetId) return
    const d = parseLocalDate(p.date)
    if (d >= baselineDate && d <= asOf) total += Number(p.qty) || 0
  })

  ;(productions || []).forEach((prod) => {
    const recipe = (recipes || []).find((r) => String(r.id) === String(prod.recipeId))
    if (!recipe) return
    const ingredient = recipe.ingredients.find((i) => String(i.productId) === targetId)
    if (!ingredient) return
    const d = parseLocalDate(prod.date)
    if (d >= baselineDate && d <= asOf) {
      total -= (Number(ingredient.qty) || 0) * (Number(prod.qty) || 1)
    }
  })

  return { balance: total, baselineDate, baselineQty }
}
