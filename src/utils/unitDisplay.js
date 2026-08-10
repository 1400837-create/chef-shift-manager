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

// Products that used to be count-based (шт/уп/банка/пучок/...) before the
// г/мл unification keep their original unit + average weight stamped as
// refUnit/refUnitWeight (see runCountBasedUnitConversion) — this converts
// the now-real gram/ml quantity back into that natural buying unit for
// display, e.g. "1890 г" → "≈ 30 шт" for eggs. Purely informational: no
// refUnit means the product was always weight/volume-native, so there's
// nothing useful to convert back to and this returns null (the plain кг/л
// folding above already covers that case).
export function formatReferenceQty(qty, product) {
  const n = Number(qty)
  const perUnit = Number(product?.refUnitWeight)
  if (!Number.isFinite(n) || !product?.refUnit || !(perUnit > 0)) return null
  const count = Math.round((n / perUnit) * 10) / 10
  return `≈ ${count} ${product.refUnit}`
}
