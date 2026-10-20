import { useMemo, useState } from 'react'
import { X, Upload } from 'lucide-react'
import { inputClass, BigButton } from '../../components/UI'
import { buildMenuTransferFromParts, applyMenuTransfer } from '../../plan/exchange'
import { coursesForDay } from '../../utils/menuCourses'
import { dayTitle, isDateKey } from '../../plan/calc'
import { LOCALE } from '../../plan/lang'
import { useEscape } from '../../plan/ui'
import PeriodPicker from './PeriodPicker'
import { daysBetween } from './gridShared'

// Sends the dishes of a chosen period into the main program's Меню, day by
// day. From there the Закупка tab can import them ("Импорт из меню").
//   initial: the period on screen · bounds: the whole span the data covers
export default function MenuTransferModal({ title, initial, bounds, partsOf, ctx, menuBridge, onClose }) {
  useEscape(onClose)
  const [range, setRange] = useState(initial)
  const [mode, setMode] = useState('skip')
  const [done, setDone] = useState(null)

  const dates = useMemo(() => {
    if (!isDateKey(range.from) || !isDateKey(range.to)) return []
    return daysBetween(range.from, range.to).slice(0, 400)
  }, [range])
  const days = useMemo(
    () => buildMenuTransferFromParts({ dates, partsOf, ctx, menuData: menuBridge.menuData }),
    [dates, partsOf, ctx, menuBridge.menuData]
  )

  function run() {
    const list = days
    const m = mode
    menuBridge.setMenuData((prev) => applyMenuTransfer(prev, list, m, coursesForDay))
    const n = list.filter((d) => !(d.hasExisting && m === 'skip')).length
    setDone(`Перенесено дней: ${n}.`)
  }

  const fmt = (k) => `${k.slice(8)}.${k.slice(5, 7)}`

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-800 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-slate-800 dark:text-slate-100">Отправить в Меню</h3>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-1">{title}</p>
        <p className="text-xs text-slate-500 mb-3">
          Блюда уходят в раздел «Меню» основной программы по дням: название приёма — подпись, блюдо — по названию рецепта,
          количество — коэффициент (гостей ÷ 10). После этого в «Закупке» нажмите «Импорт из меню» за этот период.
        </p>

        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Период</p>
        <PeriodPicker from={range.from} to={range.to} bounds={bounds} onChange={(r) => { setRange(r); setDone(null) }} />

        <select className={`${inputClass} my-3`} value={mode} onChange={(e) => { setMode(e.target.value); setDone(null) }}>
          <option value="skip">Не трогать дни, где в Меню уже есть блюда</option>
          <option value="append">Добавить к уже имеющимся блюдам</option>
          <option value="replace">Заменить блюда в этих днях</option>
        </select>

        {days.length === 0
          ? <p className="text-sm text-slate-500 text-center py-3">В этом периоде нет блюд для отправки.</p>
          : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 max-h-56 overflow-y-auto mb-3">
              {days.map((d) => (
                <div key={d.date} className="px-3 py-1.5 text-sm border-b border-slate-100 dark:border-slate-700 last:border-0 text-slate-700 dark:text-slate-200">
                  <b>{dayTitle(d.date, LOCALE.ru)}</b> — блюд: {d.courses.length}
                  {d.hasExisting && (
                    <span className={mode === 'skip' ? 'text-orange-600' : 'text-slate-400'}>
                      {' '}· в Меню уже заполнено{mode === 'skip' ? ' — будет пропущено' : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

        {done && (
          <p className="text-sm text-green-700 dark:text-green-400 mb-3">
            {done} В «Закупке» → «Импорт из меню» выберите период {fmt(range.from)} – {fmt(range.to)}.
          </p>
        )}
        <BigButton icon={Upload} onClick={run} disabled={days.length === 0 || !!done}>Отправить в Меню</BigButton>
      </div>
    </div>
  )
}
