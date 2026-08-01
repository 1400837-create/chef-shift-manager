import { useMemo, useState } from 'react'
import { Plus, ShoppingBasket, AlertTriangle, Upload, X } from 'lucide-react'
import { Section, inputClass, BigButton, PrintButton, ConfirmDeleteButton, ConfirmMarkButton } from '../components/UI'
import { formatRu, todayKey } from '../utils/dateUtils'
import { printReport } from '../utils/printReport'
import { computeBalance } from '../utils/stockBalance'
import { sanitizeDecimal } from '../utils/number'
import { parsePlannedPurchaseImport } from '../utils/importParsers'
import { uid } from '../utils/id'

export default function ShoppingList({
  recountCatalog, setRecountCatalog, recounts, purchases, productions, recipes,
  plannedPurchases, setPlannedPurchases, setPurchases,
}) {
  const [form, setForm] = useState({ productName: '', qty: '' })
  const [error, setError] = useState(null)
  const [showProductSuggestions, setShowProductSuggestions] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState(null)
  const now = new Date()

  const productSuggestions = useMemo(() => {
    const q = form.productName.trim().toLowerCase()
    if (q.length < 2) return []
    return recountCatalog.filter((p) => (p.name || '').toLowerCase().includes(q)).slice(0, 8)
  }, [form.productName, recountCatalog])

  function findProductByName(name) {
    const key = (name || '').trim().toLowerCase()
    if (!key) return null
    return recountCatalog.find((p) => (p.name || '').trim().toLowerCase() === key) || null
  }

  function findPlannedByProduct(productId) {
    return plannedPurchases.find((p) => String(p.productId) === String(productId))
  }

  function addManual() {
    const product = findProductByName(form.productName)
    if (!product) {
      setError('Товар не найден в каталоге — выберите вариант из подсказок.')
      return
    }
    if (!form.qty) {
      setError('Укажите количество.')
      return
    }
    if (findPlannedByProduct(product.id)) {
      setError('Этот товар уже в списке закупки — отредактируйте количество ниже.')
      return
    }
    setError(null)
    setPlannedPurchases((prev) => [...prev, { id: Date.now(), productId: product.id, qty: form.qty }])
    setForm({ productName: '', qty: '' })
  }

  function updateQty(id, qty) {
    setPlannedPurchases((prev) => prev.map((p) => (p.id === id ? { ...p, qty } : p)))
  }

  function remove(id) {
    setPlannedPurchases((prev) => prev.filter((p) => p.id !== id))
  }

  function markPurchased(planned) {
    if (!planned.qty) return
    setPurchases((prev) => [
      { id: Date.now(), productId: planned.productId, qty: planned.qty, date: todayKey() },
      ...prev,
    ])
    remove(planned.id)
  }

  function importPlanned() {
    const { items: parsed, skipped } = parsePlannedPurchaseImport(importText)
    let added = 0
    let alreadyPlanned = 0
    let createdProducts = 0
    const toAddPlanned = []
    const toAddCatalog = []

    function findOrCreateProduct(row) {
      const existing =
        findProductByName(row.name) ||
        toAddCatalog.find((p) => p.name.trim().toLowerCase() === row.name.trim().toLowerCase())
      if (existing) return existing
      const created = { id: uid(), name: row.name, unit: row.unit || 'шт', zone: 'dry', category: 'other' }
      toAddCatalog.push(created)
      createdProducts += 1
      return created
    }

    parsed.forEach((row) => {
      const product = findOrCreateProduct(row)
      if (findPlannedByProduct(product.id) || toAddPlanned.some((p) => p.productId === product.id)) {
        alreadyPlanned += 1
        return
      }
      toAddPlanned.push({ id: uid(), productId: product.id, qty: row.qty })
      added += 1
    })

    if (toAddCatalog.length) setRecountCatalog((prev) => [...prev, ...toAddCatalog])
    if (toAddPlanned.length) setPlannedPurchases((prev) => [...prev, ...toAddPlanned])

    const parts = [`Добавлено в закупку: ${added}`]
    if (createdProducts) parts.push(`новых товаров создано в каталоге: ${createdProducts}`)
    if (alreadyPlanned) parts.push(`уже в списке: ${alreadyPlanned}`)
    if (skipped.length) parts.push(`не распознано строк: ${skipped.length}`)
    setImportResult(parts.join(', '))
    setImportText('')
  }

  function addFromLowStock(product) {
    if (findPlannedByProduct(product.id)) return
    setPlannedPurchases((prev) => [...prev, { id: Date.now(), productId: product.id, qty: product.minQty || '' }])
  }

  function printList() {
    printReport({
      type: 'shopping-list',
      title: `Запланированная закупка — ${formatRu(now)}`,
      items: plannedPurchases.map((p) => {
        const product = recountCatalog.find((pr) => String(pr.id) === String(p.productId))
        return { name: product?.name || '?', unit: product?.unit || '', qty: p.qty }
      }),
    })
  }

  const lowStockNotPlanned = useMemo(() => {
    return recountCatalog
      .map((product) => ({ product, ...computeBalance(product.id, { recounts, purchases, productions, recipes }, now) }))
      .filter((row) => {
        const min = Number(row.product.minQty)
        return min > 0 && row.balance !== null && row.balance <= min && !findPlannedByProduct(row.product.id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recountCatalog, recounts, purchases, productions, recipes, plannedPurchases])

  return (
    <div className="pb-4">
      {lowStockNotPlanned.length > 0 && (
        <Section title="Мало на складе — добавить в закупку?" icon={AlertTriangle}>
          <div className="flex flex-col gap-2">
            {lowStockNotPlanned.map((row) => (
              <div
                key={row.product.id}
                className="flex items-center justify-between gap-2 rounded-xl border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{row.product.name}</p>
                  <p className="text-xs text-red-600 dark:text-red-400">Остаток: {row.balance} {row.product.unit}</p>
                </div>
                <button
                  onClick={() => addFromLowStock(row.product)}
                  className="shrink-0 min-h-[36px] px-3 flex items-center justify-center gap-1.5 rounded-lg bg-red-600 active:bg-red-700 text-white text-xs font-semibold"
                >
                  <Plus size={14} /> В закупку
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Импорт из Google Таблиц"
        icon={Upload}
        right={
          <button onClick={() => setShowImport((v) => !v)} className="text-xs font-semibold text-orange-600">
            {showImport ? 'Скрыть' : 'Показать'}
          </button>
        }
      >
        {showImport && (
          <>
            <p className="text-xs text-slate-500 mb-2">
              Столбцы: <b>Продукт, Кол-во</b> (можно с единицей: «600 г», «4 шт.») — по одной
              позиции на строку. Выделите в Google Таблице → Ctrl+C → вставьте сюда. Товары,
              которых ещё нет в каталоге, будут созданы автоматически.
            </p>
            <textarea
              className={inputClass + ' h-28 py-2'}
              placeholder={'Куриное филе\t2\nМорковь\t3'}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              <BigButton onClick={importPlanned} icon={Upload} disabled={!importText.trim()}>
                Импортировать в закупку
              </BigButton>
              <button
                onClick={() => { setShowImport(false); setImportText(''); setImportResult(null) }}
                className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
          </>
        )}
        {importResult && (
          <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mt-2">
            {importResult}
          </p>
        )}
      </Section>

      <Section
        title={`Запланированная закупка (${plannedPurchases.length})`}
        icon={ShoppingBasket}
        right={<PrintButton onClick={printList} label="Печать" />}
      >
        <p className="text-xs text-slate-500 mb-3">
          Список того, что нужно купить — не по факту, а то, что запланировано. Когда товар
          реально куплен, нажмите ✓ дважды (кнопка станет оранжевой — второе нажатие
          подтверждает) — он попадёт в «Приход» (вкладка Склад → Остатки) и автоматически
          обновит остаток.
        </p>
        <div className="flex gap-2 mb-3">
          <div className="flex-1 min-w-0 relative">
            <input
              className={inputClass}
              placeholder="Продукт…"
              value={form.productName}
              onChange={(e) => { setForm((f) => ({ ...f, productName: e.target.value })); setShowProductSuggestions(true) }}
              onFocus={() => setShowProductSuggestions(true)}
              onBlur={() => setTimeout(() => setShowProductSuggestions(false), 150)}
            />
            {showProductSuggestions && productSuggestions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                {productSuggestions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setForm((f) => ({ ...f, productName: p.name })); setShowProductSuggestions(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="w-20 shrink-0">
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              placeholder="Кол-во"
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: sanitizeDecimal(e.target.value) }))}
            />
          </div>
          <button
            onClick={addManual}
            className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-orange-500 active:bg-orange-600 text-white"
          >
            <Plus size={20} />
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 mb-3">
            {error}
          </p>
        )}
        {plannedPurchases.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-3">Список закупки пуст</p>
        )}
        <div className="flex flex-col gap-2">
          {plannedPurchases.map((p) => {
            const product = recountCatalog.find((pr) => String(pr.id) === String(p.productId))
            return (
              <div key={p.id} className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{product?.name || '?'}</p>
                  <p className="text-xs text-slate-400">{product?.unit}</p>
                </div>
                <div className="w-20 shrink-0">
                  <input
                    type="text"
                    inputMode="decimal"
                    className={inputClass + ' text-center'}
                    value={p.qty}
                    onChange={(e) => updateQty(p.id, sanitizeDecimal(e.target.value))}
                  />
                </div>
                <ConfirmMarkButton onConfirm={() => markPurchased(p)} />
                <ConfirmDeleteButton onConfirm={() => remove(p.id)} />
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
