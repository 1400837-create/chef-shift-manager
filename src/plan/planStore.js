import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { onValue, update, push, serverTimestamp, ref } from 'firebase/database'
import { db } from '../firebase'
import { getPlanConfig, onPlanConfigChanged, planRoomRef, getAuthor, localDayKey } from './planRoom'

// Collections that make up "the plan" — what snapshots, the file export and
// restore all cover. recipesSlim/users/journal/backups are deliberately not
// in here: the first is derived, the rest are infrastructure.
export const PLAN_COLLECTIONS = ['staff', 'shiftTemplates', 'plans', 'planData']

// ---------------------------------------------------------------------------
// Why this isn't useLocalStorage + whole-key sync
//
// The main app mirrors one big JSON value per key, so two people saving at the
// same moment means the later one overwrites the earlier one wholesale. The
// plan is shared by two people editing live, so here every record is its own
// node and every edit writes only the fields that changed (multi-path
// update()). Two people editing different things can never clobber each
// other; editing the very same field leaves the later value, visible to both
// immediately.
//
// Every edit is also appended to an outbox in localStorage BEFORE it is sent
// and only removed once the server acknowledged it, so a dropped connection
// or a closed tab doesn't lose it — it is re-sent on the next start/reconnect.
// ---------------------------------------------------------------------------

const OUTBOX_KEY = 'kitchenPlan_outbox'
const cacheKey = (code, coll) => `kitchenPlan_cache:${code}:${coll}`

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}

function clone(v) {
  return v === undefined || v === null ? v : JSON.parse(JSON.stringify(v))
}

// Firebase's set()/update() throw synchronously on `undefined` anywhere in
// the payload (same trap that once crashed the main sync).
export function cleanDeep(value) {
  if (value === undefined) return null
  if (Array.isArray(value)) return value.map(cleanDeep)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = cleanDeep(v)
    return out
  }
  return value
}

function getDeep(obj, parts) {
  let node = obj
  for (const p of parts) {
    if (node == null || typeof node !== 'object') return undefined
    node = node[p]
  }
  return node
}

function setDeep(root, parts, value) {
  if (parts.length === 0) return
  let node = root
  const stack = []
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (node[p] == null || typeof node[p] !== 'object') {
      if (value === null) return
      node[p] = {}
    }
    stack.push([node, p])
    node = node[p]
  }
  const last = parts[parts.length - 1]
  if (value === null) {
    delete node[last]
    // Firebase drops a parent node once its last child is gone — mirror it.
    for (let i = stack.length - 1; i >= 0; i--) {
      const [parent, key] = stack[i]
      if (Object.keys(parent[key]).length === 0) delete parent[key]
      else break
    }
  } else {
    node[last] = value
  }
}

// ---- outbox ----------------------------------------------------------------

let outbox = (() => {
  const saved = readJson(OUTBOX_KEY)
  return Array.isArray(saved) ? saved : []
})()

function saveOutbox() {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox))
  } catch {
    // If even this fails the edit still reaches the server while the tab is
    // open; the status chip below keeps showing it as pending until then.
  }
  setStatus({ pending: pendingForCurrent() })
}

function pendingForCurrent() {
  const code = getPlanConfig()?.code
  return outbox.filter((o) => o.code === code).length
}

export function getPendingCount() {
  return pendingForCurrent()
}

// ---- status (connection / pending / last error) ------------------------------

let status = { online: false, pending: pendingForCurrent(), error: null, flushing: false }
const statusListeners = new Set()

function setStatus(patch) {
  status = { ...status, ...patch }
  statusListeners.forEach((fn) => fn())
}

function subscribeStatus(cb) {
  statusListeners.add(cb)
  return () => statusListeners.delete(cb)
}

export function usePlanStatus() {
  return useSyncExternalStore(subscribeStatus, () => status)
}

function describeError(err) {
  const msg = String(err?.message || err || '')
  if (msg === 'timeout') return 'Нет связи с сервером — изменения сохранены на устройстве и отправятся автоматически'
  if (/permission/i.test(msg)) return 'Нет прав записи (проверьте правила Firebase)'
  return msg || 'Ошибка синхронизации'
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) }
    )
  })
}

// ---- live views of the collections -------------------------------------------

const serverSnap = {} // coll -> last known server value (or cached one)
const serverReady = {} // coll -> true once the server actually answered
const subs = {} // coll -> unsubscribe
const views = {} // coll -> { data, ready }
const viewListeners = {} // coll -> Set<callback>
const EMPTY_VIEW = { data: {}, ready: false }

