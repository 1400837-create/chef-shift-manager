import { useState } from 'react'
import { Plus, X, BookOpen, Bookmark } from 'lucide-react'
import { ConfirmDeleteButton } from '../../components/UI'
import { writePaths, newId, createRecord } from '../../plan/planStore'
import { dishesFromLines, templateFromBlock, templatePaths } from '../../plan/templates'
import { dayTitle, shiftMinutes, assignmentWarnings } from '../../plan/calc'
import { formatDuration } from '../../plan/hours'
import { getAuthor } from '../../plan/planRoom'
import { staffLabel } from '../../plan/lang'
import { blocksOf, dishesOf, shiftsOf } from '../../plan/exchange'
import { DraftInput, TimeDraft, TimeInput, normalizeTime } from './shared'
import { RecipePickerModal } from './RecipeBrowser'
import { mealColor } from '../../plan/ui'
import { useOpenRecipe } from './recipeBridge'

// Editable versions of the grid's cells. Every field here is the same kind of
// per-field write as in the day window, so two people editing never overwrite
// each other. Compact styling: these sit inside table cells.

const COMPACT = '!min-h-[32px] !py-1 !px-2 !rounded-lg !text-sm'
const SELECT = 'min-h-[32px] px-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 max-w-full'

// ---------------------------------------------------------------------------
// menu: meals and their dishes
// ---------------------------------------------------------------------------

