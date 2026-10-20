import { useEffect, useMemo, useState } from 'react'
import {
  Users, History, Archive, KeyRound, Download, Upload, Copy, Plus, Clock, UserPlus, Lock, CalendarDays, Timer, BookOpen, LayoutDashboard, Bookmark, Palette, Pencil,
} from 'lucide-react'
import { Section, Field, inputClass, BigButton, Badge, ConfirmDeleteButton } from '../components/UI'
import { usePlanDeviceState, getAuthor } from '../plan/planRoom'
import { usePlanCollection, createRecord, patchRecord, deleteRecord, undoLast, redoLast } from '../plan/planStore'
import {
  usePlanUsers, addUser, setUserPassword, setUserDisabled, deleteUser, createPlanRoom, joinPlanRoomAsOwner,
  setOwnerName, setOwnerPassword, useJournal, useUnseenChanges, markChangesSeen, useBackups, createSnapshot, restoreSnapshot, exportPlanFile, parsePlanFile, importPlanFile,
} from '../plan/planAdmin'
import { durationMinutes, formatDuration, parseHM } from '../plan/hours'
import { describeEntry } from '../plan/journalText'
import { DraftInput, ConfirmButton, TimeInput, TimeDraft, normalizeTime, useAction, Message, StatusBar, StatusIcons, parseNorm, byName } from './plan/shared'
import { usePlanLang, setPlanLang } from '../plan/lang'
import { useDensity, setDensity, densityVars, DENSITIES, MEAL_PALETTE, DEFAULT_MEAL_TYPES } from '../plan/ui'
import ScheduleTab from './plan/ScheduleTab'
import PlanDashboard from './plan/PlanDashboard'
import { RecipeBridgeProvider } from './plan/recipeBridge'
import { usePlanCtx } from './plan/usePlanCtx'
import HoursTab from './plan/HoursTab'
import RecipesTab from './plan/RecipesTab'

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
    const start = normalizeTime(form.start)
    const end = normalizeTime(form.end)
    if (!start || !end) {
      setError('Укажите начало и конец смены.')
      return
    }
    setError(null)
    createRecord('shiftTemplates', {
      label: form.label.trim() || `${start}–${end}`,
      start,
      end,
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
          <TimeInput value={form.start} placeholder="Начало (1000)" onChange={(v) => setForm((f) => ({ ...f, start: v }))} />
          <TimeInput value={form.end} placeholder="Конец (1600)" onChange={(v) => setForm((f) => ({ ...f, end: v }))} />
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
              <TimeDraft value={rec.start} onCommit={(v) => { if (v) patchRecord('shiftTemplates', rec.id, { start: v }) }} />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Конец</p>
              <TimeDraft value={rec.end} onCommit={(v) => { if (v) patchRecord('shiftTemplates', rec.id, { end: v }) }} />
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

function MealTypesEditor() {
  const { items, ready } = usePlanCollection('mealTypes')
  const custom = useMemo(
    () => [...items].filter((t) => t.name).sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'ru')),
    [items]
  )
  const [newName, setNewName] = useState('')

  const materialize = () => DEFAULT_MEAL_TYPES.forEach((t, i) => createRecord('mealTypes', {
    name: t.name, nameDe: t.nameDe, keywords: t.keywords, color: t.color, order: i,
  }))
  const resetAll = () => custom.forEach((t) => deleteRecord('mealTypes', t.id))
  const addType = () => {
    if (!newName.trim()) return
    createRecord('mealTypes', { name: newName.trim(), nameDe: '', keywords: '', color: 'sky', order: custom.length + 1 })
    setNewName('')
  }

  return (
    <Section title="Типы приёмов (список и цвета полосок)" icon={Palette}>
      <p className="text-xs text-slate-500 mb-3">
        Эти названия подсказываются в поле «Приём / мероприятие», а цвет полоски слева у приёма берётся отсюда: если в
        названии приёма встречается название типа или любое из «слов для поиска», он получает цвет типа. Остальные
        приёмы остаются светло-оранжевыми («Другое»).
      </p>
      {!ready && custom.length === 0 && <p className="text-sm text-slate-400 text-center py-2">Загрузка…</p>}

      {ready && custom.length === 0 && (
        <>
          {DEFAULT_MEAL_TYPES.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0 text-sm text-slate-700 dark:text-slate-200">
              <span className={`inline-block w-3 h-3 rounded-sm ${MEAL_PALETTE[t.color].dot}`} />
              <span className="font-semibold">{t.name}</span>
              <span className="text-slate-400">{t.nameDe}</span>
            </div>
          ))}
          <div className="mt-3">
            <BigButton onClick={materialize} icon={Pencil} color="outline">Изменить этот список</BigButton>
          </div>
        </>
      )}

      {custom.map((t) => (
        <div key={t.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Название</p>
              <DraftInput value={t.name} onCommit={(v) => { if (v.trim()) patchRecord('mealTypes', t.id, { name: v.trim() }) }} />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Название (DE)</p>
              <DraftInput value={t.nameDe} onCommit={(v) => patchRecord('mealTypes', t.id, { nameDe: v.trim() })} />
            </div>
            <div className="col-span-2">
              <p className="text-[11px] text-slate-400 mb-0.5">Слова для поиска в названии приёма (через запятую)</p>
              <DraftInput value={t.keywords} placeholder="завтрак, frühstück, breakfast" onCommit={(v) => patchRecord('mealTypes', t.id, { keywords: v.trim() })} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            {Object.entries(MEAL_PALETTE).map(([key, c]) => (
              <button
                key={key}
                onClick={() => patchRecord('mealTypes', t.id, { color: key })}
                className={`w-8 h-8 rounded-lg ${c.dot} ${t.color === key ? 'ring-2 ring-offset-2 ring-slate-800 dark:ring-white dark:ring-offset-slate-800' : ''}`}
                title={c.label}
                aria-label={c.label}
              />
            ))}
            <span className="flex-1" />
            <ConfirmDeleteButton onConfirm={() => deleteRecord('mealTypes', t.id)} size="w-10 h-10" iconSize={18} />
          </div>
        </div>
      ))}

      {custom.length > 0 && (
        <>
          <div className="flex gap-2 mt-3">
            <input
              className={inputClass}
              placeholder="Новый тип, например «Лагерь»"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addType() }}
            />
            <button onClick={addType} disabled={!newName.trim()} className="shrink-0 px-4 min-h-[48px] rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-40">
              Добавить
            </button>
          </div>
          <div className="mt-3">
            <ConfirmButton
              onConfirm={resetAll}
              confirmLabel="Точно вернуть стандартный список?"
              className="px-3 min-h-[36px] rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold"
            >
              Вернуть стандартный список
            </ConfirmButton>
          </div>
        </>
      )}
    </Section>
  )
}

