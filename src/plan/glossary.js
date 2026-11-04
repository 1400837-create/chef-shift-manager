// Shared RU → DE glossary for everything typed by hand: event names, dishes
// that are not linked to a recipe (or whose recipe has no German name), and
// comments. A phrase is translated once and from then on shows in German
// everywhere — on screen and in print, in every plan.
//
// Stored in the plan room as the `glossary` collection: { ru, de } per record.
// Matching is on a normalised key (case, extra spaces and the spaces around
// punctuation ignored), so "Закупка  + подготовка" and "закупка + подготовка"
// are the same phrase.

const CYRILLIC = /[Ѐ-ӿ]/

export const hasCyrillic = (text) => CYRILLIC.test(String(text || ''))

export function normKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .replace(/\s*([,.;:!?()·])\s*/g, '$1')
    .trim()
}

// "ТК-315 · Фрукты свежие" → prefix "ТК-315 · ", rest "Фрукты свежие".
// The tech-card code is kept as is and only the name is looked up.
const CODE_PREFIX = /^\s*((?:ТК|TK|ТТК)\s*-?\s*\d+\s*[·.:\-–—]?\s*)/i

function splitCode(text) {
  const m = String(text || '').match(CODE_PREFIX)
  if (!m) return { prefix: '', rest: String(text || '') }
  return { prefix: m[1].replace(/^ТТК/i, 'TTK').replace(/^ТК/i, 'TK'), rest: String(text).slice(m[0].length) }
}

// entries: [{ ru, de }] → Map normKey(ru) → de
export function buildGlossaryMap(entries) {
  const map = new Map()
  ;(entries || []).forEach((e) => {
    if (!e || !e.ru || !e.de || !String(e.de).trim()) return
    map.set(normKey(e.ru), String(e.de).trim())
  })
  return map
}

// The German for `text`, or null when the glossary has nothing for it.
// Text without Cyrillic letters is already German (or a number, a time) and is
// returned unchanged.
export function lookupDe(text, map) {
  const t = String(text || '')
  if (!t.trim() || !hasCyrillic(t)) return t
  const whole = map.get(normKey(t))
  if (whole) return whole
  const { prefix, rest } = splitCode(t)
  if (prefix) {
    if (!rest.trim() || !hasCyrillic(rest)) return prefix + rest
    const hit = map.get(normKey(rest))
    if (hit) return prefix + hit
  }
  return null
}

// The phrase that should go into the glossary for `text`: without the
// tech-card code, so one entry covers "ТК-315 · X" and plain "X".
export function glossaryPhrase(text) {
  const { prefix, rest } = splitCode(text)
  return (prefix ? rest : String(text || '')).trim()
}

// → (text) => { text, missing }
//   ru:   original, never missing
//   de:   German if known, else the original with missing: true
//   both: "ru / de" when known (print), else the original with missing: true
export function makeTranslator(map, lang) {
  return (text) => {
    const t = String(text || '')
    if (lang !== 'de' && lang !== 'both') return { text: t, missing: false }
    const de = lookupDe(t, map)
    if (de === null) return { text: t, missing: true }
    if (lang === 'both') return { text: de !== t ? `${t} / ${de}` : t, missing: false }
    return { text: de, missing: false }
  }
}

// Every hand-typed phrase in the plan data that the glossary cannot translate
// yet, de-duplicated by glossary phrase. recipeById lets dishes whose recipe
// has a German name be skipped.
export function collectMissing(allData, map, recipeById) {
  const seen = new Map()
  const consider = (text) => {
    const t = String(text || '').trim()
    if (!t || lookupDe(t, map) !== null) return
    const phrase = glossaryPhrase(t)
    if (!phrase || !hasCyrillic(phrase)) return
    const k = normKey(phrase)
    if (!seen.has(k)) seen.set(k, phrase)
  }
  const comments = (node) => Object.values((node && node.comments) || {}).forEach((c) => c && consider(c.text))
  Object.values(allData || {}).forEach((days) => {
    Object.values(days || {}).forEach((day) => {
      if (!day || typeof day !== 'object') return
      comments(day)
      Object.values(day.blocks || {}).forEach((b) => {
        if (!b) return
        consider(b.name)
        comments(b)
        Object.values(b.dishes || {}).forEach((d) => {
          if (!d) return
          const r = d.recipeId ? recipeById?.[d.recipeId] : null
          if (!(r && r.de)) consider(d.text)
          comments(d)
        })
      })
      Object.values(day.shifts || {}).forEach(comments)
    })
  })
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'ru'))
}

// Pasted batch: one pair per line, "русский = Deutsch". "=>" and a tab are
// accepted too. The first separator on the line splits it, so a dash inside a
// Russian comment is never mistaken for one. Lines without a separator, or
// with an empty side, are reported back so nothing is lost silently.
const SEPARATORS = ['=>', '=', '\t']

export function parseGlossaryPaste(text) {
  const pairs = []
  const skipped = []
  String(text || '').split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return
    let at = -1
    let sep = ''
    SEPARATORS.forEach((s) => {
      const i = line.indexOf(s)
      if (i >= 0 && (at < 0 || i < at)) { at = i; sep = s }
    })
    const ru = at >= 0 ? line.slice(0, at).trim() : ''
    const de = at >= 0 ? line.slice(at + sep.length).trim() : ''
    if (ru && de) pairs.push({ ru, de })
    else skipped.push(line.trim())
  })
  return { pairs, skipped }
}

// The "copy untranslated" text: one "phrase = " line each, ready to be
// filled in and pasted back.
export const missingToText = (phrases) => phrases.map((p) => `${p} = `).join('\n')
