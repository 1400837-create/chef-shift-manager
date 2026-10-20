import { useMemo, useState } from 'react'
import { CalendarClock, ListChecks, ClipboardList, Plus, Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react'
import { Section, Badge, BigButton, ConfirmDeleteButton, Field, inputClass } from '../../components/UI'
import { TASK_CATEGORIES, MY_TASK_CATEGORIES } from '../../utils/constants'
import { urgencyColor } from '../../utils/deadlines'
import { todayKey, parseLocalDate, daysBetween, startOfDay } from '../../utils/dateUtils'
import { usePlanCollection, createRecord, patchRecord, deleteRecord } from '../../plan/planStore'
import { getAuthor } from '../../plan/planRoom'
import { addDaysKey, dayTitle, isDateKey } from '../../plan/calc'
import { LOCALE } from '../../plan/lang'
import { dayText } from '../../plan/exchange'
import DaySummary from './DaySummary'
import { copyText } from './Exchange'

// The home screen of the plan: what is on today (every plan at once) and the
// two shared task lists — the same two the main Дашборд has, but kept in the
// plan room so the chef and the Küchenleiterin see and tick the same list.

const dayParts = (plans, tree, date) => plans
  .map((p) => ({ plan: p, day: tree[p.id]?.[date] }))
  .filter(({ day }) => day && (Object.keys(day.blocks || {}).length || Object.keys(day.shifts || {}).length || Object.keys(day.comments || {}).length))

function whoWhen(rec) {
  if (!rec.done || !rec.doneBy) return null
  const t = rec.doneAt ? new Date(rec.doneAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
  return `✓ ${rec.doneBy}${t ? ` · ${t}` : ''}`
}

function TaskRow({ task, onToggle, onRemove, showDeadline }) {
  const urgency = showDeadline && !task.done && isDateKey(task.deadline || '')
    ? { daysLeft: daysBetween(startOfDay(new Date()), parseLocalDate(task.deadline)) }
    : null
  const sub = whoWhen(task)
  return (
    <div className="flex items-center gap-2 mb-2">
      <label
        className={`flex-1 flex items-center gap-3 min-h-[52px] px-3 py-2.5 rounded-xl border cursor-pointer select-none active:scale-[0.99] transition-all ${
          task.done
            ? 'bg-green-50 border-green-300 dark:bg-green-900/30 dark:border-green-700'
            : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'
        }`}
      >
        <input type="checkbox" checked={!!task.done} onChange={onToggle} className="sr-only" />
        <span
          className={`shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center ${
            task.done ? 'bg-green-600 border-green-600' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
          }`}
        >
          {task.done && <Check size={18} strokeWidth={3} className="text-white" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[15px] leading-snug ${task.done ? 'text-green-800 dark:text-green-300 line-through' : 'text-slate-700 dark:text-slate-200'}`}>
            {task.text}
          </span>
          {sub && <span className="block text-xs text-green-700 dark:text-green-400">{sub}</span>}
        </span>
        {urgency && (
          <Badge color={urgencyColor(urgency.daysLeft)}>
            {urgency.daysLeft < 0 ? 'Просрочено' : urgency.daysLeft === 0 ? 'Сегодня' : `${urgency.daysLeft} дн.`}
          </Badge>
        )}
      </label>
      <ConfirmDeleteButton onConfirm={onRemove} size="w-11 h-11" iconSize={18} />
    </div>
  )
}

function toggle(coll, task) {
  const author = getAuthor()
  patchRecord(coll, task.id, task.done
    ? { done: false, doneBy: null, doneAt: null }
    : { done: true, doneBy: author.name, doneAt: Date.now() })
}

function SharedTasks() {
  const { items } = usePlanCollection('tasks')
  const [text, setText] = useState('')
  const [category, setCategory] = useState(MY_TASK_CATEGORIES[0].key)
  const [deadline, setDeadline] = useState('')

  function add() {
    if (!text.trim()) return
    createRecord('tasks', { text: text.trim(), category, deadline: deadline || null, done: false, by: getAuthor().name, createdAt: Date.now() })
    setText('')
    setDeadline('')
  }

  return (
    <Section title="Задачи" icon={ListChecks}>
      <div className="flex flex-col gap-2 mb-3">
        <Field label="Новая задача">
          <input
            className={inputClass}
            placeholder="Например: заказать инвентарь"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          />
        </Field>
        <div className="flex gap-2">
          <select className={`${inputClass} flex-1 min-w-0`} value={category} onChange={(e) => setCategory(e.target.value)}>
            {MY_TASK_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input type="date" className={`${inputClass} w-40 shrink-0`} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <BigButton onClick={add} icon={Plus} disabled={!text.trim()}>Добавить задачу</BigButton>
      </div>

      {MY_TASK_CATEGORIES.map((cat) => {
        const list = items
          .filter((t) => t.category === cat.key)
          .sort((a, b) => Number(!!a.done) - Number(!!b.done) || (a.createdAt || 0) - (b.createdAt || 0))
        if (!list.length) return null
        return (
          <div key={cat.key} className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{cat.label}</p>
            {list.map((t) => (
              <TaskRow key={t.id} task={t} showDeadline onToggle={() => toggle('tasks', t)} onRemove={() => deleteRecord('tasks', t.id)} />
            ))}
          </div>
        )
      })}
      {items.length === 0 && <p className="text-sm text-slate-400 text-center py-3">Задач пока нет</p>}
    </Section>
  )
}

function DayTasks({ locale }) {
  const { items } = usePlanCollection('dayTasks')
  const [date, setDate] = useState(todayKey())
  const [text, setText] = useState('')
  const [category, setCategory] = useState('prep')
  const today = todayKey()
  const list = items.filter((t) => t.date === date)

  function add() {
    if (!text.trim()) return
    createRecord('dayTasks', { date, text: text.trim(), category, done: false, createdAt: Date.now() })
    setText('')
  }

  return (
    <Section title="Задачи для Küchenhilfe" icon={ClipboardList}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <button onClick={() => setDate((d) => addDaysKey(d, -1))} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500">
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => setDate(today)} className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          {date === today ? 'Сегодня' : dayTitle(date, locale)}
        </button>
        <button onClick={() => setDate((d) => addDaysKey(d, 1))} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="flex flex-col gap-2 mb-3">
        <Field label="Новая задача">
          <input
            className={inputClass}
            placeholder="Например: почистить овощи"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          />
        </Field>
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          {TASK_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <BigButton onClick={add} icon={Plus} disabled={!text.trim()}>Добавить</BigButton>
      </div>
      {TASK_CATEGORIES.map((cat) => {
        const rows = list.filter((t) => t.category === cat.key).sort((a, b) => Number(!!a.done) - Number(!!b.done) || (a.createdAt || 0) - (b.createdAt || 0))
        if (!rows.length) return null
        return (
          <div key={cat.key} className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{cat.label}</p>
            {rows.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={() => toggle('dayTasks', t)} onRemove={() => deleteRecord('dayTasks', t.id)} />
            ))}
          </div>
        )
      })}
      {list.length === 0 && <p className="text-sm text-slate-400 text-center py-3">Задач на этот день пока нет</p>}
    </Section>
  )
}

export default function PlanDashboard({ ctx, plans, tree, onOpenPlan }) {
  const today = todayKey()
  const tomorrow = addDaysKey(today, 1)
  const locale = LOCALE[ctx.lang]
  const todayParts = useMemo(() => dayParts(plans, tree, today), [plans, tree, today])
  const tomorrowParts = useMemo(() => dayParts(plans, tree, tomorrow), [plans, tree, tomorrow])
  const [showTomorrow, setShowTomorrow] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copyToday() {
    try {
      await copyText(dayText({ date: today, parts: todayParts, ctx, lang: ctx.lang }))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked — nothing useful to show
    }
  }

  return (
    <div>
      <Section
        title={`Сегодня · ${dayTitle(today, locale)}`}
        icon={CalendarClock}
        right={todayParts.length > 0 && (
          <button onClick={copyToday} className="flex items-center gap-1 text-xs font-semibold text-orange-600">
            <Copy size={14} /> {copied ? 'Скопировано' : 'Текстом'}
          </button>
        )}
      >
        {todayParts.length === 0
          ? <p className="text-sm text-slate-400 text-center py-2">На сегодня в плане ничего нет</p>
          : <DaySummary date={today} parts={todayParts} ctx={ctx} showTags={plans.length > 1} onOpenPlan={onOpenPlan} repeats={ctx.repeatNote} />}
        <button
          onClick={() => setShowTomorrow((v) => !v)}
          className="mt-3 w-full min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300"
        >
          {showTomorrow ? 'Скрыть завтра' : `Показать завтра · ${dayTitle(tomorrow, locale)}`}
        </button>
        {showTomorrow && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            {tomorrowParts.length === 0
              ? <p className="text-sm text-slate-400 text-center py-2">На завтра в плане ничего нет</p>
              : <DaySummary date={tomorrow} parts={tomorrowParts} ctx={ctx} showTags={plans.length > 1} onOpenPlan={onOpenPlan} repeats={ctx.repeatNote} />}
          </div>
        )}
      </Section>

      <SharedTasks />
      <DayTasks locale={locale} />
    </div>
  )
}
