import { useMemo, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Section, BigButton, inputClass } from '../components/UI'
import PeriodPicker from './plan/PeriodPicker'
import { TimeInput, normalizeTime } from './plan/shared'
import { usePlanDeviceState } from '../plan/planRoom'
import { usePlanCollection, writePaths, newId } from '../plan/planStore'
import { planRange, monthBounds, dayTitle } from '../plan/calc'
import { DEFAULT_MEAL_TYPES } from '../plan/ui'
import { menuDaysToPlan, buildPlanWrite } from '../plan/menuToPlan'

// «Экспорт в План работы» on the Меню page: the dishes of the chosen days go
// into a plan as one meal per day (the reverse of the plan's «В Меню»).
export default function MenuToPlan({ menuData, recipes, monthKey }) {
  const { config } = usePlanDeviceState()
  const isOwner = config && config.role === 'owner'
  const plans = usePlanCollection('plans')
  const mealTypes = usePlanCollection('mealTypes')
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState(null) // null = the month shown above
  const [planId, setPlanId] = useState('')
  const [mealName, setMealName] = useState('Mittagessen')
  const [mealTime, setMealTime] = useState('')
  const [persons, setPersons] = useState('')
  const [mode, setMode] = useState('skip')
  const [useEventName, setUseEventName] = useState(true)
  const [msg, setMsg] = useState(null)

  const sortedPlans = useMemo(() => [...plans.items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [plans.items])
  const chosenPlanId = sortedPlans.some((p) => p.id === planId) ? planId : sortedPlans[0]?.id || ''
  const chosenPlan = sortedPlans.find((p) => p.id === chosenPlanId)
  const coll = `planData/${chosenPlanId || '_'}`
  const { data: existing } = usePlanCollection(coll)

  const monthRange = monthBounds(monthKey)
  const range = period || monthRange
  const days = useMemo(() => menuDaysToPlan(menuData, range.from, range.to, recipes), [menuData, range.from, range.to, recipes])
  const range0 = chosenPlan ? planRange(chosenPlan) : null
  const outside = range0 ? days.filter((d) => d.date < range0.from || d.date > range0.to).length : 0
  const hasMeals = (d) => Object.keys((existing[d.date] && existing[d.date].blocks) || {}).length > 0
  const skipped = mode === 'skip' ? days.filter(hasMeals).length : 0
  const toWrite = days.length - skipped

  const nameOptions = useMemo(() => {
    const set = new Set()
    const types = mealTypes.items.filter((t) => t.name).length ? mealTypes.items : DEFAULT_MEAL_TYPES
    types.forEach((t) => { if (t.name) set.add(t.name); if (t.nameDe) set.add(t.nameDe) })
    return [...set]
  }, [mealTypes.items])

  function send() {
    setMsg(null)
    if (!chosenPlanId) return setMsg({ ok: false, text: 'Сначала создайте план во вкладке «План работы».' })
    const { rel, written } = buildPlanWrite({
      days, existing, mode, mealName: mealName.trim(), mealTime: normalizeTime(mealTime) || '',
      persons: Number(persons) || null, useEventName, makeId: () => newId(coll),
    })
    if (!written) return setMsg({ ok: false, text: 'Нечего переносить: в выбранных днях нет блюд или в плане уже есть приёмы.' })
    writePaths(coll, rel, {
      action: 'create', entity: 'блюда', id: chosenPlanId,
      label: `Из Меню: ${written} дн. (${dayTitle(days[0].date)}${days.length > 1 ? ' …' : ''})`,
    })
    setMsg({ ok: true, text: `Отправлено дней: ${written}. Откройте «План работы», чтобы проверить.` })
  }

  return (
    <Section
      title="Экспорт в План работы"
      icon={CalendarPlus}
      right={
        <button onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-orange-600">
          {open ? 'Скрыть' : 'Показать'}
        </button>
      }
    >
      {!open ? (
        <p className="text-xs text-slate-500">Блюда выбранных дней из Меню попадут в план работы приёмом пищи по дням.</p>
      ) : !config ? (
        <p className="text-sm text-slate-500">Сначала подключите план: вкладка «Дашборд» → «План работы».</p>
      ) : !isOwner ? (
        <p className="text-sm text-slate-500">Экспорт доступен на основном устройстве.</p>
      ) : sortedPlans.length === 0 ? (
        <p className="text-sm text-slate-500">В плане работы пока нет ни одного плана — создайте его во вкладке «График».</p>
      ) : (
        <div className="animate-fade-up">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Период</p>
          <PeriodPicker from={range.from} to={range.to} bounds={monthRange} onChange={setPeriod} />

          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-4 mb-1.5">Куда</p>
          <select className={inputClass} value={chosenPlanId} onChange={(e) => setPlanId(e.target.value)}>
            {sortedPlans.map((p) => <option key={p.id} value={p.id}>{p.title || 'План'}</option>)}
          </select>

          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-4 mb-1.5">Приём в плане</p>
          <div className="grid grid-cols-[1fr_5.5rem_5rem] gap-2">
            <input className={inputClass} list="menu-export-meals" placeholder="Название" value={mealName} onChange={(e) => setMealName(e.target.value)} />
            <TimeInput className={inputClass + ' text-center'} placeholder="Время" value={mealTime} onChange={setMealTime} />
            <input className={inputClass + ' text-center'} inputMode="numeric" placeholder="Чел." value={persons} onChange={(e) => setPersons(e.target.value.replace(/\D/g, ''))} />
          </div>
          <datalist id="menu-export-meals">{nameOptions.map((n) => <option key={n} value={n} />)}</datalist>
          <label className="flex items-center gap-2 mt-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={useEventName} onChange={(e) => setUseEventName(e.target.checked)} className="w-4 h-4 accent-orange-500" />
            Если у дня есть название события (например, «Шаббат») — взять его
          </label>

          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-4 mb-1.5">Если в плане в этот день уже есть приёмы</p>
          <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="skip">Не трогать такие дни</option>
            <option value="append">Добавить ещё один приём</option>
            <option value="replace">Заменить имеющиеся приёмы</option>
          </select>

          <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
            Дней с блюдами в Меню: <b>{days.length}</b> · будет отправлено: <b>{toWrite}</b>
            {skipped > 0 && <> · пропущено (уже есть приёмы): <b>{skipped}</b></>}
            {outside > 0 && <p className="text-xs text-orange-600 mt-1">{outside} дн. вне периода этого плана — в плане они будут серыми.</p>}
          </div>

          <div className="mt-3">
            <BigButton onClick={send} icon={CalendarPlus} disabled={toWrite === 0}>
              Отправить в план{toWrite ? ` (${toWrite})` : ''}
            </BigButton>
          </div>
          {msg && (
            <p className={`mt-2 text-sm font-semibold ${msg.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600'}`}>{msg.text}</p>
          )}
        </div>
      )}
    </Section>
  )
}
