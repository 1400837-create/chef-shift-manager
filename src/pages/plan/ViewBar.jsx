import { useState } from 'react'
import { ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { StaffSelect } from './StaffFocus'
import { MealLegend } from './gridShared'

// The control strip above a schedule table, as two thin rows:
//   ‹  26 окт – 1 нояб  ›                         [Нед | Мес | Все]
//   [✎] [⧉] [⇪] [🖨] [ⓘ]  [ Все сотрудники ▾ ]
// Actions are icon-only (the hover text says what they do); the colour legend
// opens from the (i) button instead of sitting on the page all the time.
//   actions: [{ key, icon: Icon, title, onClick, active }]
export default function ViewBar({ title, onStep, span, spans, onSpan, actions, ctx, focus, onFocus }) {
  const [legend, setLegend] = useState(false)
  const btn = 'w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border'
  const idle = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow-sm'

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1.5 sm:grid sm:grid-cols-[1fr_auto_1fr]">
        <div className="hidden sm:block" />
        <div className="flex flex-1 sm:flex-none items-center justify-center gap-1 min-w-0">
          {onStep && (
            <button onClick={() => onStep(-1)} className={`${btn} ${idle}`} aria-label="Назад по датам" title="Предыдущий период">
              <ChevronLeft size={18} />
            </button>
          )}
          <p className="min-w-[8.5rem] max-w-[14rem] text-center font-bold text-slate-800 dark:text-slate-100 text-[15px] truncate px-1">{title}</p>
          {onStep && (
            <button onClick={() => onStep(1)} className={`${btn} ${idle}`} aria-label="Вперёд по датам" title="Следующий период">
              <ChevronRight size={18} />
            </button>
          )}
        </div>
        <div className="flex shrink-0 sm:justify-self-end rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 text-xs font-semibold">
          {spans.map((s) => (
            <button
              key={s.key}
              onClick={() => onSpan(s.key)}
              title={s.label}
              className={`min-h-[36px] px-2.5 ${span === s.key ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
            >
              {s.short}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {actions.filter(Boolean).map((a) => (
          <button
            key={a.key}
            onClick={a.onClick}
            title={a.title}
            aria-label={a.title}
            className={`${btn} ${a.active ? 'bg-orange-500 border-orange-500 text-white' : idle}`}
          >
            <a.icon size={16} />
          </button>
        ))}
        <button
          onClick={() => setLegend((v) => !v)}
          title="Что означают цвета полосок"
          aria-label="Цвета полосок"
          className={`${btn} ${legend ? 'bg-slate-800 border-slate-800 text-white' : idle}`}
        >
          <Info size={16} />
        </button>
        <StaffSelect ctx={ctx} value={focus} onChange={onFocus} />
      </div>

      {legend && (
        <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 pt-2">
          <MealLegend ctx={ctx} />
        </div>
      )}
    </div>
  )
}
