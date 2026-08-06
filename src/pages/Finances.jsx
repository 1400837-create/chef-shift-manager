import { useMemo, useState } from 'react'
import { Wallet, Receipt, Plus, Camera, Send, Copy, Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { Section, Field, inputClass, BigButton, PrintButton, ConfirmDeleteButton } from '../components/UI'
import { RECEIPT_CATEGORIES } from '../utils/constants'
import { formatRu, parseLocalDate, monthKey, MONTHS_RU } from '../utils/dateUtils'
import { compressToDataUrl } from '../utils/imageCompress'
import { sanitizeDecimal } from '../utils/number'
import { downloadCsv } from '../utils/csv'

export default function Finances({ advance, setAdvance, receipts, setReceipts, staffName }) {
  const now = new Date()

  const [receiptForm, setReceiptForm] = useState({
    amount: '', category: 'vegetables', date: now.toISOString().slice(0, 10), fileName: '', photoDataUrl: null,
  })
  const [formError, setFormError] = useState(null)
  const [copyMessage, setCopyMessage] = useState(null)
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [photoError, setPhotoError] = useState(null)
  const [monthOffset, setMonthOffset] = useState(0)

  // Receipts entered since the advance amount was last set count against it —
  // entering a new amount is what starts a fresh count, there's no fixed
  // calendar period anymore.
  const sinceAdvanceReceipts = useMemo(
    () => receipts.filter((r) => (r.enteredAt || 0) >= (advance.updatedAt || 0)),
    [receipts, advance.updatedAt]
  )
  const spent = sinceAdvanceReceipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  const remaining = (Number(advance.budget) || 0) - spent

  const viewedMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const viewedMonthKey = monthKey(viewedMonth)
  const monthLabel = `${MONTHS_RU[viewedMonth.getMonth()]} ${viewedMonth.getFullYear()}`
  const monthReceipts = useMemo(
    () => receipts.filter((r) => (r.date || '').slice(0, 7) === viewedMonthKey)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [receipts, viewedMonthKey]
  )

  function setBudget(value) {
    setAdvance({ budget: value, updatedAt: Date.now() })
  }

  // Shared by both the "Камера" and "Галерея" file inputs — capture="environment"
  // on a file input is unreliable across browsers (some force the camera and skip
  // the file picker entirely, others do the opposite), so instead of one input
  // relying on that, there are two separate inputs/buttons and this one handler.
  async function handleReceiptFile(e) {
    const rawFile = e.target.files?.[0] || null
    e.target.value = ''
    if (!rawFile) return
    setPhotoError(null)
    setPhotoProcessing(true)
    try {
      const dataUrl = await compressToDataUrl(rawFile)
      if (dataUrl) {
        setReceiptForm((f) => ({ ...f, photoDataUrl: dataUrl, fileName: rawFile.name }))
      } else {
        setReceiptForm((f) => ({ ...f, photoDataUrl: null, fileName: '' }))
        setPhotoError('Не удалось обработать это фото — чек можно сохранить и без него.')
      }
    } catch {
      setReceiptForm((f) => ({ ...f, photoDataUrl: null, fileName: '' }))
      setPhotoError('Не удалось обработать это фото — чек можно сохранить и без него.')
    } finally {
      setPhotoProcessing(false)
    }
  }

  function addReceipt() {
    if (!receiptForm.amount) {
      setFormError('Укажите сумму чека — без неё чек не сохранится.')
      return
    }
    setFormError(null)
    const entry = {
      id: Date.now(),
      enteredAt: Date.now(),
      date: receiptForm.date,
      amount: receiptForm.amount,
      category: receiptForm.category,
      fileName: receiptForm.fileName,
      photo: receiptForm.photoDataUrl || null,
      by: staffName || undefined,
    }
    setReceipts((prev) => [entry, ...prev])
    setReceiptForm({ amount: '', category: 'vegetables', date: now.toISOString().slice(0, 10), fileName: '', photoDataUrl: null })
  }

  function removeReceipt(id) {
    setReceipts((prev) => prev.filter((r) => r.id !== id))
  }

  function viewPhoto(dataUrl) {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!doctype html><title>Чек</title><body style="margin:0;background:#111;display:flex;justify-content:center;"><img src="${dataUrl}" style="max-width:100%;height:auto;"></body>`)
    win.document.close()
  }

  function buildReportText() {
    const lines = [
      `Финансовый отчёт на ${formatRu(now)}`,
      `Аванс: ${advance.budget || 0}`,
      `Потрачено: ${spent}`,
      `Остаток: ${remaining}`,
      '',
      'Чеки:',
      ...sinceAdvanceReceipts.map(
        (r) => `- ${formatRu(parseLocalDate(r.date))} · ${RECEIPT_CATEGORIES.find((c) => c.key === r.category)?.label} · ${r.amount}`
      ),
    ]
    return lines.join('\n')
  }

  function sendReport() {
    const body = encodeURIComponent(buildReportText())
    const subject = encodeURIComponent(`Финансовый отчёт — ${formatRu(now)}`)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  function exportMonthReceiptsCsv() {
    const rows = [['Дата', 'Категория', 'Сумма', 'Кто', 'Файл']]
    monthReceipts.forEach((r) => {
      rows.push([
        r.date,
        RECEIPT_CATEGORIES.find((c) => c.key === r.category)?.label || r.category,
        r.amount,
        r.by || '',
        r.fileName || '',
      ])
    })
    downloadCsv(`Чеки_${viewedMonthKey}.csv`, rows)
  }

  async function copyReport() {
    const text = buildReportText()
    try {
      await navigator.clipboard.writeText(text)
      setCopyMessage('Текст отчёта скопирован — вставьте его в письмо, WhatsApp или куда нужно.')
    } catch {
      setCopyMessage('Не удалось скопировать автоматически. Откройте консоль или попробуйте кнопку «Отправить» ещё раз.')
    }
    setTimeout(() => setCopyMessage(null), 5000)
  }

  return (
    <div className="pb-4">
      <Section title="Аванс" icon={Wallet}>
        <Field label="Сумма аванса">
          <input
            type="text"
            inputMode="decimal"
            className={inputClass}
            value={advance.budget}
            onChange={(e) => setBudget(sanitizeDecimal(e.target.value))}
            placeholder="0"
          />
        </Field>
        <p className="text-xs text-slate-400 mt-1">
          Введите новую сумму, когда получите новый аванс — «Потрачено»/«Остаток» посчитаются заново от этого момента.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 p-3 text-center">
            <p className="text-xs text-slate-500">Потрачено (авто, по чекам)</p>
            <p className="font-bold text-slate-800 dark:text-slate-100 text-lg">{spent}</p>
          </div>
          <div className={`rounded-xl border p-3 text-center ${remaining < 0 ? 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700' : 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700'}`}>
            <p className="text-xs text-slate-500">Остаток</p>
            <p className={`font-bold text-lg ${remaining < 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>{remaining}</p>
          </div>
        </div>
      </Section>

      <Section title="Добавить чек" icon={Receipt}>
        <div className="flex gap-2">
          <Field label="Сумма">
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              value={receiptForm.amount}
              onChange={(e) => setReceiptForm((f) => ({ ...f, amount: sanitizeDecimal(e.target.value) }))}
              placeholder="0.00"
            />
          </Field>
          <Field label="Дата">
            <input
              type="date"
              className={inputClass}
              value={receiptForm.date}
              onChange={(e) => setReceiptForm((f) => ({ ...f, date: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Категория">
          <select
            className={inputClass}
            value={receiptForm.category}
            onChange={(e) => setReceiptForm((f) => ({ ...f, category: e.target.value }))}
          >
            {RECEIPT_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Фото чека (необязательно)">
          {receiptForm.fileName && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2 truncate">{receiptForm.fileName}</p>
          )}
          <div className="flex gap-2">
            <label className="flex-1 flex items-center justify-center gap-2 min-h-[48px] px-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800">
              <Camera size={20} />
              <span className="text-sm">{photoProcessing ? 'Обработка…' : 'Камера'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleReceiptFile}
              />
            </label>
            <label className="flex-1 flex items-center justify-center gap-2 min-h-[48px] px-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800">
              <ImageIcon size={20} />
              <span className="text-sm">{photoProcessing ? 'Обработка…' : 'Галерея'}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleReceiptFile}
              />
            </label>
          </div>
        </Field>
        {photoError && (
          <p className="text-sm text-yellow-800 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-xl px-3 py-2 mb-2">
            {photoError}
          </p>
        )}
        {formError && (
          <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 mb-2">
            {formError}
          </p>
        )}
        <BigButton onClick={addReceipt} icon={Plus} disabled={photoProcessing}>
          {photoProcessing ? 'Обработка фото…' : 'Добавить чек'}
        </BigButton>
        <p className="text-xs text-slate-400 mt-2">
          Сумма — обязательна. Фото — необязательно; чек сохранится в любом случае.
        </p>
      </Section>

      <Section
        title={`Чеки за ${monthLabel} (${monthReceipts.length})`}
        icon={Receipt}
        right={monthReceipts.length > 0 && <PrintButton onClick={exportMonthReceiptsCsv} label="CSV" />}
      >
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setMonthOffset((o) => o - 1)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            <ChevronLeft size={18} />
          </button>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{monthLabel}</p>
          <button onClick={() => setMonthOffset((o) => o + 1)} disabled={monthOffset >= 0} className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40">
            <ChevronRight size={18} />
          </button>
        </div>
        {monthReceipts.length === 0 && <p className="text-sm text-slate-400 text-center py-3">Чеков пока нет</p>}
        <ul className="divide-y divide-slate-100">
          {monthReceipts.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {RECEIPT_CATEGORIES.find((c) => c.key === r.category)?.label} · {r.amount}
                </p>
                <p className="text-xs text-slate-400">
                  {formatRu(parseLocalDate(r.date))} {r.fileName && `· ${r.fileName}`} {r.by && `· ${r.by}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {r.photo && (
                  <button onClick={() => viewPhoto(r.photo)} className="w-9 h-9 flex items-center justify-center text-slate-400">
                    <ImageIcon size={16} />
                  </button>
                )}
                <ConfirmDeleteButton onConfirm={() => removeReceipt(r.id)} />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <div className="flex gap-2">
        <BigButton onClick={sendReport} icon={Send} color="slate">Отправить отчёт</BigButton>
        <BigButton onClick={copyReport} icon={Copy} color="outline" full={false}>Копировать</BigButton>
      </div>
      {copyMessage && (
        <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mt-2">
          {copyMessage}
        </p>
      )}
      <p className="text-xs text-slate-400 mt-2">
        Отчёт — по текущему авансу (все чеки с момента последнего ввода суммы), а не по месяцу из списка ниже.
        Если кнопка «Отправить» не открывает почту (бывает в некоторых мобильных браузерах),
        используйте «Копировать» и вставьте текст вручную в письмо или мессенджер.
      </p>
    </div>
  )
}
