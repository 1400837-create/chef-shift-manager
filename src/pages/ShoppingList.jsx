import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, ShoppingBasket, AlertTriangle, Upload, X, Calendar, MessageSquare } from 'lucide-react'
import { Section, inputClass, BigButton, PrintButton, ConfirmDeleteButton, ConfirmMarkButton } from '../components/UI'
import { formatRu, todayKey, parseLocalDate, addDays, monthKey, toKey } from '../utils/dateUtils'
import { printReport } from '../utils/printReport'
import { computeBalance } from '../utils/stockBalance'
import { sanitizeDecimal } from '../utils/number'
import { parsePlannedPurchaseImport } from '../utils/importParsers'
import { uid } from '../utils/id'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { coursesForDay, extractQtyNumber } from '../utils/menuCourses'
import { computeDropdownRect } from '../utils/dropdownPosition'
import { formatQtyForDisplay } from '../utils/unitDisplay'

export default function ShoppingList({
  recountCatalog, setRecountCatalog, recounts, purchases, productions, catalogWaste, recipes,
  menuData, plannedPurchases, setPlannedPurchases, setPurchases,
}) {
  const [form, setForm] = useState({ productName: '', qty: '' })
  const [lowStockExpanded, setLowStockExpanded] = useState(false)
  // Which planned-purchase rows have been armed (tapped once, orange,
  // waiting for the confirming second tap) — persisted so it survives
  // leaving the tab or closing the app, not just component re-renders.
  const [armedPurchaseIds, setArmedPurchaseIds] = useLocalStorage('armedPurchaseIds', [])
  const [error, setError] = useState(null)
  const [showProductSuggestions, setShowProductSuggestions] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [menuImportFrom, setMenuImportFrom] = useState(todayKey())
  const [menuImportTo, setMenuImportTo] = useState(todayKey())
  const [menuImportExcluded, setMenuImportExcluded] = useState(() => new Set())
  const [menuImportResult, setMenuImportResult] = useState(null)
  const [openPlannedComment, setOpenPlannedComment] = useState(null)
  const now = new Date()

  const productSuggestions = useMemo(() => {
    const q = form.productName.trim().toLowerCase()
    if (q.length < 2) return []
    return recountCatalog.filter((p) => !p.archived && (p.name || '').toLowerCase().includes(q)).slice(0, 8)
  }, [form.productName, recountCatalog])

  // The "Продукт" field lives inside a Section card, which clips overflow
  // for its rounded corners — an absolutely-positioned dropdown nested
  // inside it gets cut off at the card edge instead of floating over the
  // page. Portal it to document.body instead, positioned from the input's
  // own screen rect, so it always renders on top uncropped.
  const productInputRef = useRef(null)
  const [dropdownRect, setDropdownRect] = useState(null)

  function updateDropdownRect() {
    const el = productInputRef.current
    if (!el) return
    setDropdownRect(computeDropdownRect(el))
  }

  // A rect computed once at open time goes stale on scroll or when the
  // on-screen keyboard opens/closes (mobile browsers resize the visual
  // viewport) — keep it locked to the field for as long as it's open.
  useEffect(() => {
    if (!showProductSuggestions) return
    updateDropdownRect()
    const onScrollOrResize = () => updateDropdownRect()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    window.visualViewport?.addEventListener('resize', onScrollOrResize)
    window.visualViewport?.addEventListener('scroll', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      window.visualViewport?.removeEventListener('resize', onScrollOrResize)
      window.visualViewport?.removeEventListener('scroll', onScrollOrResize)
    }
  }, [showProductSuggestions])

  function findProductByName(name) {
    const key = (name || '').trim().toLowerCase()
    if (!key) return null
    return recountCatalog.find((p) => (p.name || '').trim().toLowerCase() === key) || null
  }

  function findPlannedByProduct(productId) {
    return plannedPurchases.find((p) => String(p.productId) === String(productId))
  }

  function findRecipeByName(name) {
    const key = (name || '').trim().toLowerCase()
    if (!key) return null
    return recipes.find((r) => (r.name || '').trim().toLowerCase() === key) || null
  }

  function setMenuImportRange(from, to) {
    setMenuImportFrom(from)
    setMenuImportTo(to)
    setMenuImportExcluded(new Set())
  }

  // Every dish scheduled in the menu across the chosen range, so the user can
  // uncheck specific ones instead of always importing the whole period —
  // same "list days/dishes, let them exclude some" pattern as MenuPlanner's
  // print-range picker.
  const menuImportDishes = useMemo(() => {
    if (!menuImportFrom || !menuImportTo) return []
    const from = parseLocalDate(menuImportFrom)
    const to = parseLocalDate(menuImportTo)
    if (to < from) return []
    const list = []
    let cursor = from
    let guard = 0
    while (cursor <= to && guard < 90) {
      const mk = monthKey(cursor)
      const dayData = menuData[mk]?.[cursor.getDate()]
      if (dayData) {
        coursesForDay(dayData).forEach((c) => {
          if (!c.dish) return
          list.push({
            key: `${toKey(cursor)}-${c.id}`,
            date: new Date(cursor),
            dish: c.dish,
            qty: c.qty,
            recipe: findRecipeByName(c.dish),
          })
        })
      }
      cursor = addDays(cursor, 1)
      guard += 1
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuImportFrom, menuImportTo, menuData, recipes])

  function toggleMenuImportDish(key) {
    setMenuImportExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Sums every ingredient across every selected dish's recipe into one
  // planned-purchase entry per product — doesn't touch stock (no
  // purchase/production record created), just tells you what the menu is
  // going to need. Only fills in products not already on the list; if one's
  // already there you adjust its qty yourself, same as everywhere else in
  // this app that avoids silently overwriting a number you might have
  // already started editing.
  function importFromMenu() {
    const selected = menuImportDishes.filter((d) => !menuImportExcluded.has(d.key))
    const neededByProduct = new Map()
    const missingDishes = new Set()
    selected.forEach((d) => {
      if (!d.recipe) {
        missingDishes.add(d.dish)
        return
      }
      const multiplier = Number(extractQtyNumber(d.qty)) || 1
      d.recipe.ingredients.forEach((ing) => {
        const need = (Number(ing.qty) || 0) * multiplier
        neededByProduct.set(ing.productId, (neededByProduct.get(ing.productId) || 0) + need)
      })
    })

    let added = 0
    let alreadyPlanned = 0
    const toAdd = []
    neededByProduct.forEach((qty, productId) => {
      if (findPlannedByProduct(productId)) {
        alreadyPlanned += 1
        return
      }
      toAdd.push({ id: uid(), productId, qty: String(Math.round(qty * 100) / 100) })
      added += 1
    })
    if (toAdd.length) setPlannedPurchases((prev) => [...prev, ...toAdd])

    const parts = [`Добавлено в закупку: ${added}`]
    if (alreadyPlanned) parts.push(`уже в списке (не тронуто): ${alreadyPlanned}`)
    if (missingDishes.size) parts.push(`нет рецепта для: ${Array.from(missingDishes).join(', ')}`)
    setMenuImportResult(parts.join(', '))
  }

  function setPlannedComment(id, value) {
    setPlannedPurchases((prev) => prev.map((p) => (p.id === id ? { ...p, comment: value } : p)))
  }

  function addManual() {
    const product = findProductByName(form.productName)
    if (!product) {
      setError('Товар не найден в каталоге — выберите вариант из подсказок.')
      return
    }
    if (!form.qty) {
      setError('Укажите количество.')
      return
    }
    if (findPlannedByProduct(product.id)) {
      setError('Этот товар уже в списке закупки — отредактируйте количество ниже.')
      return
    }
    setError(null)
    setPlannedPurchases((prev) => [...prev, { id: Date.now(), productId: product.id, qty: form.qty }])
    setForm({ productName: '', qty: '' })
  }

  function updateQty(id, qty) {
    setPlannedPurchases((prev) => prev.map((p) => (p.id === id ? { ...p, qty } : p)))
  }

  function remove(id) {
    setPlannedPurchases((prev) => prev.filter((p) => p.id !== id))
    setArmedPurchaseIds((prev) => prev.filter((armedId) => armedId !== id))
  }

  function markPurchased(planned) {
    if (!planned.qty) return
    setPurchases((prev) => [
      { id: Date.now(), productId: planned.productId, qty: planned.qty, date: todayKey(), enteredAt: Date.now() },
      ...prev,
    ])
    remove(planned.id)
  }

  function importPlanned() {
    const { items: parsed, skipped } = parsePlannedPurchaseImport(importText)
    let added = 0
    let alreadyPlanned = 0
    let createdProducts = 0
    const toAddPlanned = []
    const toAddCatalog = []

    function findOrCreateProduct(row) {
      const existing =
        findProductByName(row.name) ||
        toAddCatalog.find((p) => p.name.trim().toLowerCase() === row.name.trim().toLowerCase())
      if (existing) return existing
      const created = { id: uid(), name: row.name, unit: row.unit || 'шт', zone: 'dry', category: 'other' }
      toAddCatalog.push(created)
      createdProducts += 1
      return created
    }

    parsed.forEach((row) => {
      const product = findOrCreateProduct(row)
      if (findPlannedByProduct(product.id) || toAddPlanned.some((p) => p.productId === product.id)) {
        alreadyPlanned += 1
        return
      }
      toAddPlanned.push({ id: uid(), productId: product.id, qty: row.qty })
      added += 1
    })

    if (toAddCatalog.length) setRecountCatalog((prev) => [...prev, ...toAddCatalog])
    if (toAddPlanned.length) setPlannedPurchases((prev) => [...prev, ...toAddPlanned])

    const parts = [`Добавлено в закупку: ${added}`]
    if (createdProducts) parts.push(`новых товаров создано в каталоге: ${createdProducts}`)
    if (alreadyPlanned) parts.push(`уже в списке: ${alreadyPlanned}`)
    if (skipped.length) parts.push(`не распознано строк: ${skipped.length}`)
    setImportResult(parts.join(', '))
    setImportText('')
  }

  function addFromLowStock(product) {
    if (findPlannedByProduct(product.id)) return
    setPlannedPurchases((prev) => [...prev, { id: Date.now(), productId: product.id, qty: product.minQty || '' }])
  }

  function printList() {
    printReport({
      type: 'shopping-list',
      title: `Запланированная закупка — ${formatRu(now)}`,
      items: plannedPurchases.map((p) => {
        const product = recountCatalog.find((pr) => String(pr.id) === String(p.productId))
        const unit = product?.unit || ''
        const big = ['г', 'мл'].includes(unit) && Math.abs(Number(p.qty)) >= 1000
        return {
          name: product?.name || '?',
          unit: big ? (unit === 'г' ? 'кг' : 'л') : unit,
          qty: big ? formatQtyForDisplay(p.qty, unit).split(' ')[0] : p.qty,
        }
      }),
    })
  }

  const lowStockNotPlanned = useMemo(() => {
    return recountCatalog
      .filter((product) => !product.archived)
      .map((product) => ({ product, ...computeBalance(product.id, { recounts, purchases, productions, recipes, waste: catalogWaste }, now) }))
      .filter((row) => {
        const min = Number(row.product.minQty)
        return min > 0 && row.balance !== null && row.balance <= min && !findPlannedByProduct(row.product.id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recountCatalog, recounts, purchases, productions, recipes, plannedPurchases, catalogWaste])

  return (
    <div className="pb-4">
      {lowStockNotPlanned.length > 0 && (
        <Section
          title={`Мало на складе — добавить в закупку? (${lowStockNotPlanned.length})`}
          icon={AlertTriangle}
          right={
            <button onClick={() => setLowStockExpanded((v) => !v)} className="text-xs font-semibold text-orange-600">
              {lowStockExpanded ? 'Свернуть' : 'Показать'}
            </button>
          }
        >
          {lowStockExpanded && (
            <div className="flex flex-col gap-2">
              {lowStockNotPlanned.map((row) => (
                <div
                  key={row.product.id}
                  className="flex items-center justify-between gap-2 rounded-xl border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{row.product.name}</p>
                    <p className="text-xs text-red-600 dark:text-red-400">Остаток: {formatQtyForDisplay(row.balance, row.product.unit)}</p>
                  </div>
                  <button
                    onClick={() => addFromLowStock(row.product)}
                    className="shrink-0 min-h-[36px] px-3 flex items-center justify-center gap-1.5 rounded-lg bg-red-600 active:bg-red-700 text-white text-xs font-semibold"
                  >
                    <Plus size={14} /> В закупку
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      <Section title="Импорт из меню" icon={Calendar}>
        <p className="text-xs text-slate-500 mb-2">
          За выбранный период (можно один день) соберёт все ингредиенты по рецептам
          запланированных блюд в один список — со склада ничего не спишет, только
          подскажет, что понадобится. Товары, которые уже в закупке, не трогает.
        </p>
        <div className="flex gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <input
              type="date"
              className={inputClass}
              value={menuImportFrom}
              onChange={(e) => setMenuImportRange(e.target.value, menuImportTo)}
            />
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="date"
              className={inputClass}
              value={menuImportTo}
              onChange={(e) => setMenuImportRange(menuImportFrom, e.target.value)}
            />
          </div>
        </div>
        {menuImportDishes.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-3">
            {menuImportDishes.map((d) => {
              const checked = !menuImportExcluded.has(d.key)
              return (
                <label
                  key={d.key}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                    checked ? 'border-slate-200 dark:border-slate-700' : 'border-slate-100 dark:border-slate-800 opacity-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMenuImportDish(d.key)}
                    className="shrink-0 w-5 h-5 accent-orange-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 dark:text-slate-200 truncate">
                      {d.dish}{d.qty ? ` — ${d.qty}` : ''}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatRu(d.date)}{!d.recipe && ' · нет рецепта'}
                    </p>
                  </div>
                </label>
              )
            })}
          </div>
        )}
        <BigButton onClick={importFromMenu} icon={Calendar} disabled={menuImportDishes.length === 0}>
          Импортировать из меню
        </BigButton>
        {menuImportResult && (
          <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mt-2">
            {menuImportResult}
          </p>
        )}
      </Section>

      <Section
        title="Импорт из Google Таблиц"
        icon={Upload}
        right={
          <button onClick={() => setShowImport((v) => !v)} className="text-xs font-semibold text-orange-600">
            {showImport ? 'Скрыть' : 'Показать'}
          </button>
        }
      >
        {showImport && (
          <>
            <p className="text-xs text-slate-500 mb-2">
              Столбцы: <b>Продукт, Кол-во</b> (можно с единицей: «600 г», «4 шт.») — по одной
              позиции на строку. Выделите в Google Таблице → Ctrl+C → вставьте сюда. Товары,
              которых ещё нет в каталоге, будут созданы автоматически.
            </p>
            <textarea
              className={inputClass + ' h-28 py-2'}
              placeholder={'Куриное филе\t2\nМорковь\t3'}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              <BigButton onClick={importPlanned} icon={Upload} disabled={!importText.trim()}>
                Импортировать в закупку
              </BigButton>
              <button
                onClick={() => { setShowImport(false); setImportText(''); setImportResult(null) }}
                className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
          </>
        )}
        {importResult && (
          <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mt-2">
            {importResult}
          </p>
        )}
      </Section>

      <Section
        title={`Запланированная закупка (${plannedPurchases.length})`}
        icon={ShoppingBasket}
        right={<PrintButton onClick={printList} label="Печать" />}
      >
        <p className="text-xs text-slate-500 mb-3">
          Список того, что нужно купить — не по факту, а то, что запланировано. Когда товар
          реально куплен, нажмите ✓ дважды (кнопка станет оранжевой — второе нажатие
          подтверждает) — он попадёт в «Приход» (вкладка Склад → Остатки) и автоматически
          обновит остаток.
        </p>
        <div className="flex gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <input
              ref={productInputRef}
              className={inputClass}
              placeholder="Продукт…"
              value={form.productName}
              onChange={(e) => { setForm((f) => ({ ...f, productName: e.target.value })); setShowProductSuggestions(true) }}
              onFocus={() => setShowProductSuggestions(true)}
              onBlur={() => setTimeout(() => setShowProductSuggestions(false), 150)}
            />
            {showProductSuggestions && productSuggestions.length > 0 && dropdownRect && createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: dropdownRect.top,
                  left: dropdownRect.left,
                  width: dropdownRect.width,
                  maxHeight: dropdownRect.maxHeight,
                }}
                className="z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-y-auto"
              >
                {productSuggestions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setForm((f) => ({ ...f, productName: p.name })); setShowProductSuggestions(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0"
                  >
                    {p.name}
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>
          <div className="w-20 shrink-0">
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              placeholder="Кол-во"
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: sanitizeDecimal(e.target.value) }))}
            />
          </div>
          <button
            onClick={addManual}
            className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-orange-500 active:bg-orange-600 text-white"
          >
            <Plus size={20} />
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 mb-3">
            {error}
          </p>
        )}
        {plannedPurchases.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-3">Список закупки пуст</p>
        )}
        <div className="flex flex-col gap-2">
          {plannedPurchases.map((p) => {
            const product = recountCatalog.find((pr) => String(pr.id) === String(p.productId))
            const { balance } = product
              ? computeBalance(product.id, { recounts, purchases, productions, recipes, waste: catalogWaste }, now)
              : { balance: null }
            const hasComment = !!p.comment
            const commentOpen = openPlannedComment === p.id
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{product?.name || '?'}</p>
                    <p className="text-xs text-slate-400">
                      {product?.unit}
                      {balance !== null && ` · остаток: ${formatQtyForDisplay(balance, product?.unit)}`}
                    </p>
                  </div>
                  <div className="w-20 shrink-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      className={inputClass + ' text-center'}
                      value={p.qty}
                      onChange={(e) => updateQty(p.id, sanitizeDecimal(e.target.value))}
                    />
                    {['г', 'мл'].includes(product?.unit) && Math.abs(Number(p.qty)) >= 1000 && (
                      <p className="text-[10px] text-slate-400 text-center mt-0.5">
                        {formatQtyForDisplay(p.qty, product.unit)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setOpenPlannedComment(commentOpen ? null : p.id)}
                    className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg ${
                      hasComment ? 'text-orange-600' : 'text-slate-400 dark:text-slate-500'
                    }`}
                    title="Комментарий"
                  >
                    <MessageSquare size={16} />
                  </button>
                  <ConfirmMarkButton
                    confirming={armedPurchaseIds.includes(p.id)}
                    onArm={() => setArmedPurchaseIds((prev) => [...prev, p.id])}
                    onConfirm={() => markPurchased(p)}
                  />
                  <ConfirmDeleteButton onConfirm={() => remove(p.id)} />
                </div>
                {commentOpen && (
                  <textarea
                    className={inputClass + ' mt-2 h-16 py-2 text-sm'}
                    placeholder="Комментарий"
                    value={p.comment || ''}
                    onChange={(e) => setPlannedComment(p.id, e.target.value)}
                    autoFocus
                  />
                )}
                {!commentOpen && hasComment && (
                  <p className="text-xs text-orange-600 mt-1.5">💬 {p.comment}</p>
                )}
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