function MealTemplateList() {
  const { items, ready } = usePlanCollection('mealTemplates')
  const sorted = useMemo(() => [...items].filter((t) => t.name).sort((a, b) => a.name.localeCompare(b.name, 'ru')), [items])
  return (
    <Section title={`Шаблоны приёмов (${sorted.length})`} icon={Bookmark}>
      <p className="text-xs text-slate-500 mb-3">
        Готовые приёмы со временем, числом гостей и блюдами, например «Пятничный ужин». Сохраняются кнопкой закладки в самом
        приёме и добавляются в любой день выбором «из шаблона».
      </p>
      {!ready && sorted.length === 0 && <p className="text-sm text-slate-400 text-center py-2">Загрузка…</p>}
      {ready && sorted.length === 0 && <p className="text-sm text-slate-400 text-center py-2">Шаблонов пока нет</p>}
      {sorted.map((t) => (
        <div key={t.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <DraftInput value={t.name} onCommit={(v) => { if (v.trim()) patchRecord('mealTemplates', t.id, { name: v.trim() }) }} />
            </div>
            <ConfirmDeleteButton onConfirm={() => deleteRecord('mealTemplates', t.id)} size="w-11 h-11" iconSize={18} />
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            {t.blockName || 'без названия'}{t.time ? ` · ${t.time}` : ''}{t.persons ? ` · ${t.persons} чел.` : ''} · блюд: {Object.values(t.dishes || {}).length}
          </p>
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
  const { lastSeen } = useUnseenChanges()
  const me = getAuthor().id
  const isNew = (e) => e.byId !== me && (e.ts || e.clientTs || 0) > lastSeen
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
                {isNew(e) && <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1.5 align-middle" title="Новое с прошлого визита" />}
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
  const [ownerPw, setOwnerPw] = useState('')
  const [joinPw, setJoinPw] = useState('')
  const pwAction = useAction()
  const [newOwnerPw, setNewOwnerPw] = useState('')
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
        <Field label="Пароль владельца (от 6 символов)">
          <input className={inputClass} type="password" autoComplete="new-password" placeholder="Нужен для входа с других ваших устройств" value={ownerPw} onChange={(e) => setOwnerPw(e.target.value)} />
        </Field>
        <BigButton onClick={() => create.run(() => createPlanRoom(ownerName, ownerPw))} icon={Plus} disabled={create.busy}>
          Создать комнату плана
        </BigButton>
        <Message msg={create.msg} />

        <div className="border-t border-slate-100 dark:border-slate-700 mt-4 pt-4">
          <p className="text-xs text-slate-500 mb-2">Комната уже создана на другом вашем устройстве? Введите её код.</p>
          <input className={inputClass + ' mb-2 font-mono'} placeholder="Код плана" value={joinCode} onChange={(e) => setJoinCode(e.target.value.trim())} />
          <input className={inputClass + ' mb-2'} type="password" autoComplete="current-password" placeholder="Пароль владельца" value={joinPw} onChange={(e) => setJoinPw(e.target.value)} />
          <BigButton onClick={() => join.run(() => joinPlanRoomAsOwner(joinCode, ownerName, joinPw))} color="outline" disabled={join.busy || !joinCode}>
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
        <Field label="Пароль владельца">
          <p className="text-xs text-slate-500 mb-2">
            Нужен, чтобы подключить к плану ещё одно ваше устройство как владельца. Сотрудникам он не нужен и не должен
            быть им известен. Здесь можно задать новый.
          </p>
          <div className="flex gap-2">
            <input className={inputClass} type="password" autoComplete="new-password" placeholder="Новый пароль (от 6 символов)" value={newOwnerPw} onChange={(e) => setNewOwnerPw(e.target.value)} />
            <button
              onClick={() => pwAction.run(async () => { await setOwnerPassword(newOwnerPw); setNewOwnerPw('') }, 'Пароль владельца изменён')}
              disabled={pwAction.busy || newOwnerPw.length < 6}
              className="shrink-0 px-4 min-h-[48px] rounded-xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              Сохранить
            </button>
          </div>
          <Message msg={pwAction.msg} />
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

function DensityToggle() {
  const density = useDensity()
  return (
    <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 text-sm font-bold" title="Размер строк таблицы">
      {DENSITIES.map((d, i) => (
        <button
          key={d.key}
          onClick={() => setDensity(d.key)}
          className={`min-h-[36px] px-2.5 ${density === d.key ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 text-slate-500'}`}
          aria-label={d.label}
        >
          <span style={{ fontSize: `${0.7 + i * 0.2}rem` }}>A</span>
        </button>
      ))}
    </div>
  )
}

function LangToggle() {
  const lang = usePlanLang()
  return (
    <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 text-sm font-bold">
      {['ru', 'de'].map((l) => (
        <button
          key={l}
          onClick={() => setPlanLang(l)}
          className={`min-h-[36px] px-3 ${lang === l ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 text-slate-500'}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

// Shown on entry when the other person changed things since this one last
// looked. "Seen" is explicit (a button), so merely opening the app doesn't
// silently swallow the news.
function ChangesBanner({ onShow }) {
  const { count, authors, ready } = useUnseenChanges()
  if (!ready || count === 0) return null
  return (
    <div className="rounded-xl border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 p-3 mb-3">
      <p className="text-sm text-slate-800 dark:text-slate-100">
        Изменения с вашего прошлого визита: <b>{count}</b> (от: {authors.join(', ')})
      </p>
      <div className="flex gap-2 mt-2">
        <button onClick={onShow} className="px-3 min-h-[36px] rounded-lg bg-orange-500 text-white text-sm font-semibold">Показать</button>
        <button onClick={markChangesSeen} className="px-3 min-h-[36px] rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold">
          Отметить прочитанным
        </button>
      </div>
    </div>
  )
}

function DashboardTab({ code, openSchedule }) {
  const { ctx, sortedPlans, allData } = usePlanCtx()
  return (
    <PlanDashboard
      ctx={ctx}
      plans={sortedPlans}
      tree={allData}
      onOpenPlan={(id) => {
        try { localStorage.setItem(`kitchenPlan_selectedPlan:${code}`, id) } catch { /* preference only */ }
        openSchedule()
      }}
    />
  )
}

export default function PlanPage({ menuBridge }) {
  const { config } = usePlanDeviceState()
  const isOwner = !config || config.role === 'owner'
  const density = useDensity()
  const subKey = `kitchenPlan_sub:${config?.code}`
  const [sub, setSubState] = useState(() => {
    if (!config) return 'access'
    try {
      const v = localStorage.getItem(subKey) || 'dash'
      return v === 'access' && config.role !== 'owner' ? 'schedule' : v
    } catch { return 'dash' }
  })
  const setSub = (key) => {
    setSubState(key)
    try { localStorage.setItem(subKey, key) } catch { /* preference only */ }
  }

  // Ctrl/Cmd+Z takes back, Ctrl+Shift+Z / Ctrl+Y brings back the last edit made on this device (not while typing
  // in a field — there it keeps its normal text-undo meaning).
  useEffect(() => {
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      const isUndo = k === 'z' && !e.shiftKey
      const isRedo = (k === 'z' && e.shiftKey) || k === 'y'
      if (!isUndo && !isRedo) return
      const el = e.target
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if ((isUndo ? undoLast() : redoLast())) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const tabs = config
    ? [
        { key: 'dash', label: 'Дашборд', icon: LayoutDashboard },
        { key: 'schedule', label: 'График', icon: CalendarDays },
        { key: 'menu', label: 'Меню', icon: BookOpen },
        { key: 'hours', label: 'Часы', icon: Timer },
        { key: 'dir', label: 'Справочники', icon: Users },
        { key: 'journal', label: 'Журнал', icon: History },
        { key: 'copies', label: 'Копии', icon: Archive },
        ...(isOwner ? [{ key: 'access', label: 'Доступ', icon: Lock }] : []),
      ]
    : []

  return (
    <RecipeBridgeProvider recipes={menuBridge?.recipes} catalog={menuBridge?.recountCatalog}>
    <div className="pb-4" style={densityVars(density)}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">План работы</h1>
        {config && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusIcons />
            <div className="hidden sm:block"><DensityToggle /></div>
            <LangToggle />
          </div>
        )}
      </div>
      {config && (
        <>
          <StatusBar />
          <ChangesBanner onShow={() => setSub('journal')} />
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
      {config && sub === 'dash' && <DashboardTab code={config.code} openSchedule={() => setSub('schedule')} />}
      {config && sub === 'schedule' && <ScheduleTab menuBridge={menuBridge} />}
      {config && sub === 'menu' && <RecipesTab />}
      {config && sub === 'hours' && <HoursTab />}
      {config && sub === 'dir' && (
        <>
          <StaffDirectory />
          <ShiftTemplates />
          <MealTemplateList />
          <MealTypesEditor />
        </>
      )}
      {config && sub === 'journal' && <JournalPanel />}
      {config && sub === 'copies' && <BackupsPanel isOwner={isOwner} />}
    </div>
    </RecipeBridgeProvider>
  )
}
