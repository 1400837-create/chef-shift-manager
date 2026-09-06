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
  // Guards against a worse version of that same echo: a FRESH device (empty
  // localStorage, sync already on) mounts with `value` still at its local
  // default, and the very first render's one-time migration/defaulting
  // effects elsewhere in the app (e.g. minQtyDefaultsApplied) can touch this
  // same state before Firebase's first response arrives — that's no longer
  // "first render" by the time it happens, so without this guard it would
  // push straight through and overwrite the real cloud data with the empty
  // local default. Starts false whenever sync is enabled, and only flips
  // true once subscribeToCloud confirms it's heard from Firebase for this
  // key (or confirms there's nothing to hear because sync is off).
  const readyToPush = useRef(false)

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
    } else if (readyToPush.current) {
      pushToCloud(key, value)
    }
    // else: sync is on but we haven't confirmed the cloud's actual state for
    // this key yet — the localStorage write above still happened, so this
    // change isn't lost; it (or whatever the cloud turns out to hold) syncs
    // normally as soon as readyToPush flips true.
  }, [key, value])

  useEffect(() => {
    return subscribeToCloud(
      key,
      (remoteValue) => {
        skipNextPush.current = true
        setValue(remoteValue)
      },
      (ready) => { readyToPush.current = ready }
    )
  }, [key])

  return [value, setValue]
}
