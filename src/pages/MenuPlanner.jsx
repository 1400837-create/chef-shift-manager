import { useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Send, ShieldCheck, ChevronDown, Mail, Upload, X, Copy, Plus, Printer,
  BookOpen, Pencil, Camera, Calendar, Check,
} from 'lucide-react'
import { Section, Field, inputClass, BigButton, Badge, ConfirmDeleteButton, CheckRow } from '../components/UI'
import { DEFAULT_MENU_COURSES } from '../utils/constants'
import {
  MONTHS_RU, WEEKDAYS_RU, daysInMonth, mondayIndex, formatRu,
  todayKey, toKey, parseLocalDate, addDays, monthKey as monthKeyOf,
} from '../utils/dateUtils'
import { parseMenuImport, parseRecipesImport } from '../utils/importParsers'
import { printReport } from '../utils/printReport'
import { coursesForDay } from '../utils/menuCourses'
import { computeRecipeCost } from '../utils/recipeCost'
import { compressToDataUrl } from '../utils/imageCompress'
import { sanitizeDecimal } from '../utils/number'

function slugify(label) {
  return (label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'blyudo'
}

export default function MenuPlanner({
  menuData, setMenuData, settings, setSettings, dishLibrary, setDishLibrary,
  recipes, setRecipes, recountCatalog,
}) {
  const [menuTab, setMenuTab] = useState('calendar')
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [openDay, setOpenDay] = useState(null)

  // Рецепты tab state
  const [showRecipeImport, setShowRecipeImport] = useState(false)
  const [recipeImportText, setRecipeImportText] = useState('')
  const [recipeImportOverwrite, setRecipeImportOverwrite] = useState(false)
  const [recipeImportResult, setRecipeImportResult] = useState(null)
  const [recipeForm, setRecipeForm] = useState({ name: '', ingredients: [{ productName: '', qty: '' }], comment: '', photo: null })
  const [recipeError, setRecipeError] = useState(null)
  const [showNewRecipeForm, setShowNewRecipeForm] = useState(false)
  const [expandedRecipeId, setExpandedRecipeId] = useState(null)
  const [editingRecipeId, setEditingRecipeId] = useState(null)
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
      [monthKey]: { ...(prev[monthKey] || {}), [day]: { courses } },
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
    return recountCatalog.find((p) => p.name.trim().toLowerCase() === key) || null
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
    setEditingRecipeId(null)
    setExpandedRecipeId(null)
    setShowNewRecipeForm(true)
  }

  function closeNewRecipeForm() {
    setShowNewRecipeForm(false)
    setRecipeForm(blankRecipeForm())
    setRecipeError(null)
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
  }

  function cancelEditRecipe() {
    setEditingRecipeId(null)
    setRecipeError(null)
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

  function removeRecipe(id) {
    setRecipes((prev) => prev.filter((r) => r.id !== id))
    if (expandedRecipeId === id) setExpandedRecipeId(null)
    if (editingRecipeId === id) setEditingRecipeId(null)
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

  const allLabels = useMemo(
    () => [...new Set([...DEFAULT_MENU_COURSES, ...Object.keys(dishLibrary || {})])],
    [dishLibrary]
  )
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

  return (
    <div className="pb-4">
      <div className="flex gap-1.5 mb-4 overflow-x-auto -mx-3 px-3">
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
      <Section title="Email Küchenleiterin" icon={Mail}>
        <Field label="Куда отправлять меню">
          <input
            className={inputClass}
            placeholder="kuechenleiterin@example.com"
            value={settings.kuchenleiterinEmail || ''}
            onChange={(e) => setSettings((s) => ({ ...s, kuchenleiterinEmail: e.target.value }))}
          />
        </Field>
      </Section>

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
          return (
            <div key={day} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <button
                onClick={() => setOpenDay(isOpen ? null : day)}
                className="w-full flex items-center justify-between px-3 py-3 min-h-[56px] active:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-700 flex flex-col items-center justify-center leading-none">
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">{day}</span>
                    <span className="text-[10px] text-slate-500">{dayLabel(day)}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 text-left line-clamp-1 max-w-[45vw]">
                    {summaryText(day) || <span className="text-slate-300">Не заполнено</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {anyKosher && <Badge color="green">Кошер</Badge>}
                  <ChevronDown size={20} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700">
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
                        <div className="flex-1 min-w-0">
                          <input
                            className={inputClass}
                            placeholder="Блюдо"
                            list={`dishlist-${slugify(course.label)}`}
                            value={course.dish}
                            onChange={(e) => updateCourse(day, course.id, { dish: e.target.value })}
                            onBlur={(e) => commitDish(course.label, e.target.value)}
                          />
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
                <BigButton onClick={importRecipes} icon={Upload} disabled={!recipeImportText.trim()}>
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
                  <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button
                      onClick={() => (recipePrintMode ? toggleSelectForPrint(r.id) : toggleExpandRecipe(r))}
                      className="w-full flex items-center justify-between gap-2 px-3 py-3 min-h-[52px] active:bg-slate-50 dark:active:bg-slate-700"
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
                      <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700">
                        {r.photo && (
                          <img src={r.photo} alt={r.name} className="w-full max-h-56 object-cover rounded-lg mb-2" />
                        )}
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Ингредиенты</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                          {r.ingredients.map((ing) => {
                            const product = recountCatalog.find((p) => String(p.id) === String(ing.productId))
                            return `${product?.name || '?'} × ${ing.qty}${product?.unit ? ' ' + product.unit : ''}`
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
                {recipeError && (
                  <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 mb-2">
                    {recipeError}
                  </p>
                )}
                <BigButton onClick={saveRecipe} icon={Plus}>Сохранить рецепт</BigButton>
              </>
            )}
          </Section>
        </>
      )}

      {allLabels.map((label) => (
        <datalist key={label} id={`dishlist-${slugify(label)}`}>
          {suggestionsFor(label).map((dish) => (
            <option key={dish} value={dish} />
          ))}
        </datalist>
      ))}
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
          <label className="flex items-center gap-2 min-h-[48px] px-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 cursor-pointer active:bg-slate-50">
            <Camera size={20} />
            <span className="text-sm">{recipePhotoProcessing ? 'Обработка фото…' : 'Сфотографировать / выбрать фото'}</span>
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
