import { useMemo, useState } from 'react'
import { Printer, ClipboardCopy, ClipboardPaste, ChevronDown, ChevronRight } from 'lucide-react'
import { inputClass, BigButton } from '../../components/UI'
import { printReport } from '../../utils/printReport'
import { commitChange, newId } from '../../plan/planStore'
import { mondayOf, addDaysKey, weekTitle } from '../../plan/calc'
import { LOCALE } from '../../plan/lang'
import {
  planDates, shiftsTsv, dishesTsv, hoursTsv, parsePaste, buildImportUpdates, buildPrintPayload,
} from '../../plan/exchange'
import { todayKey } from '../../utils/dateUtils'
import { Message } from './shared'

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // older / non-secure contexts: fall back to a temporary textarea
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  ta.remove()
  if (!ok) throw new Error('Не удалось скопировать — разрешите доступ к буферу обмена.')
}

const LANG_OPTIONS = [
  { key: 'ru', label: 'По-русски' },
  { key: 'de', label: 'Auf Deutsch' },
  { key: 'both', label: 'Русский + Deutsch' },
]

export default function ExchangePanel({ plan, data, ctx, shifts }) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState('all')
  const [printLang, setPrintLang] = useState('')
  const [msg, setMsg] = useState(null)
  const [kind, setKind] = useState('shifts')
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState(null)

  const weeks = useMemo(() => {
    const set = new Set(planDates(data).map(mondayOf))
    return [...set].sort()
  }, [data])

  const range = period === 'all' ? {} : { from: period, to: addDaysKey(period, 6) }
  const lang = printLang || ctx.lang
  const defaultYear = plan.month ? Number(plan.month.slice(0, 4)) : Number(todayKey().slice(0, 4))

  function print() {
    setMsg(null)
    printReport(buildPrintPayload({ plan, data, ctx, shifts, lang, ...range }))
  }

  async function copy(builder, okText) {
    try {
      await copyText(builder())
      setMsg({ type: 'ok', text: okText })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  function check() {
    setMsg(null)
    if (!text.trim()) {
      setParsed(null)
      return setMsg({ type: 'error', text: 'Сначала вставьте данные из таблицы.' })
    }
    setParsed(parsePaste(kind, text, { staffList: ctx.staffList, recipeList: ctx.recipeList, defaultYear }))
  }

  function doImport() {
    if (!parsed || !parsed.ok.length) return
    const coll = `planData/${plan.id}`
    const updates = buildImportUpdates(kind, parsed.ok, data, plan.id, () => newId(coll))
    commitChange({
      coll,
      action: 'create',
      entity: 'импорт',
      id: plan.id,
      label: `${plan.title || 'план'}: ${parsed.ok.length} ${kind === 'shifts' ? 'смен' : 'строк с блюдами'}`,
      updates,
    })
    setMsg({ type: 'ok', text: `Добавлено строк: ${parsed.ok.length}.` })
    setParsed(null)
    setText('')
  }

  return (
    <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-4 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left bg-slate-50 dark:bg-slate-900/40"
      >
        {open ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
        <Printer size={18} className="text-slate-500 dark:text-slate-400" />
        <span className="font-semibold text-slate-800 dark:text-slate-100 text-[15px]">Печать и обмен с таблицами</span>
      </button>
      {open && (
        <div className="p-3">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <select className={inputClass} value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="all">Весь план</option>
              {weeks.map((w) => <option key={w} value={w}>Неделя {weekTitle(w, LOCALE.ru)}</option>)}
            </select>
            <select className={inputClass} value={lang} onChange={(e) => setPrintLang(e.target.value)}>
              {LANG_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <BigButton onClick={print} icon={Printer} disabled={weeks.length === 0}>Печать</BigButton>

          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-4 mb-1.5">Скопировать для Google Таблиц</p>
          <p className="text-xs text-slate-500 mb-2">Скопируется выбранный выше период. Откройте таблицу, выберите ячейку и вставьте (Ctrl+V).</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <BigButton color="outline" icon={ClipboardCopy} onClick={() => copy(() => shiftsTsv(data, ctx, range.from, range.to), 'Смены скопированы')}>Смены</BigButton>
            <BigButton color="outline" icon={ClipboardCopy} onClick={() => copy(() => dishesTsv(data, ctx, range.from, range.to), 'Блюда скопированы')}>Блюда</BigButton>
            <BigButton
              color="outline"
              icon={ClipboardCopy}
              onClick={() => copy(() => {
                const dates = planDates(data, range.from, range.to)
                return hoursTsv(shifts, ctx.staffList, dates[0] || '0000-00-00', dates[dates.length - 1] || '0000-00-00')
              }, 'Часы скопированы')}
            >
              Часы
            </BigButton>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-4 mb-1.5">Вставить из таблицы</p>
          <p className="text-xs text-slate-500 mb-2">
            {kind === 'shifts'
              ? 'Колонки: Дата · Сотрудник · Начало · Конец (необязательно: Факт начало · Факт конец). Сотрудник должен быть в справочнике — по русскому или немецкому имени.'
              : 'Колонки: Дата · Приём · Время · Персон · Блюдо. Блюдо, совпадающее по названию с рецептом, привяжется к нему.'}
            {' '}Первая строка может быть заголовком. Данные добавляются к плану, ничего не заменяется.
          </p>
          <select className={inputClass + ' mb-2'} value={kind} onChange={(e) => { setKind(e.target.value); setParsed(null) }}>
            <option value="shifts">Смены</option>
            <option value="dishes">Блюда</option>
          </select>
          <textarea
            className={inputClass + ' min-h-[110px] font-mono text-xs'}
            placeholder="Вставьте сюда ячейки из Google Таблиц"
            value={text}
            onChange={(e) => { setText(e.target.value); setParsed(null) }}
          />
          <div className="mt-2">
            <BigButton color="outline" icon={ClipboardPaste} onClick={check}>Проверить</BigButton>
          </div>

          {parsed && (
            <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-sm text-slate-700 dark:text-slate-200">
                Готово к добавлению: <b>{parsed.ok.length}</b>
                {parsed.bad.length > 0 && <> · пропущено: <b className="text-red-600">{parsed.bad.length}</b></>}
              </p>
              {parsed.bad.slice(0, 8).map((r) => (
                <p key={r.line} className="text-xs text-red-600 mt-1">Строка {r.line}: {r.error}</p>
              ))}
              {parsed.bad.length > 8 && <p className="text-xs text-slate-400 mt-1">…и ещё {parsed.bad.length - 8}</p>}
              <div className="mt-2">
                <BigButton onClick={doImport} disabled={parsed.ok.length === 0}>Добавить в план</BigButton>
              </div>
            </div>
          )}
          <Message msg={msg} />
        </div>
      )}
    </section>
  )
}
