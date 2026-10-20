import { useMemo, useState } from 'react'
import {
  Users, History, Archive, KeyRound, Download, Upload, Copy, Plus, Clock, UserPlus, Lock, CalendarDays, Timer,
} from 'lucide-react'
import { Section, Field, inputClass, BigButton, Badge, ConfirmDeleteButton } from '../components/UI'
import { usePlanDeviceState } from '../plan/planRoom'
import { usePlanCollection, createRecord, patchRecord, deleteRecord } from '../plan/planStore'
import {
  usePlanUsers, addUser, setUserPassword, setUserDisabled, deleteUser, createPlanRoom, joinPlanRoomAsOwner,
  setOwnerName, useJournal, useBackups, createSnapshot, restoreSnapshot, exportPlanFile, parsePlanFile, importPlanFile,
} from '../plan/planAdmin'
import { durationMinutes, formatDuration, parseHM } from '../plan/hours'
import { describeEntry } from '../plan/journalText'
import { DraftInput, ConfirmButton, useAction, Message, StatusBar, parseNorm, byName } from './plan/shared'
import ScheduleTab from './plan/ScheduleTab'
import HoursTab from './plan/HoursTab'

// ---------------------------------------------------------------------------
// Справочники: сотрудники и типовые смены
// ---------------------------------------------------------------------------

function StaffDirectory() {
  const { items, ready } = usePlanCollection('staff')
  const sorted = useMemo(() => [...items].sort(byName), [items])
  const [form, setForm] = useState({ name: '', nameDe: '', norm: '' })
  const [error, setError] = useState(null)

  function add() {
    if (!form.name.trim()) {
      setError('Укажите имя сотрудника.')
      return
    }
    setError(null)
    createRecord('staff', { name: form.name.trim(), nameDe: form.nameDe.trim(), norm: parseNorm(form.norm) })
    setForm({ name: '', nameDe: '', norm: '' })
  }

  return (
    <Section title={`Сотрудники (${sorted.length})`} icon={Users}>
      <p className="text-xs text-slate-500 mb-3">
        Имя по-русски и по-немецки (подставляется при смене языка) и норма часов в месяц. Список общий —
        его могут менять оба; из него потом выбираются сотрудники в графике.
      </p>
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-3 mb-3">
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass} placeholder="Имя" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className={inputClass} placeholder="Имя (DE)" value={form.nameDe} onChange={(e) => setForm((f) => ({ ...f, nameDe: e.target.value }))} />
          <input className={inputClass} inputMode="decimal" placeholder="Норма, ч/мес" value={form.norm} onChange={(e) => setForm((f) => ({ ...f, norm: e.target.value }))} />
          <button
            onClick={add}
            className="min-h-[48px] rounded-xl bg-orange-500 active:bg-orange-600 text-white font-semibold flex items-center justify-center gap-1.5"
          >
            <Plus size={18} /> Добавить
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      {!ready && sorted.length === 0 && <p className="text-sm text-slate-400 text-center py-2">Загрузка…</p>}
      {ready && sorted.length === 0 && <p className="text-sm text-slate-400 text-center py-2">Сотрудников пока нет</p>}
      {sorted.map((rec) => (
        <div key={rec.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Имя</p>
              <DraftInput value={rec.name} placeholder="(без имени)" onCommit={(v) => { if (v.trim()) patchRecord('staff', rec.id, { name: v.trim() }) }} />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Имя (DE)</p>
              <DraftInput value={rec.nameDe} onCommit={(v) => patchRecord('staff', rec.id, { nameDe: v.trim() })} />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Норма, ч/мес</p>
              <DraftInput value={rec.norm} inputMode="decimal" onCommit={(v) => patchRecord('staff', rec.id, { norm: parseNorm(v) })} />
            </div>
            <div className="flex items-end justify-end">
              <ConfirmDeleteButton onConfirm={() => deleteRecord('staff', rec.id)} size="w-11 h-11" iconSize={18} />
            </div>
          </div>
        </div>
      ))}
    </Section>
  )
}

