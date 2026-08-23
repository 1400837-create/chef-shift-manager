import { ref, onValue, set, get } from 'firebase/database'
import { db } from '../firebase'
import { buildBackup } from './backup'

// Sync config itself is plain localStorage, not synced — it's what tells
// this specific device which "room" (if any) to sync through, so it can't
// live inside the room it's configuring.
const SYNC_CONFIG_KEY = 'kitchenOS_syncConfig'
const CONFIG_CHANGED_EVENT = 'kitchenos-sync-config-changed'

export function getSyncConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY))
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // fall through to default
  }
  return { enabled: false, code: '' }
}

function setSyncConfig(config) {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config))
  window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT))
}

export function onSyncConfigChanged(handler) {
  window.addEventListener(CONFIG_CHANGED_EVENT, handler)
  return () => window.removeEventListener(CONFIG_CHANGED_EVENT, handler)
}

// Random, unguessable by default — the room code is the *only* access
// control (see the Realtime Database rules doc alongside this file), so it
// shouldn't be something like "la-chef" that a stranger could type in.
export function generateSyncCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789' // no 0/O/1/l/i — easier to read aloud/retype
  let code = ''
  for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function roomKeyRef(key) {
  if (!db) return null // Firebase failed to initialize — see firebase.js
  const { enabled, code } = getSyncConfig()
  if (!enabled || !code) return null
  return ref(db, `rooms/${code}/${key}`)
}

// Called by useLocalStorage whenever a synced key's value changes locally.
export function pushToCloud(key, value) {
  const r = roomKeyRef(key)
  if (!r) return
  set(r, value).catch(() => {
    // Best-effort — offline, or the room is unreachable. The local write
    // already succeeded, so nothing is lost; it'll catch up once connected.
  })
}

// Called once per mounted useLocalStorage instance — attaches (and
// re-attaches, if sync gets turned on/off/switched to a different room
// while already mounted) a live listener for that one key.
export function subscribeToCloud(key, onRemoteChange) {
  let detachValue = null

  function attach() {
    if (detachValue) { detachValue(); detachValue = null }
    const r = roomKeyRef(key)
    if (!r) return
    detachValue = onValue(r, (snapshot) => {
      if (!snapshot.exists()) return
      onRemoteChange(snapshot.val())
    })
  }

  attach()
  const detachConfigListener = onSyncConfigChanged(attach)
  return () => {
    if (detachValue) detachValue()
    detachConfigListener()
  }
}

// Turns sync on for this device. If the room already has data (another
// device set it up first), that data becomes authoritative — each mounted
// useLocalStorage's listener above picks up its own key automatically, no
// extra step needed. If the room is empty (this is the first device), this
// device's current data seeds it instead.
export async function enableSync(code) {
  if (!db) throw new Error('Firebase не настроен')
  const roomRef = ref(db, `rooms/${code}`)
  const snapshot = await get(roomRef)
  if (!snapshot.exists()) {
    const { data } = buildBackup()
    await set(roomRef, data)
  }
  setSyncConfig({ enabled: true, code })
}

export function disableSync() {
  const { code } = getSyncConfig()
  setSyncConfig({ enabled: false, code })
}
