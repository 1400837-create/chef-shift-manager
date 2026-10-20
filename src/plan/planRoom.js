import { useSyncExternalStore } from 'react'
import { ref } from 'firebase/database'
import { db } from '../firebase'

// Everything about the work-plan lives under its OWN localStorage prefix
// (kitchenPlan_), not kitchenOS_: utils/backup.js and the main room sync both
// enumerate kitchenOS_* keys, and none of this (room code, login session,
// offline outbox, caches) belongs in either of them.
const CONFIG_KEY = 'kitchenPlan_config' // { code, role: 'owner' | 'staff', ownerName? }
const SESSION_KEY = 'kitchenPlan_session' // staff devices: { userId, name, pwVersion, at }
const DEVICE_KEY = 'kitchenPlan_device' // 'owner' once the first-run chooser was answered
const CHANGED_EVENT = 'kitchenplan-config-changed'

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}

export function getPlanConfig() {
  const c = readJson(CONFIG_KEY)
  return c && typeof c === 'object' && c.code ? c : null
}

function emitChanged() {
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
}

export function setPlanConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  emitChanged()
}

export function clearPlanConfig() {
  localStorage.removeItem(CONFIG_KEY)
  localStorage.removeItem(SESSION_KEY)
  emitChanged()
}

export function getSession() {
  const s = readJson(SESSION_KEY)
  return s && typeof s === 'object' && s.userId ? s : null
}

export function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  emitChanged()
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  emitChanged()
}

export function getDeviceChoice() {
  return localStorage.getItem(DEVICE_KEY)
}

export function setDeviceChoice(value) {
  localStorage.setItem(DEVICE_KEY, value)
  emitChanged()
}

// A device is "fresh" if the app has never stored anything here: that's the
// only case where asking "owner device or staff login?" makes sense. Existing
// installs already hold kitchenOS_* data, so they go straight to the app.
export function isFreshDevice() {
  if (getPlanConfig() || getDeviceChoice()) return false
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('kitchenOS_')) return false
  }
  return true
}

export function onPlanConfigChanged(handler) {
  window.addEventListener(CHANGED_EVENT, handler)
  return () => window.removeEventListener(CHANGED_EVENT, handler)
}

// Raw-string snapshot so useSyncExternalStore sees a stable value between
// renders (parsing into a fresh object each call would loop forever).
function rawState() {
  return [
    localStorage.getItem(CONFIG_KEY) || '',
    localStorage.getItem(SESSION_KEY) || '',
    localStorage.getItem(DEVICE_KEY) || '',
  ].join('\u0001')
}

export function usePlanDeviceState() {
  useSyncExternalStore(onPlanConfigChanged, rawState)
  return {
    config: getPlanConfig(),
    session: getSession(),
    deviceChoice: getDeviceChoice(),
  }
}

export function planRoomRef(path = '') {
  const cfg = getPlanConfig()
  if (!db || !cfg) return null
  return path ? ref(db, `rooms/${cfg.code}/${path}`) : ref(db, `rooms/${cfg.code}`)
}

// Who a change is attributed to in the journal.
export function getAuthor() {
  const cfg = getPlanConfig()
  if (cfg?.role === 'staff') {
    const s = getSession()
    return { id: s?.userId || 'staff', name: s?.name || 'Сотрудник' }
  }
  return { id: 'owner', name: cfg?.ownerName || 'Владелец' }
}

export function localDayKey(ts = Date.now()) {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
