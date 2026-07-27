import { useState } from 'react'
import { SprayCan, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { Section, CheckRow, Badge } from '../components/UI'
import { DAILY_CLEANING_ITEMS, WEEKLY_CLEANING_ITEMS } from '../utils/constants'
import { addDays, isoWeekKey, mondayIndex, toKey, formatRuShort } from '../utils/dateUtils'

// Entries used to be plain booleans; now they can also be { done, by } so we
// know who ticked an item. isDone/doneBy read both shapes transparently.
function isDone(entry) {
  return entry === true || !!entry?.done
}

function doneBy(entry) {
  return typeof entry === 'object' && entry ? entry.by : null
}

export default function Cleaning({ dailyCleaning, setDailyCleaning, weeklyCleaning, setWeeklyCleaning, staffName }) {
  const [dayOffset, setDayOffset] = useState(0)
  const [weekOffset, setWeekOffset] = useState(0)

  const viewedDay = addDays(new Date(), dayOffset)
  const dayKey = toKey(viewedDay)
  const isToday = dayOffset === 0

  const weekAnchor = addDays(new Date(), weekOffset * 7)
  const week = isoWeekKey(weekAnchor)
  const isThisWeek = weekOffset === 0
  const weekMonday = addDays(weekAnchor, -mondayIndex(weekAnchor))
  const weekSunday = addDays(weekMonday, 6)

  const dailyState = dailyCleaning[dayKey] || {}
  const weeklyState = weeklyCleaning[week] || {}

  function toggleDaily(idx) {
    setDailyCleaning((prev) => {
      const day = { ...(prev[dayKey] || {}) }
      if (isDone(day[idx])) delete day[idx]
      else day[idx] = { done: true, by: staffName || undefined }
      return { ...prev, [dayKey]: day }
    })
  }

  function toggleWeekly(idx) {
    setWeeklyCleaning((prev) => {
      const w = { ...(prev[week] || {}) }
      if (isDone(w[idx])) delete w[idx]
      else w[idx] = { done: true, by: staffName || undefined }
      return { ...prev, [week]: w }
    })
  }

  const dailyDone = DAILY_CLEANING_ITEMS.filter((_, i) => isDone(dailyState[i])).length
  const weeklyDone = WEEKLY_CLEANING_ITEMS.filter((_, i) => isDone(weeklyState[i])).length

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between mb-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 px-2 py-2 shadow-sm">
        <button onClick={() => setDayOffset((o) => o - 1)} className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
            {isToday ? 'Сегодня' : viewedDay.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' })}
          </p>
          {!isToday && <button onClick={() => setDayOffset(0)} className="text-[11px] text-orange-600 font-semibold">Вернуться к сегодня</button>}
        </div>
        <button
          onClick={() => setDayOffset((o) => Math.min(o + 1, 0))}
          disabled={isToday}
          className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100 disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <Section
        title="Ежедневная уборка (после смены)"
        icon={SprayCan}
        right={<Badge color={dailyDone === DAILY_CLEANING_ITEMS.length ? 'green' : 'slate'}>{dailyDone}/{DAILY_CLEANING_ITEMS.length}</Badge>}
      >
        {DAILY_CLEANING_ITEMS.map((item, idx) => (
          <CheckRow
            key={idx}
            label={item}
            checked={isDone(dailyState[idx])}
            onChange={() => toggleDaily(idx)}
            sublabel={doneBy(dailyState[idx]) ? `✓ ${doneBy(dailyState[idx])}` : null}
          />
        ))}
      </Section>

      <div className="flex items-center justify-between mb-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 px-2 py-2 shadow-sm">
        <button onClick={() => setWeekOffset((o) => o - 1)} className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
            {isThisWeek ? 'Эта неделя' : `${formatRuShort(weekMonday)} – ${formatRuShort(weekSunday)}`}
          </p>
          {!isThisWeek && <button onClick={() => setWeekOffset(0)} className="text-[11px] text-orange-600 font-semibold">Вернуться к этой неделе</button>}
        </div>
        <button
          onClick={() => setWeekOffset((o) => Math.min(o + 1, 0))}
          disabled={isThisWeek}
          className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100 disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <Section
        title="Углублённая уборка (конец недели)"
        icon={CalendarRange}
        right={<Badge color={weeklyDone === WEEKLY_CLEANING_ITEMS.length ? 'green' : 'slate'}>{weeklyDone}/{WEEKLY_CLEANING_ITEMS.length}</Badge>}
      >
        {WEEKLY_CLEANING_ITEMS.map((item, idx) => (
          <CheckRow
            key={idx}
            label={item}
            checked={isDone(weeklyState[idx])}
            onChange={() => toggleWeekly(idx)}
            sublabel={doneBy(weeklyState[idx]) ? `✓ ${doneBy(weeklyState[idx])}` : null}
          />
        ))}
      </Section>
    </div>
  )
}
