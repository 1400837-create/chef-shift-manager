import { useEffect, useMemo, useState } from 'react'
import {
  Plus, PackageSearch, ClipboardCheck, Snowflake, Archive, Trash,
  ClipboardList, Upload, X, ChevronLeft, ChevronRight, Scale,
  ShoppingCart, Flame, Tags, Download, Calendar, Search,
  ArrowRightLeft, ClipboardPlus, MessageSquare,
} from 'lucide-react'
import { Section, Field, inputClass, Badge, CheckRow, BigButton, PrintButton, ConfirmDeleteButton } from '../components/UI'
import { LEFTOVER_ACTIONS, INVENTORY_AUDIT_ZONES, DEFAULT_NOMENCLATURE, PRODUCT_CATEGORIES, WASTE_REASONS } from '../utils/constants'
import { addDays, addMonths, daysBetween, formatRu, monthKey, MONTHS_RU, parseLocalDate, startOfDay, todayKey, toKey } from '../utils/dateUtils'
import { parseRecountCatalogImport, parsePurchaseImport } from '../utils/importParsers'
import { printReport } from '../utils/printReport'
import { computeBalance } from '../utils/stockBalance'
import { sanitizeDecimal } from '../utils/number'
import { downloadCsv } from '../utils/csv'
import { coursesForDay } from '../utils/menuCourses'

function matchesSearch(name, search) {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return (name || '').toLowerCase().includes(q)
}

function computeExpiry(item) {
  return addDays(parseLocalDate(item.packDate), Number(item.shelfLifeDays || 0))
}

function statusFor(daysLeft) {
  if (daysLeft <= 1) return { tone: 'red', label: daysLeft <= 0 ? 'Истекает сегодня' : 'Истекает завтра' }
  if (daysLeft <= 3) return { tone: 'yellow', label: `Осталось ${daysLeft} дн.` }
  return { tone: 'green', label: `Осталось ${daysLeft} дн.` }
}

const toneClasses = {
  red: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30',
  yellow: 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/30',
  green: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
}

