import { useMemo, useState } from 'react'
import { Wallet, Receipt, Plus, Camera, Send, Copy, Image as ImageIcon } from 'lucide-react'
import { Section, Field, inputClass, Badge, BigButton, ConfirmDeleteButton } from '../components/UI'
import { RECEIPT_CATEGORIES } from '../utils/constants'
import { biweekKey, formatRu, parseLocalDate } from '../utils/dateUtils'
import { financeDeadlineInfo, urgencyColor } from '../utils/deadlines'
import { savePhoto, getPhoto, deletePhoto } from '../utils/photoStore'
import { compressImage } from '../utils/imageCompress'

export default function Finances({ advances, setAdvances, receipts, setReceipts }) {
  const now = new Date()
  const periodKey = biweekKey(now)
  const dl = financeDeadlineInfo(now)
  const advance = advances[periodKey] || { budget: '' }

  const [receiptForm, setReceiptForm] = useState({
    amount: '', category: 'vegetables', date: now.toISOString().slice(0, 10), fileName: '', file: null,
  })
  const [formError, setFormError] = useState(null)
  const [copyMessage, setCopyMessage] = useState(null)
  const [photoProcessing, setPhotoProcessing] = useState(false)

  const periodReceipts = useMemo(
    () => receipts.filter((r) => r.periodKey === periodKey),
    [receipts, periodKey]
  )
  const spent = periodReceipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  const remaining = (Number(advance.budget) || 0) - spent

  function setBudget(value) {
    setAdvances((prev) => ({ ...prev, [periodKey]: { ...advance, budget: value } }))
  }

  async function addReceipt() {
    if (!receiptForm.amount) {
      setFormError('Укажите сумму чека — без неё чек не сохранится.')
      return
    }
    setFormError(null)
    const id = Date.now()
    const entry = {
      id,
      periodKey,
      date: receiptForm.date,
      amount: receiptForm.amount,
      category: receiptForm.category,
      fileName: receiptForm.fileName,
      hasPhoto: !!receiptForm.file,
    }
    setReceipts((prev) => [entry, ...prev])
    if (receiptForm.file) {
      try {
        await savePhoto(id, receiptForm.file)
      } catch {
        // IndexedDB unavailable (private mode etc.) — receipt still saved, just without the photo
      }
    }
    setReceiptForm({ amount: '', category: 'vegetables', date: now.toISOString().slice(0, 10), fileName: '', file: null })
  }

  function removeReceipt(id, hasPhoto) {
    setReceipts((prev) => prev.filter((r) => r.id !== id))
    if (hasPhoto) deletePhoto(id).catch(() => {})
  }

  async function viewPhoto(id) {
    try {
      const file = await getPhoto(id)
      if (!file) return
      const url = URL.createObjectURL(file)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch {
      // ignore — nothing to show
    }
  }

  function buildReportText() {
    const lines = [
      `Финансовый отчёт за период до ${dl.label}`,
      `Аванс: ${advance.budget || 0}`,
      `Потрачено: ${spent}`,
      `Остаток: ${remaining}`,
      '',
      'Чеки:',
      ...periodReceipts.map(
        (r) => `- ${formatRu(parseLocalDate(r.date))} · ${RECEIPT_CATEGORIES.find((c) => c.key === r.category)?.label} · ${r.amount}`
      ),
    ]
    return lines.join('\n')
  }

  function sendReport() {
    const body = encodeURIComponent(buildReportText())
    const subject = encodeURIComponent(`Финансовый отчёт — ${dl.label}`)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
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
      <Section title="Аванс на 2 недели" icon={Wallet}>
        <Field label="Сумма аванса на текущий период">
          <input
            type="number"
            className={inputClass}
            value={advance.budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="0"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
            <p className="text-xs text-slate-500">Потрачено (авто, по чекам)</p>
            <p className="font-bold text-slate-800 text-lg">{spent}</p>
          </div>
          <div className={`rounded-xl border p-3 text-center ${remaining < 0 ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
            <p className="text-xs text-slate-500">Остаток</p>
            <p className={`font-bold text-lg ${remaining < 0 ? 'text-red-700' : 'text-green-700'}`}>{remaining}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <p className="text-sm text-slate-500">Отчёт до {dl.label}</p>
          <Badge color={urgencyColor(dl.daysLeft)}>{dl.daysLeft <= 0 ? 'Сегодня!' : `${dl.daysLeft} дн.`}</Badge>
        </div>
      </Section>

      <Section title="Добавить чек" icon={Receipt}>
        <div className="flex gap-2">
          <Field label="Сумма">
            <input
              type="number"
              className={inputClass}
              value={receiptForm.amount}
              onChange={(e) => setReceiptForm((f) => ({ ...f, amount: e.target.value }))}
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
        <Field label="Фото чека">
          <label className="flex items-center gap-2 min-h-[48px] px-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 cursor-pointer active:bg-slate-50">
            <Camera size={20} />
            <span className="text-sm">
              {photoProcessing ? 'Обработка фото…' : receiptForm.fileName || 'Сфотографировать / выбрать чек'}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const rawFile = e.target.files?.[0] || null
                e.target.value = ''
                if (!rawFile) return
                setPhotoProcessing(true)
                try {
                  const compressed = await compressImage(rawFile)
                  setReceiptForm((f) => ({ ...f, file: compressed, fileName: rawFile.name }))
                } finally {
                  setPhotoProcessing(false)
                }
              }}
            />
          </label>
        </Field>
        {formError && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">
            {formError}
          </p>
        )}
        <BigButton onClick={addReceipt} icon={Plus} disabled={photoProcessing}>
          {photoProcessing ? 'Обработка фото…' : 'Добавить чек'}
        </BigButton>
        <p className="text-xs text-slate-400 mt-2">
          Сумма — обязательна. Фото можно приложить, но само по себе без суммы чек не сохранится.
        </p>
      </Section>

      <Section title={`Чеки за текущий период (${periodReceipts.length})`} icon={Receipt}>
        {periodReceipts.length === 0 && <p className="text-sm text-slate-400 text-center py-3">Чеков пока нет</p>}
        <ul className="divide-y divide-slate-100">
          {periodReceipts.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {RECEIPT_CATEGORIES.find((c) => c.key === r.category)?.label} · {r.amount}
                </p>
                <p className="text-xs text-slate-400">
                  {formatRu(parseLocalDate(r.date))} {r.fileName && `· ${r.fileName}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {r.hasPhoto && (
                  <button onClick={() => viewPhoto(r.id)} className="w-9 h-9 flex items-center justify-center text-slate-400">
                    <ImageIcon size={16} />
                  </button>
                )}
                <ConfirmDeleteButton onConfirm={() => removeReceipt(r.id, r.hasPhoto)} />
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
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-2">
          {copyMessage}
        </p>
      )}
      <p className="text-xs text-slate-400 mt-2">
        Если кнопка «Отправить» не открывает почту (бывает в некоторых мобильных браузерах),
        используйте «Копировать» и вставьте текст вручную в письмо или мессенджер.
      </p>
    </div>
  )
}
