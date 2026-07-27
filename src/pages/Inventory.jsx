import { useMemo, useState } from 'react'
import {
  Plus, PackageSearch, ClipboardCheck, Snowflake, Archive, Trash,
  ClipboardList, Upload, X, ChevronLeft, ChevronRight, Scale,
  BookOpen, ShoppingCart, Flame, Tags, Download, Pencil,
  ArrowUpDown, ClipboardPlus,
} from 'lucide-react'
import { Section, Field, inputClass, Badge, CheckRow, BigButton, PrintButton, ConfirmDeleteButton } from '../components/UI'
import { LEFTOVER_ACTIONS, INVENTORY_AUDIT_ZONES, DEFAULT_NOMENCLATURE, PRODUCT_CATEGORIES } from '../utils/constants'
import { addDays, addMonths, daysBetween, formatRu, monthKey, MONTHS_RU, parseLocalDate, startOfDay, todayKey } from '../utils/dateUtils'
import { parseRecountCatalogImport, parseRecipesImport } from '../utils/importParsers'
import { printReport } from '../utils/printReport'
import { computeBalance } from '../utils/stockBalance'

function computeExpiry(item) {
  return addDays(parseLocalDate(item.packDate), Number(item.shelfLifeDays || 0))
}

function statusFor(daysLeft) {
  if (daysLeft <= 1) return { tone: 'red', label: daysLeft <= 0 ? 'Истекает сегодня' : 'Истекает завтра' }
  if (daysLeft <= 3) return { tone: 'yellow', label: `Осталось ${daysLeft} дн.` }
  return { tone: 'green', label: `Осталось ${daysLeft} дн.` }
}

const toneClasses = {
  red: 'border-red-300 bg-red-50',
  yellow: 'border-yellow-300 bg-yellow-50',
  green: 'border-slate-200 bg-white',
}

