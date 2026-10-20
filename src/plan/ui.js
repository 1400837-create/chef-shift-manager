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

// ---- meals get a colour so a day reads at a glance -------------------------------

const MEALS = [
  { re: /завтрак|fr[uü]hst[uü]ck|breakfast/i, bar: 'border-amber-400', dot: 'bg-amber-400' },
  { re: /обед|mittag|lunch/i, bar: 'border-emerald-500', dot: 'bg-emerald-500' },
  { re: /полдник|imbiss|snack|перекус/i, bar: 'border-pink-400', dot: 'bg-pink-400' },
  { re: /ужин|abend|dinner|g.?ttesdi?enst|g.?ttesdeinst|шаббат|kiddusch/i, bar: 'border-indigo-500', dot: 'bg-indigo-500' },
  { re: /закупк|einkauf|vorbereit|подготов/i, bar: 'border-slate-400', dot: 'bg-slate-400' },
]

export function mealColor(name) {
  const hit = MEALS.find((m) => m.re.test(name || ''))
  return hit || { bar: 'border-orange-300', dot: 'bg-orange-300' }
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
