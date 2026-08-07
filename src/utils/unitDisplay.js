// After the г/мл unification, every product is tracked internally in
// grams/millilitres — exact for balance math, but reading "5000 г" is worse
// than "5 кг" for a human deciding what to buy. This is display-only: it
// never changes what's stored or entered, so Приход/Остатки/расчёты keep
// working in г/мл untouched everywhere except where this is explicitly used.
export function formatQtyForDisplay(qty, unit) {
  const n = Number(qty)
  const u = (unit || '').trim()
  if (!Number.isFinite(n) || (u !== 'г' && u !== 'мл')) {
    return `${qty ?? ''} ${u}`.trim()
  }
  if (Math.abs(n) < 1000) return `${qty} ${u}`
  const big = Math.round((n / 1000) * 100) / 100
  const bigUnit = u === 'г' ? 'кг' : 'л'
  return `${big} ${bigUnit}`
}