function previousMonthKey(currentMonth) {
  const [y, m] = currentMonth.split('-').map(Number)
  const prev = new Date(y, m - 2, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

export default function Inventory({
  items, setItems, audits, setAudits,
  recountCatalog, setRecountCatalog, recounts, setRecounts,
  recipes, setRecipes, purchases, setPurchases, productions, setProductions,
  plannedPurchases, setPlannedPurchases,
}) {
  const [form, setForm] = useState({ name: '', packDate: new Date().toISOString().slice(0, 10), shelfLifeDays: '' })
  const [tab, setTab] = useState('fifo')
  const [monthOffset, setMonthOffset] = useState(0)
  const now = new Date()
  const viewedMonth = addMonths(now, monthOffset)
  const isThisMonth = monthOffset === 0
  const currentMonth = monthKey(viewedMonth)
  const prevMonth = previousMonthKey(currentMonth)
  const audit = audits[currentMonth] || { fridges: {}, freezers: {}, dry: {}, verifiedWithLead: false }

  const [showCatalogImport, setShowCatalogImport] = useState(false)
  const [catalogImportText, setCatalogImportText] = useState('')
  const [catalogImportResult, setCatalogImportResult] = useState(null)
  const [newCatalogItem, setNewCatalogItem] = useState({ name: '', unit: 'шт', zone: 'fridges', category: 'other' })
  const [catalogSort, setCatalogSort] = useState('alpha')
  const [balanceSort, setBalanceSort] = useState('alpha')

  const [recipeForm, setRecipeForm] = useState({ name: '', ingredients: [{ productName: '', qty: '' }] })
  const [recipeError, setRecipeError] = useState(null)
  const [editingRecipeId, setEditingRecipeId] = useState(null)
  const [showRecipeImport, setShowRecipeImport] = useState(false)
  const [recipeImportText, setRecipeImportText] = useState('')
  const [recipeImportOverwrite, setRecipeImportOverwrite] = useState(false)
  const [recipeImportResult, setRecipeImportResult] = useState(null)
  const [purchaseForm, setPurchaseForm] = useState({ productName: '', qty: '', date: todayKey() })
  const [purchaseError, setPurchaseError] = useState(null)
  const [productionForm, setProductionForm] = useState({ recipeId: '', qty: '1', date: todayKey() })

  const recount = recounts[currentMonth] || { qty: {}, verifiedWithLead: false, countedAt: '' }
  const prevRecount = recounts[prevMonth]

  const sorted = useMemo(() => {
    return [...items]
      .filter((i) => i.status !== 'disposal')
      .map((i) => ({ ...i, expiry: computeExpiry(i) }))
      .sort((a, b) => a.expiry - b.expiry)
  }, [items])

  function addItem() {
    if (!form.name.trim() || !form.shelfLifeDays) return
    const item = {
      id: Date.now(),
      name: form.name.trim(),
      packDate: form.packDate,
      shelfLifeDays: form.shelfLifeDays,
      status: 'active',
    }
    setItems((prev) => [item, ...prev])
    setForm({ name: '', packDate: new Date().toISOString().slice(0, 10), shelfLifeDays: '' })
  }

  function setItemStatus(id, status) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)))
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function toggleAuditItem(zoneKey, idx) {
    setAudits((prev) => {
      const cur = prev[currentMonth] || { fridges: {}, freezers: {}, dry: {}, verifiedWithLead: false }
      const zone = { ...(cur[zoneKey] || {}) }
      zone[idx] = !zone[idx]
      return { ...prev, [currentMonth]: { ...cur, [zoneKey]: zone } }
    })
  }

  function setVerified(v) {
    setAudits((prev) => {
      const cur = prev[currentMonth] || { fridges: {}, freezers: {}, dry: {}, verifiedWithLead: false }
      return { ...prev, [currentMonth]: { ...cur, verifiedWithLead: v } }
    })
  }

  const auditTotal = INVENTORY_AUDIT_ZONES.reduce((sum, z) => sum + z.items.length, 0)
  const auditDone = INVENTORY_AUDIT_ZONES.reduce(
    (sum, z) => sum + z.items.filter((_, idx) => audit[z.key]?.[idx]).length,
    0
  )

  function addCatalogItem() {
    if (!newCatalogItem.name.trim()) return
    setRecountCatalog((prev) => [
      ...prev,
      {
        id: Date.now(),
        name: newCatalogItem.name.trim(),
        unit: newCatalogItem.unit.trim() || 'шт',
        zone: newCatalogItem.zone,
        category: newCatalogItem.category,
      },
    ])
    setNewCatalogItem({ name: '', unit: 'шт', zone: 'fridges', category: 'other' })
  }

  function zoneLabel(key) {
    return INVENTORY_AUDIT_ZONES.find((z) => z.key === key)?.label || 'Без зоны'
  }

  function categoryLabel(key) {
    return PRODUCT_CATEGORIES.find((c) => c.key === key)?.label || 'Другое'
  }

  function removeCatalogItem(id) {
    setRecountCatalog((prev) => prev.filter((i) => i.id !== id))
  }

  function updateCatalogItem(id, patch) {
    setRecountCatalog((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  function loadStandardNomenclature() {
    const existingNames = new Set(recountCatalog.map((i) => i.name.trim().toLowerCase()))
    const toAdd = DEFAULT_NOMENCLATURE.filter((n) => !existingNames.has(n.name.toLowerCase()))
      .map((n) => ({ id: Date.now() + Math.random(), ...n }))
    setRecountCatalog((prev) => [...prev, ...toAdd])
    setCatalogImportResult(
      toAdd.length
        ? `Добавлено из базовой номенклатуры: ${toAdd.length}`
        : 'Все позиции базовой номенклатуры уже есть в каталоге'
    )
  }

  function importCatalog() {
    const { items: parsed, skipped } = parseRecountCatalogImport(catalogImportText)
    const existingNames = new Set(recountCatalog.map((i) => i.name.trim().toLowerCase()))
    const toAdd = []
    parsed.forEach((p) => {
      const key = p.name.toLowerCase()
      if (existingNames.has(key)) return
      existingNames.add(key)
      toAdd.push({ id: Date.now() + Math.random(), ...p })
    })
    setRecountCatalog((prev) => [...prev, ...toAdd])
    const parts = [`Добавлено товаров: ${toAdd.length}`]
    const dupes = parsed.length - toAdd.length
    if (dupes) parts.push(`пропущено дублей: ${dupes}`)
    if (skipped.length) parts.push(`не распознано строк: ${skipped.length}`)
    setCatalogImportResult(parts.join(', '))
    setCatalogImportText('')
  }

  function setQty(itemId, value) {
    setRecounts((prev) => ({
      ...prev,
      [currentMonth]: { ...(prev[currentMonth] || { qty: {}, verifiedWithLead: false }), qty: { ...(prev[currentMonth]?.qty || {}), [itemId]: value } },
    }))
  }

  function setRecountVerified(v) {
    setRecounts((prev) => ({
      ...prev,
      [currentMonth]: { ...(prev[currentMonth] || { qty: {}, verifiedWithLead: false }), verifiedWithLead: v },
    }))
  }

  function setRecountDate(dateStr) {
    setRecounts((prev) => ({
      ...prev,
      [currentMonth]: { ...(prev[currentMonth] || { qty: {}, verifiedWithLead: false }), countedAt: dateStr },
    }))
  }

  function findProductByName(name) {
    const key = (name || '').trim().toLowerCase()
    if (!key) return null
    return recountCatalog.find((p) => p.name.trim().toLowerCase() === key) || null
  }

  function productNameById(id) {
    const product = recountCatalog.find((p) => p.id === Number(id) || p.id === id)
    return product?.name || ''
  }

  function addIngredientRow() {
    setRecipeForm((f) => ({ ...f, ingredients: [...f.ingredients, { productName: '', qty: '' }] }))
  }

  function updateIngredientRow(idx, patch) {
    setRecipeForm((f) => ({
      ...f,
      ingredients: f.ingredients.map((ing, i) => (i === idx ? { ...ing, ...patch } : ing)),
    }))
  }

  function removeIngredientRow(idx) {
    setRecipeForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }))
  }

  function saveRecipe() {
    if (!recipeForm.name.trim()) {
      setRecipeError('Укажите название блюда.')
      return
    }
    const filledRows = recipeForm.ingredients.filter((i) => i.productName.trim() || i.qty)
    const ingredients = []
    for (const row of filledRows) {
      const product = findProductByName(row.productName)
      if (!product || !row.qty) {
        setRecipeError(`Продукт «${row.productName}» не найден в каталоге — выберите вариант из подсказок.`)
        return
      }
      ingredients.push({ productId: product.id, qty: row.qty })
    }
    if (ingredients.length === 0) {
      setRecipeError('Добавьте хотя бы один ингредиент из каталога.')
      return
    }
    setRecipeError(null)
    if (editingRecipeId) {
      setRecipes((prev) => prev.map((r) => (r.id === editingRecipeId ? { ...r, name: recipeForm.name.trim(), ingredients } : r)))
      setEditingRecipeId(null)
    } else {
      setRecipes((prev) => [...prev, { id: Date.now(), name: recipeForm.name.trim(), ingredients }])
    }
    setRecipeForm({ name: '', ingredients: [{ productName: '', qty: '' }] })
  }

  function editRecipe(recipe) {
    setRecipeForm({
      name: recipe.name,
      ingredients: recipe.ingredients.map((ing) => ({ productName: productNameById(ing.productId), qty: ing.qty })),
    })
    setEditingRecipeId(recipe.id)
    setRecipeError(null)
  }

  function cancelEditRecipe() {
    setEditingRecipeId(null)
    setRecipeForm({ name: '', ingredients: [{ productName: '', qty: '' }] })
    setRecipeError(null)
  }

  function removeRecipe(id) {
    setRecipes((prev) => prev.filter((r) => r.id !== id))
    if (editingRecipeId === id) cancelEditRecipe()
  }

  function importRecipes() {
    const { recipes: parsed, skipped } = parseRecipesImport(recipeImportText)
    const existingByName = new Map(recipes.map((r) => [r.name.trim().toLowerCase(), r]))
    let imported = 0
    let skippedExisting = 0
    let unresolvedIngredients = 0
    const nextRecipes = [...recipes]

    parsed.forEach((parsedRecipe) => {
      const key = parsedRecipe.name.toLowerCase()
      const existing = existingByName.get(key)
      if (existing && !recipeImportOverwrite) {
        skippedExisting += 1
        return
      }

      const ingredients = []
      parsedRecipe.ingredients.forEach(({ ingredientName, qty }) => {
        const product = findProductByName(ingredientName)
        if (!product) {
          unresolvedIngredients += 1
          return
        }
        ingredients.push({ productId: product.id, qty })
      })
      if (ingredients.length === 0) return

      if (existing) {
        const idx = nextRecipes.findIndex((r) => r.id === existing.id)
        nextRecipes[idx] = { ...existing, ingredients }
      } else {
        nextRecipes.push({ id: Date.now() + Math.random(), name: parsedRecipe.name, ingredients })
      }
      imported += 1
    })

    setRecipes(nextRecipes)
    const parts = [`Импортировано рецептов: ${imported}`]
    if (skippedExisting) parts.push(`пропущено (уже есть): ${skippedExisting}`)
    if (unresolvedIngredients) parts.push(`не найдено в каталоге ингредиентов: ${unresolvedIngredients}`)
    if (skipped.length) parts.push(`не распознано строк: ${skipped.length}`)
    setRecipeImportResult(parts.join(', '))
    setRecipeImportText('')
  }

  function addPurchase() {
    const product = findProductByName(purchaseForm.productName)
    if (!product) {
      setPurchaseError('Товар не найден в каталоге — выберите вариант из подсказок.')
      return
    }
    if (!purchaseForm.qty) {
      setPurchaseError('Укажите количество.')
      return
    }
    setPurchaseError(null)
    setPurchases((prev) => [
      { id: Date.now(), productId: product.id, qty: purchaseForm.qty, date: purchaseForm.date },
      ...prev,
    ])
    setPurchaseForm({ productName: '', qty: '', date: todayKey() })
  }

  function removePurchase(id) {
    setPurchases((prev) => prev.filter((p) => p.id !== id))
  }

  function addProduction() {
    if (!productionForm.recipeId || !productionForm.qty) return
    setProductions((prev) => [
      { id: Date.now(), recipeId: productionForm.recipeId, qty: productionForm.qty, date: productionForm.date },
      ...prev,
    ])
    setProductionForm({ recipeId: '', qty: '1', date: todayKey() })
  }

  function removeProduction(id) {
    setProductions((prev) => prev.filter((p) => p.id !== id))
  }

  function zonesForPrint() {
    return INVENTORY_AUDIT_ZONES.map((z) => ({
      label: z.label,
      items: recountCatalog
        .filter((i) => i.zone === z.key)
        .map((i) => ({ name: i.name, unit: i.unit, qty: recount.qty[i.id] ?? '' })),
    }))
  }

  const monthLabel = `${MONTHS_RU[viewedMonth.getMonth()]} ${viewedMonth.getFullYear()}`

  function printRecount(blank) {
    printReport({
      type: 'recount',
      title: `Полный переучёт — ${monthLabel}${blank ? ' (бланк для подсчёта)' : ''}`,
      blank,
      zones: zonesForPrint(),
    })
  }

  const catalogTotal = recountCatalog.length
  const catalogFilled = recountCatalog.filter((i) => recount.qty[i.id] !== undefined && recount.qty[i.id] !== '').length

  const balances = useMemo(() => {
    return recountCatalog.map((product) => ({
      product,
      ...computeBalance(product.id, { recounts, purchases, productions, recipes }, now),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recountCatalog, recounts, purchases, productions, recipes])

  function sortByKey(list, sortKey, getName) {
    const copy = [...list]
    if (sortKey === 'alpha') {
      copy.sort((a, b) => getName(a).localeCompare(getName(b), 'ru'))
    } else if (sortKey === 'zone') {
      copy.sort((a, b) => zoneLabel(a.zone).localeCompare(zoneLabel(b.zone), 'ru') || getName(a).localeCompare(getName(b), 'ru'))
    } else if (sortKey === 'category') {
      copy.sort((a, b) => categoryLabel(a.category).localeCompare(categoryLabel(b.category), 'ru') || getName(a).localeCompare(getName(b), 'ru'))
    }
    return copy
  }

  const sortedCatalog = useMemo(
    () => sortByKey(recountCatalog, catalogSort, (i) => i.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recountCatalog, catalogSort]
  )

  const sortedBalances = useMemo(() => {
    if (balanceSort === 'qty') {
      return [...balances].sort((a, b) => {
        const av = a.balance ?? Infinity
        const bv = b.balance ?? Infinity
        return av - bv
      })
    }
    const list = balances.map((b) => ({ ...b.product, __row: b }))
    const sortedList = sortByKey(list, balanceSort, (i) => i.name)
    return sortedList.map((i) => i.__row)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balances, balanceSort])

  function isLowStock(row) {
    const min = Number(row.product.minQty)
    return min > 0 && row.balance !== null && row.balance <= min
  }

  const SORT_OPTIONS = [
    { key: 'alpha', label: 'А-Я' },
    { key: 'zone', label: 'Зона' },
    { key: 'category', label: 'Рубрика' },
  ]

  function findPlannedByProduct(productId) {
    return plannedPurchases.find((p) => String(p.productId) === String(productId))
  }

  function addLowStockToPlan(product, suggestedQty) {
    if (findPlannedByProduct(product.id)) return
    setPlannedPurchases((prev) => [...prev, { id: Date.now(), productId: product.id, qty: suggestedQty || '' }])
  }

  return (
    <div className="pb-4">
      <div className="flex gap-1.5 mb-4 overflow-x-auto -mx-3 px-3">
        <button
          onClick={() => setTab('fifo')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            tab === 'fifo' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          <PackageSearch size={16} /> FIFO
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            tab === 'audit' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          <ClipboardCheck size={16} /> Проверка
        </button>
        <button
          onClick={() => setTab('recount')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            tab === 'recount' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          <ClipboardList size={16} /> Переучёт
        </button>
        <button
          onClick={() => setTab('balance')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            tab === 'balance' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          <Scale size={16} /> Остатки
        </button>
        <button
          onClick={() => setTab('catalog')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            tab === 'catalog' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          <Tags size={16} /> Каталог
        </button>
      </div>

      {(tab === 'audit' || tab === 'recount') && (
        <div className="flex items-center justify-between mb-4 bg-white rounded-2xl border border-slate-200 px-2 py-2 shadow-sm">
          <button onClick={() => setMonthOffset((o) => o - 1)} className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100">
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <p className="font-semibold text-slate-800 text-sm">{monthLabel}</p>
            {!isThisMonth && <button onClick={() => setMonthOffset(0)} className="text-[11px] text-orange-600 font-semibold">Вернуться к этому месяцу</button>}
          </div>
          <button
            onClick={() => setMonthOffset((o) => Math.min(o + 1, 0))}
            disabled={isThisMonth}
            className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100 disabled:opacity-30"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      {tab === 'fifo' && (
        <>
          <Section title="Добавить продукт" icon={Plus}>
            <Field label="Название">
              <input
                className={inputClass}
                list="product-nomenclature"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Например: Куриное филе"
              />
            </Field>
            <div className="flex gap-2">
              <Field label="Дата приготовления/упаковки">
                <input
                  type="date"
                  className={inputClass}
                  value={form.packDate}
                  onChange={(e) => setForm((f) => ({ ...f, packDate: e.target.value }))}
                />
              </Field>
              <Field label="Срок годности, дней">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={form.shelfLifeDays}
                  onChange={(e) => setForm((f) => ({ ...f, shelfLifeDays: e.target.value }))}
                  placeholder="3"
                />
              </Field>
            </div>
            <BigButton onClick={addItem} icon={Plus}>Добавить в список</BigButton>
          </Section>

          <Section title="Список FIFO (по сроку годности)" icon={PackageSearch}>
            {sorted.length === 0 && <p className="text-sm text-slate-400 text-center py-3">Список пуст</p>}
            <div className="flex flex-col gap-2">
              {sorted.map((item) => {
                const daysLeft = daysBetween(startOfDay(now), item.expiry)
                const status = statusFor(daysLeft)
                return (
                  <div key={item.id} className={`rounded-xl border-2 p-3 ${toneClasses[status.tone]}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          Упаковано {formatRu(parseLocalDate(item.packDate))} · годен {item.shelfLifeDays} дн.
                        </p>
                        <p className="text-xs text-slate-500">Истекает {formatRu(item.expiry)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge color={status.tone}>{status.label}</Badge>
                        <ConfirmDeleteButton onConfirm={() => removeItem(item.id)} />
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      {LEFTOVER_ACTIONS.map((a) => (
                        <button
                          key={a.key}
                          onClick={() => setItemStatus(item.id, a.key)}
                          className={`flex-1 min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1 border ${
                            item.status === a.key
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-slate-600 border-slate-200'
                          }`}
                        >
                          {a.key === 'freezing' && <Snowflake size={14} />}
                          {a.key === 'storage' && <Archive size={14} />}
                          {a.key === 'disposal' && <Trash size={14} />}
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        </>
      )}

      {tab === 'audit' && (
        <>
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-4 py-3 mb-4 shadow-sm">
            <p className="text-sm font-medium text-slate-600">Проверка зон — {monthLabel}</p>
            <Badge color={auditDone === auditTotal ? 'green' : 'slate'}>{auditDone}/{auditTotal}</Badge>
          </div>

          {INVENTORY_AUDIT_ZONES.map((zone) => (
            <Section key={zone.key} title={zone.label}>
              {zone.items.map((item, idx) => (
                <CheckRow
                  key={idx}
                  label={item}
                  checked={!!audit[zone.key]?.[idx]}
                  onChange={() => toggleAuditItem(zone.key, idx)}
                />
              ))}
            </Section>
          ))}

          <Section title="Подтверждение">
            <CheckRow
              label="Проверка сверена с Küchenleiterin"
              checked={!!audit.verifiedWithLead}
              onChange={setVerified}
            />
          </Section>
        </>
      )}

      {tab === 'recount' && (
        <>
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-4 py-3 mb-2 shadow-sm">
            <p className="text-sm font-medium text-slate-600">Переучёт — {monthLabel}</p>
            <Badge color={catalogFilled === catalogTotal && catalogTotal > 0 ? 'green' : 'slate'}>
              {catalogFilled}/{catalogTotal}
            </Badge>
          </div>

          <Field label="Дата фактического подсчёта (для расчёта остатков)">
            <input
              type="date"
              className={inputClass}
              value={recount.countedAt || currentMonth + '-01'}
              onChange={(e) => setRecountDate(e.target.value)}
            />
          </Field>

          <div className="flex gap-2 mb-4">
            <PrintButton onClick={() => printRecount(true)} label="Пустой бланк" />
            <PrintButton onClick={() => printRecount(false)} label="С текущими данными" />
          </div>

          {INVENTORY_AUDIT_ZONES.map((zone) => {
            const zoneItems = recountCatalog.filter((i) => i.zone === zone.key)
            if (zoneItems.length === 0) return null
            return (
              <Section key={zone.key} title={zone.label}>
                <div className="flex flex-col gap-2">
                  {zoneItems.map((item) => {
                    const prevQty = prevRecount?.qty?.[item.id]
                    const curQty = recount.qty[item.id]
                    const delta = prevQty !== undefined && curQty !== undefined && curQty !== ''
                      ? Number(curQty) - Number(prevQty)
                      : null
                    return (
                      <div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{item.name}</p>
                          <p className="text-xs text-slate-400">
                            {item.unit}
                            {prevQty !== undefined && prevQty !== '' && ` · было ${prevQty}`}
                            {delta !== null && delta !== 0 && (
                              <span className={delta > 0 ? 'text-green-600' : 'text-red-600'}> ({delta > 0 ? '+' : ''}{delta})</span>
                            )}
                          </p>
                        </div>
                        <div className="w-20 shrink-0">
                          <input
                            type="number"
                            className={inputClass + ' text-center'}
                            value={curQty ?? ''}
                            onChange={(e) => setQty(item.id, e.target.value)}
                            placeholder="0"
                          />
                        </div>
                        <ConfirmDeleteButton onConfirm={() => removeCatalogItem(item.id)} />
                      </div>
                    )
                  })}
                </div>
              </Section>
            )
          })}

          {recountCatalog.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-3">
              Каталог пуст — наполните его во вкладке «Каталог» (базовая номенклатура, импорт
              или добавление вручную)
            </p>
          )}

          <Section title="Подтверждение">
            <CheckRow
              label="Переучёт сверен с Küchenleiterin"
              checked={!!recount.verifiedWithLead}
              onChange={setRecountVerified}
            />
          </Section>
        </>
      )}

      {tab === 'catalog' && (
        <>
          <Section title="Номенклатура продуктов" icon={Tags}>
            <p className="text-xs text-slate-500 mb-3">
              Единый список продуктов, из которого подставляются варианты названий во всех
              полях (Склад, Переучёт, Остатки, закупки, рецепты). Редактируется вручную —
              название, единица измерения и зона хранения каждой позиции.
            </p>
            <BigButton onClick={loadStandardNomenclature} icon={Download} color="outline">
              Загрузить базовую номенклатуру
            </BigButton>
            <p className="text-xs text-slate-400 mt-2">
              Добавит мясо/курицу/индейку (и их части), овощи, фрукты, бакалею и специи —
              пропустит то, что уже есть в каталоге по названию.
            </p>
          </Section>

          <Section
            title="Импорт из Google Таблиц"
            icon={Upload}
            right={
              <button onClick={() => setShowCatalogImport((v) => !v)} className="text-xs font-semibold text-orange-600">
                {showCatalogImport ? 'Скрыть' : 'Показать'}
              </button>
            }
          >
            {showCatalogImport && (
              <>
                <p className="text-xs text-slate-500 mb-2">
                  Столбцы: <b>Название, Ед. изм., Зона</b> (холодильник / морозильник / сухой склад).
                  Выделите в Google Таблице → Ctrl+C → вставьте сюда.
                </p>
                <textarea
                  className={inputClass + ' h-28 py-2'}
                  placeholder={'Куриное филе\tкг\tхолодильник\nМука\tкг\tсухой склад'}
                  value={catalogImportText}
                  onChange={(e) => setCatalogImportText(e.target.value)}
                />
                <div className="flex gap-2 mt-2">
                  <BigButton onClick={importCatalog} icon={Upload} disabled={!catalogImportText.trim()}>
                    Импортировать в каталог
                  </BigButton>
                  <button
                    onClick={() => { setShowCatalogImport(false); setCatalogImportText(''); setCatalogImportResult(null) }}
                    className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500"
                  >
                    <X size={18} />
                  </button>
                </div>
              </>
            )}
            {catalogImportResult && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-2">
                {catalogImportResult}
              </p>
            )}
          </Section>

          <Section title="Добавить товар вручную" icon={Plus}>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <input
                  className={inputClass}
                  placeholder="Название"
                  list="nomenclature-reference"
                  value={newCatalogItem.name}
                  onChange={(e) => setNewCatalogItem((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="w-20 shrink-0">
                <input
                  className={inputClass}
                  placeholder="Ед."
                  value={newCatalogItem.unit}
                  onChange={(e) => setNewCatalogItem((f) => ({ ...f, unit: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <div className="flex-1 min-w-0">
                <select
                  className={inputClass}
                  value={newCatalogItem.zone}
                  onChange={(e) => setNewCatalogItem((f) => ({ ...f, zone: e.target.value }))}
                >
                  {INVENTORY_AUDIT_ZONES.map((z) => (
                    <option key={z.key} value={z.key}>{z.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-0">
                <select
                  className={inputClass}
                  value={newCatalogItem.category}
                  onChange={(e) => setNewCatalogItem((f) => ({ ...f, category: e.target.value }))}
                >
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={addCatalogItem}
                className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-orange-500 active:bg-orange-600 text-white"
              >
                <Plus size={20} />
              </button>
            </div>
            <datalist id="nomenclature-reference">
              {DEFAULT_NOMENCLATURE.map((n) => (
                <option key={n.name} value={n.name} />
              ))}
            </datalist>
          </Section>

          <Section
            title={`Каталог (${recountCatalog.length})`}
            icon={PackageSearch}
            right={
              <div className="flex items-center gap-1 text-slate-400">
                <ArrowUpDown size={14} />
              </div>
            }
          >
            <div className="flex gap-1.5 mb-3">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setCatalogSort(opt.key)}
                  className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold ${
                    catalogSort === opt.key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {recountCatalog.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-3">Каталог пуст</p>
            )}
            <div className="flex flex-col gap-2">
              {sortedCatalog.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 px-2 py-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <input
                        className={inputClass + ' text-sm'}
                        value={item.name}
                        onChange={(e) => updateCatalogItem(item.id, { name: e.target.value })}
                      />
                    </div>
                    <ConfirmDeleteButton onConfirm={() => removeCatalogItem(item.id)} />
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-14 shrink-0">
                      <input
                        className={inputClass + ' text-xs text-center px-1'}
                        value={item.unit}
                        onChange={(e) => updateCatalogItem(item.id, { unit: e.target.value })}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <select
                        className={inputClass + ' text-xs px-1'}
                        value={item.zone}
                        onChange={(e) => updateCatalogItem(item.id, { zone: e.target.value })}
                      >
                        {INVENTORY_AUDIT_ZONES.map((z) => (
                          <option key={z.key} value={z.key}>{z.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-0">
                      <select
                        className={inputClass + ' text-xs px-1'}
                        value={item.category || 'other'}
                        onChange={(e) => updateCatalogItem(item.id, { category: e.target.value })}
                      >
                        {PRODUCT_CATEGORIES.map((c) => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 shrink-0">Мин. остаток для подсветки:</span>
                    <div className="w-16 shrink-0">
                      <input
                        type="number"
                        className={inputClass + ' text-xs text-center px-1'}
                        value={item.minQty ?? ''}
                        placeholder="—"
                        onChange={(e) => updateCatalogItem(item.id, { minQty: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {tab === 'balance' && (
        <>
          <p className="text-xs text-slate-500 mb-3 px-1">
            Остаток = последний переучёт с заполненным количеством по товару (дата подсчёта задаётся
            во вкладке «Переучёт») + все закупки после этой даты − расход по рецептам после этой даты.
          </p>

          <Section
            title="Рецепты"
            icon={BookOpen}
            right={
              <button onClick={() => setShowRecipeImport((v) => !v)} className="text-xs font-semibold text-orange-600">
                {showRecipeImport ? 'Скрыть импорт' : 'Импорт из таблиц'}
              </button>
            }
          >
            {showRecipeImport && (
              <div className="mb-3 pb-3 border-b border-slate-100">
                <p className="text-xs text-slate-500 mb-2">
                  Столбцы: <b>Блюдо, Ингредиент, Кол-во</b> — по одной строке на ингредиент.
                  Несколько строк с одинаковым названием блюда объединятся в один рецепт.
                  Выделите в Google Таблице → Ctrl+C → вставьте сюда.
                </p>
                <textarea
                  className={inputClass + ' h-28 py-2'}
                  placeholder={'Бульон\tКуриное крыло\t0.5\nБульон\tЛавровый лист\t1\nБорщ\tСвёкла\t1'}
                  value={recipeImportText}
                  onChange={(e) => setRecipeImportText(e.target.value)}
                />
                <label className="flex items-center gap-2 mt-2 mb-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={recipeImportOverwrite}
                    onChange={(e) => setRecipeImportOverwrite(e.target.checked)}
                    className="w-5 h-5"
                  />
                  Перезаписывать уже существующие рецепты (по названию)
                </label>
                <BigButton onClick={importRecipes} icon={Upload} disabled={!recipeImportText.trim()}>
                  Импортировать рецепты
                </BigButton>
                {recipeImportResult && (
                  <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-2">
                    {recipeImportResult}
                  </p>
                )}
              </div>
            )}

            {recipes.length === 0 && <p className="text-sm text-slate-400 text-center py-2">Рецептов пока нет</p>}
            <div className="flex flex-col gap-2 mb-3">
              {recipes.map((r) => (
                <div key={r.id} className={`rounded-xl border px-3 py-2 ${editingRecipeId === r.id ? 'border-orange-400 bg-orange-50' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{r.name}</p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => editRecipe(r)}
                        className="w-9 h-9 flex items-center justify-center text-slate-400 active:text-orange-600"
                      >
                        <Pencil size={16} />
                      </button>
                      <ConfirmDeleteButton onConfirm={() => removeRecipe(r.id)} />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {r.ingredients.map((ing) => {
                      const product = recountCatalog.find((p) => p.id === Number(ing.productId) || p.id === ing.productId)
                      return `${product?.name || '?'} × ${ing.qty}${product?.unit ? ' ' + product.unit : ''}`
                    }).join(', ')}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {editingRecipeId ? 'Редактирование рецепта' : 'Новый рецепт'}
              </p>
              {editingRecipeId && (
                <button onClick={cancelEditRecipe} className="text-xs font-semibold text-slate-500">
                  Отменить
                </button>
              )}
            </div>
            <Field label="Название блюда">
              <input
                className={inputClass}
                placeholder="Например: Бульон"
                value={recipeForm.name}
                onChange={(e) => setRecipeForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            {recipeForm.ingredients.map((ing, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <input
                    className={inputClass}
                    placeholder="Продукт…"
                    list="product-nomenclature"
                    value={ing.productName}
                    onChange={(e) => updateIngredientRow(idx, { productName: e.target.value })}
                  />
                </div>
                <div className="w-20 shrink-0">
                  <input
                    type="number"
                    className={inputClass}
                    placeholder="Кол-во"
                    value={ing.qty}
                    onChange={(e) => updateIngredientRow(idx, { qty: e.target.value })}
                  />
                </div>
                <button
                  onClick={() => removeIngredientRow(idx)}
                  className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button
              onClick={addIngredientRow}
              className="w-full min-h-[40px] flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 text-sm font-semibold active:bg-slate-50 mb-2"
            >
              <Plus size={14} /> Ингредиент
            </button>
            {recipeError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">
                {recipeError}
              </p>
            )}
            <BigButton onClick={saveRecipe} icon={editingRecipeId ? undefined : Plus}>
              {editingRecipeId ? 'Сохранить изменения' : 'Сохранить рецепт'}
            </BigButton>
          </Section>

          <Section title="Приход (закупка)" icon={ShoppingCart}>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <input
                  className={inputClass}
                  placeholder="Продукт…"
                  list="product-nomenclature"
                  value={purchaseForm.productName}
                  onChange={(e) => setPurchaseForm((f) => ({ ...f, productName: e.target.value }))}
                />
              </div>
              <div className="w-20 shrink-0">
                <input
                  type="number"
                  className={inputClass}
                  placeholder="Кол-во"
                  value={purchaseForm.qty}
                  onChange={(e) => setPurchaseForm((f) => ({ ...f, qty: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <div className="flex-1 min-w-0">
                <input
                  type="date"
                  className={inputClass}
                  value={purchaseForm.date}
                  onChange={(e) => setPurchaseForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <button
                onClick={addPurchase}
                className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-orange-500 active:bg-orange-600 text-white"
              >
                <Plus size={20} />
              </button>
            </div>
            {purchaseError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-2">
                {purchaseError}
              </p>
            )}

            {purchases.slice(0, 8).map((p) => {
              const product = recountCatalog.find((pr) => pr.id === Number(p.productId) || pr.id === p.productId)
              return (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-slate-700">
                    {product?.name || '?'} <span className="text-slate-400">+{p.qty} {product?.unit}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{formatRu(parseLocalDate(p.date))}</span>
                    <ConfirmDeleteButton onConfirm={() => removePurchase(p.id)} size="w-8 h-8" iconSize={14} />
                  </div>
                </div>
              )
            })}
          </Section>

          <Section title="Расход (готовка по рецепту)" icon={Flame}>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <select
                  className={inputClass}
                  value={productionForm.recipeId}
                  onChange={(e) => setProductionForm((f) => ({ ...f, recipeId: e.target.value }))}
                >
                  <option value="">Рецепт…</option>
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="w-20 shrink-0">
                <input
                  type="number"
                  className={inputClass}
                  placeholder="Раз"
                  value={productionForm.qty}
                  onChange={(e) => setProductionForm((f) => ({ ...f, qty: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <div className="flex-1 min-w-0">
                <input
                  type="date"
                  className={inputClass}
                  value={productionForm.date}
                  onChange={(e) => setProductionForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <button
                onClick={addProduction}
                className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-orange-500 active:bg-orange-600 text-white disabled:opacity-40"
                disabled={recipes.length === 0}
              >
                <Plus size={20} />
              </button>
            </div>
            {recipes.length === 0 && (
              <p className="text-xs text-slate-400 mt-2">Сначала добавьте хотя бы один рецепт выше</p>
            )}

            {productions.slice(0, 8).map((p) => {
              const recipe = recipes.find((r) => r.id === Number(p.recipeId) || r.id === p.recipeId)
              return (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-slate-700">
                    {recipe?.name || '?'} <span className="text-slate-400">× {p.qty}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{formatRu(parseLocalDate(p.date))}</span>
                    <ConfirmDeleteButton onConfirm={() => removeProduction(p.id)} size="w-8 h-8" iconSize={14} />
                  </div>
                </div>
              )
            })}
          </Section>

          <Section title="Текущие остатки" icon={Scale}>
            <div className="flex gap-1.5 mb-3">
              {[...SORT_OPTIONS, { key: 'qty', label: 'Кол-во' }].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setBalanceSort(opt.key)}
                  className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold ${
                    balanceSort === opt.key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {balances.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-3">Каталог пуст — добавьте товары во вкладке «Каталог»</p>
            )}
            <div className="flex flex-col gap-2">
              {sortedBalances.map((row) => {
                const { product, balance, baselineDate } = row
                const low = isLowStock(row)
                const alreadyPlanned = !!findPlannedByProduct(product.id)
                return (
                  <div
                    key={product.id}
                    className={`rounded-xl border-2 px-3 py-2 ${low ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{product.name}</p>
                        <p className="text-xs text-slate-400">
                          {baselineDate ? `с переучёта ${formatRu(baselineDate)}` : 'нет данных переучёта'}
                          {low && ' · мало на складе'}
                        </p>
                      </div>
                      {balance === null ? (
                        <Badge color="slate">—</Badge>
                      ) : (
                        <Badge color={low ? 'red' : balance <= 0 ? 'red' : 'green'}>{balance} {product.unit}</Badge>
                      )}
                    </div>
                    {low && (
                      <button
                        onClick={() => addLowStockToPlan(product, product.minQty)}
                        disabled={alreadyPlanned}
                        className="w-full min-h-[36px] mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-red-600 active:bg-red-700 disabled:bg-slate-300 text-white text-xs font-semibold"
                      >
                        <ClipboardPlus size={14} /> {alreadyPlanned ? 'Уже в списке закупки' : 'Добавить в закупку'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>

          <p className="text-xs text-slate-400 text-center px-4 py-2">
            Управление списком закупки — на вкладке «Закупка» в нижнем меню.
          </p>
        </>
      )}
    </div>
  )
}
