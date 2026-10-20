import { dishesOf } from './exchange'

// Meal templates ("Пятничный ужин": name, time, guests and a set of dishes) and
// the helpers for pasting a list of dishes. Pure functions: they only build the
// paths to write, the callers do the writing.

export function templateFromBlock(block, name) {
  return {
    name,
    blockName: block.name || '',
    time: block.time || '',
    persons: block.persons || null,
    dishes: dishesOf(block).map((d) => ({ text: d.text, recipeId: d.recipeId || null })),
    createdAt: Date.now(),
  }
}

// Paths (relative to the plan's collection) that create a new meal on `date`
// from a template. `makeId` gives fresh keys.
export function templatePaths(date, tpl, makeId) {
  const bid = makeId()
  const bp = `${date}/blocks/${bid}`
  const rel = {
    [`${bp}/name`]: tpl.blockName || '',
    [`${bp}/time`]: tpl.time || '',
  }
  if (tpl.persons) rel[`${bp}/persons`] = tpl.persons
  Object.values(tpl.dishes || {}).forEach((d) => {
    if (d && d.text) rel[`${bp}/dishes/${makeId()}`] = { text: d.text, recipeId: d.recipeId || null }
  })
  return rel
}

const norm = (s) => String(s || '').trim().toLowerCase()

// A typed or pasted dish name → the recipe it names (Russian or German), if any.
export function matchRecipe(ctx, text) {
  const key = norm(text)
  if (!key) return null
  return ctx.recipeList.find((r) => norm(r.name) === key || (r.de && norm(r.de) === key)) || null
}

// Several lines pasted at once (from a sheet or a message) → dishes.
export function dishesFromLines(ctx, text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[•·*–—-])\s*/, '').trim()) // bullets / "1." numbering
    .filter(Boolean)
    .map((line) => {
      const r = matchRecipe(ctx, line)
      return { text: r ? r.name : line, recipeId: r ? r.id : null }
    })
}
