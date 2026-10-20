import { Fragment, useEffect, useMemo, useState } from 'react'
import { Plus, ChevronDown, ChevronRight, MessageSquare, Flag, Users, X, Clock, BookOpen, Bookmark, Settings } from 'lucide-react'
import { dishesFromLines, templateFromBlock, templatePaths } from '../../plan/templates'
import { Section, inputClass, BigButton, Badge, ConfirmDeleteButton } from '../../components/UI'
import { usePlanDeviceState, getAuthor } from '../../plan/planRoom'
import { usePlanCollection, createRecord, patchRecord, writePaths, newId, commitChange } from '../../plan/planStore'
import { formatDuration, parseHM } from '../../plan/hours'
import {
  isDateKey, dayTitle, monthOf, monthTitle, shiftMinutes, sumMinutes, planRange, assignmentWarnings,
  collectShifts, suggestStaff,
} from '../../plan/calc'
import { todayKey } from '../../utils/dateUtils'
import { DraftInput, ConfirmButton, TimeDraft, TimeInput, normalizeTime, byName } from './shared'
import { usePlanLang, LOCALE, staffLabel } from '../../plan/lang'
import ExchangePanel from './Exchange'
import CostPanel from './Cost'
import GridView from './GridView'
import { usePlanCtx } from './usePlanCtx'
import AllPlansView from './AllPlansView'
import { RecipePickerModal } from './RecipeBrowser'

