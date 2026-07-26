import { useState } from 'react'
import { ClipboardList, AlertTriangle, PackageCheck, Plus, Trash2, CalendarClock, Sunrise, Sunset } from 'lucide-react'
import { Section, CheckRow, Badge, Field, inputClass, PrintButton } from '../components/UI'
import { STRATEGIC_CATEGORIES, TASK_CATEGORIES } from '../utils/constants'
import { todayKey, formatRu, daysBetween, parseLocalDate } from '../utils/dateUtils'
import { menuDeadlineInfo, financeDeadlineInfo, urgencyColor } from '../utils/deadlines'

export default function Dashboard({
  shiftChecklist, setShiftChecklist,
  kuchenhilfeTasks, setKuchenhilfeTasks,
  stockTracker, setStockTracker,
  requestPrint,
}) {
  const today = todayKey()
  const now = new Date()
  const day = shiftChecklist[today] || {
    kitchenClean: false, tasksAssigned: false, leftoversPacked: false, cleaningDone: false,
  }
  const tasksToday = kuchenhilfeTasks[today] || []

  const [newTaskText, setNewTaskText] = useState('')
  const [newTaskCategory, setNewTaskCategory] = useState('prep')
  const [produceForm, setProduceForm] = useState({ name: '', qty: '' })

  function updateDay(patch) {
    setShiftChecklist((prev) => ({ ...prev, [today]: { ...day, ...patch } }))
  }

  function addTask() {
    if (!newTaskText.trim()) return
    const task = { id: Date.now(), category: newTaskCategory, text: newTaskText.trim(), done: false }
    setKuchenhilfeTasks((prev) => ({ ...prev, [today]: [...(prev[today] || []), task] }))
    setNewTaskText('')
  }

  function toggleTask(id) {
    setKuchenhilfeTasks((prev) => ({
      ...prev,
      [today]: (prev[today] || []).map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }))
  }

  function removeTask(id) {
    setKuchenhilfeTasks((prev) => ({
      ...prev,
      [today]: (prev[today] || []).filter((t) => t.id !== id),
    }))
  }

  function toggleStockChecked(key) {
    setStockTracker((prev) => ({
      ...prev,
      checks: { ...prev.checks, [key]: { lastChecked: today } },
    }))
  }

  function addProduce() {
    if (!produceForm.name.trim()) return
    const entry = { id: Date.now(), name: produceForm.name.trim(), qty: produceForm.qty.trim(), date: today }
    setStockTracker((prev) => ({ ...prev, produce: [entry, ...(prev.produce || [])].slice(0, 20) }))
    setProduceForm({ name: '', qty: '' })
  }

  function removeProduce(id) {
    setStockTracker((prev) => ({ ...prev, produce: (prev.produce || []).filter((p) => p.id !== id) }))
  }

  const menuDl = menuDeadlineInfo(now)
  const financeDl = financeDeadlineInfo(now)

  function printTasks() {
    requestPrint({
      type: 'tasks',
      date: formatRu(now),
      tasksByCategory: TASK_CATEGORIES.map((cat) => ({
        label: cat.label,
        items: tasksToday.filter((t) => t.category === cat.key).map((t) => t.text),
      })),
    })
  }

  return (
    <div className="pb-4">
      <Section title="Открытие смены" icon={Sunrise}>
        <CheckRow
          label="Кухня проверена на чистоту"
          checked={day.kitchenClean}
          onChange={(v) => updateDay({ kitchenClean: v })}
          tone="urgent"
        />
        {!day.kitchenClean && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">
            <AlertTriangle size={16} className="shrink-0" />
            Если кухня грязная — смену начинаем с уборки, прежде чем готовить.
          </div>
        )}
        <CheckRow
          label="Задачи Küchenhilfe выданы"
          checked={day.tasksAssigned}
          onChange={(v) => updateDay({ tasksAssigned: v })}
        />
      </Section>

      <Section
        title="Задачи для Küchenhilfe"
        icon={ClipboardList}
        right={<PrintButton onClick={printTasks} />}
      >
        <div className="flex flex-col gap-2 mb-3">
          <Field label="Новая задача">
            <input
              className={inputClass}
              placeholder="Например: почистить овощи"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <select
              className={inputClass + ' flex-1'}
              value={newTaskCategory}
              onChange={(e) => setNewTaskCategory(e.target.value)}
            >
              {TASK_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <button
              onClick={addTask}
              className="shrink-0 min-h-[48px] px-4 rounded-xl bg-orange-500 active:bg-orange-600 text-white flex items-center gap-1 font-semibold"
            >
              <Plus size={20} /> Добавить
            </button>
          </div>
        </div>

        {TASK_CATEGORIES.map((cat) => {
          const items = tasksToday.filter((t) => t.category === cat.key)
          if (items.length === 0) return null
          return (
            <div key={cat.key} className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{cat.label}</p>
              {items.map((t) => (
                <div key={t.id} className="flex items-center gap-2 mb-2">
                  <div className="flex-1">
                    <CheckRow label={t.text} checked={t.done} onChange={() => toggleTask(t.id)} />
                  </div>
                  <button
                    onClick={() => removeTask(t.id)}
                    className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-slate-100 active:bg-slate-200 text-slate-500"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )
        })}
        {tasksToday.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-3">Задач на сегодня пока нет</p>
        )}
      </Section>

      <Section title="Стратегические запасы" icon={PackageCheck}>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {STRATEGIC_CATEGORIES.map((cat) => {
            const check = stockTracker.checks?.[cat.key]
            const checkedToday = check?.lastChecked === today
            const daysSince = check?.lastChecked
              ? daysBetween(parseLocalDate(check.lastChecked), now)
              : null
            const stale = daysSince !== null && daysSince >= 3
            return (
              <button
                key={cat.key}
                onClick={() => toggleStockChecked(cat.key)}
                className={`min-h-[64px] rounded-xl border-2 px-3 py-2 text-left transition-colors ${
                  checkedToday
                    ? 'bg-green-50 border-green-400'
                    : stale
                    ? 'bg-red-50 border-red-300'
                    : 'bg-white border-slate-200'
                }`}
              >
                <p className="font-semibold text-slate-800 text-sm">{cat.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {checkedToday
                    ? 'Проверено сегодня'
                    : check?.lastChecked
                    ? `Проверено ${daysSince} дн. назад`
                    : 'Ещё не проверялось'}
                </p>
              </button>
            )
          })}
        </div>

        <Field label="Учёт свежих овощей / фруктов — текущие закупки">
          <div className="flex gap-2">
            <input
              className={inputClass + ' flex-1'}
              placeholder="Продукт"
              value={produceForm.name}
              onChange={(e) => setProduceForm((p) => ({ ...p, name: e.target.value }))}
            />
            <input
              className={inputClass + ' w-24'}
              placeholder="Кол-во"
              value={produceForm.qty}
              onChange={(e) => setProduceForm((p) => ({ ...p, qty: e.target.value }))}
            />
            <button
              onClick={addProduce}
              className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-orange-500 active:bg-orange-600 text-white"
            >
              <Plus size={20} />
            </button>
          </div>
        </Field>

        {(stockTracker.produce || []).length > 0 && (
          <ul className="divide-y divide-slate-100">
            {stockTracker.produce.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-700">
                  {p.name} {p.qty && <span className="text-slate-400">· {p.qty}</span>}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{formatRu(parseLocalDate(p.date))}</span>
                  <button onClick={() => removeProduce(p.id)} className="w-8 h-8 flex items-center justify-center text-slate-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Сроки и напоминания" icon={CalendarClock}>
        <div className="flex flex-col gap-2">
          <DeadlineRow label="Подача меню на след. месяц" date={menuDl.label} daysLeft={menuDl.daysLeft} />
          <DeadlineRow label="Финансовый отчёт (аванс)" date={financeDl.label} daysLeft={financeDl.daysLeft} />
        </div>
      </Section>

      <Section title="Закрытие смены" icon={Sunset}>
        <CheckRow
          label="Остатки упакованы, подписаны (дата/содержимое)"
          checked={day.leftoversPacked}
          onChange={(v) => updateDay({ leftoversPacked: v })}
        />
        <CheckRow
          label="Базовая уборка завершена"
          checked={day.cleaningDone}
          onChange={(v) => updateDay({ cleaningDone: v })}
        />
      </Section>
    </div>
  )
}

function DeadlineRow({ label, date, daysLeft }) {
  const color = urgencyColor(daysLeft)
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">до {date}</p>
      </div>
      <Badge color={color}>{daysLeft <= 0 ? 'Сегодня!' : `${daysLeft} дн.`}</Badge>
    </div>
  )
}
