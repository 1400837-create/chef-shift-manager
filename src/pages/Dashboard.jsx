import { useState } from 'react'
import { ClipboardList, AlertTriangle, PackageCheck, Plus, CalendarClock, Sunrise, Sunset, History, Download, Upload } from 'lucide-react'
import { Section, CheckRow, Badge, Field, inputClass, BigButton, PrintButton, ConfirmDeleteButton } from '../components/UI'
import { STRATEGIC_CATEGORIES, TASK_CATEGORIES } from '../utils/constants'
import { todayKey, formatRu, daysBetween, parseLocalDate } from '../utils/dateUtils'
import { menuDeadlineInfo, financeDeadlineInfo, urgencyColor } from '../utils/deadlines'
import { downloadBackup, parseBackupFile, applyBackup } from '../utils/backup'

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

  const [showHistory, setShowHistory] = useState(false)
  const historyDays = Object.keys(shiftChecklist)
    .filter((k) => k !== today)
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, 14)

  const [importPreview, setImportPreview] = useState(null)
  const [importMessage, setImportMessage] = useState(null)

  function handleBackupFileSelected(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseBackupFile(reader.result)
        setImportPreview(parsed)
        setImportMessage(null)
      } catch {
        setImportPreview(null)
        setImportMessage('Не удалось прочитать файл — это не резервная копия Kitchen OS.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function confirmImport() {
    const count = applyBackup(importPreview)
    setImportPreview(null)
    setImportMessage(`Восстановлено разделов: ${count}. Обновляю приложение…`)
    setTimeout(() => window.location.reload(), 800)
  }

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
                  <ConfirmDeleteButton onConfirm={() => removeTask(t.id)} size="w-11 h-11" iconSize={18} />
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
                  <ConfirmDeleteButton onConfirm={() => removeProduce(p.id)} size="w-8 h-8" iconSize={14} />
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

      <Section
        title="История смен"
        icon={History}
        right={
          <button onClick={() => setShowHistory((v) => !v)} className="text-xs font-semibold text-orange-600">
            {showHistory ? 'Скрыть' : 'Показать'}
          </button>
        }
      >
        {showHistory && (
          historyDays.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-3">Пока нет прошлых смен</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {historyDays.map((dateKey) => {
                const d = shiftChecklist[dateKey]
                const tasks = kuchenhilfeTasks[dateKey] || []
                const tasksDone = tasks.filter((t) => t.done).length
                const openingDone = d.kitchenClean && d.tasksAssigned
                const closingDone = d.leftoversPacked && d.cleaningDone
                return (
                  <li key={dateKey} className="py-2.5 flex items-center justify-between">
                    <span className="text-sm text-slate-700">{formatRu(parseLocalDate(dateKey))}</span>
                    <div className="flex items-center gap-1.5">
                      {tasks.length > 0 && <Badge color="slate">Задачи {tasksDone}/{tasks.length}</Badge>}
                      <Badge color={openingDone ? 'green' : 'slate'}>Открытие</Badge>
                      <Badge color={closingDone ? 'green' : 'slate'}>Закрытие</Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        )}
      </Section>

      <Section title="Резервная копия данных" icon={Download}>
        <p className="text-xs text-slate-500 mb-3">
          Все данные хранятся только в этом браузере. Сохраните файл на телефон, чтобы не
          потерять их при смене устройства или очистке кеша.
        </p>
        <div className="flex gap-2 mb-2">
          <BigButton onClick={downloadBackup} icon={Download} color="outline">Скачать копию (JSON)</BigButton>
        </div>
        <label className="flex items-center gap-2 min-h-[48px] px-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 cursor-pointer active:bg-slate-50">
          <Upload size={18} />
          <span className="text-sm">Загрузить копию из файла</span>
          <input type="file" accept="application/json" className="hidden" onChange={handleBackupFileSelected} />
        </label>

        {importPreview && (
          <div className="mt-3 rounded-xl border-2 border-yellow-300 bg-yellow-50 p-3">
            <p className="text-sm text-slate-700 mb-2">
              Найден файл от {importPreview.exportedAt ? formatRu(new Date(importPreview.exportedAt)) : '—'},
              разделов данных: {Object.keys(importPreview.data).length}. Импорт{' '}
              <b>заменит текущие данные в приложении</b>. Продолжить?
            </p>
            <div className="flex gap-2">
              <BigButton onClick={confirmImport} color="red">Да, заменить данные</BigButton>
              <BigButton onClick={() => setImportPreview(null)} color="outline">Отмена</BigButton>
            </div>
          </div>
        )}
        {importMessage && (
          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-2">
            {importMessage}
          </p>
        )}
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
