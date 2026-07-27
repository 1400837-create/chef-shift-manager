import { useState } from 'react'
import { SprayCan, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { Section, CheckRow, Badge } from '../components/UI'
import { DAILY_CLEANING_ITEMS, WEEKLY_CLEANING_ITEMS } from '../utils/constants'
import { addDays, isoWeekKey, mondayIndex, toKey, formatRuShort } from '../utils/dateUtils'

export default function Cleaning({ dailyCleaning, setDailyCleaning, weeklyCleaning, setWeeklyCleaning }) {
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
    setDailyCleaning((prev) => ({
      ...prev,
      [dayKey]: { ...(prev[dayKey] || {}), [idx]: !dailyState[idx] },
    }))
  }

  function toggleWeekly(idx) {
    setWeeklyCleaning((prev) => ({
      ...prev,
      [week]: { ...(prev[week] || {}), [idx]: !weeklyState[idx] },
    }))
  }

  const dailyDone = DAILY_CLEANING_ITEMS.filter((_, i) => dailyState[i]).length
  const weeklyDone = WEEKLY_CLEANING_ITEMS.filter((_, i) => weeklyState[i]).length

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between mb-2 bg-white rounded-2xl border border-slate-200 px-2 py-2 shadow-sm">
        <button onClick={() => setDayOffset((o) => o - 1)} className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="font-semibold text-slate-800 text-sm">
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
          <CheckRow key={idx} label={item} checked={!!dailyState[idx]} onChange={() => toggleDaily(idx)} />
        ))}
      </Section>

      <div className="flex items-center justify-between mb-2 bg-white rounded-2xl border border-slate-200 px-2 py-2 shadow-sm">
        <button onClick={() => setWeekOffset((o) => o - 1)} className="w-11 h-11 flex items-center justify-center rounded-xl active:bg-slate-100">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="font-semibold text-slate-800 text-sm">
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
          <CheckRow key={idx} label={item} checked={!!weeklyState[idx]} onChange={() => toggleWeekly(idx)} />
        ))}
      </Section>
    </div>
  )
}
