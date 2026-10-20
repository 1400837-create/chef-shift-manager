import { useEffect, useMemo, useState } from 'react'
import { Plus, ChevronDown, ChevronRight, MessageSquare, Flag, Users, X, Clock } from 'lucide-react'
import { Section, inputClass, BigButton, Badge, ConfirmDeleteButton } from '../../components/UI'
import { usePlanDeviceState, getAuthor } from '../../plan/planRoom'
import { usePlanCollection, createRecord, patchRecord, writePaths, newId, commitChange } from '../../plan/planStore'
import { formatDuration, parseHM } from '../../plan/hours'
import {
  isDateKey, dayTitle, weekTitle, mondayOf, addDaysKey, monthOf, monthBounds, monthTitle, shiftMinutes, sumMinutes,
  collectShifts, suggestStaff,
} from '../../plan/calc'
import { todayKey } from '../../utils/dateUtils'
import { DraftInput, ConfirmButton, byName } from './shared'
import { usePlanLang, LOCALE, staffLabel } from '../../plan/lang'
import ExchangePanel from './Exchange'
import CostPanel from './Cost'
import GridView from './GridView'

const PLAN_KINDS = [
  { key: 'month', label: 'Месяц' },
  { key: 'camp', label: 'Лагерь' },
  { key: 'event', label: 'Мероприятие' },
  { key: 'other', label: 'Другое' },
]

export const BLOCK_NAMES = [
  'Frühstück', 'Mittagessen', 'Imbiss', 'Abendessen', "G'ttesdeinst", 'Lunchpakete', 'Einkaufen + vorbereitung',
  'Завтрак', 'Обед', 'Полдник', 'Ужин', 'Закупка + подготовка',
]

const kindLabel = (k) => PLAN_KINDS.find((x) => x.key === k)?.label || ''

function sortedEntries(obj, cmp) {
  return Object.entries(obj || {})
    .filter(([, v]) => v && typeof v === 'object')
    .map(([id, v]) => ({ id, ...v }))
    .sort(cmp)
}

// ---------------------------------------------------------------------------
// comments (author + time on every one)
// ---------------------------------------------------------------------------

