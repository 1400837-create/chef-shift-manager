import { useEffect, useRef, useState } from 'react'
import { pushToCloud, subscribeToCloud } from '../utils/sync'

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
//
// Also mirrors to Firebase Realtime Database when cross-device sync is
// turned on (see utils/sync.js) — every call site gets that for free without
// having to know sync exists, same way every call site already gets
// localStorage persistence for free. When sync is off, subscribeToCloud is
// a no-op (roomKeyRef returns null), so this behaves exactly as before.
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => readValue(key, initialValue))
  const firstRender = useRef(true)
  // Set right before applying a value that came FROM the cloud, so the
  // write-through effect below doesn't immediately echo it straight back —
  // without this, two devices with the sync open would just bounce the same
  // write back and forth.
  const skipNextPush = useRef(false)

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
    if (skipNextPush.current) {
      skipNextPush.current = false
    } else {
      pushToCloud(key, value)
    }
  }, [key, value])

  useEffect(() => {
    return subscribeToCloud(key, (remoteValue) => {
      skipNextPush.current = true
      setValue(remoteValue)
    })
  }, [key])

  return [value, setValue]
}
