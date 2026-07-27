import { DEFAULT_MENU_COURSES, MENU_SLOTS_LEGACY } from './constants'

// A day's courses used to be 4 fixed fields (soup/main/side/salad). They're
// now a free-form, addable list — this reads both the new `courses` array
// and, for days saved before the change, migrates the old fixed fields on
// the fly (nothing is lost, it's just not persisted in the old shape again).
export function coursesForDay(dayData) {
  if (dayData?.courses) return dayData.courses
  if (dayData && MENU_SLOTS_LEGACY.some((s) => dayData[s.key])) {
    return MENU_SLOTS_LEGACY.map((slot) => ({
      id: `legacy-${slot.key}`,
      label: slot.label,
      dish: dayData[slot.key] || '',
      kosher: !!dayData[`${slot.key}Kosher`],
    }))
  }
  return DEFAULT_MENU_COURSES.map((label, i) => ({ id: `default-${i}`, label, dish: '', kosher: false }))
}
