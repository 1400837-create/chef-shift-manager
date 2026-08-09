import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, PackageSearch, ClipboardCheck, Snowflake, Archive, Trash, Trash2,
  ClipboardList, Upload, X, ChevronLeft, ChevronRight, Scale, Check,
  ShoppingCart, Flame, Tags, Download, Calendar,
  ArrowRightLeft, ClipboardPlus, MessageSquare, AlertTriangle,
} from 'lucide-react'
import { Section, Field, inputClass, Badge, CheckRow, BigButton, PrintButton, ConfirmDeleteButton, SearchField } from '../components/UI'
import { LEFTOVER_ACTIONS, INVENTORY_AUDIT_ZONES, DEFAULT_NOMENCLATURE, PRODUCT_CATEGORIES, WASTE_REASONS } from '../utils/constants'
import { addDays, addMonths, daysBetween, formatRu, monthKey, MONTHS_RU, parseLocalDate, startOfDay, todayKey, toKey } from '../utils/dateUtils'
import { parseRecountCatalogImport, parsePurchaseImport } from '../utils/importParsers'
import { printReport } from '../utils/printReport'
import { computeBalance } from '../utils/stockBalance'
import { sanitizeDecimal } from '../utils/number'
import { downloadCsv } from '../utils/csv'
import { uid } from '../utils/id'
import { coursesForDay, extractQtyNumber } from '../utils/menuCourses'

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
  recipes, setRecipes, purchases, setPurchases, productions, setProductions,
  catalogWaste, setCatalogWaste,
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
  const [catalogSelectMode, setCatalogSelectMode] = useState(false)
  const [selectedCatalogIds, setSelectedCatalogIds] = useState(() => new Set())
  const [balanceSort, setBalanceSort] = useState('alpha')
  const [unitAuditResult, setUnitAuditResult] = useState(null)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [recountSearch, setRecountSearch] = useState('')
  const [balanceSearch, setBalanceSearch] = useState('')
  // Search inputs scroll themselves into view shortly after focus so the
  // on-screen keyboard doesn't cover them. If the user starts typing before
  // that timer fires, the mid-typing smooth-scroll can desync a mobile
  // keyboard's composing text from React's state (box keeps showing what was
  // typed, but the app never sees it) — so cancel it the moment typing starts.
  const searchScrollTimeout = useRef(null)
  function handleSearchFocus(e) {
    const target = e.target
    clearTimeout(searchScrollTimeout.current)
    searchScrollTimeout.current = setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  }
  function cancelSearchScroll() {
    clearTimeout(searchScrollTimeout.current)
  }

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
  const [usageForm, setUsageForm] = useState({ productName: '', qty: '', date: todayKey() })
  const [usageError, setUsageError] = useState(null)
  const [openRecountComment, setOpenRecountComment] = useState(null)
  const [openPurchaseComment, setOpenPurchaseComment] = useState(null)
  const [wasteForm, setWasteForm] = useState({ productName: '', qty: '', date: todayKey() })
  const [wasteError, setWasteError] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const [menuRangeFrom, setMenuRangeFrom] = useState(todayKey())
  const [menuRangeTo, setMenuRangeTo] = useState(todayKey())
  const [menuImportResult, setMenuImportResult] = useState(null)
  // Приход/Расход logs default to the last 8 entries so the page doesn't
  // load with a huge scroll — these let the user expand to the full list.
  const [showAllPurchases, setShowAllPurchases] = useState(false)
  const [showAllProductions, setShowAllProductions] = useState(false)
  const [showAllUsage, setShowAllUsage] = useState(false)
  const [showAllWaste, setShowAllWaste] = useState(false)

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

  function monthKeyLabel(mk) {
    const [y, m] = mk.split('-').map(Number)
    return `${MONTHS_RU[m - 1]} ${y}`
  }

  // Недостачи/излишки history across every recount ever entered — not a
  // separate stored log, just recomputed from data that's already kept
  // forever (recounts/purchases/productions), so it can't go stale or
  // duplicate the source of truth. Same per-item "ожидалось" logic as the
  // live Переучёт tab, just run for every past (month, product) pair with a
  // filled-in count instead of only the currently viewed month.
  const shrinkageLog = useMemo(() => {
    const entries = []
    Object.keys(recounts).sort().forEach((mk) => {
      const r = recounts[mk]
      if (!r?.qty) return
      const recountsExcludingThis = { ...recounts }
      delete recountsExcludingThis[mk]
      recountCatalog.forEach((item) => {
        const curQty = r.qty[item.id]
        if (curQty === undefined || curQty === '') return
        const actual = Number(curQty) || 0
        const dateStr = r.countedAt || `${mk}-01`
        const itemInstant = r.qtyTimestamps?.[item.id] ?? parseLocalDate(dateStr).getTime()
        const { balance: expected } = computeBalance(
          item.id,
          { recounts: recountsExcludingThis, purchases, productions, recipes, waste: catalogWaste },
          new Date(itemInstant)
        )
        if (expected === null) return
        const shrinkage = actual - expected
        if (shrinkage === 0) return
        entries.push({
          id: `${mk}-${item.id}`,
          monthLabel: monthKeyLabel(mk),
          date: dateStr,
          productName: item.name,
          unit: item.unit,
          expected,
          actual,
          shrinkage,
          comment: r.comments?.[item.id] || '',
        })
      })
    })
    return entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recounts, recountCatalog, purchases, productions, recipes, catalogWaste])

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

  function toggleCatalogSelect(id) {
    setSelectedCatalogIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllCatalog(visibleItems) {
    setSelectedCatalogIds(new Set(visibleItems.map((i) => i.id)))
  }

  function exitCatalogSelectMode() {
    setCatalogSelectMode(false)
    setSelectedCatalogIds(new Set())
  }

  // recountCatalog is part of the shared inventoryHistory undo/redo group, so
  // a bulk delete isn't a dead end — the confirm here is a lighter one-shot
  // (not the per-row two-tap ConfirmDeleteButton) since "Отменить" up top
  // already covers accidentally deleting the wrong batch.
  function deleteSelectedCatalog() {
    if (selectedCatalogIds.size === 0) return
    if (!window.confirm(`Удалить выбранные позиции из каталога (${selectedCatalogIds.size})?`)) return
    setRecountCatalog((prev) => prev.filter((i) => !selectedCatalogIds.has(i.id)))
    exitCatalogSelectMode()
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

  // Temporary diagnostic for the "search shows unrelated items" report —
  // checks whether recountCatalog has duplicate ids (would confuse React's
  // key-based list reconciliation) or other data anomalies not visible from
  // the exported name/unit/zone/category columns alone.
  function runCatalogDiagnostics() {
    const idCounts = new Map()
    recountCatalog.forEach((i) => idCounts.set(i.id, (idCounts.get(i.id) || 0) + 1))
    const dupIds = [...idCounts.entries()].filter(([, c]) => c > 1)

    const nameCounts = new Map()
    recountCatalog.forEach((i) => {
      const key = (i.name || '').trim().toLowerCase()
      nameCounts.set(key, (nameCounts.get(key) || 0) + 1)
    })
    const dupNames = [...nameCounts.entries()].filter(([, c]) => c > 1)

    const lines = [
      `Всего товаров: ${recountCatalog.length}`,
      `Повторяющихся ID: ${dupIds.length} (затронуто товаров: ${dupIds.reduce((s, [, c]) => s + c, 0)})`,
      `Повторяющихся названий: ${dupNames.length}`,
    ]
    if (dupIds.length) {
      lines.push('', 'Примеры повторных ID:')
      dupIds.slice(0, 6).forEach(([id, c]) => {
        const names = recountCatalog.filter((i) => i.id === id).map((i) => i.name).join(' | ')
        lines.push(`ID ${id} (×${c}): ${names}`)
      })
    }
    alert(lines.join('\n'))

    if (dupIds.length) {
      const proceed = window.confirm(
        `Исправить повторяющиеся ID сейчас? Каждому товару, кроме первого с таким ID, будет присвоен новый уникальный ID.\n\n` +
        `Важно: история переучётов/прихода/расхода для товаров, у которых ID изменится, была привязана к общему (ошибочному) ID и не сможет однозначно разделиться между задвоенными товарами — она останется у первого из них, а у переименованного товара учёт по факту начнётся заново. Названия и текущие настройки (зона, рубрика, мин. остаток, цена) не пострадают.`
      )
      if (proceed) fixDuplicateCatalogIds(dupIds)
    }
  }

  function fixDuplicateCatalogIds(dupIds) {
    const idsToRenumber = new Set(dupIds.map(([id]) => id))
    const seenOnce = new Set()
    let fixed = 0
    setRecountCatalog((prev) =>
      prev.map((item) => {
        if (!idsToRenumber.has(item.id)) return item
        if (!seenOnce.has(item.id)) {
          seenOnce.add(item.id)
          return item
        }
        fixed += 1
        return { ...item, id: uid() }
      })
    )
    alert(`Готово. Новые ID присвоены: ${dupIds.reduce((s, [, c]) => s + c, 0) - dupIds.length} товар(ам).`)
  }

  // Unit unification (г/мл everywhere) — first step is just visibility:
  // group every catalog item whose unit isn't already г/мл, so the user can
  // see the real scope before deciding how to handle each unit (кг/л are a
  // safe automatic ×1000, but шт/пучок/банка/etc. need a real per-product
  // weight only the user can supply — no guessing that here).
  function runUnitAudit() {
    const alreadyFine = new Set(['г', 'мл'])
    const groups = new Map()
    recountCatalog.forEach((item) => {
      const unit = (item.unit || '').trim()
      const key = unit.toLowerCase()
      if (alreadyFine.has(key)) return
      if (!groups.has(unit)) groups.set(unit, [])
      groups.get(unit).push(item.name || '?')
    })
    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
    setUnitAuditResult(sorted)
  }

  // Automatic half of the г/мл unification — кг→г and л→мл are a pure,
  // lossless ×1000 (no real-world weight/volume to guess, unlike
  // шт/пучок/банка/etc.), but "pure" still means touching every place a
  // quantity for that product is stored: the catalog's own minQty/costPerUnit,
  // every переучёт, приход, расход, списание, and every recipe ingredient
  // that references it — a partial conversion (e.g. catalog only) would
  // silently break every balance calculation downstream.
  function runAutoUnitConversion() {
    const factorMap = new Map()
    recountCatalog.forEach((item) => {
      const u = (item.unit || '').trim().toLowerCase()
      if (u === 'кг') factorMap.set(String(item.id), { factor: 1000, newUnit: 'г' })
      else if (u === 'л') factorMap.set(String(item.id), { factor: 1000, newUnit: 'мл' })
    })
    if (factorMap.size === 0) {
      alert('Товаров в «кг» или «л» не найдено — конвертировать нечего.')
      return
    }
    const proceed = window.confirm(
      `Конвертировать ${factorMap.size} товар(ов) из кг→г и л→мл?\n\n` +
      `Пересчитается вся история по этим товарам — остатки, переучёты, приход, расход, списания и ингредиенты в рецептах: количества умножатся на 1000, а цена за единицу поделится на 1000.\n\n` +
      `Рекомендую сначала сделать резервную копию (Дашборд → «Скачать копию (JSON)»).`
    )
    if (!proceed) return

    setRecountCatalog((prev) => prev.map((item) => {
      const conv = factorMap.get(String(item.id))
      if (!conv) return item
      return {
        ...item,
        unit: conv.newUnit,
        minQty: item.minQty !== undefined && item.minQty !== '' ? String((Number(item.minQty) || 0) * conv.factor) : item.minQty,
        costPerUnit: item.costPerUnit !== undefined && item.costPerUnit !== '' ? String((Number(item.costPerUnit) || 0) / conv.factor) : item.costPerUnit,
      }
    }))

    setRecounts((prev) => {
      const next = {}
      Object.entries(prev).forEach(([mk, r]) => {
        const newQty = { ...(r.qty || {}) }
        let changed = false
        Object.keys(newQty).forEach((pid) => {
          const conv = factorMap.get(String(pid))
          if (conv && newQty[pid] !== undefined && newQty[pid] !== '') {
            newQty[pid] = String((Number(newQty[pid]) || 0) * conv.factor)
            changed = true
          }
        })
        next[mk] = changed ? { ...r, qty: newQty } : r
      })
      return next
    })

    setPurchases((prev) => prev.map((p) => {
      const conv = factorMap.get(String(p.productId))
      if (!conv) return p
      return { ...p, qty: String((Number(p.qty) || 0) * conv.factor) }
    }))

    setProductions((prev) => prev.map((p) => {
      if (p.productId == null) return p
      const conv = factorMap.get(String(p.productId))
      if (!conv) return p
      return { ...p, qty: String((Number(p.qty) || 0) * conv.factor) }
    }))

    setCatalogWaste((prev) => prev.map((w) => {
      const conv = factorMap.get(String(w.productId))
      if (!conv) return w
      return { ...w, qty: String((Number(w.qty) || 0) * conv.factor) }
    }))

    setRecipes((prev) => prev.map((r) => ({
      ...r,
      ingredients: (r.ingredients || []).map((ing) => {
        const conv = factorMap.get(String(ing.productId))
        if (!conv) return ing
        return { ...ing, qty: String((Number(ing.qty) || 0) * conv.factor) }
      }),
    })))

    alert(`Готово: ${factorMap.size} товар(ов) переведено в г/мл вместе со всей историей и рецептами.`)
    setUnitAuditResult(null)
  }

  // A handful of catalog items are recorded in "шт" but are actually liquids
  // (растительное масло, лимонный сок, бульон, вода) — clear naming
  // anomalies, not real count-based items like яйца or хлеб. Unlike кг→г/л→мл
  // there is no reliable "1 шт = X мл" factor here, so this only relabels the
  // unit going forward; it deliberately does NOT rescale any existing
  // quantities, since guessing a factor could silently corrupt real data.
  const LIQUID_UNIT_ANOMALIES = new Set([
    'масло растительное', 'сок лимонный', 'бульон', 'бульон / вода', 'вода',
  ])
  function runLiquidAnomalyFix() {
    const matches = recountCatalog.filter((item) => {
      const unit = (item.unit || '').trim().toLowerCase()
      if (unit === 'мл' || unit === 'л') return false
      return LIQUID_UNIT_ANOMALIES.has((item.name || '').trim().toLowerCase())
    })
    if (matches.length === 0) {
      alert('Явных аномалий (масло/сок/бульон/вода в «шт») не найдено.')
      return
    }
    const proceed = window.confirm(
      `Переименовать единицу в «мл» для ${matches.length} товар(ов): ${matches.map((m) => m.name).join(', ')}?\n\n` +
      `Количества (мин. остаток, история) НЕ будут пересчитаны — надёжного коэффициента «шт → мл» нет. Проверьте и при необходимости поправьте эти значения вручную после.`
    )
    if (!proceed) return
    const ids = new Set(matches.map((m) => String(m.id)))
    setRecountCatalog((prev) => prev.map((item) => (
      ids.has(String(item.id)) ? { ...item, unit: 'мл' } : item
    )))
    alert(`Готово: единица изменена на «мл» для ${matches.length} товар(ов).`)
    setUnitAuditResult(null)
  }

  function importCatalog() {
    const { items: parsed, skipped } = parseRecountCatalogImport(catalogImportText)
    const existingNames = new Set(recountCatalog.map((i) => (i.name || '').trim().toLowerCase()))
    const toAdd = []
    parsed.forEach((p) => {
      const key = p.name.toLowerCase()
      if (existingNames.has(key)) return
      existingNames.add(key)
      toAdd.push({ id: uid(), ...p })
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
      [currentMonth]: {
        ...(prev[currentMonth] || { qty: {}, verifiedWithLead: false }),
        qty: { ...(prev[currentMonth]?.qty || {}), [itemId]: value },
        // Per-item entry moment, not just the shared "Дата подсчёта" — lets a
        // recount session spanning hours (or days) order correctly against
        // purchases/consumption logged partway through it.
        qtyTimestamps: { ...(prev[currentMonth]?.qtyTimestamps || {}), [itemId]: Date.now() },
      },
    }))
  }

  // computeBalance treats an unfilled qty (undefined/'') as "no baseline at
  // all" — приход for that product then has nothing to add to and never
  // shows up in Остатки, even with purchases logged. Filling every still-
  // empty item with an explicit "0" gives each one a real baseline (0 is a
  // valid count, unlike blank) without touching anything already entered —
  // including a product someone already counted as genuinely 0.
  function fillActiveZeros() {
    const missing = recountCatalog.filter((i) => recount.qty[i.id] === undefined || recount.qty[i.id] === '')
    if (missing.length === 0) {
      alert('Все товары уже заполнены — нечего дозаполнять нулями.')
      return
    }
    const proceed = window.confirm(
      `Заполнить нулём ${missing.length} ещё не заполненных товар(ов) в переучёте за ${monthLabel}?\n\n` +
      `Это создаст им точку отсчёта, от которой начнёт считаться приход/расход. Уже заполненные товары (в т.ч. настоящие нули) не тронутся.`
    )
    if (!proceed) return
    const now2 = Date.now()
    setRecounts((prev) => {
      const monthData = prev[currentMonth] || { qty: {}, verifiedWithLead: false }
      const nextQty = { ...monthData.qty }
      const nextTimestamps = { ...(monthData.qtyTimestamps || {}) }
      missing.forEach((i) => {
        nextQty[i.id] = '0'
        nextTimestamps[i.id] = now2
      })
      return { ...prev, [currentMonth]: { ...monthData, qty: nextQty, qtyTimestamps: nextTimestamps } }
    })
    alert(`Готово: ${missing.length} товар(ов) заполнено нулём.`)
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

  // Списание с причиной, tied to a Каталог product (unlike the FIFO waste
  // log, which tracks batches by name only) — counts as an outflow in
  // computeBalance just like recipe consumption, so a documented write-off
  // is what turns an "unexplained" недостача in the shrinkage report back
  // to zero instead of just noting it in a comment.
  function addCatalogWaste(reasonKey) {
    const product = findProductByName(wasteForm.productName)
    if (!product) {
      setWasteError('Товар не найден в каталоге — выберите вариант из подсказок.')
      return
    }
    if (!wasteForm.qty) {
      setWasteError('Укажите количество.')
      return
    }
    setWasteError(null)
    setCatalogWaste((prev) => [
      { id: uid(), productId: product.id, qty: wasteForm.qty, reason: reasonKey, date: wasteForm.date, enteredAt: Date.now(), by: staffName || undefined },
      ...prev,
    ])
    setWasteForm({ productName: '', qty: '', date: todayKey() })
  }

  function removeCatalogWaste(id) {
    setCatalogWaste((prev) => prev.filter((w) => w.id !== id))
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
    return recountCatalog.find((p) => (p.name || '').trim().toLowerCase() === key) || null
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
      { id: Date.now(), productId: product.id, qty: purchaseForm.qty, date: purchaseForm.date, enteredAt: Date.now() },
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
        id: uid(),
        productId: product.id,
        qty: item.qty,
        date: item.date || todayKey(),
        enteredAt: Date.now(),
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
      { id: Date.now(), recipeId: productionForm.recipeId, qty: productionForm.qty, date: productionForm.date, enteredAt: Date.now() },
      ...prev,
    ])
    setProductionForm({ recipeId: '', qty: '1', date: todayKey() })
  }

  // Расход товара напрямую, без рецепта — same `productions` array/history
  // as recipe-based расход (an entry just has productId instead of
  // recipeId), so it shares the same undo/redo stack and balance math.
  function addProductUsage() {
    const product = findProductByName(usageForm.productName)
    if (!product) {
      setUsageError('Товар не найден в каталоге — выберите вариант из подсказок.')
      return
    }
    if (!usageForm.qty) {
      setUsageError('Укажите количество.')
      return
    }
    setUsageError(null)
    setProductions((prev) => [
      { id: Date.now(), productId: product.id, qty: usageForm.qty, date: usageForm.date, enteredAt: Date.now() },
      ...prev,
    ])
    setUsageForm({ productName: '', qty: '', date: todayKey() })
  }

  function removeProduction(id) {
    setProductions((prev) => prev.filter((p) => p.id !== id))
  }

  function findRecipeByName(name) {
    const key = (name || '').trim().toLowerCase()
    if (!key) return null
    return recipes.find((r) => (r.name || '').trim().toLowerCase() === key) || null
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
              id: uid(),
              recipeId: recipe.id,
              qty: extractQtyNumber(c.qty),
              date: toKey(cursor),
              enteredAt: Date.now(),
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
      const itemAsOf = new Date(recount.qtyTimestamps?.[item.id] ?? recountAsOfDate.getTime())
      const { balance: expected } = computeBalance(
        item.id,
        { recounts: recountsExcludingCurrent, purchases, productions, recipes, waste: catalogWaste },
        itemAsOf
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
      .filter((p) => p.recipeId && monthKey(parseLocalDate(p.date)) === currentMonth)
      .forEach((p) => {
        const recipe = recipes.find((r) => String(r.id) === String(p.recipeId))
        rows.push([p.date, recipe?.name || '?', p.qty])
      })

    rows.push([])
    rows.push(['Расход товара без рецепта за месяц'])
    rows.push(['Дата', 'Товар', 'Кол-во'])
    productions
      .filter((p) => !p.recipeId && p.productId != null && monthKey(parseLocalDate(p.date)) === currentMonth)
      .forEach((p) => {
        const product = recountCatalog.find((pr) => String(pr.id) === String(p.productId))
        rows.push([p.date, product?.name || '?', p.qty])
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

  function exportShrinkageLogCsv() {
    const rows = [['Месяц', 'Дата', 'Товар', 'Ед.', 'Ожидалось', 'Факт', 'Расхождение', 'Комментарий']]
    shrinkageLog.forEach((row) => {
      rows.push([row.monthLabel, row.date, row.productName, row.unit, row.expected, row.actual, row.shrinkage, row.comment])
    })
    downloadCsv('Журнал_недостач.csv', rows)
  }

  const catalogTotal = recountCatalog.length
  const catalogFilled = recountCatalog.filter((i) => recount.qty[i.id] !== undefined && recount.qty[i.id] !== '').length

  const balances = useMemo(() => {
    return recountCatalog.map((product) => ({
      product,
      ...computeBalance(product.id, { recounts, purchases, productions, recipes, waste: catalogWaste }, now),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recountCatalog, recounts, purchases, productions, recipes, catalogWaste])

  function sortByKey(list, sortKey, getName) {
    // getName reads straight off stored items, which can predate a validation
    // fix or come from a hand-edited import — a missing/undefined name here
    // must not throw, or the whole tab (not just sorting) goes blank.
    const safeName = (item) => getName(item) || ''
    const copy = [...list]
    if (sortKey === 'alpha') {
      copy.sort((a, b) => safeName(a).localeCompare(safeName(b), 'ru'))
    } else if (sortKey === 'zone') {
      copy.sort((a, b) => zoneLabel(a.zone).localeCompare(zoneLabel(b.zone), 'ru') || safeName(a).localeCompare(safeName(b), 'ru'))
    } else if (sortKey === 'category') {
      copy.sort((a, b) => categoryLabel(a.category).localeCompare(categoryLabel(b.category), 'ru') || safeName(a).localeCompare(safeName(b), 'ru'))
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

      {(tab === 'audit' || tab === 'recount' || tab === 'movements') && (
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
            <button
              onClick={fillActiveZeros}
              className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-slate-100 dark:bg-slate-700 active:bg-slate-200 text-slate-600 dark:text-slate-300 text-xs font-semibold"
            >
              Заполнить пустые нулями
            </button>
          </div>

          <SearchField
            className="mb-4"
            inputClassName="scroll-mt-24"
            value={recountSearch}
            onChange={(e) => { cancelSearchScroll(); setRecountSearch(e.target.value) }}
            onFocus={handleSearchFocus}
          />
          {recountSearch.trim() && (
            <p className="text-[11px] text-slate-400 -mt-3 mb-3 px-1">
              Найдено: {recountCatalog.filter((i) => matchesSearch(i.name, recountSearch)).length}
            </p>
          )}

          {INVENTORY_AUDIT_ZONES.map((zone) => {
            const zoneItems = recountCatalog.filter((i) => i.zone === zone.key && matchesSearch(i.name, recountSearch))
            if (zoneItems.length === 0) return null
            return (
              <Section key={zone.key} title={zone.label}>
                <div className="flex flex-col gap-2">
                  {zoneItems.map((item) => {
                    const curQty = recount.qty[item.id]
                    const actual = curQty !== undefined && curQty !== '' ? Number(curQty) : null
                    // This item's own entry moment, not the shared recount
                    // date — so "ожидалось" is pinned to when THIS item was
                    // actually counted, correct regardless of how long the
                    // overall session takes. Not-yet-counted items fall back
                    // to right now (same as "Остаток сейчас" below).
                    const itemAsOf = new Date(recount.qtyTimestamps?.[item.id] ?? Date.now())
                    const { balance: expected } = computeBalance(
                      item.id,
                      { recounts: recountsExcludingCurrent, purchases, productions, recipes, waste: catalogWaste },
                      itemAsOf
                    )
                    const shrinkage = expected !== null && actual !== null ? actual - expected : null
                    const currentBalance = balances.find((b) => b.product.id === item.id)?.balance ?? null
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
                            {currentBalance !== null && (
                              <p className="text-xs text-slate-400">
                                Остаток сейчас: <span className="font-semibold text-slate-500 dark:text-slate-300">{currentBalance} {item.unit}</span>
                              </p>
                            )}
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

          {shrinkageLog.length > 0 && (
            <Section
              title={`Журнал недостач/излишков (${shrinkageLog.length})`}
              icon={AlertTriangle}
              right={
                <button
                  onClick={exportShrinkageLogCsv}
                  className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-slate-100 dark:bg-slate-700 active:bg-slate-200 text-slate-600 dark:text-slate-300 text-xs font-semibold"
                >
                  <Download size={15} /> CSV
                </button>
              }
            >
              <div className="flex flex-col gap-2">
                {shrinkageLog.map((row) => (
                  <div key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{row.productName}</p>
                      <span className={`shrink-0 text-sm font-semibold ${row.shrinkage > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {row.shrinkage > 0 ? '+' : ''}{row.shrinkage} {row.unit}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {row.monthLabel} · ожидалось {row.expected} → факт {row.actual}
                      {row.comment && ` · ${row.comment}`}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}
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
              catalogSelectMode ? (
                <button onClick={exitCatalogSelectMode} className="text-xs font-semibold text-slate-500">
                  Отмена
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => setCatalogSelectMode(true)} className="text-xs font-semibold text-orange-600">
                    Выбрать
                  </button>
                  <button
                    onClick={exportCatalog}
                    className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-slate-100 dark:bg-slate-700 active:bg-slate-200 text-slate-600 dark:text-slate-300 text-xs font-semibold"
                  >
                    <Download size={15} /> Экспорт
                  </button>
                </div>
              )
            }
          >
            <SearchField
              className="mb-3"
              inputClassName="scroll-mt-24"
              value={catalogSearch}
              onChange={(e) => { cancelSearchScroll(); setCatalogSearch(e.target.value) }}
              onFocus={handleSearchFocus}
            />
            <div className="flex items-center justify-between -mt-2 mb-3 px-1">
              {catalogSearch.trim() ? (
                <p className="text-[11px] text-slate-400">
                  Найдено: {recountCatalog.filter((i) => matchesSearch(i.name, catalogSearch)).length}
                </p>
              ) : <span />}
              <button onClick={runCatalogDiagnostics} className="text-[11px] text-slate-400 underline">
                Диагностика
              </button>
              <button onClick={runUnitAudit} className="text-[11px] text-slate-400 underline">
                Единицы измерения
              </button>
            </div>
            {unitAuditResult && (
              <div className="mb-3 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 px-3 py-2">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-orange-800 dark:text-orange-200">
                    Не в г/мл: {unitAuditResult.reduce((s, [, names]) => s + names.length, 0)} товар(ов)
                  </p>
                  <button onClick={() => setUnitAuditResult(null)} className="text-xs text-orange-600">Скрыть</button>
                </div>
                {unitAuditResult.length === 0 && (
                  <p className="text-xs text-slate-500">Все товары уже в г/мл.</p>
                )}
                <div className="max-h-72 overflow-y-auto flex flex-col gap-2">
                  {unitAuditResult.map(([unit, names]) => (
                    <div key={unit}>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        «{unit}» — {names.length} шт.
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{names.join(', ')}</p>
                    </div>
                  ))}
                </div>
                {unitAuditResult.some(([unit]) => ['кг', 'л'].includes(unit.trim().toLowerCase())) && (
                  <button
                    onClick={runAutoUnitConversion}
                    className="mt-2 w-full min-h-[36px] rounded-lg bg-orange-600 text-white text-xs font-semibold"
                  >
                    Конвертировать кг→г и л→мл автоматически
                  </button>
                )}
                {unitAuditResult.some(([, names]) => names.some((n) => LIQUID_UNIT_ANOMALIES.has((n || '').trim().toLowerCase()))) && (
                  <button
                    onClick={runLiquidAnomalyFix}
                    className="mt-2 w-full min-h-[36px] rounded-lg bg-orange-500 text-white text-xs font-semibold"
                  >
                    Исправить аномалии (масло/сок/бульон/вода → мл)
                  </button>
                )}
              </div>
            )}
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
            {(() => {
              const visibleCatalog = sortedCatalog.filter((item) => matchesSearch(item.name, catalogSearch))
              return (
                <>
                  {catalogSelectMode && visibleCatalog.length > 0 && (
                    <div className="flex items-center justify-between gap-2 mb-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
                      <button onClick={() => selectAllCatalog(visibleCatalog)} className="text-xs font-semibold text-orange-600">
                        Выбрать все ({visibleCatalog.length})
                      </button>
                      <span className="text-xs text-slate-500 dark:text-slate-400">Выбрано: {selectedCatalogIds.size}</span>
                      <button
                        onClick={deleteSelectedCatalog}
                        disabled={selectedCatalogIds.size === 0}
                        className="flex items-center gap-1 min-h-[32px] px-3 rounded-lg text-xs font-semibold text-white bg-red-600 active:bg-red-700 disabled:bg-slate-300 disabled:dark:bg-slate-700"
                      >
                        <Trash2 size={14} /> Удалить ({selectedCatalogIds.size})
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {visibleCatalog.map((item) => (
                <div
                  key={item.id}
                  id={`catalog-item-${item.id}`}
                  className={`rounded-xl border px-2 py-2 ${
                    item.id === highlightCatalogId
                      ? 'border-orange-400 ring-2 ring-orange-300 dark:ring-orange-700'
                      : selectedCatalogIds.has(item.id)
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {catalogSelectMode && (
                      <button
                        onClick={() => toggleCatalogSelect(item.id)}
                        className={`shrink-0 w-7 h-7 rounded-md border-2 flex items-center justify-center ${
                          selectedCatalogIds.has(item.id) ? 'bg-orange-500 border-orange-500' : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {selectedCatalogIds.has(item.id) && <Check size={14} className="text-white" />}
                      </button>
                    )}
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
                </>
              )
            })()}
          </Section>
        </>
      )}

      {tab === 'movements' && (() => {
        const purchasesThisMonth = purchases.filter((p) => monthKey(parseLocalDate(p.date)) === currentMonth)
        const recipeProductionsThisMonth = productions.filter((p) => p.recipeId && monthKey(parseLocalDate(p.date)) === currentMonth)
        const directUsageThisMonth = productions.filter((p) => !p.recipeId && p.productId != null && monthKey(parseLocalDate(p.date)) === currentMonth)
        const catalogWasteThisMonth = catalogWaste.filter((w) => monthKey(parseLocalDate(w.date)) === currentMonth)

        const daysInMonth = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() + 1, 0).getDate()
        const firstWeekday = (new Date(viewedMonth.getFullYear(), viewedMonth.getMonth(), 1).getDay() + 6) % 7
        // One dot colour per activity kind, not just a single generic marker —
        // a day with приход AND расход AND списание shows all three dots.
        const activityByDay = new Map()
        function markDay(dateStr, kind) {
          const day = Number(dateStr.slice(-2))
          if (!activityByDay.has(day)) activityByDay.set(day, new Set())
          activityByDay.get(day).add(kind)
        }
        purchasesThisMonth.forEach((p) => markDay(p.date, 'purchase'))
        recipeProductionsThisMonth.forEach((p) => markDay(p.date, 'usage'))
        directUsageThisMonth.forEach((p) => markDay(p.date, 'usage'))
        catalogWasteThisMonth.forEach((w) => markDay(w.date, 'waste'))
        const DOT_COLOR = { purchase: 'bg-green-500', usage: 'bg-blue-500', waste: 'bg-red-500' }
        const selectedDateStr = selectedDay ? `${currentMonth}-${String(selectedDay).padStart(2, '0')}` : null
        const dayEntries = selectedDateStr ? [
          ...purchasesThisMonth.filter((p) => p.date === selectedDateStr).map((p) => ({ kind: 'purchase', ...p })),
          ...recipeProductionsThisMonth.filter((p) => p.date === selectedDateStr).map((p) => ({ kind: 'production', ...p })),
          ...directUsageThisMonth.filter((p) => p.date === selectedDateStr).map((p) => ({ kind: 'usage', ...p })),
          ...catalogWasteThisMonth.filter((w) => w.date === selectedDateStr).map((w) => ({ kind: 'waste', ...w })),
        ] : []

        return (
        <>
          <Section title="Календарь" icon={Calendar}>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400 mb-1">
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstWeekday }).map((_, i) => <div key={`blank-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const kinds = activityByDay.get(day)
                const isSelected = selectedDay === day
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`relative h-9 rounded-lg text-sm ${
                      isSelected ? 'bg-orange-500 text-white' : 'text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-700'
                    }`}
                  >
                    {day}
                    {kinds && !isSelected && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                        {['purchase', 'usage', 'waste'].filter((k) => kinds.has(k)).map((k) => (
                          <span key={k} className={`w-1 h-1 rounded-full ${DOT_COLOR[k]}`} />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-3 mt-2 px-1 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Приход</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Расход</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Списание</span>
            </div>
            {selectedDay && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {formatRu(parseLocalDate(selectedDateStr))}
                  </p>
                  <button onClick={() => setSelectedDay(null)} className="text-xs text-slate-400">Скрыть</button>
                </div>
                {dayEntries.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-2">Нет записей за этот день</p>
                )}
                <div className="flex flex-col gap-2">
                  {dayEntries.map((e) => {
                    if (e.kind === 'purchase') {
                      const product = recountCatalog.find((pr) => pr.id === Number(e.productId) || pr.id === e.productId)
                      return (
                        <div key={`p-${e.id}`} className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                          <span className="text-slate-500 dark:text-slate-400 text-xs mr-1">Приход</span>
                          {product?.name || '?'} <span className="text-green-600 dark:text-green-400">+{e.qty} {product?.unit}</span>
                        </div>
                      )
                    }
                    if (e.kind === 'production') {
                      const recipe = recipes.find((r) => r.id === Number(e.recipeId) || r.id === e.recipeId)
                      return (
                        <div key={`pr-${e.id}`} className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                          <span className="text-slate-500 dark:text-slate-400 text-xs mr-1">Расход</span>
                          {recipe?.name || '?'} <span className="text-red-600 dark:text-red-400">× {e.qty}</span>
                        </div>
                      )
                    }
                    if (e.kind === 'usage') {
                      const product = recountCatalog.find((pr) => pr.id === Number(e.productId) || pr.id === e.productId)
                      return (
                        <div key={`u-${e.id}`} className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                          <span className="text-slate-500 dark:text-slate-400 text-xs mr-1">Расход</span>
                          {product?.name || '?'} <span className="text-red-600 dark:text-red-400">−{e.qty} {product?.unit}</span>
                        </div>
                      )
                    }
                    const product = recountCatalog.find((pr) => String(pr.id) === String(e.productId))
                    return (
                      <div key={`w-${e.id}`} className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                        <span className="text-slate-500 dark:text-slate-400 text-xs mr-1">Списание</span>
                        {product?.name || '?'} <span className="text-red-600 dark:text-red-400">−{e.qty} {product?.unit}</span>
                        <span className="text-xs text-slate-400"> · {wasteReasonLabel(e.reason)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Section>

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

            {purchasesThisMonth.slice(0, showAllPurchases ? undefined : 8).map((p) => {
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
            {purchasesThisMonth.length > 8 && (
              <button
                onClick={() => setShowAllPurchases((v) => !v)}
                className="w-full text-center text-xs font-semibold text-orange-600 py-2"
              >
                {showAllPurchases ? 'Свернуть' : `Показать все (${purchasesThisMonth.length})`}
              </button>
            )}
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

            {(() => {
              const recipeProductions = recipeProductionsThisMonth
              return (
                <>
                  {recipeProductions.slice(0, showAllProductions ? undefined : 8).map((p) => {
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
                  {recipeProductions.length > 8 && (
                    <button
                      onClick={() => setShowAllProductions((v) => !v)}
                      className="w-full text-center text-xs font-semibold text-orange-600 py-2"
                    >
                      {showAllProductions ? 'Свернуть' : `Показать все (${recipeProductions.length})`}
                    </button>
                  )}
                </>
              )
            })()}

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

          <Section title="Расход товара (без рецепта)" icon={Flame}>
            <p className="text-xs text-slate-500 mb-2">
              Для случаев, когда товар потратили не по рецепту (например, отдали, использовали на что-то разовое) —
              списывается из остатка так же, как расход по рецепту.
            </p>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <input
                  className={inputClass}
                  placeholder="Продукт…"
                  list="product-nomenclature"
                  value={usageForm.productName}
                  onChange={(e) => setUsageForm((f) => ({ ...f, productName: e.target.value }))}
                />
              </div>
              <div className="w-20 shrink-0">
                <input
                  type="text"
                  inputMode="decimal"
                  className={inputClass}
                  placeholder="Кол-во"
                  value={usageForm.qty}
                  onChange={(e) => setUsageForm((f) => ({ ...f, qty: sanitizeDecimal(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <div className="flex-1 min-w-0">
                <input
                  type="date"
                  className={inputClass}
                  value={usageForm.date}
                  onChange={(e) => setUsageForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <button
                onClick={addProductUsage}
                className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-orange-500 active:bg-orange-600 text-white"
              >
                <Plus size={20} />
              </button>
            </div>
            {usageError && (
              <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 mt-2">
                {usageError}
              </p>
            )}
            {(() => {
              const directUsage = directUsageThisMonth
              return (
                <>
                  {directUsage.slice(0, showAllUsage ? undefined : 8).map((p) => {
                    const product = recountCatalog.find((pr) => pr.id === Number(p.productId) || pr.id === p.productId)
                    return (
                      <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                        <span className="text-sm text-slate-700 dark:text-slate-200">
                          {product?.name || '?'} <span className="text-slate-400">−{p.qty} {product?.unit}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{formatRu(parseLocalDate(p.date))}</span>
                          <ConfirmDeleteButton onConfirm={() => removeProduction(p.id)} size="w-8 h-8" iconSize={14} />
                        </div>
                      </div>
                    )
                  })}
                  {directUsage.length > 8 && (
                    <button
                      onClick={() => setShowAllUsage((v) => !v)}
                      className="w-full text-center text-xs font-semibold text-orange-600 py-2"
                    >
                      {showAllUsage ? 'Свернуть' : `Показать все (${directUsage.length})`}
                    </button>
                  )}
                </>
              )
            })()}
          </Section>

          <Section title="Списания" icon={AlertTriangle}>
            <p className="text-xs text-slate-500 mb-2">
              Порча, просрочка и т.п. — списывается из остатка так же, как расход, но с причиной
              (для отчётов) и учитывается при расчёте недостачи в Переучёте.
            </p>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <input
                  className={inputClass}
                  placeholder="Продукт…"
                  list="product-nomenclature"
                  value={wasteForm.productName}
                  onChange={(e) => setWasteForm((f) => ({ ...f, productName: e.target.value }))}
                />
              </div>
              <div className="w-20 shrink-0">
                <input
                  type="text"
                  inputMode="decimal"
                  className={inputClass}
                  placeholder="Кол-во"
                  value={wasteForm.qty}
                  onChange={(e) => setWasteForm((f) => ({ ...f, qty: sanitizeDecimal(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <div className="flex-1 min-w-0">
                <input
                  type="date"
                  className={inputClass}
                  value={wasteForm.date}
                  onChange={(e) => setWasteForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {WASTE_REASONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => addCatalogWaste(r.key)}
                  disabled={!wasteForm.productName || !wasteForm.qty}
                  className="min-h-[32px] px-2.5 rounded-lg bg-slate-100 dark:bg-slate-700 active:bg-slate-200 disabled:opacity-40 text-slate-600 dark:text-slate-300 text-xs font-semibold"
                >
                  {r.label}
                </button>
              ))}
            </div>
            {wasteError && (
              <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 mt-2">
                {wasteError}
              </p>
            )}
            {catalogWasteThisMonth.slice(0, showAllWaste ? undefined : 8).map((w) => {
              const product = recountCatalog.find((pr) => String(pr.id) === String(w.productId))
              return (
                <div key={w.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    {product?.name || '?'} <span className="text-slate-400">−{w.qty} {product?.unit}</span>
                    <span className="text-xs text-slate-400"> · {wasteReasonLabel(w.reason)}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{formatRu(parseLocalDate(w.date))}</span>
                    <ConfirmDeleteButton onConfirm={() => removeCatalogWaste(w.id)} size="w-8 h-8" iconSize={14} />
                  </div>
                </div>
              )
            })}
            {catalogWasteThisMonth.length > 8 && (
              <button
                onClick={() => setShowAllWaste((v) => !v)}
                className="w-full text-center text-xs font-semibold text-orange-600 py-2"
              >
                {showAllWaste ? 'Свернуть' : `Показать все (${catalogWasteThisMonth.length})`}
              </button>
            )}
          </Section>
        </>
        )
      })()}

      {tab === 'balance' && (
        <>
          <p className="text-xs text-slate-500 mb-3 px-1">
            Остаток = последний переучёт с заполненным количеством по товару (дата подсчёта задаётся
            во вкладке «Переучёт») + все закупки после этой даты − расход по рецептам после этой даты.
          </p>

          <Section title="Текущие остатки" icon={Scale}>
            <SearchField
              className="mb-3"
              inputClassName="scroll-mt-24"
              value={balanceSearch}
              onChange={(e) => { cancelSearchScroll(); setBalanceSearch(e.target.value) }}
              onFocus={handleSearchFocus}
            />
            {balanceSearch.trim() && (
              <p className="text-[11px] text-slate-400 -mt-2 mb-3 px-1">
                Найдено: {balances.filter((row) => matchesSearch(row.product.name, balanceSearch)).length}
              </p>
            )}
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