export default function Inventory({
  items, setItems, audits, setAudits,
  recountCatalog, setRecountCatalog, recounts, setRecounts,
  recipes, purchases, setPurchases, productions, setProductions,
  plannedPurchases, setPlannedPurchases, menuData, staffName,
  initialTab, initialHighlightId, onInitialConsumed,
}) {
  const [form, setForm] = useState({ name: '', packDate: new Date().toISOString().slice(0, 10), shelfLifeDays: '' })
  const [disposalPromptId, setDisposalPromptId] = useState(null)
  const [tab, setTab] = useState(() => initialTab || 'fifo')
  const [highlightCatalogId, setHighlightCatalogId] = useState(initialHighlightId || null)
  const [monthOffset, setMonthOffset] = useState(0)
  const now = new Date()
  const viewedMonth = addMonths(now, monthOffset)
  const isThisMonth = monthOffset === 0
  const currentMonth = monthKey(viewedMonth)
  const audit = audits[currentMonth] || { fridges: {}, freezers: {}, dry: {}, verifiedWithLead: false }

  const [showCatalogImport, setShowCatalogImport] = useState(false)
  const [catalogImportText, setCatalogImportText] = useState('')
  const [catalogImportResult, setCatalogImportResult] = useState(null)
  const [newCatalogItem, setNewCatalogItem] = useState({ name: '', unit: 'шт', zone: 'fridges', category: 'other' })
  const [catalogSort, setCatalogSort] = useState('alpha')
  const [balanceSort, setBalanceSort] = useState('alpha')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [recountSearch, setRecountSearch] = useState('')
  const [balanceSearch, setBalanceSearch] = useState('')

  const [purchaseForm, setPurchaseForm] = useState({ productName: '', qty: '', date: todayKey() })
  const [purchaseError, setPurchaseError] = useState(null)
  // Switching Склад's own sub-tab (this component never unmounts for that,
  // unlike switching the app's top-level tab) so this import's in-progress
  // state doesn't need localStorage persistence the way MenuPlanner's does.
  const [showPurchaseImport, setShowPurchaseImport] = useState(false)
  const [purchaseImportText, setPurchaseImportText] = useState('')
  const [purchaseImportDeclined, setPurchaseImportDeclined] = useState([])
  const [purchaseImportMissingPrompt, setPurchaseImportMissingPrompt] = useState(null)
  const [purchaseImportResult, setPurchaseImportResult] = useState(null)
  const [productionForm, setProductionForm] = useState({ recipeId: '', qty: '1', date: todayKey() })
  const [openRecountComment, setOpenRecountComment] = useState(null)
  const [openPurchaseComment, setOpenPurchaseComment] = useState(null)
  const [menuRangeFrom, setMenuRangeFrom] = useState(todayKey())
  const [menuRangeTo, setMenuRangeTo] = useState(todayKey())
  const [menuImportResult, setMenuImportResult] = useState(null)

  // initialTab/initialHighlightId are a one-shot navigation request from
  // MenuPlanner (added a nomenclature item mid-recipe, wants to land here to
  // fill in its details) — read once on mount into local state, then hand
  // control straight back via onInitialConsumed so a later, unrelated visit
  // to Склад doesn't get stuck reopening on Каталог.
  useEffect(() => {
    if (initialTab) onInitialConsumed?.()
    if (initialHighlightId) {
      const el = document.getElementById(`catalog-item-${initialHighlightId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const t = setTimeout(() => setHighlightCatalogId(null), 4000)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recount = recounts[currentMonth] || { qty: {}, verifiedWithLead: false, countedAt: '' }

  // Recounts excluding the in-progress month, so "expected" is forecast purely
  // from history + purchases/consumption — not from the entry we're comparing it to.
  const recountsExcludingCurrent = useMemo(() => {
    const copy = { ...recounts }
    delete copy[currentMonth]
    return copy
  }, [recounts, currentMonth])

  const recountAsOfDate = useMemo(
    () => parseLocalDate(recount.countedAt || currentMonth + '-01'),
    [recount.countedAt, currentMonth]
  )

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

  function setItemStatus(id, status, extra = {}) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status, ...extra } : i)))
  }

  function confirmDisposal(id, reasonKey) {
    setItemStatus(id, 'disposal', { wasteReason: reasonKey, wasteDate: todayKey(), wasteBy: staffName || undefined })
    setDisposalPromptId(null)
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function wasteReasonLabel(key) {
    return WASTE_REASONS.find((r) => r.key === key)?.label || 'Не указана'
  }

  const wasteLog = useMemo(
    () => [...items].filter((i) => i.status === 'disposal').sort((a, b) => (b.wasteDate || '').localeCompare(a.wasteDate || '')),
    [items]
  )

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

  // Export mirrors exactly what the import above expects (Название, Ед.
  // изм., Зона, Рубрика, tab-separated) so the round trip works: export,
  // paste into a sheet, edit, copy, paste back into "Импорт из Google Таблиц".
  function exportCatalog() {
    const rows = sortedCatalog.map((item) =>
      [item.name, item.unit, zoneLabel(item.zone), categoryLabel(item.category || 'other')].join('\t')
    )
    const text = rows.join('\n')
    const finish = () => {
      alert(`Скопировано в буфер обмена: ${rows.length} товаров.\nВставьте в Google Таблицу, отредактируйте и при необходимости вставьте обратно через «Импорт из Google Таблиц».`)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(finish).catch(() => {
        downloadCsv('Номенклатура.csv', rows.map((r) => r.split('\t')))
      })
    } else {
      downloadCsv('Номенклатура.csv', rows.map((r) => r.split('\t')))
    }
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

  function setRecountComment(itemId, value) {
    setRecounts((prev) => ({
      ...prev,
      [currentMonth]: {
        ...(prev[currentMonth] || { qty: {}, verifiedWithLead: false }),
        comments: { ...(prev[currentMonth]?.comments || {}), [itemId]: value },
      },
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

  function setRecountEnteredBy(name) {
    setRecounts((prev) => ({
      ...prev,
      [currentMonth]: { ...(prev[currentMonth] || { qty: {}, verifiedWithLead: false }), enteredBy: name },
    }))
  }

  function findProductByName(name) {
    const key = (name || '').trim().toLowerCase()
    if (!key) return null
    return recountCatalog.find((p) => p.name.trim().toLowerCase() === key) || null
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

  function setPurchaseComment(id, value) {
    setPurchases((prev) => prev.map((p) => (p.id === id ? { ...p, comment: value } : p)))
  }

  // Same missing-product confirmation as recipe import (see MenuPlanner) —
  // stop at the first product not in the nomenclature and not already
  // declined this run, ask once, then either create it (jumping to the
  // Каталог sub-tab, which stays mounted here so nothing needs to persist)
  // or mark it declined and keep going on the next click of "Импортировать".
  function runPurchaseImport() {
    const { items: parsed } = parsePurchaseImport(purchaseImportText)
    const declinedSet = new Set(purchaseImportDeclined.map((n) => n.toLowerCase()))

    for (const item of parsed) {
      const key = item.name.trim().toLowerCase()
      if (!key || declinedSet.has(key)) continue
      if (!findProductByName(item.name)) {
        setPurchaseImportMissingPrompt(item.name.trim())
        return
      }
    }

    finalizePurchaseImport(parsed)
  }

  function finalizePurchaseImport(parsed) {
    const { skipped } = parsePurchaseImport(purchaseImportText)
    const declinedSet = new Set(purchaseImportDeclined.map((n) => n.toLowerCase()))
    const newEntries = []
    let declinedCount = 0

    parsed.forEach((item) => {
      const key = item.name.trim().toLowerCase()
      if (declinedSet.has(key)) { declinedCount += 1; return }
      const product = findProductByName(item.name)
      if (!product) { declinedCount += 1; return }
      newEntries.push({
        id: Date.now() + Math.random(),
        productId: product.id,
        qty: item.qty,
        date: item.date || todayKey(),
      })
    })

    if (newEntries.length) setPurchases((prev) => [...newEntries, ...prev])
    const parts = [`Добавлено записей прихода: ${newEntries.length}`]
    if (declinedCount) parts.push(`пропущено (отказано в добавлении): ${declinedCount}`)
    if (skipped.length) parts.push(`не распознано строк: ${skipped.length}`)
    setPurchaseImportResult(parts.join(', '))
    setPurchaseImportText('')
    setPurchaseImportDeclined([])
    setPurchaseImportMissingPrompt(null)
  }

  function confirmAddPurchaseImportProduct() {
    const name = purchaseImportMissingPrompt
    if (!name) return
    const newId = Date.now()
    setRecountCatalog((prev) => [...prev, { id: newId, name, unit: 'шт', zone: 'fridges', category: 'other' }])
    setPurchaseImportMissingPrompt(null)
    setTab('catalog')
    setHighlightCatalogId(newId)
  }

  function declinePurchaseImportProduct() {
    const name = purchaseImportMissingPrompt
    if (!name) return
    setPurchaseImportDeclined((prev) => [...prev, name])
    setPurchaseImportMissingPrompt(null)
  }

  function printPurchaseLog() {
    printReport({
      type: 'purchase-log',
      title: `Приход (закупка) — ${monthLabel}`,
      items: purchases
        .filter((p) => monthKey(parseLocalDate(p.date)) === currentMonth)
        .map((p) => {
          const product = recountCatalog.find((pr) => String(pr.id) === String(p.productId))
          return {
            date: formatRu(parseLocalDate(p.date)),
            name: product?.name || '?',
            qty: p.qty,
            unit: product?.unit || '',
            comment: p.comment || '',
          }
        }),
    })
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

  function findRecipeByName(name) {
    const key = (name || '').trim().toLowerCase()
    if (!key) return null
    return recipes.find((r) => r.name.trim().toLowerCase() === key) || null
  }

  // Menu quantities are free text ("40 шт", "по 2 порции") since they're
  // meant for printing, not math — pull out the leading number so the
  // multiplier used against a recipe's ingredients is actually numeric.
  function extractQtyNumber(qtyStr) {
    const match = String(qtyStr || '').match(/[\d.,]+/)
    if (!match) return '1'
    return match[0].replace(',', '.')
  }

  function addProductionsFromMenu(fromStr, toStr) {
    const from = parseLocalDate(fromStr)
    const to = parseLocalDate(toStr)
    if (to < from) {
      setMenuImportResult('Дата «по» раньше даты «от».')
      return
    }
    const newEntries = []
    const missingDishes = new Set()
    let cursor = from
    while (cursor <= to) {
      const mk = monthKey(cursor)
      const dayData = menuData[mk]?.[cursor.getDate()]
      if (dayData) {
        coursesForDay(dayData).forEach((c) => {
          if (!c.dish) return
          const recipe = findRecipeByName(c.dish)
          if (recipe) {
            newEntries.push({
              id: Date.now() + Math.random(),
              recipeId: recipe.id,
              qty: extractQtyNumber(c.qty),
              date: toKey(cursor),
            })
          } else {
            missingDishes.add(c.dish)
          }
        })
      }
      cursor = addDays(cursor, 1)
    }
    if (newEntries.length) setProductions((prev) => [...newEntries, ...prev])
    const parts = [`Добавлено записей расхода: ${newEntries.length}`]
    if (missingDishes.size) parts.push(`нет рецепта для: ${Array.from(missingDishes).join(', ')}`)
    setMenuImportResult(parts.join('; '))
  }

  function zonesForPrint() {
    return INVENTORY_AUDIT_ZONES.map((z) => ({
      label: z.label,
      items: recountCatalog
        .filter((i) => i.zone === z.key)
        .map((i) => ({ name: i.name, unit: i.unit, qty: recount.qty[i.id] ?? '', comment: recount.comments?.[i.id] || '' })),
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

  function exportMonthCsv() {
    const rows = [['Переучёт', monthLabel]]
    rows.push(['Продукт', 'Ед.', 'Учтено', 'Ожидалось', 'Расхождение', 'Комментарий'])
    recountCatalog.forEach((item) => {
      const curQty = recount.qty[item.id]
      const actual = curQty !== undefined && curQty !== '' ? Number(curQty) : ''
      const { balance: expected } = computeBalance(
        item.id,
        { recounts: recountsExcludingCurrent, purchases, productions, recipes },
        recountAsOfDate
      )
      const shrinkage = expected !== null && actual !== '' ? actual - expected : ''
      rows.push([item.name, item.unit, actual, expected ?? '', shrinkage, recount.comments?.[item.id] || ''])
    })

    rows.push([])
    rows.push(['Приход за месяц'])
    rows.push(['Дата', 'Продукт', 'Кол-во', 'Комментарий'])
    purchases
      .filter((p) => monthKey(parseLocalDate(p.date)) === currentMonth)
      .forEach((p) => {
        const product = recountCatalog.find((pr) => String(pr.id) === String(p.productId))
        rows.push([p.date, product?.name || '?', p.qty, p.comment || ''])
      })

    rows.push([])
    rows.push(['Расход по рецептам за месяц'])
    rows.push(['Дата', 'Рецепт', 'Раз'])
    productions
      .filter((p) => monthKey(parseLocalDate(p.date)) === currentMonth)
      .forEach((p) => {
        const recipe = recipes.find((r) => String(r.id) === String(p.recipeId))
        rows.push([p.date, recipe?.name || '?', p.qty])
      })

    rows.push([])
    rows.push(['Списания за месяц'])
    rows.push(['Дата', 'Товар', 'Причина', 'Кто'])
    items
      .filter((i) => i.status === 'disposal' && i.wasteDate && monthKey(parseLocalDate(i.wasteDate)) === currentMonth)
      .forEach((i) => {
        rows.push([i.wasteDate, i.name, wasteReasonLabel(i.wasteReason), i.wasteBy || ''])
      })

    downloadCsv(`Отчёт_${currentMonth}.csv`, rows)
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
            tab === 'fifo' ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          <PackageSearch size={16} /> FIFO
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            tab === 'audit' ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          <ClipboardCheck size={16} /> Проверка
        </button>
        <button
          onClick={() => setTab('recount')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            tab === 'recount' ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          <ClipboardList size={16} /> Переучёт
        </button>
        <button
          onClick={() => setTab('movements')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            tab === 'movements' ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          <ArrowRightLeft size={16} /> Приход/Расход
        </button>
        <button
          onClick={() => setTab('balance')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            tab === 'balance' ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          <Scale size={16} /> Остатки
        </button>
        <button
          onClick={() => setTab('catalog')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            tab === 'catalog' ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          <Tags size={16} /> Каталог
        </button>
      </div>

      {(tab === 'audit' || tab === 'recount') && (
        <div className="flex items-center justify-between mb-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 px-2 py-2 shadow-sm">
          <button onClick={() => setMonthOffset((o) => o - 1)} className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100">
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{monthLabel}</p>
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
                  type="text"
                  inputMode="numeric"
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
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{item.name}</p>
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
                          onClick={() =>
                            a.key === 'disposal' ? setDisposalPromptId(item.id) : setItemStatus(item.id, a.key)
                          }
                          className={`flex-1 min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1 border ${
                            item.status === a.key
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {a.key === 'freezing' && <Snowflake size={14} />}
                          {a.key === 'storage' && <Archive size={14} />}
                          {a.key === 'disposal' && <Trash size={14} />}
                          {a.label}
                        </button>
                      ))}
                    </div>
                    {disposalPromptId === item.id && (
                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-semibold text-slate-500">Причина списания:</p>
                          <button onClick={() => setDisposalPromptId(null)} className="text-slate-400">
                            <X size={16} />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {WASTE_REASONS.map((r) => (
                            <button
                              key={r.key}
                              onClick={() => confirmDisposal(item.id, r.key)}
                              className="min-h-[32px] px-2.5 rounded-lg text-xs font-semibold bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 active:bg-red-100"
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>

          {wasteLog.length > 0 && (
            <Section title={`Журнал списаний (${wasteLog.length})`} icon={Trash}>
              <div className="flex flex-col gap-2">
                {wasteLog.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{item.name}</p>
                      <p className="text-xs text-slate-400">
                        {wasteReasonLabel(item.wasteReason)}
                        {item.wasteDate && ` · ${formatRu(parseLocalDate(item.wasteDate))}`}
                        {item.wasteBy && ` · ${item.wasteBy}`}
                      </p>
                    </div>
                    <ConfirmDeleteButton onConfirm={() => removeItem(item.id)} />
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {tab === 'audit' && (
        <>
          <div className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-3 mb-4 shadow-sm">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Проверка зон — {monthLabel}</p>
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
          <div className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-3 mb-2 shadow-sm">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Переучёт — {monthLabel}</p>
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

          <Field label="Кто вносил переучёт">
            <input
              className={inputClass}
              placeholder="Имя"
              value={recount.enteredBy ?? staffName}
              onChange={(e) => setRecountEnteredBy(e.target.value)}
            />
          </Field>

          <div className="flex flex-wrap gap-2 mb-4">
            <PrintButton onClick={() => printRecount(true)} label="Пустой бланк" />
            <PrintButton onClick={() => printRecount(false)} label="С текущими данными" />
            <button
              onClick={exportMonthCsv}
              className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-slate-100 dark:bg-slate-700 active:bg-slate-200 text-slate-600 dark:text-slate-300 text-xs font-semibold"
            >
              <Download size={15} /> Экспорт за месяц (CSV)
            </button>
          </div>

          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              className={inputClass + ' pl-9 scroll-mt-24'}
              placeholder="Поиск по названию…"
              value={recountSearch}
              onChange={(e) => setRecountSearch(e.target.value)}
              onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)}
            />
          </div>

          {INVENTORY_AUDIT_ZONES.map((zone) => {
            const zoneItems = recountCatalog.filter((i) => i.zone === zone.key && matchesSearch(i.name, recountSearch))
            if (zoneItems.length === 0) return null
            return (
              <Section key={zone.key} title={zone.label}>
                <div className="flex flex-col gap-2">
                  {zoneItems.map((item) => {
                    const curQty = recount.qty[item.id]
                    const actual = curQty !== undefined && curQty !== '' ? Number(curQty) : null
                    const { balance: expected } = computeBalance(
                      item.id,
                      { recounts: recountsExcludingCurrent, purchases, productions, recipes },
                      recountAsOfDate
                    )
                    const shrinkage = expected !== null && actual !== null ? actual - expected : null
                    const hasComment = !!recount.comments?.[item.id]
                    const commentOpen = openRecountComment === item.id
                    return (
                      <div key={item.id} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{item.name}</p>
                            <p className="text-xs text-slate-400">
                              {item.unit}
                              {expected !== null && ` · ожидалось ${expected}`}
                              {shrinkage !== null && shrinkage !== 0 && (
                                <span className={shrinkage > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                  {' '}({shrinkage > 0 ? '+' : ''}{shrinkage}{shrinkage < 0 ? ' недостача' : ' излишек'})
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="w-20 shrink-0">
                            <input
                              type="text"
                              inputMode="decimal"
                              className={inputClass + ' text-center'}
                              value={curQty ?? ''}
                              onChange={(e) => setQty(item.id, sanitizeDecimal(e.target.value))}
                              placeholder="0"
                            />
                          </div>
                          <button
                            onClick={() => setOpenRecountComment(commentOpen ? null : item.id)}
                            className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg ${
                              hasComment ? 'text-orange-600' : 'text-slate-400 dark:text-slate-500'
                            }`}
                            title="Комментарий"
                          >
                            <MessageSquare size={16} />
                          </button>
                          <ConfirmDeleteButton onConfirm={() => removeCatalogItem(item.id)} />
                        </div>
                        {commentOpen && (
                          <textarea
                            className={inputClass + ' mt-2 h-16 py-2 text-sm'}
                            placeholder="Комментарий (например: недостача из-за банкета)"
                            value={recount.comments?.[item.id] || ''}
                            onChange={(e) => setRecountComment(item.id, e.target.value)}
                            autoFocus
                          />
                        )}
                        {!commentOpen && hasComment && (
                          <p className="text-xs text-orange-600 mt-1.5">💬 {recount.comments[item.id]}</p>
                        )}
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
          {recountCatalog.length > 0 && recountSearch.trim() && !recountCatalog.some((i) => matchesSearch(i.name, recountSearch)) && (
            <p className="text-sm text-slate-400 text-center py-3">Ничего не найдено</p>
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
                    className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500"
                  >
                    <X size={18} />
                  </button>
                </div>
              </>
            )}
            {catalogImportResult && (
              <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mt-2">
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
              <button
                onClick={exportCatalog}
                className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-slate-100 dark:bg-slate-700 active:bg-slate-200 text-slate-600 dark:text-slate-300 text-xs font-semibold"
              >
                <Download size={15} /> Экспорт
              </button>
            }
          >
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                className={inputClass + ' pl-9 scroll-mt-24'}
                placeholder="Поиск по названию…"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)}
              />
            </div>
            <div className="flex gap-1.5 mb-3">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setCatalogSort(opt.key)}
                  className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold ${
                    catalogSort === opt.key ? 'bg-slate-800 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {recountCatalog.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-3">Каталог пуст</p>
            )}
            {recountCatalog.length > 0 && catalogSearch.trim() && !recountCatalog.some((i) => matchesSearch(i.name, catalogSearch)) && (
              <p className="text-sm text-slate-400 text-center py-3">Ничего не найдено</p>
            )}
            <div className="flex flex-col gap-2">
              {sortedCatalog.filter((item) => matchesSearch(item.name, catalogSearch)).map((item) => (
                <div
                  key={item.id}
                  id={`catalog-item-${item.id}`}
                  className={`rounded-xl border px-2 py-2 ${
                    item.id === highlightCatalogId
                      ? 'border-orange-400 ring-2 ring-orange-300 dark:ring-orange-700'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
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
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs text-slate-400 shrink-0">Мин. остаток для подсветки:</span>
                    <div className="w-16 shrink-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        className={inputClass + ' text-xs text-center px-1'}
                        value={item.minQty ?? ''}
                        placeholder="—"
                        onChange={(e) => updateCatalogItem(item.id, { minQty: sanitizeDecimal(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 shrink-0">Цена за {item.unit || 'ед.'}:</span>
                    <div className="w-16 shrink-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        className={inputClass + ' text-xs text-center px-1'}
                        value={item.costPerUnit ?? ''}
                        placeholder="—"
                        onChange={(e) => updateCatalogItem(item.id, { costPerUnit: sanitizeDecimal(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {tab === 'movements' && (
        <>
          <Section
            title="Приход (закупка)"
            icon={ShoppingCart}
            right={<PrintButton onClick={printPurchaseLog} label="Печать" />}
          >
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
                  type="text"
                  inputMode="decimal"
                  className={inputClass}
                  placeholder="Кол-во"
                  value={purchaseForm.qty}
                  onChange={(e) => setPurchaseForm((f) => ({ ...f, qty: sanitizeDecimal(e.target.value) }))}
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
              <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 mt-2">
                {purchaseError}
              </p>
            )}

            {purchases.slice(0, 8).map((p) => {
              const product = recountCatalog.find((pr) => pr.id === Number(p.productId) || pr.id === p.productId)
              const hasComment = !!p.comment
              const commentOpen = openPurchaseComment === p.id
              return (
                <div key={p.id} className="py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700 dark:text-slate-200">
                      {product?.name || '?'} <span className="text-slate-400">+{p.qty} {product?.unit}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">{formatRu(parseLocalDate(p.date))}</span>
                      <button
                        onClick={() => setOpenPurchaseComment(commentOpen ? null : p.id)}
                        className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg ${
                          hasComment ? 'text-orange-600' : 'text-slate-400 dark:text-slate-500'
                        }`}
                        title="Комментарий"
                      >
                        <MessageSquare size={14} />
                      </button>
                      <ConfirmDeleteButton onConfirm={() => removePurchase(p.id)} size="w-8 h-8" iconSize={14} />
                    </div>
                  </div>
                  {commentOpen && (
                    <textarea
                      className={inputClass + ' mt-1.5 h-14 py-2 text-sm'}
                      placeholder="Комментарий"
                      value={p.comment || ''}
                      onChange={(e) => setPurchaseComment(p.id, e.target.value)}
                      autoFocus
                    />
                  )}
                  {!commentOpen && hasComment && (
                    <p className="text-xs text-orange-600 mt-1">💬 {p.comment}</p>
                  )}
                </div>
              )
            })}
          </Section>

          <Section
            title="Импорт прихода из Google Таблиц"
            icon={Upload}
            right={
              <button onClick={() => setShowPurchaseImport((v) => !v)} className="text-xs font-semibold text-orange-600">
                {showPurchaseImport ? 'Скрыть' : 'Показать'}
              </button>
            }
          >
            {showPurchaseImport && (
              <>
                <p className="text-xs text-slate-500 mb-2">
                  Столбцы: <b>Продукт, Кол-во, [Дата]</b> — по одной строке на позицию прихода.
                  Дата необязательна (без неё — сегодняшняя). Выделите в Google Таблице → Ctrl+C → вставьте сюда.
                </p>
                <textarea
                  className={inputClass + ' h-28 py-2'}
                  placeholder={'Куриное филе\t10\t28.07.2026\nКартофель\t25'}
                  value={purchaseImportText}
                  onChange={(e) => setPurchaseImportText(e.target.value)}
                />
                {purchaseImportMissingPrompt && (
                  <div className="text-sm bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-xl px-3 py-3 mt-2 mb-2">
                    <p className="text-orange-800 dark:text-orange-200 mb-2">
                      Продукт «{purchaseImportMissingPrompt}» не найден в номенклатуре. Добавить его в каталог?
                    </p>
                    <div className="flex gap-2">
                      <BigButton onClick={confirmAddPurchaseImportProduct} full={false}>Да, добавить</BigButton>
                      <BigButton onClick={declinePurchaseImportProduct} color="outline" full={false}>Нет</BigButton>
                    </div>
                  </div>
                )}
                <BigButton onClick={runPurchaseImport} icon={Upload} disabled={!purchaseImportText.trim()}>
                  Импортировать приход
                </BigButton>
                {purchaseImportResult && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mt-2">
                    {purchaseImportResult}
                  </p>
                )}
              </>
            )}
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
                  type="text"
                  inputMode="decimal"
                  className={inputClass}
                  placeholder="Раз"
                  value={productionForm.qty}
                  onChange={(e) => setProductionForm((f) => ({ ...f, qty: sanitizeDecimal(e.target.value) }))}
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
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    {recipe?.name || '?'} <span className="text-slate-400">× {p.qty}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{formatRu(parseLocalDate(p.date))}</span>
                    <ConfirmDeleteButton onConfirm={() => removeProduction(p.id)} size="w-8 h-8" iconSize={14} />
                  </div>
                </div>
              )
            })}

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Добавить из меню за период
              </p>
              <p className="text-xs text-slate-400 mb-2">
                Для каждого блюда из меню за выбранные даты, у которого есть рецепт с таким же
                названием, добавит запись расхода (количество — из поля «Кол-во» в меню, если указано).
              </p>
              <div className="flex gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <input type="date" className={inputClass} value={menuRangeFrom} onChange={(e) => setMenuRangeFrom(e.target.value)} />
                </div>
                <div className="flex-1 min-w-0">
                  <input type="date" className={inputClass} value={menuRangeTo} onChange={(e) => setMenuRangeTo(e.target.value)} />
                </div>
              </div>
              <BigButton onClick={() => addProductionsFromMenu(menuRangeFrom, menuRangeTo)} icon={Calendar}>
                Добавить из меню
              </BigButton>
              {menuImportResult && (
                <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mt-2">
                  {menuImportResult}
                </p>
              )}
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

          <Section title="Текущие остатки" icon={Scale}>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                className={inputClass + ' pl-9 scroll-mt-24'}
                placeholder="Поиск по названию…"
                value={balanceSearch}
                onChange={(e) => setBalanceSearch(e.target.value)}
                onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)}
              />
            </div>
            <div className="flex gap-1.5 mb-3">
              {[...SORT_OPTIONS, { key: 'qty', label: 'Кол-во' }].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setBalanceSort(opt.key)}
                  className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold ${
                    balanceSort === opt.key ? 'bg-slate-800 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {balances.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-3">Каталог пуст — добавьте товары во вкладке «Каталог»</p>
            )}
            {balances.length > 0 && balanceSearch.trim() && !balances.some((row) => matchesSearch(row.product.name, balanceSearch)) && (
              <p className="text-sm text-slate-400 text-center py-3">Ничего не найдено</p>
            )}
            <div className="flex flex-col gap-2">
              {sortedBalances.filter((row) => matchesSearch(row.product.name, balanceSearch)).map((row) => {
                const { product, balance, baselineDate } = row
                const low = isLowStock(row)
                const alreadyPlanned = !!findPlannedByProduct(product.id)
                return (
                  <div
                    key={product.id}
                    className={`rounded-xl border-2 px-3 py-2 ${low ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30' : 'border-slate-200 dark:border-slate-700'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{product.name}</p>
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
