import { weekTitle, dayTitle } from '../../plan/calc'
import DaySummary from './DaySummary'

// The phone version of the table: one card per day, grouped by week. Tapping a
// card opens that day's editor (when `onOpenDay` is given).
export default function DayCards({
  weeks, getParts, ctx, locale, today, span, showTags, onOpenPlan, onOpenDay, isOutside, outsideNote, hideEmpty, bridge, focusStaff,
}) {
  return (
    <div>
      {weeks.map(([monday, list0]) => {
        const list = hideEmpty ? list0.filter((d) => getParts(d).length > 0) : list0
        if (!list.length) return null
        return (
          <div key={monday} className="mb-3">
            {span !== 'week' && (
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5 px-1">
                {ctx.lang === 'de' ? 'Woche' : 'Неделя'} {weekTitle(monday, locale)}
              </p>
            )}
            {list.map((date) => {
              const parts = getParts(date)
              const outside = isOutside ? isOutside(date) : false
              return (
                <div
                  key={date}
                  onClick={onOpenDay && !outside ? () => onOpenDay(date) : undefined}
                  className={`mb-2 rounded-2xl border p-3 shadow-sm ${
                    outside
                      ? 'bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700'
                      : `bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 ${onOpenDay ? 'active:bg-orange-50 dark:active:bg-slate-700 cursor-pointer' : ''}`
                  } ${date === today ? 'ring-2 ring-orange-300' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="font-bold text-slate-800 dark:text-slate-100">
                      {dayTitle(date, locale)}
                      {date === today && <span className="ml-2 text-xs font-semibold text-orange-600">сегодня</span>}
                      {outside && <span className="ml-2 text-xs font-normal text-slate-500">вне периода плана</span>}
                    </p>
                  </div>
                  {outside && outsideNote ? outsideNote(date) : null}
                  <DaySummary date={date} parts={parts} ctx={ctx} showTags={showTags} onOpenPlan={onOpenPlan} bridge={bridge} focusStaff={focusStaff} />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
