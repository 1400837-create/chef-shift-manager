import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Check, X, Plus, CalendarPlus } from 'lucide-react'
import { inputClass, BigButton } from '../../components/UI'
import { RECIPE_CATEGORIES } from '../../utils/constants'
import { usePlanDeviceState } from '../../plan/planRoom'
import { usePlanCollection, writePaths, newId } from '../../plan/planStore'
import { usePlanLang } from '../../plan/lang'
import { dayTitle, isDateKey } from '../../plan/calc'
import { blocksOf } from '../../plan/exchange'
import { todayKey } from '../../utils/dateUtils'
import { BLOCK_NAMES } from './ScheduleTab'

function RecipeRow({ recipe, lang, selected, onToggle }) {
  const name = lang === 'de' && recipe.de ? recipe.de : recipe.name
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0 ${
        selected ? 'bg-orange-50 dark:bg-orange-950/30' : 'active:bg-slate-50 dark:active:bg-slate-700/40'
      }`}
    >
      <span
        className={`shrink-0 mt-0.5 w-6 h-6 rounded-md border-2 flex items-center justify-center ${
          selected ? 'bg-orange-500 border-orange-500' : 'border-slate-300 dark:border-slate-600'
        }`}
      >
        {selected && <Check size={15} strokeWidth={3} className="text-white" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-slate-800 dark:text-slate-100 leading-snug">{name}</span>
        {recipe.desc && <span className="block text-xs text-slate-500 dark:text-slate-400 leading-snug mt-0.5">Состав: {recipe.desc}</span>}
      </span>
    </button>
  )
}

// Adds the chosen recipes to one day of one plan, into an existing meal or a
// new one. Dishes are stored the same way as hand-picked ones (text + link).
function AddToDay({ picked, plans, defaultPlanId, onRemove, onClose, onDone }) {
  const [planId, setPlanId] = useState(defaultPlanId || plans[0]?.id || '')
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
      rel[`${date}/blocks/${bid}/time`] = blockTime
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
              <input type="time" className={inputClass} value={blockTime} onChange={(e) => setBlockTime(e.target.value)} />
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
  const plansCol = usePlanCollection('plans')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState({})
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(null)
  const barRef = useRef(null)
  const [barH, setBarH] = useState(96)

  // Category jumps must stop below the sticky bar, whose height depends on
  // the screen width (chips can wrap the search row), so measure it.
  useEffect(() => {
    const el = barRef.current
    if (!el) return undefined
    const measure = () => setBarH(el.offsetHeight)
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  })

  // recipesSlim can arrive as an array with holes (small integer keys) — skip the empty slots.
  const recipes = useMemo(
    () => Object.entries(recipesCol.data || {})
      .map(([id, r]) => (r && r.n ? { id, name: r.n, de: r.d || '', cat: r.c || 'other', desc: r.m || '' } : null))
      .filter(Boolean),
    [recipesCol.data]
  )

  const needle = query.trim().toLowerCase()
  const groups = useMemo(() => {
    const keys = new Set(RECIPE_CATEGORIES.map((c) => c.key))
    return RECIPE_CATEGORIES
      .map((c) => ({
        ...c,
        items: recipes
          .filter((r) => (keys.has(r.cat) ? r.cat : 'other') === c.key)
          .filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.de.toLowerCase().includes(needle) || r.desc.toLowerCase().includes(needle))
          .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      }))
      .filter((g) => g.items.length)
  }, [recipes, needle])

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
      <div
        ref={barRef}
        className="sticky z-20 -mx-3 md:-mx-6 lg:-mx-10 px-3 md:px-6 lg:px-10 pt-1 pb-2 mb-1 bg-slate-100 dark:bg-slate-950 shadow-[0_2px_4px_-2px_rgba(0,0,0,0.15)]"
        style={{ top: 'var(--app-header-h, 64px)' }}
      >
      <div className="relative mb-2">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className={inputClass + ' pl-10'} placeholder={`Поиск по ${recipes.length} рецептам…`} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {groups.map((g) => (
          <a
            key={g.key}
            href={`#plan-cat-${g.key}`}
            onClick={(e) => {
              e.preventDefault()
              document.getElementById(`plan-cat-${g.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="shrink-0 px-3 min-h-[34px] inline-flex items-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap"
          >
            {g.label} · {g.items.length}
          </a>
        ))}
      </div>
      </div>

      {note && <p className="text-sm text-green-700 dark:text-green-400 mb-2">{note}</p>}
      {groups.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Ничего не найдено.</p>}

      {groups.map((g) => (
        <section key={g.key} id={`plan-cat-${g.key}`} className="mb-4" style={{ scrollMarginTop: `calc(var(--app-header-h, 64px) + ${barH}px + 6px)` }}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-1.5 px-1">{g.label} ({g.items.length})</h2>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            {g.items.map((r) => (
              <RecipeRow key={r.id} recipe={r} lang={lang} selected={!!picked[r.id]} onToggle={() => toggle(r.id)} />
            ))}
          </div>
        </section>
      ))}

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