function applyPending(coll, base) {
  const code = getPlanConfig()?.code
  const data = clone(base) || {}
  // `coll` may itself be a path ("planData/abc"), and an op may write either
  // below it, exactly at it (deleting a whole plan), or in a collection that
  // sits above it — so match on path prefix, not on the first segment.
  const prefix = `${coll}/`
  for (const op of outbox) {
    if (op.code !== code) continue
    for (const [path, value] of Object.entries(op.updates)) {
      if (path === coll) {
        if (value === null) Object.keys(data).forEach((k) => delete data[k])
        else Object.assign(data, clone(value))
        continue
      }
      if (!path.startsWith(prefix)) continue
      setDeep(data, path.slice(prefix.length).split('/'), value === null ? null : clone(value))
    }
  }
  return data
}

function recompute(coll) {
  views[coll] = getPlanConfig()
    ? { data: applyPending(coll, serverSnap[coll]), ready: !!serverReady[coll] }
    : EMPTY_VIEW
  if (viewListeners[coll]) viewListeners[coll].forEach((fn) => fn())
}

function recomputeAll() {
  Object.keys(viewListeners).forEach(recompute)
}

function ensureSubscribed(coll) {
  const cfg = getPlanConfig()
  if (!cfg || !db || subs[coll]) return
  if (serverSnap[coll] === undefined) {
    const cached = readJson(cacheKey(cfg.code, coll))
    if (cached && typeof cached === 'object') serverSnap[coll] = cached
  }
  recompute(coll)
  subs[coll] = onValue(
    planRoomRef(coll),
    (snap) => {
      serverSnap[coll] = snap.val() || {}
      serverReady[coll] = true
      try {
        localStorage.setItem(cacheKey(cfg.code, coll), JSON.stringify(serverSnap[coll]))
      } catch {
        // cache is a nicety (offline start) — not worth surfacing
      }
      recompute(coll)
    },
    (err) => setStatus({ error: describeError(err) })
  )
}

function subscribeView(coll, cb) {
  if (!viewListeners[coll]) viewListeners[coll] = new Set()
  viewListeners[coll].add(cb)
  ensureSubscribed(coll)
  return () => {
    viewListeners[coll].delete(cb)
  }
}

function getView(coll) {
  return views[coll] || EMPTY_VIEW
}

// The room changed (created / joined / left / logged out): drop everything
// that belonged to the old one and re-attach whatever is on screen.
function resetAll() {
  Object.keys(subs).forEach((coll) => {
    try { subs[coll]() } catch { /* already detached */ }
    delete subs[coll]
  })
  Object.keys(serverSnap).forEach((k) => delete serverSnap[k])
  Object.keys(serverReady).forEach((k) => delete serverReady[k])
  Object.keys(viewListeners).forEach((coll) => {
    ensureSubscribed(coll)
    recompute(coll)
  })
  setStatus({ pending: pendingForCurrent(), error: null })
  flush()
}
onPlanConfigChanged(resetAll)

export function usePlanCollection(coll) {
  const subscribe = useCallback((cb) => subscribeView(coll, cb), [coll])
  const view = useSyncExternalStore(subscribe, () => getView(coll))
  const items = useMemo(
    () => Object.entries(view.data).map(([id, rec]) => ({ id, ...(rec && typeof rec === 'object' ? rec : {}) })),
    [view]
  )
  return { data: view.data, items, ready: view.ready }
}

// ---- sending -----------------------------------------------------------------

let flushing = false
let retryTimer = null

function scheduleRetry() {
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    flush()
  }, 10000)
}

export async function flush() {
  if (flushing) return
  flushing = true
  setStatus({ flushing: true })
  try {
    for (;;) {
      const cfg = getPlanConfig()
      if (!cfg || !db) break
      const op = outbox.find((o) => o.code === cfg.code)
      if (!op) break
      const payload = { ...op.updates }
      payload[`journal/${op.day}/${op.opId}`] = { ...op.journal, clientTs: op.clientTs, ts: serverTimestamp() }
      payload[`journalDays/${op.day}`] = true
      await withTimeout(update(ref(db, `rooms/${cfg.code}`), payload), 30000)
      outbox = outbox.filter((o) => o.opId !== op.opId)
      saveOutbox()
      recomputeAll()
      setStatus({ error: null })
    }
  } catch (err) {
    setStatus({ error: describeError(err) })
    scheduleRetry()
  } finally {
    flushing = false
    setStatus({ flushing: false })
  }
}

let connectionOff = null
let engineTimer = null

// Called once from whichever shell is running (owner App / StaffApp). Safe to
// call repeatedly.
export function startPlanEngine() {
  if (db && !connectionOff) {
    connectionOff = onValue(ref(db, '.info/connected'), (snap) => {
      const online = snap.val() === true
      setStatus({ online })
      if (online) flush()
    })
  }
  if (!engineTimer) {
    engineTimer = setInterval(() => {
      if (pendingForCurrent() > 0) flush()
    }, 20000)
    window.addEventListener('online', () => flush())
  }
  setStatus({ pending: pendingForCurrent() })
  flush()
}

