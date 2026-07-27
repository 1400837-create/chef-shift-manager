import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Send, ShieldCheck, ChevronDown, Mail, Upload, X } from 'lucide-react'
import { Section, Field, inputClass, BigButton, Badge, PrintButton } from '../components/UI'
import { MENU_SLOTS } from '../utils/constants'
import { MONTHS_RU, WEEKDAYS_RU, daysInMonth, mondayIndex } from '../utils/dateUtils'
import { parseMenuImport } from '../utils/importParsers'

export default function MenuPlanner({ menuData, setMenuData, settings, setSettings, dishLibrary, setDishLibrary, requestPrint }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [openDay, setOpenDay] = useState(null)

  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [overwriteExisting, setOverwriteExisting] = useState(false)
  const [importResult, setImportResult] = useState(null)

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

  function updateDay(day, patch) {
    setMenuData((prev) => ({
      ...prev,
      [monthKey]: { ...(prev[monthKey] || {}), [day]: { ...(prev[monthKey]?.[day] || {}), ...patch } },
    }))
  }

  function commitDish(slotKey, value) {
    const dish = value.trim()
    if (!dish) return
    setDishLibrary((prev) => {
      const list = prev[slotKey] || []
      if (list.some((d) => d.toLowerCase() === dish.toLowerCase())) return prev
      return { ...prev, [slotKey]: [dish, ...list].slice(0, 40) }
    })
  }

  function dayLabel(day) {
    const date = new Date(cursor.year, cursor.month, day)
    return WEEKDAYS_RU[mondayIndex(date)]
  }

  function summaryText(dayData) {
    if (!dayData) return ''
    return MENU_SLOTS.map((s) => dayData[s.key]).filter(Boolean).join(' · ')
  }

  function sendMenu() {
    const lines = [`Меню на ${MONTHS_RU[cursor.month]} ${cursor.year}`, '']
    days.forEach((day) => {
      const dayData = monthData[day]
      if (!dayData || !MENU_SLOTS.some((s) => dayData[s.key])) return
      lines.push(`${String(day).padStart(2, '0')}.${String(cursor.month + 1).padStart(2, '0')} (${dayLabel(day)}):`)
      MENU_SLOTS.forEach((slot) => {
        const dish = dayData[slot.key]
        if (!dish) return
        const kosher = dayData[`${slot.key}Kosher`] ? ' [кошер]' : ''
        lines.push(`  ${slot.label}: ${dish}${kosher}`)
      })
      lines.push('')
    })
    const body = encodeURIComponent(lines.join('\n'))
    const subject = encodeURIComponent(`Меню на ${MONTHS_RU[cursor.month]} ${cursor.year}`)
    const to = encodeURIComponent(settings.kuchenleiterinEmail || '')
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
  }

  function printMenu() {
    requestPrint({
      type: 'menu',
      title: `Меню на ${MONTHS_RU[cursor.month]} ${cursor.year}`,
      rows: days.map((day) => {
        const dayData = monthData[day] || {}
        return {
          day: String(day).padStart(2, '0'),
          weekday: dayLabel(day),
          soup: dayData.soup || '',
          soupKosher: !!dayData.soupKosher,
          main: dayData.main || '',
          mainKosher: !!dayData.mainKosher,
          side: dayData.side || '',
          sideKosher: !!dayData.sideKosher,
          salad: dayData.salad || '',
          saladKosher: !!dayData.saladKosher,
        }
      }),
    })
  }

  function runImport() {
    const { rows, skipped } = parseMenuImport(importText)
    let imported = 0
    let skippedExisting = 0

    setMenuData((prev) => {
      const cur = { ...(prev[monthKey] || {}) }
      rows.forEach(({ day, soup, main, side, salad, kosher }) => {
        if (day > totalDays) return
        const existing = cur[day]
        const hasExisting = existing && MENU_SLOTS.some((s) => existing[s.key])
        if (hasExisting && !overwriteExisting) {
          skippedExisting += 1
          return
        }
        imported += 1
        cur[day] = {
          soup, main, side, salad,
          soupKosher: kosher, mainKosher: kosher, sideKosher: kosher, saladKosher: kosher,
        }
        commitDish('soup', soup)
        commitDish('main', main)
        commitDish('side', side)
        commitDish('salad', salad)
      })
      return { ...prev, [monthKey]: cur }
    })

    const parts = [`Импортировано дней: ${imported}`]
    if (skippedExisting) parts.push(`пропущено (уже заполнено): ${skippedExisting}`)
    if (skipped.length) parts.push(`не распознано строк: ${skipped.length}`)
    setImportResult(parts.join(', '))
    setImportText('')
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
              В Google Таблице выделите столбцы <b>День, Суп, Горячее, Гарнир, Салат</b> (и, при желании,
              шестой столбец «Кошер»: да/нет) → Ctrl+C → вставьте сюда → «Импортировать».
            </p>
            <textarea
              className={inputClass + ' h-28 py-2'}
              placeholder={'1\tБорщ\tКурица\tРис\tОвощи\tда\n2\tСуп овощной\tРыба\tКартофель\tСалат'}
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
          const anyKosher = MENU_SLOTS.some((s) => dayData?.[`${s.key}Kosher`])
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
                    {summaryText(dayData) || <span className="text-slate-300">Не заполнено</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {anyKosher && <Badge color="green">Кошер</Badge>}
                  <ChevronDown size={20} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-100">
                  {MENU_SLOTS.map((slot) => (
                    <div key={slot.key} className="flex items-center gap-2 mb-2">
                      <input
                        className={inputClass + ' flex-1'}
                        placeholder={slot.label}
                        list={`dishlist-${slot.key}`}
                        value={dayData?.[slot.key] || ''}
                        onChange={(e) => updateDay(day, { [slot.key]: e.target.value })}
                        onBlur={(e) => commitDish(slot.key, e.target.value)}
                      />
                      <button
                        onClick={() => updateDay(day, { [`${slot.key}Kosher`]: !dayData?.[`${slot.key}Kosher`] })}
                        className={`shrink-0 w-12 h-12 rounded-xl border-2 flex items-center justify-center ${
                          dayData?.[`${slot.key}Kosher`]
                            ? 'bg-green-50 border-green-400 text-green-600'
                            : 'bg-white border-slate-200 text-slate-300'
                        }`}
                        title="Кашрут"
                      >
                        <ShieldCheck size={20} />
                      </button>
                    </div>
                  ))}
                  <p className="text-xs text-slate-400 mt-1">Значок щита отмечает блюдо как кошерное (кашрут)</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <BigButton onClick={sendMenu} icon={Send} color="orange">
        Отправить меню Küchenleiterin
      </BigButton>

      {MENU_SLOTS.map((slot) => (
        <datalist key={slot.key} id={`dishlist-${slot.key}`}>
          {(dishLibrary?.[slot.key] || []).map((dish) => (
            <option key={dish} value={dish} />
          ))}
        </datalist>
      ))}
    </div>
  )
}