const PLAN_KINDS = [
  { key: 'month', label: 'Месяц' },
  { key: 'camp', label: 'Лагерь' },
  { key: 'event', label: 'Мероприятие' },
  { key: 'other', label: 'Другое' },
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

// `part` lets a caller put the toggle button in one place (next to a dish) and
// the thread below it, sharing one open state.
function Comments({ coll, path, comments, label, part = 'both', open: openProp, onToggle }) {
  const [openState, setOpenState] = useState(false)
  const open = openProp !== undefined ? openProp : openState
  const toggle = onToggle || (() => setOpenState((v) => !v))
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

  const Wrap = part === 'both' ? 'div' : Fragment
  return (
    <Wrap>
      {part !== 'panel' && (
        <button
          onClick={toggle}
          className={`flex items-center gap-1 px-2 min-h-[32px] rounded-lg text-xs font-semibold ${
            list.length ? 'text-orange-600' : 'text-slate-400'
          }`}
          title="Комментарии"
        >
          <MessageSquare size={14} /> {list.length || ''}
        </button>
      )}
      {part !== 'button' && open && (
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
    </Wrap>
  )
}

// ---------------------------------------------------------------------------
// dishes
// ---------------------------------------------------------------------------

function DishAdder({ recipeList, onAdd, onPasteLines }) {
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
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (onPasteLines && text.trim().split(/\r?\n/).length > 1) {
              e.preventDefault()
              onPasteLines(text)
            }
          }}
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
  const [cOpen, setCOpen] = useState({})
  const [picker, setPicker] = useState(false)
  const persons = Number(block.persons)
  const coef = Number.isFinite(persons) && persons > 0 ? Math.round((persons / 10) * 100) / 100 : null

  const patch = (field, value) =>
    writePaths(coll, { [`${base}/${field}`]: value }, { action: 'update', entity: 'блок', id: date, label })

  function addPasted(text) {
    const list = dishesFromLines(ctx, text)
    if (!list.length) return
    const rel = {}
    list.forEach((d) => { rel[`${base}/dishes/${newId(coll)}`] = d })
    writePaths(coll, rel, { action: 'create', entity: 'блюда', id: date, label: `${label}: ${list.length} шт. из вставки` })
  }

  function saveTemplate() {
    const name = window.prompt('Название шаблона приёма', block.name || '')
    if (!name || !name.trim()) return
    createRecord('mealTemplates', templateFromBlock(block, name.trim()))
  }

  // Several dishes in one write = one journal line, not one per dish.
  function addDishes(list) {
    if (!list.length) return
    const rel = {}
    list.forEach((r) => { rel[`${base}/dishes/${newId(coll)}`] = { text: r.name, recipeId: r.id } })
    writePaths(coll, rel, {
      action: 'create', entity: 'блюда', id: date,
      label: `${label}: ${list.length} шт. (${list.slice(0, 3).map((r) => r.name).join(', ')}${list.length > 3 ? '…' : ''})`,
    })
  }

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
      <div>
        <p className="text-[11px] text-slate-400 mb-0.5">Приём / мероприятие</p>
        <DraftInput value={block.name} onCommit={(v) => patch('name', v.trim())} list="plan-block-names" placeholder="Например: Mittagessen" />
      </div>
      <div className="grid grid-cols-[minmax(7.5rem,1fr)_minmax(5rem,1fr)_auto] gap-2 mt-2 items-end">
        <div>
          <p className="text-[11px] text-slate-400 mb-0.5">Время</p>
          <TimeDraft value={block.time} onCommit={(v) => patch('time', v || null)} />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-0.5">Персон</p>
          <DraftInput inputMode="numeric" value={block.persons} onCommit={(v) => { const n = parseInt(v, 10); patch('persons', Number.isFinite(n) && n > 0 ? n : null) }} />
        </div>
        <ConfirmDeleteButton
          onConfirm={() => writePaths(coll, { [base]: null }, { action: 'delete', entity: 'блок', id: date, label, before: block })}
          size="w-11 h-11"
          iconSize={18}
        />
      </div>

      <div className="mt-2">
        {dishes.map((d) => {
          const recipe = d.recipeId ? ctx.recipeById[d.recipeId] : null
          return (
            <div key={d.id} className="mb-1.5">
            <div className="flex items-center gap-1.5">
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
              <Comments part="button" coll={coll} path={`${base}/dishes/${d.id}`} comments={d.comments} label={`${label}: ${d.text}`} open={!!cOpen[d.id]} onToggle={() => setCOpen((o) => ({ ...o, [d.id]: !o[d.id] }))} />
              <button
                onClick={() => writePaths(coll, { [`${base}/dishes/${d.id}`]: null }, { action: 'delete', entity: 'блюдо', id: date, label: `${label}: ${d.text}`, before: d })}
                className="shrink-0 w-8 h-8 flex items-center justify-center text-slate-400 active:text-red-600"
                title="Убрать блюдо"
              >
                <X size={16} />
              </button>
            </div>
            <div className="pl-9">
              <Comments part="panel" coll={coll} path={`${base}/dishes/${d.id}`} comments={d.comments} label={`${label}: ${d.text}`} open={!!cOpen[d.id]} />
            </div>
            </div>
          )
        })}
        <button
          onClick={() => setPicker(true)}
          className="w-full min-h-[44px] mb-2 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 text-sm font-semibold flex items-center justify-center gap-1.5"
        >
          <BookOpen size={16} /> Выбрать из меню (по рубрикам)
        </button>
        <DishAdder recipeList={ctx.recipeList} onAdd={addDish} onPasteLines={addPasted} />
        {picker && (
          <RecipePickerModal
            usageDates={ctx.usageDates}
            recipes={ctx.recipeList}
            lang={ctx.lang}
            title={`${dayTitle(date, LOCALE[ctx.lang])} · ${block.name || 'приём'}`}
            onClose={() => setPicker(false)}
            onAdd={(list) => { addDishes(list); setPicker(false) }}
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <Comments coll={coll} path={base} comments={block.comments} label={label} />
        <button onClick={saveTemplate} className="flex items-center gap-1 px-2 min-h-[32px] rounded-lg text-xs font-semibold text-slate-500" title="Сохранить этот приём как шаблон">
          <Bookmark size={14} /> в шаблон
        </button>
      </div>
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
          <TimeDraft value={shift.start} onCommit={(v) => { if (v) patch('start', v) }} />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-0.5">Конец</p>
          <TimeDraft value={shift.end} onCommit={(v) => { if (v) patch('end', v) }} />
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
            <TimeDraft value={shift.actStart} onCommit={(v) => patch('actStart', v || null)} />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-0.5">Факт: конец</p>
            <TimeDraft value={shift.actEnd} onCommit={(v) => patch('actEnd', v || null)} />
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

  // The fields hold typed text ("930" shows as 9:30) — work with the clean value.
  const ns = normalizeTime(start)
  const ne = normalizeTime(end)

  const [guard, setGuard] = useState(null)

  // Overlap with the person's other shift (any plan) or going over their norm
  // is allowed, but only after an explicit "add anyway".
  function attempt(rec) {
    const warnings = assignmentWarnings({ staff: rec, shifts: ctx.allShifts, date, start: ns, end: ne, planTitles: ctx.planTitles })
    if (warnings.length) { setGuard({ rec, warnings }); return }
    create(rec, ns, ne)
    setStaffId('')
  }

  function add() {
    const rec = ctx.staffList.find((s) => s.id === staffId)
    if (!rec) return setError('Выберите сотрудника.')
    if (!ns || !ne) return setError('Укажите начало и конец смены.')
    setError(null)
    attempt(rec)
    return undefined
  }

  const canSuggest = !!ns && !!ne
  const suggestions = useMemo(
    () => (pickOpen && canSuggest ? suggestStaff({ staff: ctx.staffList, shifts: allShifts, date, start: ns, end: ne }).slice(0, 6) : []),
    [pickOpen, canSuggest, ctx.staffList, allShifts, date, ns, ne]
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
        <TimeInput value={start} placeholder="Начало (1000)" onChange={(v) => { setStart(v); setTemplateId('') }} />
        <TimeInput value={end} placeholder="Конец (1600)" onChange={(v) => { setEnd(v); setTemplateId('') }} onEnter={add} />
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
      {guard && (
        <div className="mt-2 rounded-xl border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 p-3 text-sm">
          {guard.warnings.map((w) => <p key={w} className="text-slate-800 dark:text-slate-100 mb-1">⚠ {w}</p>)}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => { create(guard.rec, ns, ne); setGuard(null); setStaffId('') }}
              className="px-3 min-h-[40px] rounded-lg bg-orange-500 text-white font-semibold"
            >
              Всё равно добавить
            </button>
            <button onClick={() => setGuard(null)} className="px-3 min-h-[40px] rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold">
              Отмена
            </button>
          </div>
        </div>
      )}
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
                onClick={() => attempt(staff)}
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
          {ctx.mealTemplates.length > 0 && (
            <select
              className={`${inputClass} mb-4`}
              value=""
              onChange={(e) => {
                const tpl = ctx.mealTemplates.find((t) => t.id === e.target.value)
                if (!tpl) return
                writePaths(coll, templatePaths(date, tpl, () => newId(coll)), {
                  action: 'create', entity: 'приём из шаблона', id: date, label: `${dayTitle(date)} · ${tpl.name}`,
                })
              }}
            >
              <option value="">Добавить приём из шаблона…</option>
              {ctx.mealTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}

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

function PlanView({ plan, ctx, menuBridge, plans }) {
  const isOwner = usePlanDeviceState().config?.role === 'owner'
  const coll = `planData/${plan.id}`
  const { data } = usePlanCollection(coll)
  const tree = usePlanCollection('planData').data
  const allShifts = useMemo(() => collectShifts(tree), [tree])
  const dates = useMemo(() => Object.keys(data).filter(isDateKey).sort(), [data])
  const [note, setNote] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  const range = planRange(plan)

  return (
    <>
      <GridView plan={plan} data={data} ctx={ctx} renderDay={renderDay} plans={plans} tree={tree} menuBridge={menuBridge} />

      <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-4 overflow-hidden">
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left bg-slate-50 dark:bg-slate-900/40"
        >
          {settingsOpen ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
          <Settings size={18} className="text-slate-500 dark:text-slate-400" />
          <span className="font-semibold text-slate-800 dark:text-slate-100 text-[15px] flex-1">Настройки плана</span>
          <Badge color="slate">{kindLabel(plan.kind)}</Badge>
        </button>
        {settingsOpen && <div className="p-3">
        <div className="grid grid-cols-1 gap-2 mb-3">
          <DraftInput value={plan.title} placeholder="Название плана" onCommit={(v) => { if (v.trim()) patchRecord('plans', plan.id, { title: v.trim() }) }} />
        </div>

        <p className="text-[11px] text-slate-400 mb-1">Период плана</p>
        {plan.kind === 'month' ? (
          <input
            type="month"
            className={inputClass}
            value={plan.month || ''}
            onChange={(e) => { if (e.target.value) patchRecord('plans', plan.id, { month: e.target.value }) }}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">С</p>
              <input type="date" className={inputClass} value={plan.dateFrom || ''} onChange={(e) => patchRecord('plans', plan.id, { dateFrom: e.target.value || null })} />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">По</p>
              <input type="date" className={inputClass} value={plan.dateTo || ''} onChange={(e) => patchRecord('plans', plan.id, { dateTo: e.target.value || null })} />
            </div>
          </div>
        )}
        <p className="text-xs text-slate-500 mt-1.5">
          {range
            ? 'В таблице показаны все дни этого периода. Дни вне периода серые и не редактируются: они относятся к другому плану.'
            : 'Укажите даты «С» и «По» — тогда в таблице появятся все дни лагеря или мероприятия, в том числе пустые.'}
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
                Убрать служебные пустые дни ({emptyDays.length})
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
        </div>}
      </section>

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
  const [dateFrom, setDateFrom] = useState(() => todayKey())
  const [dateTo, setDateTo] = useState(() => todayKey())
  const [error, setError] = useState(null)

  function create() {
    if (kind !== 'month' && (!dateFrom || !dateTo || dateFrom > dateTo)) {
      setError('Укажите даты: «С» не может быть позже «По».')
      return
    }
    const finalTitle = title.trim() || (kind === 'month' ? monthTitle(month) : kindLabel(kind))
    const id = createRecord('plans', {
      title: finalTitle,
      kind,
      month: kind === 'month' ? month : null,
      dateFrom: kind === 'month' ? null : dateFrom,
      dateTo: kind === 'month' ? null : dateTo,
      createdAt: Date.now(),
    })
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
        {kind !== 'month' && (
          <>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Начало</p>
              <input type="date" className={inputClass} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); if (!dateTo || e.target.value > dateTo) setDateTo(e.target.value) }} />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Конец</p>
              <input type="date" className={inputClass} value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </>
        )}
        {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
        <input className={inputClass + ' col-span-2'} placeholder="Название (необязательно)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <BigButton onClick={create} icon={Plus}>Создать</BigButton>
        <button onClick={onCancel} className="min-h-[52px] rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">Отмена</button>
      </div>
    </Section>
  )
}

const ALL = '__all'

export default function ScheduleTab({ menuBridge }) {
  const { config } = usePlanDeviceState()
  const code = config?.code
  const { ctx, sortedPlans, allData, plansReady } = usePlanCtx()

  const selKey = `kitchenPlan_selectedPlan:${code}`
  const [selected, setSelected] = useState(() => {
    try { return localStorage.getItem(selKey) || '' } catch { return '' }
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!plansReady) return
    if (selected !== ALL && !sortedPlans.some((p) => p.id === selected)) setSelected(sortedPlans[0]?.id || '')
  }, [plansReady, sortedPlans, selected])

  useEffect(() => {
    try { if (selected) localStorage.setItem(selKey, selected) } catch { /* preference only */ }
  }, [selected, selKey])

  const plan = sortedPlans.find((p) => p.id === selected)

  return (
    <div>
      <datalist id="plan-block-names">
        {[...new Set(ctx.mealTypes.flatMap((t) => [t.name, t.nameDe]).filter(Boolean))].map((n) => <option key={n} value={n} />)}
      </datalist>

      <div
        className="sticky z-20 -mx-3 md:-mx-6 lg:-mx-10 px-3 md:px-6 lg:px-10 py-2 mb-2 flex gap-1.5 overflow-x-auto items-center bg-slate-100 dark:bg-slate-950 shadow-[0_2px_4px_-2px_rgba(0,0,0,0.15)]"
        style={{ top: "var(--app-header-h, 64px)" }}
      >
        {sortedPlans.length > 1 && (
          <button
            onClick={() => { setSelected(ALL); setCreating(false) }}
            className={`shrink-0 min-h-[40px] px-3.5 rounded-full text-sm font-semibold whitespace-nowrap ${
              selected === ALL && !creating ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'
            }`}
          >
            Все планы
          </button>
        )}
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
      {!creating && !plan && selected !== ALL && plansReady && (
        <p className="text-sm text-slate-400 text-center py-6">Планов пока нет. Создайте первый — например, «Октябрь 2026».</p>
      )}
      {!creating && selected === ALL && sortedPlans.length > 0 && (
        <AllPlansView plans={sortedPlans} tree={allData} ctx={ctx} onOpenPlan={(id) => setSelected(id)} menuBridge={menuBridge} />
      )}
      {!creating && plan && <PlanView key={plan.id} plan={plan} ctx={ctx} menuBridge={menuBridge} plans={sortedPlans} />}
    </div>
  )
}
