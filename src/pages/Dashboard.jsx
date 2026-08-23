import { useMemo, useState } from 'react'
import { ClipboardList, ListChecks, AlertTriangle, UtensilsCrossed, Plus, Check, CalendarClock, Download, Upload, LayoutDashboard, SprayCan } from 'lucide-react'
import { Section, CheckRow, Badge, Field, inputClass, BigButton, PrintButton, ConfirmDeleteButton, UndoRedoBar } from '../components/UI'
import { TASK_CATEGORIES, MY_TASK_CATEGORIES } from '../utils/constants'
import { todayKey, formatRu, monthKey, parseLocalDate, daysBetween, startOfDay } from '../utils/dateUtils'
import { menuDeadlineInfo, urgencyColor } from '../utils/deadlines'
import { downloadBackup, parseBackupFile, applyBackup } from '../utils/backup'
import { printReport } from '../utils/printReport'
import { computeBalance } from '../utils/stockBalance'
import { coursesForDay } from '../utils/menuCourses'
import Cleaning from './Cleaning'

export default function Dashboard({
  myTasks, setMyTasks,
  kuchenhilfeTasks, setKuchenhilfeTasks,
  recountCatalog, recounts, purchases, productions, catalogWaste, recipes, plannedPurchases,
  menuData, onNavigate,
  dailyCleaning, setDailyCleaning, weeklyCleaning, setWeeklyCleaning, staffName,
  dashboardHistory, cleaningHistory,
}) {
  // Not persisted — Уборка used to be its own top-level tab (which always
  // reset to "today"/"this week" on every visit anyway, since Cleaning's own
  // offsets are plain useState too), so landing back on Обзор each time
  // Дашборд is revisited isn't a behavior change from before.
  const [dashTab, setDashTab] = useState('overview')
  const today = todayKey()
  const now = new Date()
  const tasksToday = kuchenhilfeTasks[today] || []

  const [newTaskText, setNewTaskText] = useState('')
  const [newTaskCategory, setNewTaskCategory] = useState('prep')

  const [newMyTaskText, setNewMyTaskText] = useState('')
  const [newMyTaskCategory, setNewMyTaskCategory] = useState(MY_TASK_CATEGORIES[0].key)
  const [newMyTaskDeadline, setNewMyTaskDeadline] = useState('')

  function addMyTask() {
    if (!newMyTaskText.trim()) return
    const task = {
      id: Date.now(),
      category: newMyTaskCategory,
      text: newMyTaskText.trim(),
      done: false,
      deadline: newMyTaskDeadline || null,
    }
    setMyTasks((prev) => [...prev, task])
    setNewMyTaskText('')
    setNewMyTaskDeadline('')
  }

  function toggleMyTask(id) {
    setMyTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }

  function removeMyTask(id) {
    setMyTasks((prev) => prev.filter((t) => t.id !== id))
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

  const lowStockItems = useMemo(() => {
    return recountCatalog
      .filter((product) => !product.archived)
      .map((product) => ({ product, ...computeBalance(product.id, { recounts, purchases, productions, recipes, waste: catalogWaste }, now) }))
      .filter((row) => {
        const min = Number(row.product.minQty)
        return min > 0 && row.balance !== null && row.balance <= min &&
          !plannedPurchases.some((p) => String(p.productId) === String(row.product.id))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recountCatalog, recounts, purchases, productions, recipes, plannedPurchases, catalogWaste])

  const todayCourses = useMemo(() => {
    const dayData = menuData[monthKey(now)]?.[now.getDate()]
    if (!dayData) return []
    return coursesForDay(dayData).filter((c) => c.dish)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuData])

  const menuDl = menuDeadlineInfo(now)

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
        setImportMessage('Не удалось прочитать файл — это не резервная копия LA CHEF.')
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
    printReport({
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
      <div
        className="sticky z-20 -mx-3 px-3 pt-2 pb-1.5 mb-2 bg-slate-100 dark:bg-slate-950 flex gap-1.5 overflow-x-auto"
        style={{ top: 'var(--app-header-h, 64px)' }}
      >
        <button
          onClick={() => setDashTab('overview')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            dashTab === 'overview' ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          <LayoutDashboard size={16} /> Обзор
        </button>
        <button
          onClick={() => setDashTab('cleaning')}
          className={`shrink-0 min-h-[48px] px-3.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${
            dashTab === 'cleaning' ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          <SprayCan size={16} /> Уборка
        </button>
      </div>

      <UndoRedoBar {...(dashTab === 'cleaning' ? cleaningHistory : dashboardHistory)} />

      {dashTab === 'cleaning' && (
        <Cleaning
          dailyCleaning={dailyCleaning}
          setDailyCleaning={setDailyCleaning}
          weeklyCleaning={weeklyCleaning}
          setWeeklyCleaning={setWeeklyCleaning}
          staffName={staffName}
        />
      )}

      {dashTab === 'overview' && (
      <>
      <div className="rounded-2xl shadow-md border-2 border-orange-300 dark:border-orange-700 mb-4 overflow-hidden bg-white dark:bg-slate-800">
        <div className="flex items-center gap-2 px-4 py-3 bg-orange-500 dark:bg-orange-600">
          <ListChecks size={20} className="text-white shrink-0" />
          <h2 className="font-bold text-white text-[15px]">Мои задачи</h2>
        </div>
        <div className="p-3">
          <div className="flex flex-col gap-2 mb-3">
            <Field label="Новая задача">
              <input
                className={inputClass}
                placeholder="Например: заказать инвентарь"
                value={newMyTaskText}
                onChange={(e) => setNewMyTaskText(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <select
                  className={inputClass}
                  value={newMyTaskCategory}
                  onChange={(e) => setNewMyTaskCategory(e.target.value)}
                >
                  {MY_TASK_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="w-36 shrink-0">
                <input
                  type="date"
                  className={inputClass}
                  value={newMyTaskDeadline}
                  onChange={(e) => setNewMyTaskDeadline(e.target.value)}
                />
              </div>
            </div>
            <BigButton onClick={addMyTask} icon={Plus} disabled={!newMyTaskText.trim()}>Добавить задачу</BigButton>
          </div>

          {MY_TASK_CATEGORIES.map((cat) => {
            const items = myTasks.filter((t) => t.category === cat.key)
            if (items.length === 0) return null
            return (
              <div key={cat.key} className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{cat.label}</p>
                {items.map((t) => (
                  <MyTaskRow key={t.id} task={t} onToggle={() => toggleMyTask(t.id)} onRemove={() => removeMyTask(t.id)} />
                ))}
              </div>
            )
          })}
          {myTasks.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-3">Задач пока нет</p>
          )}
        </div>
      </div>

      <Section title="Меню на сегодня" icon={UtensilsCrossed}>
        {todayCourses.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-2">Меню на сегодня ещё не заполнено</p>
        ) : (
          <div className="flex flex-col gap-1.5 mb-3">
            {todayCourses.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-500 dark:text-slate-400 shrink-0">{c.label}</span>
                <span className="font-medium text-slate-800 dark:text-slate-100 text-right truncate">
                  {c.dish}{c.qty ? ` — ${c.qty}` : ''}{c.kosher ? ' ✡' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        <BigButton onClick={() => onNavigate('menu')} color="outline">Открыть меню</BigButton>
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
            <div className="flex-1 min-w-0">
              <select
                className={inputClass}
                value={newTaskCategory}
                onChange={(e) => setNewTaskCategory(e.target.value)}
              >
                {TASK_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
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

      <Section title="Сроки и напоминания" icon={CalendarClock}>
        <div className="flex flex-col gap-2">
          <DeadlineRow label="Подача меню на след. месяц" date={menuDl.label} daysLeft={menuDl.daysLeft} />
        </div>
      </Section>

      <Section
        title="Мало на складе"
        icon={AlertTriangle}
        right={lowStockItems.length > 0 && <Badge color="red">{lowStockItems.length}</Badge>}
      >
        {lowStockItems.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-2">Низких остатков нет</p>
        ) : (
          <div className="flex flex-col gap-2 mb-2">
            {lowStockItems.slice(0, 6).map((row) => (
              <div
                key={row.product.id}
                className="flex items-center justify-between gap-2 rounded-xl border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 px-3 py-2"
              >
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{row.product.name}</p>
                <span className="text-xs font-semibold text-red-700 dark:text-red-300 shrink-0">{row.balance} {row.product.unit}</span>
              </div>
            ))}
            {lowStockItems.length > 6 && (
              <p className="text-xs text-slate-400 text-center">
                Показаны первые 6 из {lowStockItems.length} — остальные в «Закупке»
              </p>
            )}
          </div>
        )}
        {lowStockItems.length > 0 && (
          <BigButton onClick={() => onNavigate('shopping')} color="red">Перейти в закупку</BigButton>
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
        <label className="flex items-center gap-2 min-h-[48px] px-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 cursor-pointer active:bg-slate-50">
          <Upload size={18} />
          <span className="text-sm">Загрузить копию из файла</span>
          <input type="file" accept="application/json" className="hidden" onChange={handleBackupFileSelected} />
        </label>

        {importPreview && (
          <div className="mt-3 rounded-xl border-2 border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 p-3">
            <p className="text-sm text-slate-700 dark:text-slate-200 mb-2">
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
          <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mt-2">
            {importMessage}
          </p>
        )}
      </Section>
      </>
      )}
    </div>
  )
}

function DeadlineRow({ label, date, daysLeft }) {
  const color = urgencyColor(daysLeft)
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
        <p className="text-xs text-slate-400">до {date}</p>
      </div>
      <Badge color={color}>{daysLeft < 0 ? 'Просрочено' : daysLeft === 0 ? 'Сегодня!' : `${daysLeft} дн.`}</Badge>
    </div>
  )
}

// Same checkbox-row look as the shared CheckRow component, but with room for
// a deadline badge — CheckRow's sublabel slot is fixed green (built for "✓
// done by so-and-so"), not suitable for an urgency color, so this is its own
// small component instead of bending CheckRow to a second purpose.
function MyTaskRow({ task, onToggle, onRemove }) {
  const urgency = !task.done && task.deadline
    ? { daysLeft: daysBetween(startOfDay(new Date()), parseLocalDate(task.deadline)) }
    : null
  const urgencyColorValue = urgency ? urgencyColor(urgency.daysLeft) : null

  return (
    <div className="flex items-center gap-2 mb-2">
      <label
        className={`flex-1 flex items-center gap-3 min-h-[52px] px-3 py-2.5 rounded-xl border cursor-pointer select-none active:scale-[0.99] transition-all ${
          task.done
            ? 'bg-green-50 border-green-300 dark:bg-green-900/30 dark:border-green-700'
            : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'
        }`}
      >
        <input type="checkbox" checked={task.done} onChange={onToggle} className="sr-only" />
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
        </span>
        {urgency && (
          <Badge color={urgencyColorValue}>
            {urgency.daysLeft < 0 ? 'Просрочено' : urgency.daysLeft === 0 ? 'Сегодня' : `${urgency.daysLeft} дн.`}
          </Badge>
        )}
      </label>
      <ConfirmDeleteButton onConfirm={onRemove} size="w-11 h-11" iconSize={18} />
    </div>
  )
}
