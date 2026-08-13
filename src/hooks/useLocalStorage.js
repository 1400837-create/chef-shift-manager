import { useEffect, useRef, useState } from 'react'

const PREFIX = 'kitchenOS_'

function readValue(key, initialValue) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw === null) return typeof initialValue === 'function' ? initialValue() : initialValue
    return JSON.parse(raw)
  } catch {
    return typeof initialValue === 'function' ? initialValue() : initialValue
  }
}

// Drop-in replacement for useState that persists to localStorage under a
// namespaced key. Every module in the app uses this so data survives reloads
// and works fully offline.
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => readValue(key, initialValue))
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // Storage full or unavailable — the change stays in memory (visible,
      // usable) but won't survive a reload. That's a silent data-loss trap
      // if nothing tells the user, so a single app-wide event does — App.jsx
      // turns it into a persistent banner instead of failing invisibly.
      window.dispatchEvent(new CustomEvent('kitchenos-storage-error', { detail: { key } }))
    }
  }, [key, value])

  return [value, setValue]
}
