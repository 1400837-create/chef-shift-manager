import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Search, Check, X, Plus, Star } from 'lucide-react'
import { inputClass, BigButton } from '../../components/UI'
import { RECIPE_CATEGORIES } from '../../utils/constants'
import { useEscape, useFavorites, toggleFav } from '../../plan/ui'
import { todayKey } from '../../utils/dateUtils'
import { parseDate } from '../../plan/calc'

const MS_DAY = 86400000
const dd = (key) => `${key.slice(8)}.${key.slice(5, 7)}`

// "было 19.10" / "будет 22.10": the closest serving within a week of today.
function usageNote(dates, today) {
  if (!dates || !dates.length) return null
  let best = null
  dates.forEach((d) => {
    const diff = Math.round((parseDate(d) - parseDate(today)) / MS_DAY)
    if (Math.abs(diff) <= 7 && (best === null || Math.abs(diff) < Math.abs(best.diff))) best = { d, diff }
  })
  if (!best) return null
  return best.diff < 0 ? `было ${dd(best.d)}` : best.diff === 0 ? 'сегодня' : `будет ${dd(best.d)}`
}

function RecipeRow({ recipe, lang, selected, onToggle, note, fav }) {
  const name = lang === 'de' && recipe.de ? recipe.de : recipe.name
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0 cursor-pointer ${
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
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-slate-800 dark:text-slate-100 leading-snug">
          {name}
          {note && <span className="ml-2 align-middle px-1.5 py-0.5 rounded-md bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 text-[11px] font-semibold">{note}</span>}
        </span>
        {recipe.desc && <span className="block text-xs text-slate-500 dark:text-slate-400 leading-snug mt-0.5">Состав: {recipe.desc}</span>}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); toggleFav(recipe.id) }}
        className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg ${fav ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}
        title={fav ? 'Убрать из избранного' : 'В избранное'}
      >
        <Star size={18} fill={fav ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

// Search + category chips pinned on top + the recipes grouped by category.
// Used both as the «Меню» tab (the page scrolls) and inside a picker window
// (a container scrolls) — `getScroller` says which, `topOffset` is where the
// pinned bar sticks.
//   recipes: [{ id, name, de, cat, desc }]
export default function RecipeBrowser({ recipes, lang, picked, onToggle, topOffset = '0px', getScroller = () => null, barClass = '', usageDates = {} }) {
  const uid = useId().replace(/:/g, '')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(null)
  const [barH, setBarH] = useState(96)
  const barRef = useRef(null)
  const chipsRef = useRef(null)
  const favs = useFavorites()
  const today = todayKey()

  const needle = query.trim().toLowerCase()
  const groups = useMemo(() => {
    const keys = new Set(RECIPE_CATEGORIES.map((c) => c.key))
    const matches = (r) => !needle || r.name.toLowerCase().includes(needle) || (r.de || '').toLowerCase().includes(needle) || (r.desc || '').toLowerCase().includes(needle)
    const byCat = RECIPE_CATEGORIES
      .map((c) => ({
        ...c,
        items: recipes
          .filter((r) => (keys.has(r.cat) ? r.cat : 'other') === c.key)
          .filter(matches)
          .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      }))
      .filter((g) => g.items.length)

    // Quick lists on top: starred ones, and what was served around now.
    const fav = recipes.filter((r) => favs.has(r.id) && matches(r)).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    const nearness = (r) => {
      const dates = usageDates[r.id] || []
      let best = null
      dates.forEach((d) => {
        const diff = Math.round((parseDate(d) - parseDate(today)) / MS_DAY)
        if (diff >= -30 && diff <= 14 && (best === null || Math.abs(diff) < best)) best = Math.abs(diff)
      })
      return best
    }
    const recent = recipes
      .map((r) => ({ r, n: nearness(r) }))
      .filter((x) => x.n !== null && matches(x.r))
      .sort((a, b) => a.n - b.n)
      .slice(0, 12)
      .map((x) => x.r)
    const extra = []
    if (fav.length) extra.push({ key: '__fav', label: '★ Избранные', items: fav })
    if (recent.length) extra.push({ key: '__recent', label: 'Недавние', items: recent })
    return [...extra, ...byCat]
  }, [recipes, needle, favs, usageDates, today])

  const sectionId = (key) => `rb-${uid}-${key}`

  // Scroll-spy: the category whose heading last passed under the pinned bar.
  useEffect(() => {
    const scroller = getScroller() || window
    let frame = 0
    function update() {
      frame = 0
      const bar = barRef.current
      if (!bar) return
      setBarH(bar.offsetHeight)
      const line = bar.getBoundingClientRect().bottom + 8
      let current = groups[0]?.key || null
      groups.forEach((g) => {
        const el = document.getElementById(sectionId(g.key))
        if (el && el.getBoundingClientRect().top <= line) current = g.key
      })
      setActive(current)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups])

  // Keep the highlighted chip visible in the horizontally scrolling row.
  useEffect(() => {
    const row = chipsRef.current
    const chip = row?.querySelector(`[data-cat="${active}"]`)
    if (!row || !chip) return
    const target = chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2
    row.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [active])

  function jump(key) {
    document.getElementById(sectionId(key))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(key)
  }

  return (
    <div>
      <div
        ref={barRef}
        className={`sticky z-20 pt-1 pb-2 mb-1 shadow-[0_2px_4px_-2px_rgba(0,0,0,0.15)] ${barClass}`}
        style={{ top: topOffset }}
      >
        <div className="relative mb-2">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputClass + ' pl-10'} placeholder={`Поиск по ${recipes.length} рецептам…`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div ref={chipsRef} className="flex gap-1.5 overflow-x-auto pb-1">
          {groups.map((g) => (
            <button
              key={g.key}
              data-cat={g.key}
              onClick={() => jump(g.key)}
              className={`shrink-0 px-3 min-h-[34px] inline-flex items-center rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                active === g.key
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {g.label} · {g.items.length}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Ничего не найдено.</p>}
      {groups.map((g) => (
        <section
          key={g.key}
          id={sectionId(g.key)}
          className="mb-4"
          style={{ scrollMarginTop: `calc(${topOffset} + ${barH}px + 6px)` }}
        >
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-1.5 px-1">{g.label} ({g.items.length})</h2>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            {g.items.map((r) => (
              <RecipeRow key={r.id} recipe={r} lang={lang} selected={!!picked[r.id]} onToggle={() => onToggle(r.id)} note={usageNote(usageDates[r.id], today)} fav={favs.has(r.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// A window for picking one or several recipes (e.g. into a meal of a day).
export function RecipePickerModal({ recipes, lang, title, onAdd, onClose, usageDates }) {
  useEscape(onClose)
  const [picked, setPicked] = useState({})
  const scrollRef = useRef(null)
  const count = Object.keys(picked).length
  const toggle = (id) => setPicked((p) => {
    const next = { ...p }
    if (next[id]) delete next[id]
    else next[id] = true
    return next
  })

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-2xl h-[92vh] sm:h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-slate-100 dark:bg-slate-900 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate">{title || 'Выбрать блюда из меню'}</h3>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 text-slate-500">
            <X size={18} />
          </button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4">
          <RecipeBrowser
            usageDates={usageDates}
            recipes={recipes}
            lang={lang}
            picked={picked}
            onToggle={toggle}
            topOffset="0px"
            getScroller={() => scrollRef.current}
            barClass="-mx-4 px-4 bg-slate-100 dark:bg-slate-900"
          />
        </div>
        <div className="shrink-0 p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <BigButton
            icon={Plus}
            disabled={count === 0}
            onClick={() => onAdd(recipes.filter((r) => picked[r.id]))}
          >
            {count ? `Добавить выбранные (${count})` : 'Отметьте блюда галочками'}
          </BigButton>
        </div>
      </div>
    </div>
  )
}
