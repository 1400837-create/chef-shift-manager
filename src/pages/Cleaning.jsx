import { SprayCan, CalendarRange } from 'lucide-react'
import { Section, CheckRow, Badge } from '../components/UI'
import { DAILY_CLEANING_ITEMS, WEEKLY_CLEANING_ITEMS } from '../utils/constants'
import { todayKey, isoWeekKey } from '../utils/dateUtils'

export default function Cleaning({ dailyCleaning, setDailyCleaning, weeklyCleaning, setWeeklyCleaning }) {
  const today = todayKey()
  const week = isoWeekKey()
  const dailyState = dailyCleaning[today] || {}
  const weeklyState = weeklyCleaning[week] || {}

  function toggleDaily(idx) {
    setDailyCleaning((prev) => ({
      ...prev,
      [today]: { ...(prev[today] || {}), [idx]: !dailyState[idx] },
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
      <Section
        title="Ежедневная уборка (после смены)"
        icon={SprayCan}
        right={<Badge color={dailyDone === DAILY_CLEANING_ITEMS.length ? 'green' : 'slate'}>{dailyDone}/{DAILY_CLEANING_ITEMS.length}</Badge>}
      >
        {DAILY_CLEANING_ITEMS.map((item, idx) => (
          <CheckRow key={idx} label={item} checked={!!dailyState[idx]} onChange={() => toggleDaily(idx)} />
        ))}
      </Section>

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
