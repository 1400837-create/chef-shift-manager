import { useSyncExternalStore } from 'react'

// Display language of the plan (dates, staff and dish names, print). It is a
// per-device viewing preference, not shared data: each person flips it for
// themselves.
const KEY = 'kitchenPlan_lang'
const listeners = new Set()

export function getPlanLang() {
  try {
    return localStorage.getItem(KEY) === 'de' ? 'de' : 'ru'
  } catch {
    return 'ru'
  }
}

export function setPlanLang(lang) {
  try {
    localStorage.setItem(KEY, lang === 'de' ? 'de' : 'ru')
  } catch {
    // preference simply won't persist
  }
  listeners.forEach((fn) => fn())
}

export function usePlanLang() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    getPlanLang
  )
}

export const LOCALE = { ru: 'ru-RU', de: 'de-DE' }

const DICT = {
  ru: {
    plan: 'План',
    week: 'Неделя',
    meals: 'Приёмы и блюда',
    shifts: 'Смены',
    time: 'Время',
    meal: 'Приём',
    persons: 'Персон',
    dishes: 'Блюда',
    staff: 'Сотрудник',
    hours: 'Часы',
    norm: 'Норма',
    planned: 'План',
    actual: 'Факт',
    total: 'Итого',
    totalMonth: 'Итого за период',
    comment: 'Комментарий',
    printed: 'Напечатано',
    changed: 'изменено',
    noData: 'В плане пока нет дней',
  },
  de: {
    plan: 'Plan',
    week: 'Woche',
    meals: 'Mahlzeiten und Gerichte',
    shifts: 'Schichten',
    time: 'Zeit',
    meal: 'Mahlzeit',
    persons: 'Personen',
    dishes: 'Gerichte',
    staff: 'Mitarbeiter',
    hours: 'Stunden',
    norm: 'Soll',
    planned: 'Geplant',
    actual: 'Tatsächlich',
    total: 'Gesamt',
    totalMonth: 'Gesamt im Zeitraum',
    comment: 'Kommentar',
    printed: 'Gedruckt',
    changed: 'geändert',
    noData: 'Der Plan enthält noch keine Tage',
  },
}

export const tr = (lang, key) => (DICT[lang] || DICT.ru)[key] ?? DICT.ru[key] ?? key

export function staffLabel(staff, lang) {
  if (!staff) return ''
  return lang === 'de' && staff.nameDe ? staff.nameDe : staff.name || ''
}

// A dish is stored as free text plus an optional link to a recipe; the German
// name lives on the recipe. Unlinked (hand-typed) dishes have only their text.
export function dishLabel(dish, recipeById, lang) {
  const r = dish.recipeId ? recipeById?.[dish.recipeId] : null
  if (lang === 'de' && r?.de) return r.de
  return dish.text || ''
}
