import { createRecord, patchRecord, deleteRecord } from '../../plan/planStore'
import { glossaryPhrase, normKey } from '../../plan/glossary'

// Adds or changes one glossary entry. An empty German text removes the entry.
// Returns true when something was written.
export function saveTranslation(ctx, ru, de) {
  const phrase = String(ru || '').trim()
  const value = String(de || '').trim()
  if (!phrase) return false
  const key = normKey(phrase)
  const existing = (ctx.glossaryItems || []).find((e) => normKey(e.ru) === key)
  if (existing) {
    if (!value) return deleteRecord('glossary', existing.id)
    return patchRecord('glossary', existing.id, { de: value })
  }
  if (!value) return false
  createRecord('glossary', { ru: phrase, de: value })
  return true
}

// Asks for the German of a hand-typed phrase (the tech-card code is left
// out — one entry covers the dish with and without its code).
export function askTranslation(ctx, text) {
  const phrase = glossaryPhrase(text)
  if (!phrase) return
  const de = window.prompt(`Перевод на немецкий — сохранится в словаре и будет показан везде:\n\n${phrase}`, '')
  if (de === null) return
  saveTranslation(ctx, phrase, de)
}

// Hand-typed text in the plan's language. In DE mode a phrase the glossary
// does not know yet keeps its Russian text with an orange wavy underline;
// tapping it asks for the German.
export function Tr({ text, ctx }) {
  const r = ctx.tr ? ctx.tr(text) : { text, missing: false }
  if (!r.missing || ctx.lang !== 'de') return r.text
  return (
    <span
      role="button"
      tabIndex={0}
      title="Нет перевода — нажмите, чтобы добавить"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); askTranslation(ctx, text) }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); askTranslation(ctx, text) } }}
      className="underline decoration-wavy decoration-orange-500 underline-offset-4 cursor-pointer"
    >
      {r.text}
    </span>
  )
}