// ---- edits -------------------------------------------------------------------

function requireRoom() {
  const cfg = getPlanConfig()
  if (!cfg || !db) throw new Error('План не настроен на этом устройстве')
  return cfg
}

export function commitChange(args) {
  commit(args)
}

// A fresh unique id (push key) for a record that will live under `coll`.
export function newId(coll) {
  const cfg = requireRoom()
  return push(ref(db, `rooms/${cfg.code}/${coll}`)).key
}

// General nested edit: `rel` maps paths RELATIVE to `coll` to new values
// (null deletes). Unchanged scalar values are skipped so re-saving a field
// with the same text writes and journals nothing.
//   meta: { action: 'create'|'update'|'delete', entity, label, id, changes?, before? }
export function writePaths(coll, rel, meta = {}) {
  const action = meta.action || 'update'
  const view = getView(coll).data
  const updates = {}
  const changes = []
  for (const [p, raw] of Object.entries(rel)) {
    const value = norm(cleanDeep(raw))
    const prev = norm(getDeep(view, p.split('/')))
    const scalar = value === null || typeof value !== 'object'
    if (action === 'update' && scalar && prev === value) continue
    updates[`${coll}/${p}`] = value
    if (action === 'update') changes.push({ f: p.split('/').pop(), from: scalar ? prev : null, to: scalar ? value : null })
  }
  if (!Object.keys(updates).length) return false
  commit({
    coll,
    action,
    entity: meta.entity,
    id: meta.id,
    label: meta.label,
    updates,
    changes: meta.changes || (action === 'update' ? changes : null),
    before: meta.before,
  })
  return true
}

function commit({ coll, action, entity, id, label, updates, changes, before }) {
  const cfg = requireRoom()
  const author = getAuthor()
  const day = localDayKey()
  const opId = push(ref(db, `rooms/${cfg.code}/journal/${day}`)).key
  const journal = { coll, action, id: id || null, label: label || '', by: author.name, byId: author.id }
  if (entity) journal.entity = entity
  if (changes && changes.length) journal.changes = changes
  if (before !== undefined && before !== null) journal.before = before
  outbox.push({ opId, code: cfg.code, clientTs: Date.now(), day, updates: cleanDeep(updates), journal: cleanDeep(journal) })
  saveOutbox()
  recomputeAll()
  flush()
}

function displayLabel(rec) {
  return (rec && (rec.name || rec.label || rec.title)) || ''
}

export function createRecord(coll, record) {
  const cfg = requireRoom()
  const id = push(ref(db, `rooms/${cfg.code}/${coll}`)).key
  const clean = cleanDeep(record)
  commit({ coll, action: 'create', id, label: displayLabel(clean), updates: { [`${coll}/${id}`]: clean } })
  return id
}

function norm(v) {
  return v === undefined || v === null ? null : v
}

// patch: { field: value } — a key may contain "/" to reach into nested maps.
// Only fields whose value really changed are written (and journaled).
export function patchRecord(coll, id, patch) {
  const current = getView(coll).data[id] || {}
  const updates = {}
  const changes = []
  for (const [field, raw] of Object.entries(patch)) {
    const value = norm(cleanDeep(raw))
    const prev = norm(getDeep(current, field.split('/')))
    if (prev === value) continue
    updates[`${coll}/${id}/${field}`] = value
    changes.push({ f: field, from: prev, to: value })
  }
  if (!changes.length) return false
  commit({ coll, action: 'update', id, label: displayLabel(current), updates, changes })
  return true
}

export function deleteRecord(coll, id) {
  const before = getView(coll).data[id]
  if (before === undefined) return false
  commit({ coll, action: 'delete', id, label: displayLabel(before), updates: { [`${coll}/${id}`]: null }, before })
  return true
}

// For admin actions that must not be queued silently (user management,
// restore, snapshots): written immediately, together with its journal entry,
// and the promise rejects if the server can't be reached.
export async function writeDirect(updates, journalEntry) {
  const cfg = requireRoom()
  const author = getAuthor()
  const day = localDayKey()
  const key = push(ref(db, `rooms/${cfg.code}/journal/${day}`)).key
  const payload = cleanDeep({ ...updates })
  payload[`journal/${day}/${key}`] = {
    ...cleanDeep(journalEntry),
    by: author.name,
    byId: author.id,
    clientTs: Date.now(),
    ts: serverTimestamp(),
  }
  payload[`journalDays/${day}`] = true
  await withTimeout(update(ref(db, `rooms/${cfg.code}`), payload), 15000)
}

export function getCollectionNow(coll) {
  return getView(coll).data
}
