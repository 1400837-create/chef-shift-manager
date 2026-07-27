import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { INVENTORY_AUDIT_ZONES, PRODUCT_CATEGORIES } from '../utils/constants'
import { computeBalance } from '../utils/stockBalance'
import { computeRecipeCost } from '../utils/recipeCost'

function zoneLabel(key) {
  return INVENTORY_AUDIT_ZONES.find((z) => z.key === key)?.label || 'Без зоны'
}

function categoryLabel(key) {
  return PRODUCT_CATEGORIES.find((c) => c.key === key)?.label || 'Другое'
}

export default function GlobalSearch({ open, onClose, recountCatalog, recipes, recounts, purchases, productions }) {
  const [query, setQuery] = useState('')
  const now = new Date()

  const products = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return recountCatalog
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 15)
      .map((p) => ({ product: p, ...computeBalance(p.id, { recounts, purchases, productions, recipes }, now) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, recountCatalog, recounts, purchases, productions, recipes])

  const matchedRecipes = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return recipes.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 15)
  }, [query, recipes])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-800 flex flex-col">
      <div className="safe-top flex items-center gap-2 px-3 py-3 border-b border-slate-100 dark:border-slate-700 shrink-0">
        <Search size={18} className="text-slate-400 shrink-0" />
        <input
          autoFocus
          className="flex-1 min-w-0 text-[15px] text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none"
          placeholder="Поиск по продуктам и рецептам…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={onClose} className="shrink-0 w-9 h-9 flex items-center justify-center text-slate-400">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {query.trim() === '' && (
          <p className="text-sm text-slate-400 text-center py-8">Начните вводить название продукта или рецепта</p>
        )}
        {query.trim() !== '' && products.length === 0 && matchedRecipes.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">Ничего не найдено</p>
        )}

        {products.length > 0 && (
          <div className="mt-3 mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Продукты</p>
            <div className="flex flex-col gap-2">
              {products.map((row) => (
                <div key={row.product.id} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{row.product.name}</p>
                    {row.balance !== null ? (
                      <span className="shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">{row.balance} {row.product.unit}</span>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-400">—</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {zoneLabel(row.product.zone)} · {categoryLabel(row.product.category)}
                    {row.product.costPerUnit ? ` · ${row.product.costPerUnit}/${row.product.unit}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {matchedRecipes.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Рецепты</p>
            <div className="flex flex-col gap-2">
              {matchedRecipes.map((r) => {
                const cost = computeRecipeCost(r, recountCatalog)
                return (
                  <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{r.name}</p>
                      {cost !== null && <span className="shrink-0 text-xs font-semibold text-green-700 dark:text-green-300">≈ {cost.toFixed(2)}</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {r.ingredients.map((ing) => {
                        const product = recountCatalog.find((p) => String(p.id) === String(ing.productId))
                        return `${product?.name || '?'} × ${ing.qty}${product?.unit ? ' ' + product.unit : ''}`
                      }).join(', ')}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