function Comments({ coll, path, comments, label }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const list = sortedEntries(comments, (a, b) => (a.ts || 0) - (b.ts || 0))

  function add() {
    const t = text.trim()
    if (!t) return
    const author = getAuthor()
    writePaths(
      coll,
      { [`${path}/comments/${newId(coll)}`]: { text: t, by: author.name, byId: author.id, ts: Date.now() } },
      { action: 'create', entity: 'комментарий', id: path, label: `${label}: ${t.slice(0, 60)}` }
    )
    setText('')
  }

  function remove(c) {
    writePaths(coll, { [`${path}/comments/${c.id}`]: null }, {
      action: 'delete', entity: 'комментарий', id: path, label: `${label}: ${(c.text || '').slice(0, 60)}`, before: c,
    })
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 px-2 min-h-[32px] rounded-lg text-xs font-semibold ${
          list.length ? 'text-orange-600' : 'text-slate-400'
        }`}
        title="Комментарии"
      >
        <MessageSquare size={14} /> {list.length || ''}
      </button>
      {open && (
        <div className="mt-1 mb-2 rounded-xl border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/40">
          {list.length === 0 && <p className="text-xs text-slate-400 mb-1">Комментариев пока нет</p>}
          {list.map((c) => (
            <div key={c.id} className="mb-1.5 text-sm text-slate-700 dark:text-slate-200">
              <p className="text-[11px] text-slate-400">
                <b>{c.by}</b> · {c.ts ? new Date(c.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                <button onClick={() => remove(c)} className="ml-2 text-slate-400 underline">удалить</button>
              </p>
              <p className="whitespace-pre-wrap">{c.text}</p>
            </div>
          ))}
          <div className="flex gap-2 mt-1">
            <input
              className={inputClass + ' text-sm'}
              placeholder="Комментарий…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            />
            <button onClick={add} disabled={!text.trim()} className="shrink-0 px-3 rounded-xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-40">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// dishes
// ---------------------------------------------------------------------------

function DishAdder({ recipeList, onAdd }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const matches = needle.length >= 2
    ? recipeList.filter((r) => r.name.toLowerCase().includes(needle)).slice(0, 8)
    : []

  function addManual() {
    if (!q.trim()) return
    onAdd(q.trim(), null)
    setQ('')
  }

  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <input
          className={inputClass + ' text-sm'}
          placeholder="Блюдо: поиск по рецептам или впишите своё"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addManual() }}
        />
        <button onClick={addManual} disabled={!q.trim()} className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-orange-500 text-white disabled:opacity-40">
          <Plus size={18} />
        </button>
      </div>
      {matches.length > 0 && (
        <div className="mt-1 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {matches.map((r) => (
            <button
              key={r.id}
              onClick={() => { onAdd(r.name, r.id); setQ('') }}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 last:border-0 active:bg-slate-100 dark:active:bg-slate-700"
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BlockCard({ coll, date, block, ctx }) {
  const base = `${date}/blocks/${block.id}`
  const label = `${dayTitle(date)} · ${block.name || 'приём'}`
  const dishes = sortedEntries(block.dishes, (a, b) => a.id.localeCompare(b.id))
  const persons = Number(block.persons)
  const coef = Number.isFinite(persons) && persons > 0 ? Math.round((persons / 10) * 100) / 100 : null

  const patch = (field, value) =>
    writePaths(coll, { [`${base}/${field}`]: value }, { action: 'update', entity: 'блок', id: date, label })

  function addDish(text, recipeId) {
    const did = newId(coll)
    writePaths(coll, { [`${base}/dishes/${did}`]: { text, recipeId: recipeId || null } }, {
      action: 'create', entity: 'блюдо', id: date, label: `${label}: ${text}`,
    })
  }

  function patchDish(d, rel, meta = {}) {
    writePaths(coll, rel, { action: 'update', entity: 'блюдо', id: date, label: `${label}: ${d.text}`, ...meta })
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-2">
      <div className="grid grid-cols-6 gap-2">
        <div className="col-span-6 sm:col-span-3">
          <p className="text-[11px] text-slate-400 mb-0.5">Приём / мероприятие</p>
          <DraftInput value={block.name} onCommit={(v) => patch('name', v.trim())} list="plan-block-names" placeholder="Например: Mittagessen" />
        </div>
        <div className="col-span-3 sm:col-span-1">
          <p className="text-[11px] text-slate-400 mb-0.5">Время</p>
          <DraftInput type="time" value={block.time} onCommit={(v) => patch('time', v)} />
        </div>
        <div className="col-span-3 sm:col-span-1">
          <p className="text-[11px] text-slate-400 mb-0.5">Персон</p>
          <DraftInput inputMode="numeric" value={block.persons} onCommit={(v) => { const n = parseInt(v, 10); patch('persons', Number.isFinite(n) && n > 0 ? n : null) }} />
        </div>
        <div className="col-span-6 sm:col-span-1 flex items-end justify-end">
          <ConfirmDeleteButton
            onConfirm={() => writePaths(coll, { [base]: null }, { action: 'delete', entity: 'блок', id: date, label, before: block })}
            size="w-11 h-11"
            iconSize={18}
          />
        </div>
      </div>

      <div className="mt-2">
        {dishes.map((d) => {
          const recipe = d.recipeId ? ctx.recipeById[d.recipeId] : null
          return (
            <div key={d.id} className="flex items-center gap-1.5 mb-1.5">
              <button
                onClick={() => patchDish(d, { [`${base}/dishes/${d.id}/changed`]: d.changed ? null : true })}
                className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg ${d.changed ? 'text-red-600' : 'text-slate-300 dark:text-slate-600'}`}
                title="Пометить как изменённое"
              >
                <Flag size={15} fill={d.changed ? 'currentColor' : 'none'} />
              </button>
              {ctx.lang === 'de' && recipe?.de ? (
                // German view of a linked dish is read-only: the German name
                // belongs to the recipe, edit the dish in the Russian view.
                <div className={`${inputClass} flex items-center ${d.changed ? '!text-red-600' : ''}`}>{recipe.de}</div>
              ) : (
                <DraftInput
                  value={d.text}
                  className={d.changed ? '!text-red-600' : ''}
                  onCommit={(v) => {
                    const text = v.trim()
                    if (!text) return
                    const rel = { [`${base}/dishes/${d.id}/text`]: text }
                    // Renaming a dish away from its recipe's name means it is no
                    // longer that recipe — drop the link rather than lie.
                    if (d.recipeId && recipe && recipe.name !== text) rel[`${base}/dishes/${d.id}/recipeId`] = null
                    patchDish(d, rel)
                  }}
                />
              )}
              {d.recipeId && recipe && <Badge color="green">ТК</Badge>}
              {coef !== null && <span className="shrink-0 text-xs text-slate-400">×{coef}</span>}
              <button
                onClick={() => writePaths(coll, { [`${base}/dishes/${d.id}`]: null }, { action: 'delete', entity: 'блюдо', id: date, label: `${label}: ${d.text}`, before: d })}
                className="shrink-0 w-8 h-8 flex items-center justify-center text-slate-400 active:text-red-600"
                title="Убрать блюдо"
              >
                <X size={16} />
              </button>
            </div>
          )
        })}
        <DishAdder recipeList={ctx.recipeList} onAdd={addDish} />
      </div>

      <Comments coll={coll} path={base} comments={block.comments} label={label} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// shifts