function ShiftTemplates() {
  const { items, ready } = usePlanCollection('shiftTemplates')
  const sorted = useMemo(
    () => [...items].sort((a, b) => (parseHM(a.start) ?? 0) - (parseHM(b.start) ?? 0) || byName(a, b)),
    [items]
  )
  const [form, setForm] = useState({ label: '', start: '', end: '' })
  const [error, setError] = useState(null)

  function add() {
    if (parseHM(form.start) === null || parseHM(form.end) === null) {
      setError('Укажите начало и конец смены.')
      return
    }
    setError(null)
    createRecord('shiftTemplates', {
      label: form.label.trim() || `${form.start}–${form.end}`,
      start: form.start,
      end: form.end,
    })
    setForm({ label: '', start: '', end: '' })
  }

  return (
    <Section title={`Типовые смены (${sorted.length})`} icon={Clock}>
      <p className="text-xs text-slate-500 mb-3">
        Готовые смены для быстрого выбора в графике, например 10:00–16:00. Часы считаются как конец минус
        начало, перерыв не вычитается; смена через полночь считается верно.
      </p>
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-3 mb-3">
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass + ' col-span-2'} placeholder="Название (необязательно)" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          <input type="time" className={inputClass} value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />
          <input type="time" className={inputClass} value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
          <button
            onClick={add}
            className="col-span-2 min-h-[48px] rounded-xl bg-orange-500 active:bg-orange-600 text-white font-semibold flex items-center justify-center gap-1.5"
          >
            <Plus size={18} /> Добавить смену
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      {!ready && sorted.length === 0 && <p className="text-sm text-slate-400 text-center py-2">Загрузка…</p>}
      {ready && sorted.length === 0 && <p className="text-sm text-slate-400 text-center py-2">Типовых смен пока нет</p>}
      {sorted.map((rec) => (
        <div key={rec.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <p className="text-[11px] text-slate-400 mb-0.5">Название</p>
              <DraftInput value={rec.label} onCommit={(v) => { if (v.trim()) patchRecord('shiftTemplates', rec.id, { label: v.trim() }) }} />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Начало</p>
              <DraftInput type="time" value={rec.start} onCommit={(v) => { if (parseHM(v) !== null) patchRecord('shiftTemplates', rec.id, { start: v }) }} />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Конец</p>
              <DraftInput type="time" value={rec.end} onCommit={(v) => { if (parseHM(v) !== null) patchRecord('shiftTemplates', rec.id, { end: v }) }} />
            </div>
            <div className="col-span-2 flex items-center justify-between">
              <Badge color="slate">{formatDuration(durationMinutes(rec.start, rec.end))} ч</Badge>
              <ConfirmDeleteButton onConfirm={() => deleteRecord('shiftTemplates', rec.id)} size="w-11 h-11" iconSize={18} />
            </div>
          </div>
        </div>
      ))}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Журнал
// ---------------------------------------------------------------------------

function dayTitle(ts) {
  return new Date(ts).toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' })
}

function JournalPanel() {
  const [days, setDays] = useState(7)
  const [author, setAuthor] = useState('all')
  const { entries, ready } = useJournal(days)
  const authors = useMemo(() => [...new Set(entries.map((e) => e.by).filter(Boolean))], [entries])
  const shown = author === 'all' ? entries : entries.filter((e) => e.by === author)

  const groups = useMemo(() => {
    const map = new Map()
    shown.forEach((e) => {
      const key = e.day
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(e)
    })
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [shown])

  return (
    <Section title="Журнал изменений" icon={History}>
      <p className="text-xs text-slate-500 mb-3">Кто, что и когда изменил. Записи хранятся 90 дней.</p>
      {authors.length > 1 && (
        <select className={inputClass + ' mb-3'} value={author} onChange={(e) => setAuthor(e.target.value)}>
          <option value="all">Все авторы</option>
          {authors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}
      {!ready && <p className="text-sm text-slate-400 text-center py-2">Загрузка…</p>}
      {ready && shown.length === 0 && <p className="text-sm text-slate-400 text-center py-2">Записей пока нет</p>}
      {groups.map(([day, list]) => (
        <div key={day} className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{dayTitle(list[0].clientTs)}</p>
          {list.map((e) => (
            <div key={e.id} className="flex gap-2 py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
              <span className="shrink-0 text-xs text-slate-400 w-10 pt-0.5">
                {new Date(e.clientTs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <p className="text-sm text-slate-700 dark:text-slate-200 min-w-0">
                <b>{e.by}</b> {describeEntry(e)}
              </p>
            </div>
          ))}
        </div>
      ))}
      {days < 90 && (
        <button
          onClick={() => setDays((d) => Math.min(90, d + 14))}
          className="w-full min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold"
        >
          Показать более ранние
        </button>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Копии и файл
// ---------------------------------------------------------------------------

const KIND_LABEL = {
  auto: 'Автоматическая',
  manual: 'Ручная',
  'pre-restore': 'Перед восстановлением',
  'pre-import': 'Перед загрузкой файла',
}

function BackupsPanel({ isOwner }) {
  const { backups, ready } = useBackups()
  const { msg, setMsg, busy, run } = useAction()
  const [pendingImport, setPendingImport] = useState(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMsg(null)
    try {
      const parsed = parsePlanFile(await file.text())
      setPendingImport(parsed)
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  const importCounts = pendingImport
    ? `сотрудников: ${Object.keys(pendingImport.collections.staff || {}).length}, типовых смен: ${Object.keys(pendingImport.collections.shiftTemplates || {}).length}, планов: ${Object.keys(pendingImport.collections.plans || {}).length}`
    : ''

  return (
    <Section title="Копии и файл" icon={Archive}>
      <p className="text-xs text-slate-500 mb-3">
        Раз в день план сохраняется автоматически, копии хранятся 30 дней.
        {isOwner ? ' Любую можно восстановить — перед этим автоматически создаётся копия текущего состояния.' : ''}
      </p>
      <div className="flex gap-2 mb-2">
        <BigButton onClick={() => run(() => createSnapshot('manual'), 'Копия создана')} icon={Archive} color="outline" disabled={busy}>
          Создать копию
        </BigButton>
      </div>
      <div className="flex gap-2 mb-1">
        <BigButton onClick={() => run(() => exportPlanFile(), 'Файл сохранён')} icon={Download} color="outline" disabled={busy}>
          Скачать файл
        </BigButton>
        {isOwner && (
          <label className="w-full flex items-center justify-center gap-2 min-h-[52px] px-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-semibold text-[15px] cursor-pointer">
            <Upload size={20} /> Загрузить из файла
            <input type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
          </label>
        )}
      </div>
      <Message msg={msg} />

      {pendingImport && (
        <div className="rounded-xl border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 p-3 mt-3">
          <p className="text-sm text-slate-700 dark:text-slate-200 mb-2">
            Файл от {pendingImport.exportedAt ? new Date(pendingImport.exportedAt).toLocaleString('ru-RU') : '—'}
            {pendingImport.exportedBy ? ` (${pendingImport.exportedBy})` : ''}: {importCounts}.
            Текущие данные плана будут заменены.
          </p>
          <div className="flex gap-2">
            <ConfirmButton
              onConfirm={() => { const p = pendingImport; setPendingImport(null); run(() => importPlanFile(p), 'План загружен из файла') }}
              confirmLabel="Точно заменить?"
              disabled={busy}
              className="flex-1 min-h-[44px] rounded-xl bg-orange-500 text-white text-sm font-semibold"
            >
              Заменить данные
            </ConfirmButton>
            <button onClick={() => setPendingImport(null)} className="px-4 min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold">
              Отмена
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Сохранённые копии</p>
        {!ready && <p className="text-sm text-slate-400">Загрузка…</p>}
        {ready && backups.length === 0 && <p className="text-sm text-slate-400">Копий пока нет</p>}
        {backups.map((b) => (
          <div key={b.id} className="flex items-center gap-2 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {b.createdAt ? new Date(b.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : b.id}
                {' · '}{KIND_LABEL[b.kind] || b.kind}
              </p>
              <p className="text-xs text-slate-400">
                {b.by ? `${b.by} · ` : ''}сотрудников: {b.counts?.staff || 0}, типовых смен: {b.counts?.shiftTemplates || 0}, планов: {b.counts?.plans || 0}
              </p>
            </div>
            {isOwner && (
              <ConfirmButton
                onConfirm={() => run(() => restoreSnapshot(b.id), 'План восстановлен из копии')}
                confirmLabel="Точно?"
                disabled={busy}
                className="shrink-0 px-3 min-h-[36px] rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold"
              >
                Восстановить
              </ConfirmButton>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Доступ (только владелец)
// ---------------------------------------------------------------------------

function UserRow({ user }) {
  const { msg, busy, run } = useAction()
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState('')
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex-1 min-w-0 truncate">{user.name}</p>
        <Badge color={user.disabled ? 'red' : 'green'}>{user.disabled ? 'Отключён' : 'Активен'}</Badge>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <button onClick={() => setPwOpen((v) => !v)} className="px-3 min-h-[36px] rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5">
          <KeyRound size={13} /> Сменить пароль
        </button>
        <button
          onClick={() => run(() => setUserDisabled(user.id, user.name, !user.disabled))}
          disabled={busy}
          className="px-3 min-h-[36px] rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold"
        >
          {user.disabled ? 'Включить доступ' : 'Отключить'}
        </button>
        <ConfirmDeleteButton onConfirm={() => run(() => deleteUser(user.id, user.name))} size="w-9 h-9" />
      </div>
      {pwOpen && (
        <div className="flex gap-2 mt-2">
          <input className={inputClass} type="text" autoComplete="off" placeholder="Новый пароль (от 6 символов)" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button
            onClick={() => run(async () => { await setUserPassword(user.id, user.name, pw); setPw(''); setPwOpen(false) }, 'Пароль изменён')}
            disabled={busy || pw.length < 6}
            className="shrink-0 px-4 min-h-[48px] rounded-xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            Сохранить
          </button>
        </div>
      )}
      <Message msg={msg} />
    </div>
  )
}

function AccessPanel({ config }) {
  const { users, ready } = usePlanUsers()
  const create = useAction()
  const join = useAction()
  const add = useAction()
  const [ownerName, setOwnerNameDraft] = useState(config?.ownerName || '')
  const [joinCode, setJoinCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newPw, setNewPw] = useState('')
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(config.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // the code is on screen — can be copied by hand
    }
  }

  if (!config) {
    return (
      <Section title="План работы — настройка" icon={Lock}>
        <p className="text-xs text-slate-500 mb-3">
          План живёт в отдельной «комнате» со своим кодом. Сотрудники получают доступ только к ней: склад, финансы
          и остальные данные на их устройство не попадают.
        </p>
        <Field label="Ваше имя в журнале изменений">
          <input className={inputClass} placeholder="Например: Шеф" value={ownerName} onChange={(e) => setOwnerNameDraft(e.target.value)} />
        </Field>
        <BigButton onClick={() => create.run(() => createPlanRoom(ownerName))} icon={Plus} disabled={create.busy}>
          Создать комнату плана
        </BigButton>
        <Message msg={create.msg} />

        <div className="border-t border-slate-100 dark:border-slate-700 mt-4 pt-4">
          <p className="text-xs text-slate-500 mb-2">Комната уже создана на другом вашем устройстве? Введите её код.</p>
          <input className={inputClass + ' mb-2 font-mono'} placeholder="Код плана" value={joinCode} onChange={(e) => setJoinCode(e.target.value.trim())} />
          <BigButton onClick={() => join.run(() => joinPlanRoomAsOwner(joinCode, ownerName))} color="outline" disabled={join.busy || !joinCode}>
            Подключиться к существующему плану
          </BigButton>
          <Message msg={join.msg} />
        </div>
      </Section>
    )
  }

  return (
    <>
      <Section title="Код плана" icon={Lock}>
        <p className="text-xs text-slate-500 mb-2">
          Этот код вводится на устройстве сотрудника вместе с её именем и паролем. Относитесь к нему как к паролю.
        </p>
        <div className="flex gap-2 mb-3">
          <div className="flex-1 min-w-0 min-h-[48px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex items-center font-mono text-[15px] text-slate-800 dark:text-slate-100 truncate">
            {config.code}
          </div>
          <button onClick={copyCode} className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            {copied ? <span className="text-xs font-semibold text-green-600">ОК</span> : <Copy size={18} />}
          </button>
        </div>
        <Field label="Ваше имя в журнале изменений">
          <DraftInput value={config.ownerName || ''} placeholder="Владелец" onCommit={(v) => setOwnerName(v)} />
        </Field>
      </Section>

      <Section title={`Пользователи (${users.length})`} icon={UserPlus}>
        <p className="text-xs text-slate-500 mb-3">
          Сотрудники, которые входят в план по имени и паролю. Пароль хранится только в зашифрованном виде.
          Отключённый или удалённый пользователь теряет доступ при следующей проверке.
        </p>
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-3 mb-3">
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="Имя для входа" autoComplete="off" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input className={inputClass} type="text" placeholder="Пароль (от 6 символов)" autoComplete="off" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </div>
          <div className="mt-2">
            <BigButton
              onClick={() => add.run(async () => { await addUser(newName, newPw); setNewName(''); setNewPw('') }, 'Пользователь добавлен')}
              icon={UserPlus}
              disabled={add.busy}
            >
              Добавить пользователя
            </BigButton>
          </div>
          <Message msg={add.msg} />
        </div>
        {!ready && <p className="text-sm text-slate-400 text-center py-2">Загрузка…</p>}
        {ready && users.length === 0 && <p className="text-sm text-slate-400 text-center py-2">Пользователей пока нет</p>}
        {users.map((u) => <UserRow key={u.id} user={u} />)}
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

export default function PlanPage() {
  const { config } = usePlanDeviceState()
  const isOwner = !config || config.role === 'owner'
  const [sub, setSub] = useState(config ? 'schedule' : 'access')

  const tabs = config
    ? [
        { key: 'schedule', label: 'График', icon: CalendarDays },
        { key: 'hours', label: 'Часы', icon: Timer },
        { key: 'dir', label: 'Справочники', icon: Users },
        { key: 'journal', label: 'Журнал', icon: History },
        { key: 'copies', label: 'Копии', icon: Archive },
        ...(isOwner ? [{ key: 'access', label: 'Доступ', icon: Lock }] : []),
      ]
    : []

  return (
    <div className="pb-4">
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-3">План работы</h1>
      {config && (
        <>
          <StatusBar />
          <div className="flex gap-1.5 overflow-x-auto mb-3">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setSub(key)}
                className={`shrink-0 min-h-[44px] px-3.5 rounded-xl font-semibold flex items-center gap-1.5 text-sm whitespace-nowrap ${
                  sub === key ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </>
      )}
      {(!config || sub === 'access') && <AccessPanel config={config} />}
      {config && sub === 'schedule' && <ScheduleTab />}
      {config && sub === 'hours' && <HoursTab />}
      {config && sub === 'dir' && (
        <>
          <StaffDirectory />
          <ShiftTemplates />
        </>
      )}
      {config && sub === 'journal' && <JournalPanel />}
      {config && sub === 'copies' && <BackupsPanel isOwner={isOwner} />}
    </div>
  )
}
