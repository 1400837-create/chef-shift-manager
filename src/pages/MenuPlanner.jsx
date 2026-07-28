import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Send, ShieldCheck, ChevronDown, Mail, Upload, X, Copy, Plus, Printer } from 'lucide-react'
import { Section, Field, inputClass, BigButton, Badge, ConfirmDeleteButton, CheckRow } from '../components/UI'
import { DEFAULT_MENU_COURSES } from '../utils/constants'
import {
  MONTHS_RU, WEEKDAYS_RU, daysInMonth, mondayIndex, formatRu,
  todayKey, toKey, parseLocalDate, addDays, monthKey as monthKeyOf,
} from '../utils/dateUtils'
import { parseMenuImport } from '../utils/importParsers'
import { printReport } from '../utils/printReport'
import { coursesForDay } from '../utils/menuCourses'

function slugify(label) {
  return (label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'blyudo'
}

export default function MenuPlanner({ menuData, setMenuData, settings, setSettings, dishLibrary, setDishLibrary, recipes }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [openDay, setOpenDay] = useState(null)

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
