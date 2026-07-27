import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Send, ShieldCheck, ChevronDown, Mail, Upload, X, Copy, Plus } from 'lucide-react'
import { Section, Field, inputClass, BigButton, Badge, PrintButton, ConfirmDeleteButton } from '../components/UI'
import { DEFAULT_MENU_COURSES, MENU_SLOTS_LEGACY } from '../utils/constants'
import { MONTHS_RU, WEEKDAYS_RU, daysInMonth, mondayIndex } from '../utils/dateUtils'
import { parseMenuImport } from '../utils/importParsers'
import { printReport } from '../utils/printReport'

function slugify(label) {
  return (label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'blyudo'
}

// A day's courses used to be 4 fixed fields (soup/main/side/salad). They're
// now a free-form, addable list — this reads both the new `courses` array
// and, for days saved before the change, migrates the old fixed fields on
// the fly (nothing is lost, it's just not persisted in the old shape again).
function coursesForDay(dayData) {
  if (dayData?.courses) return dayData.courses
  if (dayData && MENU_SLOTS_LEGACY.some((s) => dayData[s.key])) {
    return MENU_SLOTS_LEGACY.map((slot) => ({
      id: `legacy-${slot.key}`,
      label: slot.label,
      dish: dayData[slot.key] || '',
      kosher: !!dayData[`${slot.key}Kosher`],
    }))
  }
  return DEFAULT_MENU_COURSES.map((label, i) => ({ id: `default-${i}`, label, dish: '', kosher: false }))
}

export default function MenuPlanner({ menuData, setMenuData, settings, setSettings, dishLibrary, setDishLibrary }) {
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
    const newCourse = { id: `c-${Date.now()}`, label: `Блюдо ${courses.length + 1}`, dish: '', kosher: false }
    setDayCourses(day, [...courses, newCourse])
  }

  function removeCourse(day, courseId) {
    const courses = coursesForDay(monthData[day]).filter((c) => c.id !== courseId)
    setDayCourses(day, courses)
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
    return coursesForDay(dayData).map((c) => c.dish).filter(Boolean).join(' · ')
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
        lines.push(`  ${c.label}: ${c.dish}${c.kosher ? ' [кошер]' : ''}`)
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

  function printMenu() {
    printReport({
      type: 'menu',
      title: `Меню на ${MONTHS_RU[cursor.month]} ${cursor.year}`,
      days: days.map((day) => ({
        day: String(day).padStart(2, '0'),
        weekday: dayLabel(day),
        courses: monthData[day] ? coursesForDay(monthData[day]) : [],
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

  const allLabels = useMemo(() => Object.keys(dishLibrary || {}), [dishLibrary])

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
            <label className="flex items-center gap-2 mt-2 mb-2 text-sm text-slate-600">
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
                className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
            {importResult && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-2">
                {importResult}
              </p>
            )}
          </>
        )}
      </Section>

      <div className="flex items-center justify-between mb-3 bg-white rounded-2xl border border-slate-200 px-2 py-2 shadow-sm">
        <button onClick={() => changeMonth(-1)} className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100">
          <ChevronLeft size={22} />
        </button>
        <p className="font-bold text-slate-800">{MONTHS_RU[cursor.month]} {cursor.year}</p>
        <button onClick={() => changeMonth(1)} className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100">
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="flex justify-end mb-2">
        <PrintButton onClick={printMenu} label="Печать меню на месяц" />
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {days.map((day) => {
          const dayData = monthData[day]
          const isOpen = openDay === day
          const courses = isOpen || dayData ? coursesForDay(dayData) : []
          const anyKosher = courses.some((c) => c.kosher)
          return (
            <div key={day} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setOpenDay(isOpen ? null : day)}
                className="w-full flex items-center justify-between px-3 py-3 min-h-[56px] active:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 flex flex-col items-center justify-center leading-none">
                    <span className="font-bold text-slate-800 text-sm">{day}</span>
                    <span className="text-[10px] text-slate-500">{dayLabel(day)}</span>
                  </div>
                  <p className="text-sm text-slate-600 text-left line-clamp-1 max-w-[45vw]">
                    {summaryText(day) || <span className="text-slate-300">Не заполнено</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {anyKosher && <Badge color="green">Кошер</Badge>}
                  <ChevronDown size={20} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-100">
                  {courses.map((course) => (
                    <div key={course.id} className="flex items-center gap-1.5 mb-2">
                      <div className="w-20 shrink-0">
                        <input
                          className={inputClass + ' text-xs px-2'}
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
                            ? 'bg-green-50 border-green-400 text-green-600'
                            : 'bg-white border-slate-200 text-slate-300'
                        }`}
                        title="Кашрут"
                      >
                        <ShieldCheck size={18} />
                      </button>
                      <ConfirmDeleteButton onConfirm={() => removeCourse(day, course.id)} size="w-9 h-9" iconSize={14} />
                    </div>
                  ))}
                  <button
                    onClick={() => addCourse(day)}
                    className="w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 text-sm font-semibold active:bg-slate-50 mt-1"
                  >
                    <Plus size={16} /> Добавить блюдо
                  </button>
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
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-2">
          {sendMessage}
        </p>
      )}
      <p className="text-xs text-slate-400 mt-2">
        Если кнопка «Отправить» не открывает почту, используйте «Копировать» и вставьте текст вручную.
      </p>

      {allLabels.map((label) => (
        <datalist key={label} id={`dishlist-${slugify(label)}`}>
          {(dishLibrary[label] || []).map((dish) => (
            <option key={dish} value={dish} />
          ))}
        </datalist>
      ))}
    </div>
  )
}