function DishAddLine({ recipeList, onAdd, onPick, onPasteLines }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const matches = needle.length >= 2 ? recipeList.filter((r) => r.name.toLowerCase().includes(needle)).slice(0, 6) : []

  function addManual() {
    if (!q.trim()) return
    onAdd(q.trim(), null)
    setQ('')
  }

  return (
    <div className="mt-1">
      <div className="flex gap-1">
        <input
          className="flex-1 min-w-0 min-h-[32px] px-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-transparent text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 text-slate-900 dark:text-slate-100"
          placeholder="+ блюдо (Enter)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManual() } }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (onPasteLines && text.trim().split(/\r?\n/).length > 1) {
              e.preventDefault()
              onPasteLines(text)
            }
          }}
        />
        <button onClick={onPick} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/30 text-orange-600" title="Выбрать из меню по рубрикам">
          <BookOpen size={15} />
        </button>
      </div>
      {matches.length > 0 && (
        <div className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
          {matches.map((r) => (
            <button
              key={r.id}
              onClick={() => { onAdd(r.name, r.id); setQ('') }}
              className="w-full text-left px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-orange-50 dark:hover:bg-slate-700"
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function MenuCell({ coll, date, day, ctx }) {
  const bridge = useOpenRecipe()
  const [pickerFor, setPickerFor] = useState(null)
  const blocks = blocksOf(day)
  const lbl = dayTitle(date)

  const patchBlock = (b, field, value) =>
    writePaths(coll, { [`${date}/blocks/${b.id}/${field}`]: value }, { action: 'update', entity: 'блок', id: date, label: `${lbl} · ${b.name || 'приём'}` })

  function addBlock() {
    const bid = newId(coll)
    writePaths(coll, { [`${date}/blocks/${bid}/name`]: '', [`${date}/blocks/${bid}/time`]: '' }, {
      action: 'create', entity: 'блок', id: date, label: `${lbl} · новый приём`,
    })
  }

  function addDish(b, text, recipeId) {
    writePaths(coll, { [`${date}/blocks/${b.id}/dishes/${newId(coll)}`]: { text, recipeId: recipeId || null } }, {
      action: 'create', entity: 'блюдо', id: date, label: `${lbl} · ${b.name || 'приём'}: ${text}`,
    })
  }

  // A list pasted into "+ блюдо" (one dish per line) becomes several dishes.
  function addPasted(b, text) {
    const list = dishesFromLines(ctx, text)
    if (!list.length) return
    const rel = {}
    list.forEach((d) => { rel[`${date}/blocks/${b.id}/dishes/${newId(coll)}`] = d })
    writePaths(coll, rel, {
      action: 'create', entity: 'блюда', id: date,
      label: `${lbl} · ${b.name || 'приём'}: ${list.length} шт. из вставки`,
    })
  }

  function saveTemplate(b) {
    const name = window.prompt('Название шаблона приёма', b.name || '')
    if (!name || !name.trim()) return
    createRecord('mealTemplates', templateFromBlock(b, name.trim()))
  }

  function applyTemplate(id) {
    const tpl = ctx.mealTemplates.find((t) => t.id === id)
    if (!tpl) return
    writePaths(coll, templatePaths(date, tpl, () => newId(coll)), {
      action: 'create', entity: 'приём из шаблона', id: date, label: `${lbl} · ${tpl.name}`,
    })
  }

  function addDishes(b, list) {
    if (!list.length) return
    const rel = {}
    list.forEach((r) => { rel[`${date}/blocks/${b.id}/dishes/${newId(coll)}`] = { text: r.name, recipeId: r.id } })
    writePaths(coll, rel, {
      action: 'create', entity: 'блюда', id: date,
      label: `${lbl} · ${b.name || 'приём'}: ${list.length} шт. (${list.slice(0, 3).map((r) => r.name).join(', ')}${list.length > 3 ? '…' : ''})`,
    })
  }

  return (
    <div>
      {blocks.map((b) => (
        <div key={b.id} className={`mb-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 p-1.5 border-l-4 ${mealColor(b.name).bar}`}>
          <div className="flex items-center gap-1">
            <div className="w-[4.2rem] shrink-0">
              <TimeDraft className={`${COMPACT} text-center`} value={b.time} onCommit={(v) => patchBlock(b, 'time', v || null)} />
            </div>
            <DraftInput className={`${COMPACT} font-semibold`} value={b.name} list="plan-block-names" placeholder="приём / мероприятие" onCommit={(v) => patchBlock(b, 'name', v.trim())} />
            <div className="w-[3.4rem] shrink-0">
              <DraftInput
                className={COMPACT}
                inputMode="numeric"
                value={b.persons}
                placeholder="чел."
                onCommit={(v) => { const n = parseInt(v, 10); patchBlock(b, 'persons', Number.isFinite(n) && n > 0 ? n : null) }}
              />
            </div>
            <button
              onClick={() => saveTemplate(b)}
              className="shrink-0 w-7 h-8 flex items-center justify-center text-slate-400 hover:text-orange-600"
              title="Сохранить этот приём как шаблон"
            >
              <Bookmark size={14} />
            </button>
            <ConfirmDeleteButton
              onConfirm={() => writePaths(coll, { [`${date}/blocks/${b.id}`]: null }, { action: 'delete', entity: 'блок', id: date, label: `${lbl} · ${b.name || 'приём'}`, before: b })}
              size="w-7 h-8"
              iconSize={14}
            />
          </div>
          <div className="mt-1 pl-3">
            {dishesOf(b).map((d) => {
              const recipe = d.recipeId ? ctx.recipeById[d.recipeId] : null
              const readOnlyDe = ctx.lang === 'de' && recipe?.de
              return (
                <div key={d.id} className="flex items-center gap-1 mb-1">
                  {readOnlyDe
                    ? <div className="flex-1 min-w-0 px-2 py-1 text-sm text-slate-700 dark:text-slate-200">{recipe.de}</div>
                    : (
                      <DraftInput
                        className={`${COMPACT} ${d.changed ? '!text-red-600' : ''}`}
                        value={d.text}
                        onCommit={(v) => {
                          const text = v.trim()
                          if (!text) return
                          const rel = { [`${date}/blocks/${b.id}/dishes/${d.id}/text`]: text }
                          if (d.recipeId && recipe && recipe.name !== text) rel[`${date}/blocks/${b.id}/dishes/${d.id}/recipeId`] = null
                          writePaths(coll, rel, { action: 'update', entity: 'блюдо', id: date, label: `${lbl} · ${b.name || 'приём'}: ${d.text}` })
                        }}
                      />
                    )}
                  {d.recipeId && ctx.repeatNote && ctx.repeatNote(d.recipeId, date) && (
                    <span className="shrink-0 text-[11px] font-semibold text-orange-600" title={ctx.repeatNote(d.recipeId, date)}>↻</span>
                  )}
                  {d.recipeId && bridge && bridge.has(d.recipeId) && (
                    <button
                      onClick={() => bridge.open(d.recipeId, b.persons)}
                      className="shrink-0 w-7 h-8 flex items-center justify-center text-orange-600"
                      title="Открыть ТК с пересчётом на гостей"
                    >
                      <BookOpen size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => writePaths(coll, { [`${date}/blocks/${b.id}/dishes/${d.id}`]: null }, { action: 'delete', entity: 'блюдо', id: date, label: `${lbl} · ${b.name || 'приём'}: ${d.text}`, before: d })}
                    className="shrink-0 w-7 h-8 flex items-center justify-center text-slate-400 hover:text-red-600"
                    title="Убрать блюдо"
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}
            <DishAddLine recipeList={ctx.recipeList} onAdd={(t, id) => addDish(b, t, id)} onPick={() => setPickerFor(b.id)} onPasteLines={(text) => addPasted(b, text)} />
          </div>
          {pickerFor === b.id && (
            <RecipePickerModal
              usageDates={ctx.usageDates}
              recipes={ctx.recipeList}
              lang={ctx.lang}
              title={`${lbl} · ${b.name || 'приём'}`}
              onClose={() => setPickerFor(null)}
              onAdd={(list) => { addDishes(b, list); setPickerFor(null) }}
            />
          )}
        </div>
      ))}
      <div className="flex gap-1">
        <button onClick={addBlock} className="flex-1 min-h-[30px] rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-xs font-semibold text-slate-500 flex items-center justify-center gap-1">
          <Plus size={13} /> приём
        </button>
        {ctx.mealTemplates.length > 0 && (
          <select
            className={`${SELECT} w-[7.5rem] text-xs`}
            value=""
            onChange={(e) => { if (e.target.value) applyTemplate(e.target.value) }}
          >
            <option value="">из шаблона…</option>
            {ctx.mealTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// shifts
// ---------------------------------------------------------------------------

export function ShiftCell({ coll, date, day, ctx }) {
  const shifts = shiftsOf(day)
  const lbl = dayTitle(date)
  const [staffId, setStaffId] = useState('')
  const [t1, setT1] = useState('')
  const [t2, setT2] = useState('')
  const [tpl, setTpl] = useState('')
  const [err, setErr] = useState(false)
  const [guard, setGuard] = useState(null)

  const patch = (s, field, value) =>
    writePaths(coll, { [`${date}/shifts/${s.id}/${field}`]: value }, { action: 'update', entity: 'смену', id: date, label: `${lbl} · смена ${s.staffName || ''}`.trim() })

  function changeStaff(s, id) {
    const rec = ctx.staffById[id]
    writePaths(coll, { [`${date}/shifts/${s.id}/staffId`]: id || null, [`${date}/shifts/${s.id}/staffName`]: rec ? rec.name : null }, {
      action: 'update', entity: 'смену', id: date, label: `${lbl} · смена ${s.staffName || ''}`.trim(),
      changes: [{ f: 'сотрудник', from: s.staffName || null, to: rec ? rec.name : null }],
    })
  }

  function add() {
    const rec = ctx.staffById[staffId]
    const a = normalizeTime(t1)
    const b = normalizeTime(t2)
    let times = a && b ? [a, b] : null
    if (!times && tpl) {
      const t = ctx.templates.find((x) => x.id === tpl)
      if (t) times = [t.start, t.end]
    }
    if (!rec || !times) { setErr(true); return }
    setErr(false)
    const warnings = assignmentWarnings({ staff: rec, shifts: ctx.allShifts || [], date, start: times[0], end: times[1], planTitles: ctx.planTitles })
    if (warnings.length) { setGuard({ rec, times, warnings }); return }
    commit(rec, times)
  }

  function commit(rec, times) {
    writePaths(coll, { [`${date}/shifts/${newId(coll)}`]: { staffId: rec.id, staffName: rec.name, start: times[0], end: times[1] } }, {
      action: 'create', entity: 'смену', id: date, label: `${lbl} · ${rec.name} ${times[0]}–${times[1]}`,
    })
    setGuard(null)
    setStaffId('')
    setT1('')
    setT2('')
    setTpl('')
  }

  function chooseTemplate(id) {
    setTpl(id)
    const t = ctx.templates.find((x) => x.id === id)
    if (t) { setT1(t.start); setT2(t.end) }
  }

  return (
    <div>
      {shifts.map((s) => {
        const known = s.staffId && ctx.staffById[s.staffId]
        return (
          <div key={s.id} className="flex items-center gap-1 mb-1">
            <select className={`${SELECT} flex-1 min-w-0`} value={s.staffId || (s.staffName ? '__old' : '')} onChange={(e) => changeStaff(s, e.target.value)}>
              <option value="">—</option>
              {!known && s.staffName && <option value={s.staffId || '__old'} disabled>{s.staffName} (нет в списке)</option>}
              {ctx.staffList.map((p) => <option key={p.id} value={p.id}>{staffLabel(p, ctx.lang)}</option>)}
            </select>
            <div className="w-[3.8rem] shrink-0"><TimeDraft className={`${COMPACT} text-center`} value={s.start} onCommit={(v) => { if (v) patch(s, 'start', v) }} /></div>
            <span className="text-slate-400">–</span>
            <div className="w-[3.8rem] shrink-0"><TimeDraft className={`${COMPACT} text-center`} value={s.end} onCommit={(v) => { if (v) patch(s, 'end', v) }} /></div>
            <span className="w-9 shrink-0 text-right text-xs font-semibold text-slate-500">
              {shiftMinutes(s, 'planned') === null ? '' : formatDuration(shiftMinutes(s, 'planned'))}
            </span>
            <button
              onClick={() => writePaths(coll, { [`${date}/shifts/${s.id}`]: null }, { action: 'delete', entity: 'смену', id: date, label: `${lbl} · смена ${s.staffName || ''}`.trim(), before: s })}
              className="shrink-0 w-7 h-8 flex items-center justify-center text-slate-400 hover:text-red-600"
              title="Убрать смену"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
      <div className={`mt-1 rounded-lg border border-dashed p-1 ${err ? 'border-red-400' : 'border-slate-300 dark:border-slate-600'}`}>
        <select className={`${SELECT} w-full mb-1`} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">+ сотрудник…</option>
          {ctx.staffList.map((p) => <option key={p.id} value={p.id}>{staffLabel(p, ctx.lang)}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <div className="w-[3.8rem] shrink-0"><TimeInput className={`${COMPACT} text-center`} placeholder="с" value={t1} onChange={(v) => { setT1(v); setTpl('') }} /></div>
          <span className="text-slate-400">–</span>
          <div className="w-[3.8rem] shrink-0"><TimeInput className={`${COMPACT} text-center`} placeholder="до" value={t2} onChange={(v) => { setT2(v); setTpl('') }} onEnter={add} /></div>
          {ctx.templates.length > 0 && (
            <select className={`${SELECT} flex-1 min-w-0`} value={tpl} onChange={(e) => chooseTemplate(e.target.value)}>
              <option value="">смена…</option>
              {ctx.templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          )}
          <button onClick={add} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-orange-500 text-white" title="Добавить смену">
            <Plus size={15} />
          </button>
        </div>
        {guard && (
          <div className="mt-1 rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 p-1.5 text-xs">
            {guard.warnings.map((w) => <p key={w} className="text-slate-800 dark:text-slate-100 mb-1">⚠ {w}</p>)}
            <div className="flex gap-1">
              <button onClick={() => commit(guard.rec, guard.times)} className="px-2 min-h-[30px] rounded-md bg-orange-500 text-white font-semibold">Всё равно</button>
              <button onClick={() => setGuard(null)} className="px-2 min-h-[30px] rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 font-semibold text-slate-700 dark:text-slate-200">Отмена</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// comments
// ---------------------------------------------------------------------------

export function NoteCell({ coll, date, notes }) {
  const [text, setText] = useState('')

  function add() {
    const t = text.trim()
    if (!t) return
    const author = getAuthor()
    writePaths(coll, { [`${date}/comments/${newId(coll)}`]: { text: t, by: author.name, byId: author.id, ts: Date.now() } }, {
      action: 'create', entity: 'комментарий', id: date, label: `${dayTitle(date)}: ${t.slice(0, 60)}`,
    })
    setText('')
  }

  return (
    <div className="text-xs">
      {notes.map((n, i) => (
        <p key={i} className="mb-1 text-slate-700 dark:text-slate-200">
          {n.where && <span className="font-semibold text-orange-600">{n.where}: </span>}
          {n.text}
          <span className="text-slate-400"> — {n.by}</span>
        </p>
      ))}
      <input
        className="w-full min-h-[30px] px-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-transparent text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 text-slate-900 dark:text-slate-100"
        placeholder="+ комментарий дня (Enter)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
      />
    </div>
  )
}
