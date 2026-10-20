import { useMemo, useState } from 'react'
import { X, Plus, CalendarPlus } from 'lucide-react'
import { inputClass, BigButton } from '../../components/UI'
import RecipeBrowser from './RecipeBrowser'
import { usePlanCtx } from './usePlanCtx'
import { usePlanDeviceState } from '../../plan/planRoom'
import { usePlanCollection, writePaths, newId } from '../../plan/planStore'
import { usePlanLang } from '../../plan/lang'
import { dayTitle, isDateKey } from '../../plan/calc'
import { blocksOf } from '../../plan/exchange'
import { todayKey } from '../../utils/dateUtils'
import { BLOCK_NAMES } from './ScheduleTab'
import { TimeInput, normalizeTime } from './shared'

// Adds the chosen recipes to one day of one plan, into an existing meal or a
// new one. Dishes are stored the same way as hand-picked ones (text + link).
function AddToDay({ picked, plans, defaultPlanId, onRemove, onClose, onDone }) {
  const [planId, setPlanId] = useState(plans.some((p) => p.id === defaultPlanId) ? defaultPlanId : plans[0]?.id || '')
  const [date, setDate] = useState(todayKey())
  const [blockId, setBlockId] = useState('__new')
  const [blockName, setBlockName] = useState('')
  const [blockTime, setBlockTime] = useState('')
  const [error, setError] = useState(null)
  const coll = `planData/${planId || '_'}`
  const { data } = usePlanCollection(coll)
  const dayBlocks = isDateKey(date) && data[date] ? blocksOf(data[date]) : []
  const selectedBlock = dayBlocks.find((b) => b.id === blockId) ? blockId : '__new'

  function add() {
    if (!planId) return setError('Сначала создайте план во вкладке «График».')
    if (!isDateKey(date)) return setError('Укажите дату.')
    if (!picked.length) return setError('Ничего не выбрано.')
    setError(null)
    const rel = {}
    if (!data[date]) rel[`${date}/d`] = 1
    let bid = selectedBlock
    if (bid === '__new') {
      bid = newId(coll)
      rel[`${date}/blocks/${bid}/name`] = blockName.trim()
      rel[`${date}/blocks/${bid}/time`] = normalizeTime(blockTime) || ''
    }
    picked.forEach((r) => {
      rel[`${date}/blocks/${bid}/dishes/${newId(coll)}`] = { text: r.name, recipeId: r.id }
    })
    writePaths(coll, rel, {
      action: 'create', entity: 'блюда', id: date,
      label: `${dayTitle(date)}: ${picked.length} шт. (${picked.slice(0, 3).map((r) => r.name).join(', ')}${picked.length > 3 ? '…' : ''})`,
    })
    onDone(`Добавлено блюд: ${picked.length} → ${dayTitle(date)}`)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-800 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 dark:text-slate-100">Добавить на день ({picked.length})</h3>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 mb-3">
          {picked.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0 text-sm text-slate-700 dark:text-slate-200">
              <span className="flex-1 min-w-0 truncate">{r.name}</span>
              <button onClick={() => onRemove(r.id)} className="shrink-0 text-slate-400"><X size={15} /></button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2">
          {plans.length > 1 && (
            <select className={inputClass} value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.title || 'План'}</option>)}
            </select>
          )}
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          <select className={inputClass} value={selectedBlock} onChange={(e) => setBlockId(e.target.value)}>
            <option value="__new">Новый приём / мероприятие</option>
            {dayBlocks.map((b) => <option key={b.id} value={b.id}>{b.time ? `${b.time} ` : ''}{b.name || 'приём'}</option>)}
          </select>
          {selectedBlock === '__new' && (
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <input className={inputClass} list="plan-recipe-blocks" placeholder="Название приёма (необяз.)" value={blockName} onChange={(e) => setBlockName(e.target.value)} />
              <TimeInput value={blockTime} placeholder="Время (1230)" onChange={setBlockTime} />
              <datalist id="plan-recipe-blocks">{BLOCK_NAMES.map((n) => <option key={n} value={n} />)}</datalist>
            </div>
          )}
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <div className="mt-3">
          <BigButton onClick={add} icon={Plus}>Добавить {picked.length} блюд</BigButton>
        </div>
      </div>
    </div>
  )
}

export default function RecipesTab() {
  const { config } = usePlanDeviceState()
  const lang = usePlanLang()
  const recipesCol = usePlanCollection('recipesSlim')
  const usageDates = usePlanCtx().ctx.usageDates
  const plansCol = usePlanCollection('plans')
  const [picked, setPicked] = useState({})
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(null)

  // recipesSlim can arrive as an array with holes (small integer keys) — skip the empty slots.
  const recipes = useMemo(
    () => Object.entries(recipesCol.data || {})
      .map(([id, r]) => (r && r.n ? { id, name: r.n, de: r.d || '', cat: r.c || 'other', desc: r.m || '' } : null))
      .filter(Boolean),
    [recipesCol.data]
  )

  const plans = useMemo(() => [...plansCol.items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [plansCol.items])
  const defaultPlanId = (() => {
    try { return localStorage.getItem(`kitchenPlan_selectedPlan:${config?.code}`) || '' } catch { return '' }
  })()
  const pickedList = recipes.filter((r) => picked[r.id])
  const count = pickedList.length

  const toggle = (id) => setPicked((p) => {
    const next = { ...p }
    if (next[id]) delete next[id]
    else next[id] = true
    return next
  })

  if (recipesCol.ready && recipes.length === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-8">
        Список рецептов пока пуст. Он публикуется с устройства владельца: откройте приложение владельца и подождите несколько секунд.
      </p>
    )
  }

  return (
    <div className="pb-24">
      {note && <p className="text-sm text-green-700 dark:text-green-400 mb-2">{note}</p>}

      <RecipeBrowser
        usageDates={usageDates}
        recipes={recipes}
        lang={lang}
        picked={picked}
        onToggle={toggle}
        topOffset="var(--app-header-h, 64px)"
        barClass="-mx-3 md:-mx-6 lg:-mx-10 px-3 md:px-6 lg:px-10 bg-slate-100 dark:bg-slate-950"
      />

      {count > 0 && (
        <div className="fixed bottom-24 left-0 right-0 z-40 flex justify-center gap-2 px-4 pointer-events-none">
          <button
            onClick={() => { setNote(null); setOpen(true) }}
            className="pointer-events-auto shadow-lg rounded-full bg-orange-500 active:bg-orange-600 text-white font-bold px-5 min-h-[48px] flex items-center gap-2"
          >
            <CalendarPlus size={20} /> Добавить на день ({count})
          </button>
          <button
            onClick={() => setPicked({})}
            className="pointer-events-auto shadow-lg rounded-full bg-slate-700 text-white px-4 min-h-[48px] text-sm font-semibold"
          >
            Сбросить
          </button>
        </div>
      )}

      {open && (
        <AddToDay
          picked={pickedList}
          plans={plans}
          defaultPlanId={defaultPlanId}
          onRemove={(id) => { toggle(id); if (count <= 1) setOpen(false) }}
          onClose={() => setOpen(false)}
          onDone={(text) => { setOpen(false); setPicked({}); setNote(text) }}
        />
      )}
    </div>
  )
}
