import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Send, ShieldCheck, ChevronDown, Mail } from 'lucide-react'
import { Section, Field, inputClass, BigButton, Badge } from '../components/UI'
import { MENU_SLOTS } from '../utils/constants'
import { MONTHS_RU, WEEKDAYS_RU, daysInMonth, mondayIndex } from '../utils/dateUtils'

export default function MenuPlanner({ menuData, setMenuData, settings, setSettings }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [openDay, setOpenDay] = useState(null)

  const monthKey = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
  const monthData = menuData[monthKey] || {}
  const totalDays = daysInMonth(cursor.year, cursor.month)

  const days = useMemo(() => Array.from({ length: totalDays }, (_, i) => i + 1), [totalDays])

  function changeMonth(delta) {
    const d = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
    setOpenDay(null)
  }

  function updateDay(day, patch) {
    setMenuData((prev) => ({
      ...prev,
      [monthKey]: { ...(prev[monthKey] || {}), [day]: { ...(prev[monthKey]?.[day] || {}), ...patch } },
    }))
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

      <div className="flex items-center justify-between mb-3 bg-white rounded-2xl border border-slate-200 px-2 py-2 shadow-sm">
        <button onClick={() => changeMonth(-1)} className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100">
          <ChevronLeft size={22} />
        </button>
        <p className="font-bold text-slate-800">{MONTHS_RU[cursor.month]} {cursor.year}</p>
        <button onClick={() => changeMonth(1)} className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100">
          <ChevronRight size={22} />
        </button>
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
                        value={dayData?.[slot.key] || ''}
                        onChange={(e) => updateDay(day, { [slot.key]: e.target.value })}
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
    </div>
  )
}