// ---------------------------------------------------------------------------

function ShiftRow({ coll, date, shift, ctx, blocks }) {
  const base = `${date}/shifts/${shift.id}`
  const [showActual, setShowActual] = useState(!!(shift.actStart || shift.actEnd))
  const label = `${dayTitle(date)} · смена ${shift.staffName || ''}`.trim()
  const planned = shiftMinutes(shift, 'planned')
  const actual = shiftMinutes(shift, 'actual')
  const staffKnown = shift.staffId && ctx.staffList.some((s) => s.id === shift.staffId)

  const patch = (field, value) =>
    writePaths(coll, { [`${base}/${field}`]: value }, { action: 'update', entity: 'смену', id: date, label })

  function setStaff(id) {
    const rec = ctx.staffList.find((s) => s.id === id)
    writePaths(coll, { [`${base}/staffId`]: id || null, [`${base}/staffName`]: rec ? rec.name : null }, {
      action: 'update', entity: 'смену', id: date, label,
      changes: [{ f: 'сотрудник', from: shift.staffName || null, to: rec ? rec.name : null }],
    })
  }

  function applyTemplate(id) {
    const t = ctx.templates.find((x) => x.id === id)
    if (!t) return
    writePaths(coll, { [`${base}/start`]: t.start, [`${base}/end`]: t.end }, { action: 'update', entity: 'смену', id: date, label })
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <select className={inputClass} value={shift.staffId || (shift.staffName ? '__old' : '')} onChange={(e) => setStaff(e.target.value)}>
            <option value="">— выберите сотрудника —</option>
            {!staffKnown && shift.staffName && <option value={shift.staffId || '__old'} disabled>{shift.staffName} (нет в списке)</option>}
            {ctx.staffList.map((s) => <option key={s.id} value={s.id}>{staffLabel(s, ctx.lang)}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-0.5">Начало</p>
          <DraftInput type="time" value={shift.start} onCommit={(v) => patch('start', v)} />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-0.5">Конец</p>
          <DraftInput type="time" value={shift.end} onCommit={(v) => patch('end', v)} />
        </div>
        {ctx.templates.length > 0 && (
          <select className={inputClass} value="" onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">Типовая смена…</option>
            {ctx.templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        )}
        {blocks.length > 0 && (
          <select className={inputClass} value={shift.blockId || ''} onChange={(e) => patch('blockId', e.target.value || null)}>
            <option value="">К приёму (необяз.)</option>
            {blocks.map((b) => <option key={b.id} value={b.id}>{b.name || 'приём'} {b.time || ''}</option>)}
          </select>
        )}
      </div>

      {showActual && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <p className="text-[11px] text-slate-400 mb-0.5">Факт: начало</p>
            <DraftInput type="time" value={shift.actStart} onCommit={(v) => patch('actStart', v || null)} />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-0.5">Факт: конец</p>
            <DraftInput type="time" value={shift.actEnd} onCommit={(v) => patch('actEnd', v || null)} />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        <Badge color="slate">План {formatDuration(planned)}</Badge>
        {actual !== null && (
          <Badge color={planned !== null && actual > planned ? 'yellow' : 'green'}>Факт {formatDuration(actual)}</Badge>
        )}
        <button onClick={() => setShowActual((v) => !v)} className="text-xs font-semibold text-orange-600">
          {showActual ? 'Скрыть факт' : 'Факт'}
        </button>
        <span className="flex-1" />
        <ConfirmDeleteButton
          onConfirm={() => writePaths(coll, { [base]: null }, { action: 'delete', entity: 'смену', id: date, label, before: shift })}
          size="w-9 h-9"
        />
      </div>
      <Comments coll={coll} path={base} comments={shift.comments} label={label} />
    </div>
  )
}

function ShiftAdder({ coll, date, ctx, shifts, allShifts }) {
  const [staffId, setStaffId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [pickOpen, setPickOpen] = useState(false)
  const [error, setError] = useState(null)

  function chooseTemplate(id) {
    setTemplateId(id)
    const t = ctx.templates.find((x) => x.id === id)
    if (t) { setStart(t.start); setEnd(t.end) }
  }

  function create(staffRec, s, e) {
    const sid = newId(coll)
    writePaths(coll, {
      [`${date}/shifts/${sid}`]: { staffId: staffRec.id, staffName: staffRec.name, start: s, end: e },
    }, {
      action: 'create', entity: 'смену', id: date,
      label: `${dayTitle(date)} · ${staffRec.name} ${s}–${e}`,
    })
  }

  function add() {
    const rec = ctx.staffList.find((s) => s.id === staffId)
    if (!rec) return setError('Выберите сотрудника.')
    if (parseHM(start) === null || parseHM(end) === null) return setError('Укажите начало и конец смены.')
    setError(null)
    create(rec, start, end)
    setStaffId('')
  }

  const canSuggest = parseHM(start) !== null && parseHM(end) !== null
  const suggestions = useMemo(
    () => (pickOpen && canSuggest ? suggestStaff({ staff: ctx.staffList, shifts: allShifts, date, start, end }).slice(0, 6) : []),
    [pickOpen, canSuggest, ctx.staffList, allShifts, date, start, end]
  )

  return (
    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-3">
      <div className="grid grid-cols-2 gap-2">
        <select className={inputClass + ' col-span-2'} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">— сотрудник —</option>
          {ctx.staffList.map((s) => <option key={s.id} value={s.id}>{staffLabel(s, ctx.lang)}</option>)}
        </select>
        {ctx.templates.length > 0 && (
          <select className={inputClass + ' col-span-2'} value={templateId} onChange={(e) => chooseTemplate(e.target.value)}>
            <option value="">Типовая смена…</option>
            {ctx.templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        )}
        <input type="time" className={inputClass} value={start} onChange={(e) => { setStart(e.target.value); setTemplateId('') }} />
        <input type="time" className={inputClass} value={end} onChange={(e) => { setEnd(e.target.value); setTemplateId('') }} />
        <button onClick={add} className="min-h-[48px] rounded-xl bg-orange-500 active:bg-orange-600 text-white font-semibold flex items-center justify-center gap-1.5">
          <Plus size={16} /> Смена
        </button>
        <button
          onClick={() => setPickOpen((v) => !v)}
          className="min-h-[48px] rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold flex items-center justify-center gap-1.5"
        >
          <Users size={16} /> Подобрать
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {pickOpen && !canSuggest && <p className="text-xs text-slate-500 mt-2">Сначала выберите типовую смену или укажите время начала и конца.</p>}
      {suggestions.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-slate-500 mb-1">Больше всего часов до нормы в этом месяце — сверху:</p>
          {suggestions.map(({ staff, remainingMin, busy, workingToday }) => (
            <div key={staff.id} className="flex items-center gap-2 py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{staffLabel(staff, ctx.lang)}</p>
                <p className="text-xs text-slate-400">
                  {remainingMin === null ? 'норма не задана' : remainingMin >= 0 ? `осталось ${formatDuration(remainingMin)} до нормы` : `сверх нормы ${formatDuration(-remainingMin)}`}
                  {busy ? ' · занят(а) в это время' : workingToday ? ' · уже работает в этот день' : ''}
                </p>
              </div>
              <button
                onClick={() => create(staff, start, end)}
                className={`shrink-0 px-3 min-h-[36px] rounded-lg text-xs font-semibold ${busy ? 'bg-slate-100 dark:bg-slate-700 text-slate-500' : 'bg-orange-500 text-white'}`}
              >
                Назначить
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// day
// ---------------------------------------------------------------------------

function DayCard({ coll, date, day, ctx, allShifts, open, onToggle, onDeleted }) {
  const blocks = sortedEntries(day.blocks, (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.id.localeCompare(b.id))
  const shifts = sortedEntries(day.shifts, (a, b) => (a.start || '99:99').localeCompare(b.start || '99:99') || (a.staffName || '').localeCompare(b.staffName || '', 'ru'))
  const plannedMin = sumMinutes(shifts, 'planned')
  const actualMin = sumMinutes(shifts, 'actual')
  const commentCount = Object.keys(day.comments || {}).length
  const dishCount = blocks.reduce((n, b) => n + Object.keys(b.dishes || {}).length, 0)

  function addBlock() {
    const bid = newId(coll)
    writePaths(coll, { [`${date}/blocks/${bid}`]: { name: '', time: '', persons: null } }, {
      action: 'create', entity: 'блок', id: date, label: `${dayTitle(date)} · новый приём`,
    })
  }

  function removeDay() {
    writePaths(coll, { [date]: null }, { action: 'delete', entity: 'день', id: date, label: dayTitle(date), before: day })
    if (onDeleted) onDeleted()
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 mb-3 overflow-hidden">
      <div className="flex items-center bg-slate-50 dark:bg-slate-900/40">
        <button onClick={onToggle} className="flex-1 min-w-0 flex items-center gap-2 pl-3 py-3 text-left">
          {open ? <ChevronDown size={18} className="text-slate-400 shrink-0" /> : <ChevronRight size={18} className="text-slate-400 shrink-0" />}
          <span className="font-bold text-slate-800 dark:text-slate-100 flex-1 min-w-0">{dayTitle(date, LOCALE[ctx.lang])}</span>
          {blocks.length > 0 && <Badge color="slate">{blocks.length} приём. · {dishCount} блюд</Badge>}
          {shifts.length > 0 && <Badge color="orange">{formatDuration(plannedMin)} ч</Badge>}
          {commentCount > 0 && <MessageSquare size={14} className="text-orange-500 shrink-0" />}
        </button>
        <div className="shrink-0 px-1">
          <ConfirmDeleteButton onConfirm={removeDay} size="w-12 h-11" iconSize={18} />
        </div>
      </div>
      {open && (
        <div className="p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Приёмы и блюда</p>
          {blocks.map((b) => <BlockCard key={b.id} coll={coll} date={date} block={b} ctx={ctx} />)}
          <button onClick={addBlock} className="w-full min-h-[44px] mb-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 text-sm font-semibold flex items-center justify-center gap-1.5">
            <Plus size={16} /> Приём / мероприятие
          </button>

          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
            Смены{shifts.length > 0 ? ` · план ${formatDuration(plannedMin)}${actualMin ? ` · факт ${formatDuration(actualMin)}` : ''}` : ''}
          </p>
          {shifts.map((s) => <ShiftRow key={s.id} coll={coll} date={date} shift={s} ctx={ctx} blocks={blocks} />)}
          <ShiftAdder coll={coll} date={date} ctx={ctx} shifts={shifts} allShifts={allShifts} />

          <div className="mt-3">
            <Comments coll={coll} path={date} comments={day.comments} label={dayTitle(date)} />
          </div>
        </div>
      )}
    </div>
  )
}

// A day with nothing in it but its placeholder marker.
const isEmptyDay = (day) =>
  !day || (!Object.keys(day.blocks || {}).length && !Object.keys(day.shifts || {}).length && !Object.keys(day.comments || {}).length)

// ---------------------------------------------------------------------------
// one plan
// ---------------------------------------------------------------------------

function defaultDate(plan) {
  const today = todayKey()
  if (plan.kind === 'month' && plan.month) return monthOf(today) === plan.month ? today : `${plan.month}-01`
  return today
}

function PlanView({ plan, ctx, menuBridge }) {
  const isOwner = usePlanDeviceState().config?.role === 'owner'
  const coll = `planData/${plan.id}`
  const { data } = usePlanCollection(coll)
  const tree = usePlanCollection('planData').data
  const allShifts = useMemo(() => collectShifts(tree), [tree])
  const dates = useMemo(() => Object.keys(data).filter(isDateKey).sort(), [data])
  const [newDate, setNewDate] = useState(() => defaultDate(plan))
  const [addMode, setAddMode] = useState(plan.kind === 'month' ? 'month' : 'day')
  const [toggled, setToggled] = useState({})
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('kitchenPlan_view') === 'cards' ? 'cards' : 'grid' } catch { return 'grid' }
  })
  const [note, setNote] = useState(null)
  const today = todayKey()

  function chooseView(v) {
    setView(v)
    try { localStorage.setItem('kitchenPlan_view', v) } catch { /* preference only */ }
  }

  const weeks = useMemo(() => {
    const map = new Map()
    dates.forEach((d) => {
      const m = mondayOf(d)
      if (!map.has(m)) map.set(m, [])
      map.get(m).push(d)
    })
    return [...map.entries()]
  }, [dates])

  // One write for the whole batch, so adding a month is one journal entry
  // rather than thirty.
  function addDays() {
    if (!isDateKey(newDate)) return
    let list
    if (addMode === 'day') list = [newDate]
    else if (addMode === 'week') {
      const m = mondayOf(newDate)
      list = Array.from({ length: 7 }, (_, i) => addDaysKey(m, i))
    } else {
      const { from, to } = monthBounds(monthOf(newDate))
      list = []
      for (let d = from; d <= to; d = addDaysKey(d, 1)) list.push(d)
    }
    const fresh = list.filter((d) => !data[d])
    if (!fresh.length) {
      setNote('Эти дни уже есть в плане.')
      return
    }
    const rel = {}
    fresh.forEach((d) => { rel[`${d}/d`] = 1 })
    writePaths(coll, rel, {
      action: 'create', entity: fresh.length > 1 ? 'дни' : 'день', id: plan.id,
      label: fresh.length > 1 ? `${plan.title || 'план'}: ${fresh.length} дн. (${fresh[0]} — ${fresh[fresh.length - 1]})` : dayTitle(fresh[0]),
    })
    setNote(`Добавлено дней: ${fresh.length}.`)
    if (fresh.length === 1) setToggled((t) => ({ ...t, [fresh[0]]: true }))
  }

  const emptyDays = dates.filter((d) => isEmptyDay(data[d]))

  function clearEmpty() {
    const rel = {}
    emptyDays.forEach((d) => { rel[d] = null })
    writePaths(coll, rel, {
      action: 'delete', entity: 'пустые дни', id: plan.id, label: `${plan.title || 'план'}: ${emptyDays.length} дн.`,
    })
    setNote(`Удалено пустых дней: ${emptyDays.length}.`)
  }

  const renderDay = (date, close) => (
    <DayCard coll={coll} date={date} day={data[date]} ctx={ctx} allShifts={allShifts} open onToggle={close} onDeleted={close} />
  )

  return (
    <>
      <Section title={plan.title || 'План'} icon={Clock} right={<Badge color="slate">{kindLabel(plan.kind)}</Badge>}>
        <div className="grid grid-cols-1 gap-2 mb-3">
          <DraftInput value={plan.title} placeholder="Название плана" onCommit={(v) => { if (v.trim()) patchRecord('plans', plan.id, { title: v.trim() }) }} />
        </div>
        <p className="text-[11px] text-slate-400 mb-1">Добавить в план</p>
        <div className="grid grid-cols-[1fr_1fr] sm:grid-cols-[8rem_1fr_auto] gap-2">
          <select className={inputClass} value={addMode} onChange={(e) => setAddMode(e.target.value)}>
            <option value="day">День</option>
            <option value="week">Неделю</option>
            <option value="month">Месяц</option>
          </select>
          <input type="date" className={inputClass} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button onClick={addDays} className="col-span-2 sm:col-span-1 px-4 min-h-[48px] rounded-xl bg-orange-500 active:bg-orange-600 text-white font-semibold flex items-center justify-center gap-1.5">
            <Plus size={18} /> Добавить
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-1.5">
          Неделя — с понедельника по воскресенье, месяц — все дни месяца выбранной даты. Уже существующие дни не затрагиваются.
        </p>
        {note && <p className="text-sm text-green-700 dark:text-green-400 mt-1.5">{note}</p>}
        <div className="flex items-center justify-between mt-3">
          {emptyDays.length > 0
            ? (
              <ConfirmButton
                onConfirm={clearEmpty}
                confirmLabel={`Удалить ${emptyDays.length}?`}
                className="px-3 min-h-[36px] rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold"
              >
                Удалить пустые дни ({emptyDays.length})
              </ConfirmButton>
            )
            : <span />}
          <ConfirmDeleteButton
            onConfirm={() => commitChange({
              coll: 'plans', action: 'delete', entity: 'план', id: plan.id, label: plan.title,
              updates: { [`plans/${plan.id}`]: null, [`planData/${plan.id}`]: null }, before: plan,
            })}
            size="w-9 h-9"
          />
        </div>
      </Section>

      <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 text-sm font-semibold mb-3">
        {[['grid', 'Таблица'], ['cards', 'По дням']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => chooseView(k)}
            className={`flex-1 min-h-[40px] ${view === k ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {view === 'grid' && <GridView plan={plan} data={data} ctx={ctx} renderDay={renderDay} />}

      {view === 'cards' && (
        <>
          {dates.length === 0 && <p className="text-sm text-slate-400 text-center py-4">В плане пока нет дней — добавьте первый.</p>}
          {weeks.map(([monday, list]) => (
            <div key={monday}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 mt-1">{ctx.lang === 'de' ? 'Woche' : 'Неделя'} {weekTitle(monday, LOCALE[ctx.lang])}</p>
              {list.map((date) => (
                <DayCard
                  key={date}
                  coll={coll}
                  date={date}
                  day={data[date]}
                  ctx={ctx}
                  allShifts={allShifts}
                  open={toggled[date] ?? date >= addDaysKey(today, -1)}
                  onToggle={() => setToggled((t) => ({ ...t, [date]: !(t[date] ?? date >= addDaysKey(today, -1)) }))}
                />
              ))}
            </div>
          ))}
        </>
      )}

      <ExchangePanel plan={plan} data={data} ctx={ctx} shifts={allShifts} menuBridge={menuBridge} />
      {isOwner && <CostPanel plan={plan} data={data} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// tab: plan list + selected plan
// ---------------------------------------------------------------------------

function NewPlanForm({ onCreated, onCancel }) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('month')
  const [month, setMonth] = useState(() => monthOf(todayKey()))

  function create() {
    const finalTitle = title.trim() || (kind === 'month' ? monthTitle(month) : kindLabel(kind))
    const id = createRecord('plans', { title: finalTitle, kind, month: kind === 'month' ? month : null, createdAt: Date.now() })
    onCreated(id)
  }

  return (
    <Section title="Новый план" icon={Plus}>
      <div className="grid grid-cols-2 gap-2">
        <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          {PLAN_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
        {kind === 'month'
          ? <input type="month" className={inputClass} value={month} onChange={(e) => setMonth(e.target.value)} />
          : <span />}
        <input className={inputClass + ' col-span-2'} placeholder="Название (необязательно)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <BigButton onClick={create} icon={Plus}>Создать</BigButton>
        <button onClick={onCancel} className="min-h-[52px] rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">Отмена</button>
      </div>
    </Section>
  )
}

export default function ScheduleTab({ menuBridge }) {
  const { config } = usePlanDeviceState()
  const code = config?.code
  const plans = usePlanCollection('plans')
  const staff = usePlanCollection('staff')
  const templatesCol = usePlanCollection('shiftTemplates')
  const recipes = usePlanCollection('recipesSlim')
  const lang = usePlanLang()

  const sortedPlans = useMemo(() => [...plans.items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [plans.items])
  const selKey = `kitchenPlan_selectedPlan:${code}`
  const [selected, setSelected] = useState(() => localStorage.getItem(selKey) || '')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!plans.ready) return
    if (!sortedPlans.some((p) => p.id === selected)) setSelected(sortedPlans[0]?.id || '')
  }, [plans.ready, sortedPlans, selected])

  useEffect(() => {
    if (selected) localStorage.setItem(selKey, selected)
  }, [selected, selKey])

  const ctx = useMemo(() => {
    const staffList = [...staff.items].filter((s) => s.name).sort(byName)
    const templates = [...templatesCol.items].sort((a, b) => (parseHM(a.start) ?? 0) - (parseHM(b.start) ?? 0))
    // recipesSlim can come back as an array with holes (Firebase turns small
    // integer keys into one) — skip the empty slots.
    const recipeList = Object.entries(recipes.data || {})
      .map(([id, r]) => (r && r.n ? { id, name: r.n, de: r.d || '' } : null))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    const recipeById = {}
    recipeList.forEach((r) => { recipeById[r.id] = r })
    const staffById = {}
    staffList.forEach((s) => { staffById[s.id] = s })
    return { staffList, staffById, templates, recipeList, recipeById, lang }
  }, [staff.items, templatesCol.items, recipes.data, lang])

  const plan = sortedPlans.find((p) => p.id === selected)

  return (
    <div>
      <datalist id="plan-block-names">
        {BLOCK_NAMES.map((n) => <option key={n} value={n} />)}
      </datalist>

      <div className="flex gap-1.5 overflow-x-auto mb-3 items-center">
        {sortedPlans.map((p) => (
          <button
            key={p.id}
            onClick={() => { setSelected(p.id); setCreating(false) }}
            className={`shrink-0 min-h-[40px] px-3.5 rounded-full text-sm font-semibold whitespace-nowrap ${
              p.id === selected && !creating ? 'bg-orange-500 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {p.title || kindLabel(p.kind)}
          </button>
        ))}
        <button
          onClick={() => setCreating(true)}
          className="shrink-0 min-h-[40px] px-3.5 rounded-full text-sm font-semibold bg-slate-800 text-white flex items-center gap-1"
        >
          <Plus size={15} /> Новый план
        </button>
      </div>

      {creating && (
        <NewPlanForm
          onCreated={(id) => { setSelected(id); setCreating(false) }}
          onCancel={() => setCreating(false)}
        />
      )}
      {!creating && !plan && plans.ready && (
        <p className="text-sm text-slate-400 text-center py-6">Планов пока нет. Создайте первый — например, «Октябрь 2026».</p>
      )}
      {!creating && plan && <PlanView key={plan.id} plan={plan} ctx={ctx} menuBridge={menuBridge} />}
    </div>
  )
}
