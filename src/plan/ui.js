import { useEffect, useState, useSyncExternalStore } from 'react'

// Small view-only helpers shared by the plan screens. Nothing here is shared
// data: density, remembered position, narrow-screen detection are all
// per-device viewing preferences.

// ---- density -------------------------------------------------------------------

const DENSITY_KEY = 'kitchenPlan_density'
const densityListeners = new Set()

export const DENSITIES = [
  { key: 'compact', label: 'Компактно', py: '0.2rem', fs: '0.8rem' },
  { key: 'normal', label: 'Обычно', py: '0.5rem', fs: '0.875rem' },
  { key: 'large', label: 'Крупно', py: '0.8rem', fs: '1.05rem' },
]

export function getDensity() {
  try {
    const v = localStorage.getItem(DENSITY_KEY)
    return DENSITIES.some((d) => d.key === v) ? v : 'normal'
  } catch {
    return 'normal'
  }
}

export function setDensity(key) {
  try { localStorage.setItem(DENSITY_KEY, key) } catch { /* preference only */ }
  densityListeners.forEach((fn) => fn())
}

export function useDensity() {
  return useSyncExternalStore((cb) => { densityListeners.add(cb); return () => densityListeners.delete(cb) }, getDensity)
}

// CSS variables the table cells read (see TD/TH in GridView).
export function densityVars(key) {
  const d = DENSITIES.find((x) => x.key === key) || DENSITIES[1]
  return { '--cell-py': d.py, '--cell-fs': d.fs }
}

// ---- narrow screens ------------------------------------------------------------

export function useNarrow(maxPx = 760) {
  const query = `(max-width: ${maxPx}px)`
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false))
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const mq = window.matchMedia(query)
    const fn = () => setNarrow(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return narrow
}

// ---- remembered position (plan / week / month) ----------------------------------

const posKey = (code, id) => `kitchenPlan_pos:${code}:${id}`

export function loadPos(code, id) {
  try {
    return JSON.parse(localStorage.getItem(posKey(code, id))) || null
  } catch {
    return null
  }
}

export function savePos(code, id, pos) {
  try { localStorage.setItem(posKey(code, id), JSON.stringify(pos)) } catch { /* preference only */ }
}

// ---- meal types: the list of meal names and the colour of each ----------------------
// A meal's coloured bar comes from its name: the first type whose name or
// keywords appear in it wins. The list is editable (Справочники → Типы приёмов);
// until it is edited, DEFAULT_MEAL_TYPES is used.

// Static class strings so Tailwind keeps them.
export const MEAL_PALETTE = {
  amber: { bar: 'border-amber-400', dot: 'bg-amber-400', label: 'Жёлтый' },
  emerald: { bar: 'border-emerald-500', dot: 'bg-emerald-500', label: 'Зелёный' },
  pink: { bar: 'border-pink-400', dot: 'bg-pink-400', label: 'Розовый' },
  indigo: { bar: 'border-indigo-500', dot: 'bg-indigo-500', label: 'Синий' },
  slate: { bar: 'border-slate-400', dot: 'bg-slate-400', label: 'Серый' },
  orange: { bar: 'border-orange-400', dot: 'bg-orange-400', label: 'Оранжевый' },
  sky: { bar: 'border-sky-400', dot: 'bg-sky-400', label: 'Голубой' },
  rose: { bar: 'border-rose-500', dot: 'bg-rose-500', label: 'Красный' },
  violet: { bar: 'border-violet-500', dot: 'bg-violet-500', label: 'Фиолетовый' },
  teal: { bar: 'border-teal-500', dot: 'bg-teal-500', label: 'Бирюзовый' },
  lime: { bar: 'border-lime-500', dot: 'bg-lime-500', label: 'Салатовый' },
  stone: { bar: 'border-stone-600', dot: 'bg-stone-600', label: 'Коричневый' },
}

export const DEFAULT_MEAL_TYPES = [
  { id: 'd-breakfast', name: 'Завтрак', nameDe: 'Frühstück', keywords: 'завтрак, frühstück, fruehstueck, breakfast', color: 'amber' },
  { id: 'd-lunch', name: 'Обед', nameDe: 'Mittagessen', keywords: 'обед, mittag, lunch', color: 'emerald' },
  { id: 'd-snack', name: 'Полдник', nameDe: 'Imbiss', keywords: 'полдник, перекус, imbiss, snack', color: 'pink' },
  { id: 'd-dinner', name: 'Ужин', nameDe: 'Abendessen', keywords: "ужин, abend, dinner, шаббат, kiddusch, g'ttesdienst, g'ttesdeinst", color: 'indigo' },
  { id: 'd-prep', name: 'Закупка + подготовка', nameDe: 'Einkaufen + vorbereitung', keywords: 'закупк, подготов, einkauf, vorbereit', color: 'slate' },
]

export const OTHER_MEAL_COLOR = MEAL_PALETTE.orange

const keysOf = (t) =>
  [t.name, t.nameDe, ...String(t.keywords || '').split(',')]
    .map((s) => String(s || '').trim().toLowerCase())
    .filter(Boolean)

// Returns a function: meal name → { bar, dot, type }.
export function makeMealColor(types) {
  const list = (types && types.length ? types : DEFAULT_MEAL_TYPES).map((t) => ({ t, keys: keysOf(t) }))
  return (name) => {
    const n = String(name || '').toLowerCase()
    if (n) {
      const hit = list.find((x) => x.keys.some((k) => n.includes(k)))
      if (hit) return { ...(MEAL_PALETTE[hit.t.color] || OTHER_MEAL_COLOR), type: hit.t }
    }
    return { ...OTHER_MEAL_COLOR, type: null }
  }
}

// Esc closes a window; capture phase so a window opened on top of another one
// closes first instead of both at once.
export function useEscape(onClose) {
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
}

// ---- favourite recipes (per device) ---------------------------------------------

const FAV_KEY = 'kitchenPlan_favRecipes'
const favListeners = new Set()
let favCache = { raw: null, set: new Set() }

function readFavs() {
  let raw = ''
  try { raw = localStorage.getItem(FAV_KEY) || '' } catch { raw = '' }
  if (raw !== favCache.raw) {
    let arr = []
    try { arr = JSON.parse(raw || '[]') } catch { arr = [] }
    favCache = { raw, set: new Set(Array.isArray(arr) ? arr : []) }
  }
  return favCache.set
}

export function toggleFav(id) {
  const next = new Set(readFavs())
  if (next.has(id)) next.delete(id)
  else next.add(id)
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])) } catch { /* preference only */ }
  favListeners.forEach((fn) => fn())
}

export function useFavorites() {
  return useSyncExternalStore((cb) => { favListeners.add(cb); return () => favListeners.delete(cb) }, readFavs)
}
