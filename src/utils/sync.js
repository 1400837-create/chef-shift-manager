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

// Firebase Realtime Database forbids ".", "#", "$", "/", "[", "]" in keys.
// Most data here uses crypto.randomUUID() ids (safe), but some items still
// carry legacy numeric ids from an older `Date.now() + Math.random()` scheme
// (see utils/id.js) that can render as e.g. "1785118603951.4883" — a plain
// object key with a dot in it. Rather than migrate all existing local data,
// escape/unescape these characters transparently at the sync boundary so
// sync works regardless of what ids happen to already exist locally.
const KEY_ESCAPES = [
  ['%', '%25'], // must stay first so escaping/unescaping is unambiguous
  ['.', '%2E'],
  ['#', '%23'],
  ['$', '%24'],
  ['/', '%2F'],
  ['[', '%5B'],
  [']', '%5D'],
]

// Firebase also rejects "" (empty string) as a key outright — distinct from
// the forbidden-character case above, so it needs its own placeholder.
// "%00" can't collide with the character-escaping scheme: a literal "%00" in
// a real key gets "%" escaped to "%25" first, becoming "%2500", never "%00".
const EMPTY_KEY_PLACEHOLDER = '%00'

function escapeKey(key) {
  if (key === '') return EMPTY_KEY_PLACEHOLDER
  return KEY_ESCAPES.reduce((acc, [ch, esc]) => acc.split(ch).join(esc), key)
}

function unescapeKey(key) {
  if (key === EMPTY_KEY_PLACEHOLDER) return ''
  return KEY_ESCAPES.reduceRight((acc, [ch, esc]) => acc.split(esc).join(ch), key)
}

function sanitizeForFirebase(value) {
  if (Array.isArray(value)) return value.map(sanitizeForFirebase)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[escapeKey(k)] = sanitizeForFirebase(v)
    return out
  }
  return value
}

function restoreFromFirebase(value) {
  if (Array.isArray(value)) return value.map(restoreFromFirebase)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[unescapeKey(k)] = restoreFromFirebase(v)
    return out
  }
  return value
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
  set(r, sanitizeForFirebase(value)).catch(() => {
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
      onRemoteChange(restoreFromFirebase(snapshot.val()))
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
    await set(roomRef, sanitizeForFirebase(data))
  }
  setSyncConfig({ enabled: true, code })
}

export function disableSync() {
  const { code } = getSyncConfig()
  setSyncConfig({ enabled: false, code })
}
