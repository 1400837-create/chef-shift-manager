import { useEffect, useRef, useState } from 'react'

const MAX_HISTORY = 30

// Generic multi-field undo/redo: watches a group of [value, setValue] pairs
// (every piece of state one tab's page touches) and lets that tab step
// backward/forward through its OWN change history as one combined stack —
// independent of every other tab's history, except where two tabs are
// deliberately grouped together because they edit the same underlying data
// (see App.jsx: Склад + Закупка share one group so undo can never skip over
// a change made from the other tab).
//
// maxHistory is overridable per group — groups whose state can carry large
// embedded data (recipe photos, in the Меню group) pass a smaller cap so a
// long editing session doesn't keep 30 near-full copies of that array alive
// in memory at once; every entry is still just a reference to a version that
// already exists (state updates elsewhere are immutable), so this only
// bounds how many old *array-level* references stay reachable, not how much
// gets copied per edit.
export function useTabHistory(stateMap, maxHistory = MAX_HISTORY) {
  const keys = Object.keys(stateMap)
  const values = keys.map((k) => stateMap[k][0])

  const pastRef = useRef([])
  const futureRef = useRef([])
  const skipRef = useRef(false)
  const lastRef = useRef(values)
  const [, bump] = useState(0)

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false
      lastRef.current = values
      return
    }
    pastRef.current = [...pastRef.current, lastRef.current].slice(-maxHistory)
    futureRef.current = []
    lastRef.current = values
    bump((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, values)

  function apply(snapshot) {
    skipRef.current = true
    keys.forEach((k, i) => stateMap[k][1](snapshot[i]))
  }

  function undo() {
    if (pastRef.current.length === 0) return
    const prev = pastRef.current[pastRef.current.length - 1]
    pastRef.current = pastRef.current.slice(0, -1)
    futureRef.current = [lastRef.current, ...futureRef.current].slice(0, maxHistory)
    lastRef.current = prev
    apply(prev)
    bump((n) => n + 1)
  }

  function redo() {
    if (futureRef.current.length === 0) return
    const next = futureRef.current[0]
    futureRef.current = futureRef.current.slice(1)
    pastRef.current = [...pastRef.current, lastRef.current].slice(-maxHistory)
    lastRef.current = next
    apply(next)
    bump((n) => n + 1)
  }

  return { undo, redo, canUndo: pastRef.current.length > 0, canRedo: futureRef.current.length > 0 }
}
