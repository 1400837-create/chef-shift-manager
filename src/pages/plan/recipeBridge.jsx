import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { inputClass } from '../../components/UI'
import { useEscape } from '../../plan/ui'

// The owner's device has the real recipes (ingredients, method); the staff
// device only gets names. This lets any dish in the plan open its tech card
// scaled to the number of guests — on the owner's device only.

const BridgeContext = createContext(null)

export const useOpenRecipe = () => useContext(BridgeContext)

const clean = (id) => String(id).replace(/[.#$/[\]]/g, '_')

function scaleText(qty, coef) {
  const n = Math.round((Number(qty) || 0) * coef * 100) / 100
  return String(n)
}

function RecipeModal({ recipe, catalog, persons, onClose }) {
  useEscape(onClose)
  const guests = Number(persons)
  const [coefText, setCoefText] = useState(Number.isFinite(guests) && guests > 0 ? String(Math.round((guests / 10) * 100) / 100) : '1')
  const coef = Number(String(coefText).replace(',', '.')) || 1

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-800 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 leading-snug">{recipe.name}</h3>
          <button onClick={onClose} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-slate-500">Коэффициент (рецепт на 10 порций):</span>
          <input
            className={`${inputClass} !w-20 !min-h-[40px] text-center`}
            inputMode="decimal"
            value={coefText}
            onChange={(e) => setCoefText(e.target.value.replace(/[^\d.,]/g, ''))}
          />
          {Number.isFinite(guests) && guests > 0 && <span className="text-xs text-slate-500">= {guests} чел.</span>}
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Ингредиенты{coef !== 1 ? ` (×${coef})` : ''}</p>
        <div className="mb-3 rounded-lg border border-slate-100 dark:border-slate-700 overflow-hidden">
          {(recipe.ingredients || []).map((ing, idx) => {
            const product = catalog.find((p) => String(p.id) === String(ing.productId))
            return (
              <div key={idx} className={`flex items-baseline justify-between gap-3 px-2.5 py-1.5 ${idx % 2 === 1 ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`}>
                <span className="text-sm text-slate-700 dark:text-slate-200">{product?.name || '?'}</span>
                <span className="shrink-0 text-sm font-semibold text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                  {scaleText(ing.qty, coef)}{product?.unit ? ` ${product.unit}` : ''}
                </span>
              </div>
            )
          })}
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Технология приготовления</p>
        <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
          {recipe.comment || <span className="text-slate-400">Не описано</span>}
        </p>
      </div>
    </div>
  )
}

export function RecipeBridgeProvider({ recipes, catalog, children }) {
  const [open, setOpen] = useState(null) // { recipeId, persons }
  const byId = useMemo(() => {
    const map = {}
    ;(recipes || []).forEach((r) => { map[clean(r.id)] = r })
    return map
  }, [recipes])

  const openRecipe = useCallback((recipeId, persons) => {
    if (byId[clean(recipeId)]) setOpen({ recipeId, persons })
  }, [byId])

  const hasRecipes = !!recipes && recipes.length > 0
  const value = useMemo(() => (hasRecipes ? { open: openRecipe, has: (id) => !!byId[clean(id)] } : null), [hasRecipes, openRecipe, byId])
  const recipe = open ? byId[clean(open.recipeId)] : null

  return (
    <BridgeContext.Provider value={value}>
      {children}
      {recipe && <RecipeModal recipe={recipe} catalog={catalog || []} persons={open.persons} onClose={() => setOpen(null)} />}
    </BridgeContext.Provider>
  )
}
