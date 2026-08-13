import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft, ChevronRight, Send, ShieldCheck, ChevronDown, Upload, X, Copy, Plus, Printer,
  BookOpen, Pencil, Camera, Calendar, Check, ExternalLink, Image as ImageIcon,
} from 'lucide-react'
import { Section, Field, inputClass, BigButton, Badge, ConfirmDeleteButton, CheckRow, PrintButton } from '../components/UI'
import { DEFAULT_MENU_COURSES } from '../utils/constants'
import {
  MONTHS_RU, WEEKDAYS_RU, daysInMonth, mondayIndex, formatRu,
  todayKey, toKey, parseLocalDate, addDays, monthKey as monthKeyOf,
} from '../utils/dateUtils'
import { parseMenuImport, parseRecipesImport, parseRationalChefExport } from '../utils/importParsers'
import { printReport } from '../utils/printReport'
import { coursesForDay, extractQtyNumber } from '../utils/menuCourses'
import { computeRecipeCost } from '../utils/recipeCost'
import { compressToDataUrl } from '../utils/imageCompress'
import { sanitizeDecimal } from '../utils/number'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useBackableTab } from '../hooks/useBackableTab'
import { uid } from '../utils/id'
import { computeDropdownRect } from '../utils/dropdownPosition'

export default function MenuPlanner({
  menuData, setMenuData, settings, setSettings, dishLibrary, setDishLibrary,
  recipes, setRecipes, recountCatalog, setRecountCatalog, onNavigateToCatalog,
}) {
  // Рецепты draft state (menuTab + everything below down to editingRecipeId)
  // is persisted rather than plain useState: adding an ingredient whose
  // product doesn't exist yet in the nomenclature sends the user over to
  // Склад → Каталог to fill it in, which unmounts this page — persisting the
  // in-progress recipe means it's still there, untouched, when they come back.
  const [menuTab, setMenuTab] = useLocalStorage('menuTab', 'calendar')
  useBackableTab('menuTab', menuTab, setMenuTab)
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [openDay, setOpenDay] = useState(null)

  // Рецепты tab state
  const [showRecipeImport, setShowRecipeImport] = useLocalStorage('showRecipeImportDraft', false)
  // Persisted (not plain useState): confirming a missing ingredient sends the
  // user to Склад → Каталог and back, same as the manual recipe form — the
  // pasted text, overwrite choice and already-declined ingredients need to
  // survive that round trip so the import can resume where it left off.
  const [recipeImportText, setRecipeImportText] = useLocalStorage('recipeImportTextDraft', '')
  const [recipeImportOverwrite, setRecipeImportOverwrite] = useLocalStorage('recipeImportOverwriteDraft', false)
  const [recipeImportDeclined, setRecipeImportDeclined] = useLocalStorage('recipeImportDeclinedDraft', [])
  const [recipeImportMissingPrompt, setRecipeImportMissingPrompt] = useState(null)
  const [recipeImportResult, setRecipeImportResult] = useState(null)
  const [rationalImportText, setRationalImportText] = useState('')
  const [rationalImportOverwrite, setRationalImportOverwrite] = useState(false)
  const [rationalImportResult, setRationalImportResult] = useState(null)
  const [photoImportResult, setPhotoImportResult] = useState(null)
  const [photoImportText, setPhotoImportText] = useState('')
  const [showAdvancedImport, setShowAdvancedImport] = useState(false)
  const [advancedImportTab, setAdvancedImportTab] = useState('rational')
  const [recipeForm, setRecipeForm] = useLocalStorage('recipeFormDraft', () => ({ name: '', ingredients: [{ productName: '', qty: '' }], comment: '', photo: null }))
  const [recipeError, setRecipeError] = useState(null)
  const [missingProductPrompt, setMissingProductPrompt] = useState(null)
  const [showNewRecipeForm, setShowNewRecipeForm] = useLocalStorage('showNewRecipeFormDraft', false)
  const [expandedRecipeId, setExpandedRecipeId] = useLocalStorage('expandedRecipeIdDraft', null)
  // Recipes are written for one base yield (e.g. 10 порций) but a given day's
  // menu scales that by a coefficient (4 порции в меню = ×4 the base recipe)
  // — this scales the displayed ingredient amounts to match without ever
  // touching the stored recipe, so cooking at the actual scale needed
  // doesn't require doing the multiplication by hand.
  const [recipeCoefficient, setRecipeCoefficient] = useState('1')
  const [zoomedRecipeThumbId, setZoomedRecipeThumbId] = useState(null)
  // Set by openRecipeFromMenu right before switching to Рецепты — the
  // recipe list can be long, so jumping here from Меню needs to actually
  // scroll to the opened card, not just land at the top of the tab.
  const pendingRecipeScrollRef = useRef(null)
  // Set alongside it — which day's card to scroll back to when returning to
  // Меню (via the "Меню" button or system back), so switching back and
  // forth between a day's dishes and their ТК stays anchored on that day.
  const pendingDayScrollRef = useRef(null)
  const [editingRecipeId, setEditingRecipeId] = useLocalStorage('editingRecipeIdDraft', null)
  const [recipePhotoProcessing, setRecipePhotoProcessing] = useState(false)
  const [recipePhotoError, setRecipePhotoError] = useState(null)
  const [recipePrintMode, setRecipePrintMode] = useState(false)
  const [selectedForPrint, setSelectedForPrint] = useState(() => new Set())

  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [overwriteExisting, setOverwriteExisting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [sendMessage, setSendMessage] = useState(null)
  const [dayPasteText, setDayPasteText] = useState('')
  const [showDayPaste, setShowDayPaste] = useState(false)

  const [showPrintPanel, setShowPrintPanel] = useState(false)
  const [printFrom, setPrintFrom] = useState(() => todayKey())
  const [printTo, setPrintTo] = useState(() => todayKey())
  const [printExcluded, setPrintExcluded] = useState(() => new Set())

  const monthKey = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
  const monthData = menuData[monthKey] || {}
  const totalDays = daysInMonth(cursor.year, cursor.month)

  const days = useMemo(() => Array.from({ length: totalDays }, (_, i) => i + 1), [totalDays])

  function changeMonth(delta) {
    const d = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
    setOpenDay(null)
    setImportResult(null)
  }

  function setDayCourses(day, courses) {
    setMenuData((prev) => ({
      ...prev,
      [monthKey]: { ...(prev[monthKey] || {}), [day]: { ...(prev[monthKey]?.[day] || {}), courses } },
    }))
  }

  function setDayEventName(day, eventName) {
    setMenuData((prev) => ({
      ...prev,
      [monthKey]: { ...(prev[monthKey] || {}), [day]: { ...(prev[monthKey]?.[day] || {}), eventName } },
    }))
  }

  function updateCourse(day, courseId, patch) {
    const courses = coursesForDay(monthData[day]).map((c) => (c.id === courseId ? { ...c, ...patch } : c))
    setDayCourses(day, courses)
  }

  function addCourse(day) {
    const courses = coursesForDay(monthData[day])
    const newCourse = { id: `c-${Date.now()}`, label: `Блюдо ${courses.length + 1}`, dish: '', qty: '', kosher: false }
    setDayCourses(day, [...courses, newCourse])
  }

  function removeCourse(day, courseId) {
    const courses = coursesForDay(monthData[day]).filter((c) => c.id !== courseId)
    setDayCourses(day, courses)
  }

  // For event/banquet-style days: one dish per line, no fixed course labels.
  // Hand-typed lists (not copied from a spreadsheet) almost always separate
  // the quantity with " - " / " — " at the end ("Тунец-яйцо на плате с
  // черным хлебом - 20 порций") rather than a real tab character, and the
  // dish name itself may contain its own hyphen ("Тунец-яйцо") with no
  // spaces around it — so a plain tab/space column split misreads those.
  // Try the spaced dash first (matches hand-typed lists), then fall back to
  // tab or a run of 2+ spaces (spreadsheet-style paste), then just the dish
  // name with no quantity.
  function parseDayPasteLine(line) {
    const dashMatch = line.match(/^(.+?)\s+[-–—]\s+(.+)$/)
    if (dashMatch) return { dish: dashMatch[1].trim(), qty: dashMatch[2].trim() }
    if (line.includes('\t')) {
      const [dish, ...rest] = line.split('\t')
      return { dish: (dish || '').trim(), qty: rest.join(' ').trim() }
    }
    if (/\s{2,}/.test(line)) {
      const [dish, ...rest] = line.split(/\s{2,}/)
      return { dish: (dish || '').trim(), qty: rest.join(' ').trim() }
    }
    return { dish: line.trim(), qty: '' }
  }

  function pasteDayList(day, text) {
    const parsed = text
      .split(/\r\n|\n|\r/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map(parseDayPasteLine)
      .filter((r) => r.dish)
    if (parsed.length === 0) return
    const existing = coursesForDay(monthData[day])
    const added = parsed.map((item, i) => ({
      id: `c-${Date.now()}-${i}`,
      label: '',
      dish: item.dish,
      qty: item.qty,
      kosher: false,
    }))
    setDayCourses(day, [...existing, ...added])
  }

  function commitDish(label, value) {
    const dish = value.trim()
    if (!dish) return
    setDishLibrary((prev) => {
      const list = prev[label] || []
      if (list.some((d) => d.toLowerCase() === dish.toLowerCase())) return prev
      return { ...prev, [label]: [dish, ...list].slice(0, 40) }
    })
  }

  // ---- Рецепты ----

  function findProductByName(name) {
    const key = (name || '').trim().toLowerCase()
    if (!key) return null
    return recountCatalog.find((p) => (p.name || '').trim().toLowerCase() === key) || null
  }

  function productNameById(id) {
    const product = recountCatalog.find((p) => p.id === Number(id) || p.id === id)
    return product?.name || ''
  }

  function recipeCost(recipe) {
    return computeRecipeCost(recipe, recountCatalog)
  }

  function blankRecipeForm() {
    return { name: '', ingredients: [{ productName: '', qty: '' }], comment: '', photo: null }
  }

  function openNewRecipeForm() {
    setRecipeForm(blankRecipeForm())
    setRecipeError(null)
    setMissingProductPrompt(null)
    setEditingRecipeId(null)
    setExpandedRecipeId(null)
    setShowNewRecipeForm(true)
  }

  function closeNewRecipeForm() {
    setShowNewRecipeForm(false)
    setRecipeForm(blankRecipeForm())
    setRecipeError(null)
    setMissingProductPrompt(null)
  }

  function toggleExpandRecipe(recipe) {
    if (expandedRecipeId === recipe.id) {
      setExpandedRecipeId(null)
      setEditingRecipeId(null)
      return
    }
    setExpandedRecipeId(recipe.id)
    setEditingRecipeId(null)
    setShowNewRecipeForm(false)
    setRecipeError(null)
    setMissingProductPrompt(null)
    setRecipeCoefficient('1')
  }

  function findRecipeByName(name) {
    const key = (name || '').trim().toLowerCase()
    if (!key) return null
    return recipes.find((r) => (r.name || '').trim().toLowerCase() === key) || null
  }

  // Jumps straight from a scheduled dish in Меню to its ТК in Рецепты,
  // pre-scaled by that day's coefficient — no need to reopen the recipe and
  // retype the multiplier by hand.
  function openRecipeFromMenu(dishName, qtyStr, day) {
    const recipe = findRecipeByName(dishName)
    if (!recipe) {
      alert(`Рецепт «${dishName}» не найден в Рецептах — сначала добавьте его туда.`)
      return
    }
    setRecipeCoefficient(String(Number(extractQtyNumber(qtyStr)) || 1))
    setExpandedRecipeId(recipe.id)
    setEditingRecipeId(null)
    setShowNewRecipeForm(false)
    pendingRecipeScrollRef.current = recipe.id
    // Remember which day to snap back to when the user returns to Меню —
    // openDay itself already survives the tab switch (MenuPlanner never
    // unmounts), but the scroll position doesn't, so without this the
    // calendar view lands wherever the browser's own scroll-restoration
    // guesses (often the very bottom, since Рецепты was scrolled much
    // further down than the calendar view is tall).
    pendingDayScrollRef.current = day
    setMenuTab('recipes')
  }

  function startEditRecipe(recipe) {
    setRecipeForm({
      name: recipe.name,
      ingredients: recipe.ingredients.map((ing) => ({ productName: productNameById(ing.productId), qty: ing.qty })),
      comment: recipe.comment || '',
      photo: recipe.photo || null,
    })
    setEditingRecipeId(recipe.id)
    setRecipeError(null)
    setMissingProductPrompt(null)
  }

  function cancelEditRecipe() {
    setEditingRecipeId(null)
    setRecipeError(null)
    setMissingProductPrompt(null)
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

  async function handleRecipePhoto(file) {
    setRecipePhotoError(null)
    setRecipePhotoProcessing(true)
    try {
      const dataUrl = await compressToDataUrl(file)
      if (dataUrl) setRecipeForm((f) => ({ ...f, photo: dataUrl }))
      else setRecipePhotoError('Не удалось обработать это фото.')
    } catch {
      setRecipePhotoError('Не удалось обработать это фото.')
    } finally {
      setRecipePhotoProcessing(false)
    }
  }

  function removeRecipePhoto() {
    setRecipeForm((f) => ({ ...f, photo: null }))
  }

  function saveRecipe() {
    setMissingProductPrompt(null)
    if (!recipeForm.name.trim()) {
      setRecipeError('Укажите название блюда.')
      return
    }
    const filledRows = recipeForm.ingredients.filter((i) => i.productName.trim() || i.qty)
    const ingredients = []
    for (const row of filledRows) {
      const name = row.productName.trim()
      const product = findProductByName(name)
      if (!product) {
        setRecipeError(null)
        setMissingProductPrompt(name)
        return
      }
      if (!row.qty) {
        setRecipeError(`Укажите количество для «${name}».`)
        return
      }
      ingredients.push({ productId: product.id, qty: row.qty })
    }
    if (ingredients.length === 0) {
      setRecipeError('Добавьте хотя бы один ингредиент из каталога.')
      return
    }
    setRecipeError(null)
    const payload = { name: recipeForm.name.trim(), ingredients, comment: recipeForm.comment.trim(), photo: recipeForm.photo || null }
    if (editingRecipeId) {
      setRecipes((prev) => prev.map((r) => (r.id === editingRecipeId ? { ...r, ...payload } : r)))
      setEditingRecipeId(null)
    } else {
      setRecipes((prev) => [...prev, { id: Date.now(), ...payload }])
      setShowNewRecipeForm(false)
    }
    setRecipeForm(blankRecipeForm())
  }

  function confirmAddMissingProduct() {
    const name = missingProductPrompt
    if (!name) return
    const newId = Date.now()
    setRecountCatalog((prev) => [...prev, { id: newId, name, unit: 'шт', zone: 'fridges', category: 'other' }])
    setMissingProductPrompt(null)
    onNavigateToCatalog?.(newId)
  }

  function cancelMissingProduct() {
    setMissingProductPrompt(null)
  }

  function removeRecipe(id) {
    setRecipes((prev) => prev.filter((r) => r.id !== id))
    if (expandedRecipeId === id) setExpandedRecipeId(null)
    if (editingRecipeId === id) setEditingRecipeId(null)
  }

  // Same missing-ingredient confirmation as the manual recipe form (see
  // saveRecipe/confirmAddMissingProduct below), but scanning across every
  // recipe in the pasted sheet: stop at the first ingredient not yet in the
  // nomenclature and not already declined this run, ask once, then either
  // create it (and hand off to Каталог) or mark it declined and keep scanning.
  function runRecipeImport() {
    const { recipes: parsed } = parseRecipesImport(recipeImportText)
    const declinedSet = new Set(recipeImportDeclined.map((n) => n.toLowerCase()))

    for (const parsedRecipe of parsed) {
      for (const { ingredientName } of parsedRecipe.ingredients) {
        const key = ingredientName.trim().toLowerCase()
        if (!key || declinedSet.has(key)) continue
        if (!findProductByName(ingredientName)) {
          setRecipeImportMissingPrompt(ingredientName.trim())
          return
        }
      }
    }

    finalizeRecipeImport(parsed)
  }

  function finalizeRecipeImport(parsed) {
    const { skipped } = parseRecipesImport(recipeImportText)
    const existingByName = new Map(recipes.map((r) => [(r.name || '').trim().toLowerCase(), r]))
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
        nextRecipes.push({ id: uid(), name: parsedRecipe.name, ingredients })
      }
      imported += 1
    })

    setRecipes(nextRecipes)
    const parts = [`Импортировано рецептов: ${imported}`]
    if (skippedExisting) parts.push(`пропущено (уже есть): ${skippedExisting}`)
    if (unresolvedIngredients) parts.push(`пропущено ингредиентов (отказано в добавлении): ${unresolvedIngredients}`)
    if (skipped.length) parts.push(`не распознано строк: ${skipped.length}`)
    setRecipeImportResult(parts.join(', '))
    setRecipeImportText('')
    setRecipeImportDeclined([])
    setRecipeImportMissingPrompt(null)
  }

  function confirmAddImportIngredient() {
    const name = recipeImportMissingPrompt
    if (!name) return
    const newId = Date.now()
    setRecountCatalog((prev) => [...prev, { id: newId, name, unit: 'шт', zone: 'fridges', category: 'other' }])
    setRecipeImportMissingPrompt(null)
    onNavigateToCatalog?.(newId)
  }

  function declineImportIngredient() {
    const name = recipeImportMissingPrompt
    if (!name) return
    setRecipeImportDeclined((prev) => [...prev, name])
    setRecipeImportMissingPrompt(null)
  }

  // Rational Chef OS's export already flattens its oven-mode/kashrut fields
  // into a "comment" string (see parseRationalChefExport) — this only needs
  // to resolve ingredient names against the nomenclature, creating any that
  // don't exist yet (with the unit the export already provides) rather than
  // stopping at the first one, since a full import can easily touch 50+
  // distinct ingredients in one paste.
  function importFromRationalChef() {
    const { recipes: parsed, error } = parseRationalChefExport(rationalImportText)
    if (error) {
      setRationalImportResult(error)
      return
    }
    const existingByName = new Map(recipes.map((r) => [(r.name || '').trim().toLowerCase(), r]))
    const nextRecipes = [...recipes]
    const workingCatalog = [...recountCatalog]
    const newProducts = []
    const unitMismatches = []
    let imported = 0
    let skippedExisting = 0

    function resolveProduct(name, unit) {
      const key = name.trim().toLowerCase()
      let product = workingCatalog.find((p) => (p.name || '').trim().toLowerCase() === key)
      if (!product) {
        product = { id: uid(), name: name.trim(), unit: unit || 'шт', zone: 'fridges', category: 'other' }
        workingCatalog.push(product)
        newProducts.push(product)
      }
      return product
    }

    // Rational Chef OS's export carries its own per-ingredient unit, which
    // can silently disagree with the catalog product's unit (e.g. the export
    // says "0.21 л" but the existing nomenclature item is tracked in "г") —
    // without reconciling them, the qty gets stored against the wrong scale
    // (0.21 "г" instead of 210 г), which is exactly the class of bug behind
    // the tiny/fractional ingredient amounts seen in already-imported ТК.
    // Only кг↔г and л↔мл are auto-reconciled (an exact ×1000); anything else
    // (e.g. import says "шт", catalog says "г") can't be resolved without a
    // real per-item weight, so it's left as-is and flagged for manual review.
    function reconcileQty(rawQty, importUnit, product) {
      const iu = (importUnit || '').trim().toLowerCase()
      const cu = (product.unit || '').trim().toLowerCase()
      const qtyNum = Number(rawQty) || 0
      if (!iu || iu === cu) return { qty: rawQty, mismatch: false }
      const massFactor = { 'кг': 1000, 'г': 1 }
      const volFactor = { 'л': 1000, 'мл': 1 }
      for (const fam of [massFactor, volFactor]) {
        if (iu in fam && cu in fam) {
          return { qty: String(qtyNum * (fam[iu] / fam[cu])), mismatch: false }
        }
      }
      unitMismatches.push(`${product.name} (импорт «${importUnit}» ≠ каталог «${product.unit}»)`)
      return { qty: rawQty, mismatch: true }
    }

    parsed.forEach((parsedRecipe) => {
      const key = parsedRecipe.name.toLowerCase()
      const existing = existingByName.get(key)
      if (existing && !rationalImportOverwrite) {
        skippedExisting += 1
        return
      }
      const ingredients = parsedRecipe.ingredients.map(({ ingredientName, qty, unit }) => {
        const product = resolveProduct(ingredientName, unit)
        const { qty: reconciledQty } = reconcileQty(String(qty ?? ''), unit, product)
        return { productId: product.id, qty: reconciledQty }
      })
      const payload = { name: parsedRecipe.name, ingredients, comment: parsedRecipe.comment || '', photo: null }
      if (existing) {
        const idx = nextRecipes.findIndex((r) => r.id === existing.id)
        nextRecipes[idx] = { ...existing, ...payload }
      } else {
        nextRecipes.push({ id: uid(), ...payload })
      }
      imported += 1
    })

    if (newProducts.length) setRecountCatalog((prev) => [...prev, ...newProducts])
    setRecipes(nextRecipes)
    const parts = [`Импортировано рецептов: ${imported}`]
    if (skippedExisting) parts.push(`пропущено (уже есть): ${skippedExisting}`)
    if (newProducts.length) parts.push(`создано новых позиций в номенклатуре: ${newProducts.length}`)
    if (unitMismatches.length) parts.push(`несовпадение единиц, нужна проверка (${unitMismatches.length}): ${unitMismatches.join('; ')}`)
    setRationalImportResult(parts.join(', '))
    setRationalImportText('')
  }

  function applyPhotoImportJson(text) {
    setPhotoImportResult(null)
    try {
      const map = JSON.parse(text)
      const usedKeys = new Set()
      const nextRecipes = recipes.map((r) => {
        const m = (r.name || '').match(/(\d+)/)
        if (!m) return r
        const num = String(Number(m[1]))
        const photo = map[num]
        if (!photo) return r
        usedKeys.add(num)
        return { ...r, photo }
      })
      setRecipes(nextRecipes)
      const allKeys = Object.keys(map)
      const unusedKeys = allKeys.filter((k) => !usedKeys.has(String(Number(k))))
      setPhotoImportResult(
        `Фото добавлено: ${usedKeys.size} из ${allKeys.length}.` +
        (unusedKeys.length ? ` Не найден рецепт для ТК: ${unusedKeys.join(', ')}.` : '')
      )
    } catch {
      setPhotoImportResult('Не удалось прочитать данные. Убедитесь, что это JSON со сопоставлением фото по номеру ТК.')
    }
  }

  async function importRecipePhotosFromJson(file) {
    const text = await file.text()
    applyPhotoImportJson(text)
  }

  function importRecipePhotosFromText() {
    applyPhotoImportJson(photoImportText)
    setPhotoImportText('')
  }

  function toggleSelectForPrint(id) {
    setSelectedForPrint((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function buildTtkPayload(recipeList) {
    return recipeList.map((r) => ({
      name: r.name,
      photo: r.photo || null,
      comment: r.comment || '',
      cost: recipeCost(r),
      ingredients: r.ingredients.map((ing) => {
        const product = recountCatalog.find((p) => String(p.id) === String(ing.productId))
        return { name: product?.name || '?', qty: ing.qty, unit: product?.unit || '' }
      }),
    }))
  }

  function printOneTtk(recipe) {
    printReport({ type: 'ttk', recipes: buildTtkPayload([recipe]) })
  }

  function printSelectedTtk() {
    const selected = recipes.filter((r) => selectedForPrint.has(r.id))
    if (selected.length === 0) return
    printReport({ type: 'ttk', recipes: buildTtkPayload(selected) })
    setRecipePrintMode(false)
    setSelectedForPrint(new Set())
  }

  function dayLabel(day) {
    const date = new Date(cursor.year, cursor.month, day)
    return WEEKDAYS_RU[mondayIndex(date)]
  }

  function summaryText(day) {
    const dayData = monthData[day]
    if (!dayData) return ''
    return coursesForDay(dayData)
      .filter((c) => c.dish)
      .map((c) => c.dish + (c.qty ? ` (${c.qty})` : ''))
      .join(' · ')
  }

  function buildMenuText() {
    const lines = [`Меню на ${MONTHS_RU[cursor.month]} ${cursor.year}`, '']
    days.forEach((day) => {
      const dayData = monthData[day]
      const courses = dayData ? coursesForDay(dayData) : []
      if (!courses.some((c) => c.dish)) return
      lines.push(`${String(day).padStart(2, '0')}.${String(cursor.month + 1).padStart(2, '0')} (${dayLabel(day)}):`)
      courses.forEach((c) => {
        if (!c.dish) return
        const label = c.label ? `${c.label}: ` : ''
        const qty = c.qty ? ` — ${c.qty}` : ''
        lines.push(`  ${label}${c.dish}${qty}${c.kosher ? ' [кошер]' : ''}`)
      })
      lines.push('')
    })
    return lines.join('\n')
  }

  function sendMenu() {
    const body = encodeURIComponent(buildMenuText())
    const subject = encodeURIComponent(`Меню на ${MONTHS_RU[cursor.month]} ${cursor.year}`)
    const to = encodeURIComponent(settings.kuchenleiterinEmail || '')
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
  }

  async function copyMenu() {
    try {
      await navigator.clipboard.writeText(buildMenuText())
      setSendMessage('Текст меню скопирован — вставьте его в письмо или мессенджер.')
    } catch {
      setSendMessage('Не удалось скопировать автоматически.')
    }
    setTimeout(() => setSendMessage(null), 5000)
  }

  // Печать: works across month boundaries by reading straight from menuData
  // (keyed by real dates), independent of which month is currently open on
  // screen — so a range like "28 июля – 3 августа" pulls both months.
  function setPrintRange(from, to) {
    setPrintFrom(from)
    setPrintTo(to)
    setPrintExcluded(new Set())
  }

  function selectPrintToday() {
    const t = todayKey()
    setPrintRange(t, t)
  }

  function selectPrintWeek() {
    const now = new Date()
    const monday = addDays(now, -mondayIndex(now))
    const sunday = addDays(monday, 6)
    setPrintRange(toKey(monday), toKey(sunday))
  }

  function selectPrintMonth() {
    const first = new Date(cursor.year, cursor.month, 1)
    const last = new Date(cursor.year, cursor.month + 1, 0)
    setPrintRange(toKey(first), toKey(last))
  }

  const printDays = useMemo(() => {
    if (!printFrom || !printTo) return []
    const from = parseLocalDate(printFrom)
    const to = parseLocalDate(printTo)
    if (to < from) return []
    const list = []
    let d = from
    let guard = 0
    while (d <= to && guard < 90) {
      const mk = monthKeyOf(d)
      const dayNum = d.getDate()
      const dayData = menuData[mk]?.[dayNum]
      const courses = dayData ? coursesForDay(dayData).filter((c) => c.dish) : []
      list.push({ key: toKey(d), date: new Date(d), courses })
      d = addDays(d, 1)
      guard += 1
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printFrom, printTo, menuData])

  const printSelectedDays = printDays.filter((d) => !printExcluded.has(d.key))

  function togglePrintDay(key, checked) {
    setPrintExcluded((prev) => {
      const next = new Set(prev)
      if (checked) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function printSelectedRange() {
    if (printSelectedDays.length === 0) return
    const title = printFrom === printTo
      ? `Меню на ${formatRu(parseLocalDate(printFrom))}`
      : `Меню ${formatRu(parseLocalDate(printFrom))} — ${formatRu(parseLocalDate(printTo))}`
    printReport({
      type: 'menu',
      title,
      days: printSelectedDays.map((d) => ({
        day: String(d.date.getDate()).padStart(2, '0'),
        weekday: WEEKDAYS_RU[mondayIndex(d.date)],
        courses: d.courses,
      })),
    })
  }

  function runImport() {
    const { rows, skipped } = parseMenuImport(importText)
    let imported = 0
    let skippedExisting = 0

    setMenuData((prev) => {
      const cur = { ...(prev[monthKey] || {}) }
      rows.forEach(({ day, dishes, kosher }) => {
        if (day > totalDays) return
        const existing = cur[day]
        const hasExisting = existing && coursesForDay(existing).some((c) => c.dish)
        if (hasExisting && !overwriteExisting) {
          skippedExisting += 1
          return
        }
        imported += 1
        cur[day] = {
          courses: dishes.map((dish, i) => {
            const label = DEFAULT_MENU_COURSES[i] || `Блюдо ${i + 1}`
            commitDish(label, dish)
            return { id: `c-${Date.now()}-${i}`, label, dish, kosher: dish ? kosher : false }
          }),
        }
      })
      return { ...prev, [monthKey]: cur }
    })

    const parts = [`Импортировано дней: ${imported}`]
    if (skippedExisting) parts.push(`пропущено (уже заполнено): ${skippedExisting}`)
    if (skipped.length) parts.push(`не распознано строк: ${skipped.length}`)
    setImportResult(parts.join(', '))
    setImportText('')
  }

  const recipeNames = useMemo(() => (recipes || []).map((r) => r.name), [recipes])

  function suggestionsFor(label) {
    const fromLibrary = dishLibrary?.[label] || []
    const seen = new Set()
    const combined = []
    for (const dish of [...recipeNames, ...fromLibrary]) {
      const key = dish.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      combined.push(dish)
    }
    return combined
  }

  // Native <input list=datalist> dropdowns turned out unreliable on real
  // devices (no visible arrow/affordance on most, inconsistent across
  // browsers) — same problem already worked around elsewhere in this app.
  // This is a custom dropdown instead: an explicit arrow button opens it,
  // portalled to document.body since the day card it lives in clips
  // overflow for its rounded corners.
  const [openDishDropdown, setOpenDishDropdown] = useState(null)
  const [dishDropdownRect, setDishDropdownRect] = useState(null)
  const openDishWrapRef = useRef(null)

  function openDishSuggestions(e, courseId) {
    const wrap = e.currentTarget.closest('.dish-input-wrap')
    if (!wrap) return
    if (openDishDropdown === courseId) {
      setOpenDishDropdown(null)
      return
    }
    openDishWrapRef.current = wrap
    setDishDropdownRect(computeDropdownRect(wrap))
    setOpenDishDropdown(courseId)
  }

  // A rect computed once at open time goes stale on scroll or when the
  // on-screen keyboard opens/closes (mobile browsers resize the visual
  // viewport) — reported as the dropdown drifting away from its field and
  // ending up hidden under the keyboard. Keep it locked to the field for as
  // long as it's open.
  useEffect(() => {
    if (!openDishDropdown) return
    const update = () => {
      if (openDishWrapRef.current) setDishDropdownRect(computeDropdownRect(openDishWrapRef.current))
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [openDishDropdown])

  useEffect(() => {
    if (menuTab !== 'recipes' || !pendingRecipeScrollRef.current) return
    const id = pendingRecipeScrollRef.current
    pendingRecipeScrollRef.current = null
    const t = setTimeout(() => {
      document.getElementById(`recipe-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
    return () => clearTimeout(t)
  }, [menuTab, expandedRecipeId])

  // Undoes the "jump to a specific recipe" scroll above when coming back —
  // without this, returning to Меню lands the browser's own (wrong)
  // scroll-restoration guess, often the very bottom of the calendar, since
  // Рецепты was scrolled much further down than Меню is tall.
  useEffect(() => {
    if (menuTab !== 'calendar' || pendingDayScrollRef.current == null) return
    const day = pendingDayScrollRef.current
    pendingDayScrollRef.current = null
    const t = setTimeout(() => {
      document.getElementById(`menu-day-${day}`)?.scrollIntoView({ behavior: 'auto', block: 'start' })
    }, 50)
    return () => clearTimeout(t)
  }, [menuTab])

  // Опening Меню always lands on the current month (see cursor's initial
  // state above) but day 1 is still at the top of a long list — jump straight
  // to today's card once per mount so it doesn't take a manual scroll every time.
  useEffect(() => {
    if (menuTab !== 'calendar') return
    const now = new Date()
    if (cursor.year !== now.getFullYear() || cursor.month !== now.getMonth()) return
    const day = now.getDate()
    const t = setTimeout(() => {
      document.getElementById(`menu-day-${day}`)?.scrollIntoView({ behavior: 'auto', block: 'start' })
    }, 50)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="pb-4">
      <div
        className="sticky z-20 -mx-3 px-3 pt-2 pb-1.5 mb-2 bg-slate-100 dark:bg-slate-950 flex gap-1.5 overflow-x-auto"
        style={{ top: 'var(--app-header-h, 64px)' }}
      >
        <button
          onClick={() => setMenuTab('calendar')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            menuTab === 'calendar' ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          <Calendar size={16} /> Меню
        </button>
        <button
          onClick={() => setMenuTab('recipes')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            menuTab === 'recipes' ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          <BookOpen size={16} /> Рецепты
        </button>
      </div>

      {menuTab === 'calendar' && (
      <>
      <Section
        title="Импорт из Google Таблиц"
        icon={Upload}
        right={
          <button
            onClick={() => setShowImport((v) => !v)}
            className="text-xs font-semibold text-orange-600"
          >
            {showImport ? 'Скрыть' : 'Показать'}
          </button>
        }
      >
        {showImport && (
          <>
            <p className="text-xs text-slate-500 mb-2">
              В Google Таблице выделите столбцы <b>День</b> и сколько угодно столбцов с блюдами
              (первые 5 подставятся как «{DEFAULT_MENU_COURSES.join(', ')}», дальше — «Блюдо 6», «Блюдо 7»…),
              последний столбец можно оставить под «Кошер» (да/нет) → Ctrl+C → вставьте сюда → «Импортировать».
            </p>
            <textarea
              className={inputClass + ' h-28 py-2'}
              placeholder={'1\tБорщ\tКурица\tРис\tОвощи\tКомпот\tда\n2\tСуп овощной\tРыба\tКартофель\tСалат\tМорс'}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <label className="flex items-center gap-2 mt-2 mb-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={overwriteExisting}
                onChange={(e) => setOverwriteExisting(e.target.checked)}
                className="w-5 h-5"
              />
              Перезаписывать уже заполненные дни
            </label>
            <div className="flex gap-2">
              <BigButton onClick={runImport} icon={Upload} disabled={!importText.trim()}>
                Импортировать в {MONTHS_RU[cursor.month]}
              </BigButton>
              <button
                onClick={() => { setShowImport(false); setImportText(''); setImportResult(null) }}
                className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
            {importResult && (
              <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mt-2">
                {importResult}
              </p>
            )}
          </>
        )}
      </Section>

      <div className="flex items-center justify-between mb-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 px-2 py-2 shadow-sm">
        <button onClick={() => changeMonth(-1)} className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100">
          <ChevronLeft size={22} />
        </button>
        <p className="font-bold text-slate-800 dark:text-slate-100">{MONTHS_RU[cursor.month]} {cursor.year}</p>
        <button onClick={() => changeMonth(1)} className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100">
          <ChevronRight size={22} />
        </button>
      </div>

      <Section
        title="Печать"
        icon={Printer}
        right={
          <button onClick={() => setShowPrintPanel((v) => !v)} className="text-xs font-semibold text-orange-600">
            {showPrintPanel ? 'Скрыть' : 'Показать'}
          </button>
        }
      >
        {!showPrintPanel ? (
          <p className="text-xs text-slate-500">
            Выберите день, неделю, месяц или свой период — и какие дни из него печатать.
          </p>
        ) : (
          <>
            <div className="flex gap-1.5 mb-3">
              <button
                onClick={selectPrintToday}
                className="flex-1 min-h-[36px] rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
              >
                Сегодня
              </button>
              <button
                onClick={selectPrintWeek}
                className="flex-1 min-h-[36px] rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
              >
                Эта неделя
              </button>
              <button
                onClick={selectPrintMonth}
                className="flex-1 min-h-[36px] rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
              >
                Весь месяц
              </button>
            </div>
            <div className="flex gap-2 mb-1">
              <div className="flex-1 min-w-0">
                <Field label="С">
                  <input
                    type="date"
                    className={inputClass}
                    value={printFrom}
                    onChange={(e) => setPrintRange(e.target.value, printTo)}
                  />
                </Field>
              </div>
              <div className="flex-1 min-w-0">
                <Field label="По">
                  <input
                    type="date"
                    className={inputClass}
                    value={printTo}
                    onChange={(e) => setPrintRange(printFrom, e.target.value)}
                  />
                </Field>
              </div>
            </div>

            {printDays.length === 0 ? (
              <p className="text-sm text-red-600 dark:text-red-400 mb-2">Некорректный период — «По» раньше «С».</p>
            ) : (
              <div className="max-h-64 overflow-y-auto mb-2 -mx-1 px-1">
                {printDays.map((d) => (
                  <CheckRow
                    key={d.key}
                    label={`${formatRu(d.date)} (${WEEKDAYS_RU[mondayIndex(d.date)]})${d.courses.length ? ' — ' + d.courses.length + ' блюд' : ' — пусто'}`}
                    checked={!printExcluded.has(d.key)}
                    onChange={(v) => togglePrintDay(d.key, v)}
                  />
                ))}
              </div>
            )}

            <BigButton onClick={printSelectedRange} icon={Printer} disabled={printSelectedDays.length === 0}>
              Печать выбранных дней ({printSelectedDays.length})
            </BigButton>
          </>
        )}
      </Section>

      <div className="flex flex-col gap-2 mb-4">
        {days.map((day) => {
          const dayData = monthData[day]
          const isOpen = openDay === day
          const courses = isOpen || dayData ? coursesForDay(dayData) : []
          const anyKosher = courses.some((c) => c.kosher)
          const summary = summaryText(day)
          return (
            <div key={day} id={`menu-day-${day}`} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden scroll-mt-32">
              <button
                onClick={() => setOpenDay(isOpen ? null : day)}
                className={`w-full flex items-center justify-between px-3 py-3 min-h-[56px] active:bg-slate-50 ${
                  isOpen ? 'bg-orange-100/80 dark:bg-orange-950/50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center leading-none ${
                      summary
                        ? 'bg-orange-100 dark:bg-orange-900/40'
                        : 'bg-slate-100 dark:bg-slate-700'
                    }`}
                  >
                    <span className={`font-bold text-sm ${summary ? 'text-orange-700 dark:text-orange-300' : 'text-slate-800 dark:text-slate-100'}`}>
                      {day}
                    </span>
                    <span className={`text-[10px] ${summary ? 'text-orange-600/80 dark:text-orange-300/70' : 'text-slate-500'}`}>
                      {dayLabel(day)}
                    </span>
                  </div>
                  <div className="min-w-0 max-w-[45vw]">
                    {dayData?.eventName && (
                      <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 text-left truncate">
                        {dayData.eventName}
                      </p>
                    )}
                    <p className="text-sm text-slate-600 dark:text-slate-300 text-left line-clamp-1">
                      {summary || <span className="text-slate-300">Не заполнено</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {anyKosher && <Badge color="green">Кошер</Badge>}
                  <ChevronDown size={20} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700 bg-gradient-to-b from-orange-100/80 via-orange-50/30 to-transparent dark:from-orange-950/50 dark:via-orange-950/15 dark:to-transparent">
                  <input
                    className={inputClass + ' mb-2'}
                    placeholder="Название дня (праздник, мероприятие) — необязательно"
                    value={dayData?.eventName || ''}
                    onChange={(e) => setDayEventName(day, e.target.value)}
                  />
                  {courses.map((course) => (
                    <div key={course.id} className="rounded-xl border border-slate-200 dark:border-slate-700 px-2 py-2 mb-2">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className="w-20 shrink-0">
                          <input
                            className={inputClass + ' text-xs px-2'}
                            placeholder="Курс"
                            value={course.label}
                            onChange={(e) => updateCourse(day, course.id, { label: e.target.value })}
                          />
                        </div>
                        <div className="dish-input-wrap flex-1 min-w-0 relative">
                          <input
                            className={inputClass + ' pr-9'}
                            placeholder="Блюдо"
                            value={course.dish}
                            onChange={(e) => updateCourse(day, course.id, { dish: e.target.value })}
                            onFocus={(e) => openDishSuggestions(e, course.id)}
                            onBlur={(e) => { commitDish(course.label, e.target.value); setTimeout(() => setOpenDishDropdown(null), 150) }}
                          />
                          <button
                            type="button"
                            tabIndex={-1}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => openDishSuggestions(e, course.id)}
                            className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400"
                          >
                            <ChevronDown size={16} className={openDishDropdown === course.id ? 'rotate-180' : ''} />
                          </button>
                          {openDishDropdown === course.id && dishDropdownRect && createPortal(
                            (() => {
                              const options = suggestionsFor(course.label).filter((d) =>
                                d.toLowerCase().includes((course.dish || '').trim().toLowerCase())
                              )
                              if (options.length === 0) return null
                              return (
                                <div
                                  style={{
                                    position: 'fixed',
                                    top: dishDropdownRect.top,
                                    left: dishDropdownRect.left,
                                    width: dishDropdownRect.width,
                                    maxHeight: dishDropdownRect.maxHeight,
                                  }}
                                  className="z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-y-auto"
                                >
                                  {options.map((dish) => (
                                    <button
                                      key={dish}
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => { updateCourse(day, course.id, { dish }); commitDish(course.label, dish); setOpenDishDropdown(null) }}
                                      className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0"
                                    >
                                      {dish}
                                    </button>
                                  ))}
                                </div>
                              )
                            })(),
                            document.body
                          )}
                        </div>
                        <button
                          onClick={() => updateCourse(day, course.id, { kosher: !course.kosher })}
                          className={`shrink-0 w-11 h-11 rounded-xl border-2 flex items-center justify-center ${
                            course.kosher
                              ? 'bg-green-50 dark:bg-green-900/30 border-green-400 dark:border-green-700 text-green-600 dark:text-green-400'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-300'
                          }`}
                          title="Кашрут"
                        >
                          <ShieldCheck size={18} />
                        </button>
                        {course.dish.trim() && (
                          <button
                            onClick={() => openRecipeFromMenu(course.dish, course.qty, day)}
                            className="shrink-0 w-11 h-11 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-slate-400 flex items-center justify-center"
                            title="Открыть ТК (с коэффициентом этого дня)"
                          >
                            <BookOpen size={18} />
                          </button>
                        )}
                        <ConfirmDeleteButton onConfirm={() => removeCourse(day, course.id)} size="w-9 h-9" iconSize={14} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400 shrink-0">Кол-во:</span>
                        <div className="w-28 shrink-0">
                          <input
                            className={inputClass + ' text-xs px-2'}
                            placeholder="напр. 40 шт"
                            value={course.qty || ''}
                            onChange={(e) => updateCourse(day, course.id, { qty: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => addCourse(day)}
                    className="w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 text-sm font-semibold active:bg-slate-50 mt-1"
                  >
                    <Plus size={16} /> Добавить блюдо
                  </button>

                  <button
                    onClick={() => setShowDayPaste((v) => !v)}
                    className="text-xs font-semibold text-orange-600 mt-2"
                  >
                    {showDayPaste ? 'Скрыть вставку списка' : 'Вставить список (например, для банкета)'}
                  </button>
                  {showDayPaste && (
                    <div className="mt-2">
                      <p className="text-xs text-slate-500 mb-2">
                        По одной позиции на строку: <b>Блюдо - Кол-во</b> (например «Брускетта с
                        лососем - 40 шт»). Подходит и вставка из Google Таблиц (столбцами через
                        Tab). Список добавится к уже существующим блюдам этого дня, не заменит их.
                      </p>
                      <textarea
                        className={inputClass + ' h-24 py-2'}
                        placeholder={'Брускетта классическая с лососем - 40 шт\nКапрезе на шпажках - 20 шт'}
                        value={dayPasteText}
                        onChange={(e) => setDayPasteText(e.target.value)}
                      />
                      <BigButton
                        onClick={() => { pasteDayList(day, dayPasteText); setDayPasteText(''); setShowDayPaste(false) }}
                        icon={Upload}
                        disabled={!dayPasteText.trim()}
                      >
                        Добавить блюда из списка
                      </BigButton>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-2">Значок щита отмечает блюдо как кошерное (кашрут)</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <BigButton onClick={sendMenu} icon={Send} color="orange">Отправить меню Küchenleiterin</BigButton>
        <BigButton onClick={copyMenu} icon={Copy} color="outline" full={false}>Копировать</BigButton>
      </div>
      {sendMessage && (
        <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mt-2">
          {sendMessage}
        </p>
      )}
      <p className="text-xs text-slate-400 mt-2">
        Если кнопка «Отправить» не открывает почту, используйте «Копировать» и вставьте текст вручную.
      </p>
      </>
      )}

      {menuTab === 'recipes' && (
        <>
          <a
            href="https://1400837-create.github.io/Chef/"
            target="_blank"
            rel="noopener"
            className="flex items-center justify-center gap-2 min-h-[44px] mb-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-sm font-semibold active:bg-slate-50 dark:active:bg-slate-800"
          >
            <ExternalLink size={15} /> Открыть Rational Chef OS (параметры печи)
          </a>

          <Section
            title="Импорт из Google Таблиц"
            icon={Upload}
            right={
              <button onClick={() => setShowRecipeImport((v) => !v)} className="text-xs font-semibold text-orange-600">
                {showRecipeImport ? 'Скрыть' : 'Показать'}
              </button>
            }
          >
            {showRecipeImport && (
              <>
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
                <label className="flex items-center gap-2 mt-2 mb-2 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={recipeImportOverwrite}
                    onChange={(e) => setRecipeImportOverwrite(e.target.checked)}
                    className="w-5 h-5"
                  />
                  Перезаписывать уже существующие рецепты (по названию)
                </label>
                {recipeImportMissingPrompt && (
                  <div className="text-sm bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-xl px-3 py-3 mb-2">
                    <p className="text-orange-800 dark:text-orange-200 mb-2">
                      Продукт «{recipeImportMissingPrompt}» не найден в номенклатуре. Добавить его в каталог?
                    </p>
                    <div className="flex gap-2">
                      <BigButton onClick={confirmAddImportIngredient} full={false}>Да, добавить</BigButton>
                      <BigButton onClick={declineImportIngredient} color="outline" full={false}>Нет</BigButton>
                    </div>
                  </div>
                )}
                <BigButton onClick={runRecipeImport} icon={Upload} disabled={!recipeImportText.trim()}>
                  Импортировать рецепты
                </BigButton>
                {recipeImportResult && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mt-2">
                    {recipeImportResult}
                  </p>
                )}
              </>
            )}
          </Section>

          <Section
            title={`Рецепты (${recipes.length})`}
            icon={BookOpen}
            right={
              recipePrintMode ? (
                <button
                  onClick={() => { setRecipePrintMode(false); setSelectedForPrint(new Set()) }}
                  className="text-xs font-semibold text-slate-500"
                >
                  Отмена
                </button>
              ) : (
                <button onClick={() => setRecipePrintMode(true)} className="text-xs font-semibold text-orange-600">
                  Печать ТТК
                </button>
              )
            }
          >
            {recipes.length === 0 && <p className="text-sm text-slate-400 text-center py-2">Рецептов пока нет</p>}
            <div className="flex flex-col gap-2">
              {recipes.map((r) => {
                const isExpanded = expandedRecipeId === r.id
                const isEditing = editingRecipeId === r.id
                const isSelected = selectedForPrint.has(r.id)
                const cost = recipeCost(r)
                return (
                  <div key={r.id} id={`recipe-${r.id}`} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden scroll-mt-32">
                    <button
                      onClick={() => (recipePrintMode ? toggleSelectForPrint(r.id) : toggleExpandRecipe(r))}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-3 min-h-[52px] active:bg-slate-50 dark:active:bg-slate-700 ${
                        isExpanded && !recipePrintMode ? 'bg-orange-100/80 dark:bg-orange-950/50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {recipePrintMode && (
                          <span
                            className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center ${
                              isSelected ? 'bg-orange-500 border-orange-500' : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {isSelected && <Check size={14} className="text-white" />}
                          </span>
                        )}
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            setZoomedRecipeThumbId(zoomedRecipeThumbId === r.id ? null : r.id)
                          }}
                          className={`shrink-0 rounded-md overflow-hidden transition-all duration-200 ${
                            zoomedRecipeThumbId === r.id ? 'w-[108px] h-[108px]' : 'w-9 h-9'
                          }`}
                        >
                          {r.photo ? (
                            <img src={r.photo} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="block w-full h-full bg-orange-100 dark:bg-orange-900/30" />
                          )}
                        </span>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{r.name}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {cost !== null && <Badge color="green">≈ {cost.toFixed(2)}</Badge>}
                        {!recipePrintMode && (
                          <ChevronDown size={18} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </button>

                    {isExpanded && !recipePrintMode && !isEditing && (
                      <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700 bg-gradient-to-b from-orange-100/80 via-orange-50/30 to-transparent dark:from-orange-950/50 dark:via-orange-950/15 dark:to-transparent">
                        {r.photo && (
                          <img src={r.photo} alt={r.name} className="w-full max-h-56 object-cover rounded-lg mb-2" />
                        )}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-slate-500">Коэффициент (рецепт указан как есть):</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            className={inputClass + ' w-16 text-xs text-center px-1'}
                            value={recipeCoefficient}
                            onChange={(e) => setRecipeCoefficient(sanitizeDecimal(e.target.value))}
                          />
                        </div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                          Ингредиенты{Number(recipeCoefficient) !== 1 ? ` (×${recipeCoefficient})` : ''}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                          {r.ingredients.map((ing) => {
                            const product = recountCatalog.find((p) => String(p.id) === String(ing.productId))
                            const coef = Number(recipeCoefficient) || 1
                            const scaledQty = Math.round((Number(ing.qty) || 0) * coef * 100) / 100
                            return `${product?.name || '?'} × ${scaledQty}${product?.unit ? ' ' + product.unit : ''}`
                          }).join(', ')}
                        </p>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Технология приготовления</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap mb-3">
                          {r.comment || <span className="text-slate-400">Не описано</span>}
                        </p>
                        <div className="flex gap-2">
                          <BigButton onClick={() => startEditRecipe(r)} icon={Pencil} color="outline" full={false}>
                            Редактировать
                          </BigButton>
                          <PrintButton onClick={() => printOneTtk(r)} label="Печать ТТК" />
                          <ConfirmDeleteButton onConfirm={() => removeRecipe(r.id)} />
                        </div>
                      </div>
                    )}

                    {isExpanded && !recipePrintMode && isEditing && (
                      <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700">
                        <RecipeFormFields
                          recipeForm={recipeForm}
                          setRecipeForm={setRecipeForm}
                          addIngredientRow={addIngredientRow}
                          updateIngredientRow={updateIngredientRow}
                          removeIngredientRow={removeIngredientRow}
                          handleRecipePhoto={handleRecipePhoto}
                          removeRecipePhoto={removeRecipePhoto}
                          recipePhotoProcessing={recipePhotoProcessing}
                          recipePhotoError={recipePhotoError}
                        />
                        {missingProductPrompt && (
                          <div className="text-sm bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-xl px-3 py-3 mb-2">
                            <p className="text-orange-800 dark:text-orange-200 mb-2">
                              Продукт «{missingProductPrompt}» не найден в номенклатуре. Добавить его в каталог?
                            </p>
                            <div className="flex gap-2">
                              <BigButton onClick={confirmAddMissingProduct} full={false}>Да, добавить</BigButton>
                              <BigButton onClick={cancelMissingProduct} color="outline" full={false}>Нет</BigButton>
                            </div>
                          </div>
                        )}
                        {recipeError && (
                          <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 mb-2">
                            {recipeError}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <BigButton onClick={saveRecipe}>Сохранить изменения</BigButton>
                          <BigButton onClick={cancelEditRecipe} color="outline" full={false}>Отмена</BigButton>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {recipePrintMode && (
              <BigButton
                onClick={printSelectedTtk}
                icon={Printer}
                disabled={selectedForPrint.size === 0}
              >
                Печать ТТК ({selectedForPrint.size})
              </BigButton>
            )}
          </Section>

          <Section
            title="Новый рецепт"
            icon={Plus}
            right={
              showNewRecipeForm && (
                <button onClick={closeNewRecipeForm} className="text-xs font-semibold text-slate-500">
                  Скрыть
                </button>
              )
            }
          >
            {!showNewRecipeForm ? (
              <BigButton onClick={openNewRecipeForm} icon={Plus}>Добавить рецепт</BigButton>
            ) : (
              <>
                <RecipeFormFields
                  recipeForm={recipeForm}
                  setRecipeForm={setRecipeForm}
                  addIngredientRow={addIngredientRow}
                  updateIngredientRow={updateIngredientRow}
                  removeIngredientRow={removeIngredientRow}
                  handleRecipePhoto={handleRecipePhoto}
                  removeRecipePhoto={removeRecipePhoto}
                  recipePhotoProcessing={recipePhotoProcessing}
                  recipePhotoError={recipePhotoError}
                />
                {missingProductPrompt && (
                  <div className="text-sm bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-xl px-3 py-3 mb-2">
                    <p className="text-orange-800 dark:text-orange-200 mb-2">
                      Продукт «{missingProductPrompt}» не найден в номенклатуре. Добавить его в каталог?
                    </p>
                    <div className="flex gap-2">
                      <BigButton onClick={confirmAddMissingProduct} full={false}>Да, добавить</BigButton>
                      <BigButton onClick={cancelMissingProduct} color="outline" full={false}>Нет</BigButton>
                    </div>
                  </div>
                )}
                {recipeError && (
                  <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 mb-2">
                    {recipeError}
                  </p>
                )}
                <BigButton onClick={saveRecipe} icon={Plus}>Сохранить рецепт</BigButton>
              </>
            )}
          </Section>

          <Section
            title="Ещё способы импорта"
            icon={Upload}
            right={
              <button onClick={() => setShowAdvancedImport((v) => !v)} className="text-xs font-semibold text-orange-600">
                {showAdvancedImport ? 'Скрыть' : 'Показать'}
              </button>
            }
          >
            {showAdvancedImport && (
              <>
                <select
                  className={inputClass + ' mb-3'}
                  value={advancedImportTab}
                  onChange={(e) => setAdvancedImportTab(e.target.value)}
                >
                  <option value="rational">Импорт из Rational Chef OS</option>
                  <option value="photo">Импорт фото рецептов</option>
                </select>

                {advancedImportTab === 'rational' && (
                  <>
                    <p className="text-xs text-slate-500 mb-2">
                      В Rational Chef OS: «⋮» → «Экспорт для LA CHEF» — данные скопируются в буфер обмена.
                      Вставьте их сюда. Ингредиенты, которых ещё нет в номенклатуре, будут созданы автоматически
                      (с единицей измерения из экспорта); режим печи, влажность и кашрут попадут в
                      «Технологию приготовления» текстом.
                    </p>
                    <textarea
                      className={inputClass + ' h-28 py-2'}
                      placeholder='[{"name":"Бульон","ingredients":[...],"description":"..."}]'
                      value={rationalImportText}
                      onChange={(e) => setRationalImportText(e.target.value)}
                    />
                    <label className="flex items-center gap-2 mt-2 mb-2 text-sm text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={rationalImportOverwrite}
                        onChange={(e) => setRationalImportOverwrite(e.target.checked)}
                        className="w-5 h-5"
                      />
                      Перезаписывать уже существующие рецепты (по названию)
                    </label>
                    <BigButton onClick={importFromRationalChef} icon={Upload} disabled={!rationalImportText.trim()}>
                      Импортировать рецепты
                    </BigButton>
                    {rationalImportResult && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mt-2">
                        {rationalImportResult}
                      </p>
                    )}
                  </>
                )}

                {advancedImportTab === 'photo' && (
                  <>
                    <p className="text-xs text-slate-500 mb-2">
                      Фото, сопоставленные по номеру ТК (готовит ассистент), подставятся в рецепты
                      автоматически по номеру в названии. Загрузите файл или вставьте текст —
                      что получится на вашем устройстве.
                    </p>
                    <label className="flex items-center gap-2 min-h-[48px] px-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800">
                      <Upload size={18} />
                      <span className="text-sm">Выбрать JSON-файл</span>
                      <input
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          e.target.value = ''
                          if (file) importRecipePhotosFromJson(file)
                        }}
                      />
                    </label>
                    <p className="text-xs text-slate-400 text-center my-2">— или —</p>
                    <textarea
                      className={inputClass + ' h-20 py-2'}
                      placeholder='Вставьте сюда скопированный JSON: {"105":"data:image/...", ...}'
                      value={photoImportText}
                      onChange={(e) => setPhotoImportText(e.target.value)}
                    />
                    <BigButton onClick={importRecipePhotosFromText} icon={ImageIcon} disabled={!photoImportText.trim()}>
                      Импортировать вставленные фото
                    </BigButton>
                    {photoImportResult && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mt-2">
                        {photoImportResult}
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </Section>
        </>
      )}

    </div>
  )
}

// Defined as a real top-level component (not nested inside MenuPlanner) so it
// keeps a stable identity across renders — a component defined inline inside
// another component's render body gets treated as a brand-new type on every
// render, which would remount this form (and drop focus/input state) on
// every keystroke.
function RecipeFormFields({
  recipeForm, setRecipeForm, addIngredientRow, updateIngredientRow, removeIngredientRow,
  handleRecipePhoto, removeRecipePhoto, recipePhotoProcessing, recipePhotoError,
}) {
  return (
    <>
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
              type="text"
              inputMode="decimal"
              className={inputClass}
              placeholder="Кол-во"
              value={ing.qty}
              onChange={(e) => updateIngredientRow(idx, { qty: sanitizeDecimal(e.target.value) })}
            />
          </div>
          <button
            onClick={() => removeIngredientRow(idx)}
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        onClick={addIngredientRow}
        className="w-full min-h-[40px] flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 text-sm font-semibold active:bg-slate-50 mb-2"
      >
        <Plus size={14} /> Ингредиент
      </button>

      <Field label="Технология приготовления">
        <textarea
          className={inputClass + ' h-24 py-2'}
          placeholder="Опишите процесс приготовления…"
          value={recipeForm.comment}
          onChange={(e) => setRecipeForm((f) => ({ ...f, comment: e.target.value }))}
        />
      </Field>

      <Field label="Фото блюда (необязательно)">
        {recipeForm.photo ? (
          <div className="relative">
            <img src={recipeForm.photo} alt="" className="w-full max-h-48 object-cover rounded-xl" />
            <button
              onClick={removeRecipePhoto}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <label className="flex-1 flex items-center justify-center gap-2 min-h-[48px] px-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800">
              <Camera size={20} />
              <span className="text-sm">{recipePhotoProcessing ? 'Обработка…' : 'Камера'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  e.target.value = ''
                  if (file) handleRecipePhoto(file)
                }}
              />
            </label>
            <label className="flex-1 flex items-center justify-center gap-2 min-h-[48px] px-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800">
              <ImageIcon size={20} />
              <span className="text-sm">{recipePhotoProcessing ? 'Обработка…' : 'Галерея'}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  e.target.value = ''
                  if (file) handleRecipePhoto(file)
                }}
              />
            </label>
          </div>
        )}
        {recipePhotoError && (
          <p className="text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 mt-2">
            {recipePhotoError}
          </p>
        )}
      </Field>
    </>
  )
}
