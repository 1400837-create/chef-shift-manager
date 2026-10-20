import { useEffect, useState } from 'react'
import { get, onValue, query, orderByKey, limitToLast, update, set, push, serverTimestamp, ref } from 'firebase/database'
import { db } from '../firebase'
import { generateSyncCode } from '../utils/sync'
import {
  getPlanConfig, setPlanConfig, getSession, setSession, clearSession,
  planRoomRef, localDayKey, getAuthor, usePlanDeviceState,
} from './planRoom'
import {
  PLAN_COLLECTIONS, writeDirect, flush, getPendingCount, getCollectionNow, startPlanEngine,
} from './planStore'

function withNet(promise, ms = 12000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Нет связи с сервером. Проверьте интернет и повторите.')), ms)
    promise.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) }
    )
  })
}

function requireDb() {
  if (!db) throw new Error('Firebase не настроен')
  return db
}

// ---- passwords ---------------------------------------------------------------
// PBKDF2 via WebCrypto. The point isn't strong secrecy (anyone holding the
// plan code can read the user records, hashes included) but never storing or
// transmitting a password in readable form, and making guessing slow.

const PBKDF2_ITERATIONS = 150000
const encoder = new TextEncoder()

function toB64(bytes) {
  let s = ''
  bytes.forEach((b) => { s += String.fromCharCode(b) })
  return btoa(s)
}

function fromB64(b64) {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

function newSalt() {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return toB64(a)
}

export async function hashPassword(password, saltB64, iterations = PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations },
    material,
    256
  )
  return toB64(new Uint8Array(bits))
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ---- room lifecycle -----------------------------------------------------------

export async function createPlanRoom(ownerName) {
  requireDb()
  const name = (ownerName || '').trim() || 'Владелец'
  let code = generateSyncCode()
  const taken = await withNet(get(ref(db, `rooms/${code}/meta`)))
  if (taken.exists()) code = generateSyncCode()
  await withNet(set(ref(db, `rooms/${code}/meta`), { createdAt: serverTimestamp(), schema: 1, ownerName: name }))
  setPlanConfig({ code, role: 'owner', ownerName: name })
  return code
}

// Second owner device (laptop + phone): attach to the plan that already exists.
export async function joinPlanRoomAsOwner(code, ownerName) {
  requireDb()
  const c = (code || '').trim()
  if (!c) throw new Error('Введите код плана')
  const meta = await withNet(get(ref(db, `rooms/${c}/meta`)))
  if (!meta.exists()) throw new Error('Комната плана с таким кодом не найдена')
  setPlanConfig({ code: c, role: 'owner', ownerName: (ownerName || '').trim() || meta.val().ownerName || 'Владелец' })
}

export function setOwnerName(name) {
  const cfg = getPlanConfig()
  if (cfg) setPlanConfig({ ...cfg, ownerName: name.trim() || 'Владелец' })
}

// ---- users (owner) ---------------------------------------------------------------

export function usePlanUsers() {
  const { config } = usePlanDeviceState()
  const code = config?.code
  const [state, setState] = useState({ users: [], ready: false })
  useEffect(() => {
    if (!code || !db) return undefined
    const off = onValue(planRoomRef('users'), (snap) => {
      const v = snap.val() || {}
      const users = Object.entries(v)
        .map(([id, u]) => ({ id, name: u.name || '', disabled: !!u.disabled, createdAt: u.createdAt || 0 }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      setState({ users, ready: true })
    }, () => setState((s) => ({ ...s, ready: true })))
    return () => off()
  }, [code])
  return state
}

export async function addUser(name, password) {
  requireDb()
  const cleanName = (name || '').trim()
  if (cleanName.length < 2) throw new Error('Укажите имя (минимум 2 символа)')
  if ((password || '').length < 6) throw new Error('Пароль — минимум 6 символов')
  const snap = await withNet(get(planRoomRef('users')))
  const existing = snap.val() || {}
  if (Object.values(existing).some((u) => (u.name || '').trim().toLowerCase() === cleanName.toLowerCase())) {
    throw new Error('Пользователь с таким именем уже есть')
  }
  const uid = push(planRoomRef('users')).key
  const salt = newSalt()
  const hash = await hashPassword(password, salt)
  await writeDirect(
    { [`users/${uid}`]: { name: cleanName, role: 'staff', salt, iter: PBKDF2_ITERATIONS, hash, pwVersion: 1, disabled: false, createdAt: Date.now() } },
    { coll: 'users', action: 'create', id: uid, label: cleanName }
  )
}

export async function setUserPassword(uid, name, password) {
  requireDb()
  if ((password || '').length < 6) throw new Error('Пароль — минимум 6 символов')
  const snap = await withNet(get(planRoomRef(`users/${uid}`)))
  const u = snap.val()
  if (!u) throw new Error('Пользователь не найден')
  const salt = newSalt()
  const hash = await hashPassword(password, salt)
  await writeDirect(
    {
      [`users/${uid}/salt`]: salt,
      [`users/${uid}/iter`]: PBKDF2_ITERATIONS,
      [`users/${uid}/hash`]: hash,
      [`users/${uid}/pwVersion`]: (u.pwVersion || 1) + 1,
    },
    { coll: 'users', action: 'password', id: uid, label: name }
  )
}

export async function setUserDisabled(uid, name, disabled) {
  requireDb()
  await writeDirect(
    { [`users/${uid}/disabled`]: !!disabled },
    { coll: 'users', action: disabled ? 'disable' : 'enable', id: uid, label: name }
  )
}

export async function deleteUser(uid, name) {
  requireDb()
  await writeDirect({ [`users/${uid}`]: null }, { coll: 'users', action: 'delete', id: uid, label: name })
}

// ---- staff login ---------------------------------------------------------------------

export async function loginStaff({ code, name, password }) {
  requireDb()
  const c = (code || '').trim()
  const n = (name || '').trim()
  if (!c || !n || !password) throw new Error('Заполните код плана, имя и пароль')
  const generic = 'Неверный код, имя или пароль'
  const snap = await withNet(get(ref(db, `rooms/${c}/users`)), 15000)
  const users = snap.val() || {}
  const found = Object.entries(users).find(([, u]) => (u.name || '').trim().toLowerCase() === n.toLowerCase())
  if (!found) throw new Error(generic)
  const [uid, u] = found
  if (u.disabled) throw new Error('Доступ отключён. Обратитесь к владельцу.')
  const hash = await hashPassword(password, u.salt, u.iter || PBKDF2_ITERATIONS)
  if (!safeEqual(hash, u.hash)) throw new Error(generic)
  setPlanConfig({ code: c, role: 'staff' })
  setSession({ userId: uid, name: u.name, pwVersion: u.pwVersion || 1, at: Date.now() })
  return u.name
}

export function logoutStaff() {
  clearSession()
}

// Owner disabled / re-passworded this user since login → kick them out on the
// next check. Offline keeps the session (nothing to compare against).
export async function validateSession() {
  const cfg = getPlanConfig()
  const s = getSession()
  if (!cfg || cfg.role !== 'staff' || !s) return true
  try {
    const snap = await withNet(get(planRoomRef(`users/${s.userId}`)), 10000)
    const u = snap.val()
    if (!u || u.disabled || (u.pwVersion || 1) !== s.pwVersion) {
      clearSession()
      return false
    }
  } catch {
    // offline — keep working
  }
  return true
}

// ---- journal ----------------------------------------------------------------------------

export function useJournal(days) {
  const { config } = usePlanDeviceState()
  const code = config?.code
  const [state, setState] = useState({ entries: [], ready: false })
  useEffect(() => {
    if (!code || !db) return undefined
    const q = query(planRoomRef('journal'), orderByKey(), limitToLast(days))
    const off = onValue(q, (snap) => {
      const byDay = snap.val() || {}
      const entries = []
      Object.entries(byDay).forEach(([day, items]) => {
        Object.entries(items || {}).forEach(([id, e]) => entries.push({ id, day, ...e }))
      })
      entries.sort((a, b) => (b.clientTs || 0) - (a.clientTs || 0))
      setState({ entries, ready: true })
    }, () => setState((s) => ({ ...s, ready: true })))
    return () => off()
  }, [code, days])
  return state
}

// ---- snapshots --------------------------------------------------------------------------

const JOURNAL_KEEP_DAYS = 90
const BACKUP_KEEP_DAYS = 30

export function useBackups() {
  const { config } = usePlanDeviceState()
  const code = config?.code
  const [state, setState] = useState({ backups: [], ready: false })
  useEffect(() => {
    if (!code || !db) return undefined
    const off = onValue(planRoomRef('backupsIndex'), (snap) => {
      const v = snap.val() || {}
      const backups = Object.entries(v)
        .map(([id, b]) => ({ id, kind: b.kind || 'auto', by: b.by || '', createdAt: b.createdAt || 0, counts: b.counts || {} }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      setState({ backups, ready: true })
    }, () => setState((s) => ({ ...s, ready: true })))
    return () => off()
  }, [code])
  return state
}

export async function createSnapshot(kind = 'auto', explicitId) {
  requireDb()
  const day = localDayKey()
  const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '')
  const id = explicitId || (kind === 'auto' ? day : `${day}-${kind}-${stamp}`)
  const data = {}
  const counts = {}
  for (const coll of PLAN_COLLECTIONS) {
    const snap = await withNet(get(planRoomRef(coll)), 15000)
    const v = snap.val()
    data[coll] = v || null
    counts[coll] = v ? Object.keys(v).length : 0
  }
  const by = getAuthor().name
  await withNet(
    update(planRoomRef(), {
      [`backups/${id}`]: { kind, createdAt: serverTimestamp(), by, data },
      [`backupsIndex/${id}`]: { kind, createdAt: serverTimestamp(), by, counts },
    }),
    20000
  )
  return id
}

// First device to open the app each day takes the daily snapshot. Two devices
// racing both write the same id with near-identical content — harmless.
export async function ensureDailyBackup() {
  const cfg = getPlanConfig()
  if (!cfg || !db) return
  const day = localDayKey()
  const marker = `kitchenPlan_backupChecked:${cfg.code}`
  if (localStorage.getItem(marker) === day) return
  const exists = await withNet(get(planRoomRef(`backupsIndex/${day}`)), 15000)
  if (!exists.exists()) await createSnapshot('auto', day)
  localStorage.setItem(marker, day)
}

export async function pruneOld() {
  const cfg = getPlanConfig()
  if (!cfg || !db) return
  const day = localDayKey()
  const marker = `kitchenPlan_pruned:${cfg.code}`
  if (localStorage.getItem(marker) === day) return
  const journalCutoff = localDayKey(Date.now() - JOURNAL_KEEP_DAYS * 86400000)
  const backupCutoff = localDayKey(Date.now() - BACKUP_KEEP_DAYS * 86400000)
  const updates = {}
  const days = (await withNet(get(planRoomRef('journalDays')), 15000)).val() || {}
  Object.keys(days).forEach((d) => {
    if (d < journalCutoff) {
      updates[`journal/${d}`] = null
      updates[`journalDays/${d}`] = null
    }
  })
  const index = (await withNet(get(planRoomRef('backupsIndex')), 15000)).val() || {}
  Object.keys(index).forEach((id) => {
    if (id.slice(0, 10) < backupCutoff) {
      updates[`backups/${id}`] = null
      updates[`backupsIndex/${id}`] = null
    }
  })
  if (Object.keys(updates).length) await withNet(update(planRoomRef(), updates), 20000)
  localStorage.setItem(marker, day)
}

function restoreUpdates(collections) {
  const updates = {}
  PLAN_COLLECTIONS.forEach((coll) => {
    if (collections && Object.prototype.hasOwnProperty.call(collections, coll)) updates[coll] = collections[coll] || null
  })
  return updates
}

// Restoring writes the old state over the current one, so edits still queued
// on this device must reach the server first — otherwise they would replay
// on top of the restored data afterwards.
async function ensureNothingPending() {
  await flush()
  if (getPendingCount() > 0) throw new Error('Есть неотправленные изменения. Дождитесь синхронизации и повторите.')
}

export async function restoreSnapshot(id) {
  requireDb()
  if (getPlanConfig()?.role !== 'owner') throw new Error('Восстанавливать план может только владелец')
  await ensureNothingPending()
  const snap = await withNet(get(planRoomRef(`backups/${id}`)), 20000)
  if (!snap.exists()) throw new Error('Копия не найдена')
  await createSnapshot('pre-restore')
  await writeDirect(restoreUpdates(snap.val().data || {}), { coll: 'system', action: 'restore', label: id })
}

// ---- file export / import ------------------------------------------------------------

export async function exportPlanFile() {
  const collections = {}
  for (const coll of PLAN_COLLECTIONS) {
    try {
      const snap = await withNet(get(planRoomRef(coll)), 8000)
      collections[coll] = snap.val() || null
    } catch {
      collections[coll] = getCollectionNow(coll) // offline: what this device has
    }
  }
  const payload = {
    kind: 'la-chef-plan',
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: getAuthor().name,
    collections,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `la-chef-plan-${localDayKey()}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function parsePlanFile(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Это не файл плана (не удалось прочитать)')
  }
  if (!parsed || parsed.kind !== 'la-chef-plan' || typeof parsed.collections !== 'object' || parsed.collections === null) {
    throw new Error('Это не файл плана LA CHEF')
  }
  return parsed
}

export async function importPlanFile(parsed) {
  requireDb()
  if (getPlanConfig()?.role !== 'owner') throw new Error('Загружать план из файла может только владелец')
  await ensureNothingPending()
  await createSnapshot('pre-import')
  await writeDirect(restoreUpdates(parsed.collections), { coll: 'system', action: 'import', label: parsed.exportedAt || '' })
}

// ---- slim recipe list for the staff side -------------------------------------------------

function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return String(h)
}

// The staff device never receives the real recipes (ingredients, photos,
// prices). The owner's device publishes just names + type, one-way, so dishes
// can still be picked from a list in the plan.
export async function publishRecipesSlim(recipes) {
  const cfg = getPlanConfig()
  if (!cfg || cfg.role !== 'owner' || !db || !Array.isArray(recipes) || recipes.length === 0) return
  const map = {}
  recipes.forEach((r) => {
    const key = String(r.id).replace(/[.#$\/\[\]]/g, '_')
    map[key] = { n: r.name || '', c: r.category || 'other' }
  })
  const json = JSON.stringify(map)
  const marker = `kitchenPlan_slimHash:${cfg.code}`
  const sig = `${json.length}:${djb2(json)}`
  if (localStorage.getItem(marker) === sig) return
  await withNet(set(planRoomRef('recipesSlim'), map), 20000)
  localStorage.setItem(marker, sig)
}

// ---- background upkeep ---------------------------------------------------------------------

export function usePlanMaintenance(recipes) {
  const { config } = usePlanDeviceState()
  const code = config?.code
  const role = config?.role

  useEffect(() => {
    if (!code) return
    startPlanEngine()
    ensureDailyBackup().catch(() => {})
    pruneOld().catch(() => {})
  }, [code])

  useEffect(() => {
    if (role !== 'owner' || !code || !recipes?.length) return undefined
    const t = setTimeout(() => publishRecipesSlim(recipes).catch(() => {}), 3000)
    return () => clearTimeout(t)
  }, [code, role, recipes])
}
