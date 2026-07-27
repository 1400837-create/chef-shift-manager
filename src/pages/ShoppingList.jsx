import { useMemo, useState } from 'react'
import { Plus, Check, ShoppingBasket, AlertTriangle } from 'lucide-react'
import { Section, inputClass, PrintButton, ConfirmDeleteButton } from '../components/UI'
import { formatRu, todayKey } from '../utils/dateUtils'
import { printReport } from '../utils/printReport'
import { computeBalance } from '../utils/stockBalance'

export default function ShoppingList({
  recountCatalog, recounts, purchases, productions, recipes,
  plannedPurchases, setPlannedPurchases, setPurchases,
}) {
  const [form, setForm] = useState({ productName: '', qty: '' })
  const [error, setError] = useState(null)
  const now = new Date()

  function findProductByName(name) {
    const key = (name || '').trim().toLowerCase()
    if (!key) return null
    return recountCatalog.find((p) => p.name.trim().toLowerCase() === key) || null
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
                className="flex items-center justify-between gap-2 rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{row.product.name}</p>
                  <p className="text-xs text-red-600">Остаток: {row.balance} {row.product.unit}</p>
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
        title={`Запланированная закупка (${plannedPurchases.length})`}
        icon={ShoppingBasket}
        right={<PrintButton onClick={printList} label="Печать" />}
      >
        <p className="text-xs text-slate-500 mb-3">
          Список того, что нужно купить — не по факту, а то, что запланировано. Когда товар
          реально куплен, нажмите ✓ — он попадёт в «Приход» (вкладка Склад → Остатки) и
          автоматически обновит остаток.
        </p>
        <div className="flex gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <input
              className={inputClass}
              placeholder="Продукт…"
              list="product-nomenclature"
              value={form.productName}
              onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
            />
          </div>
          <div className="w-20 shrink-0">
            <input
              type="number"
              className={inputClass}
              placeholder="Кол-во"
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
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
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
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
              <div key={p.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{product?.name || '?'}</p>
                  <p className="text-xs text-slate-400">{product?.unit}</p>
                </div>
                <div className="w-20 shrink-0">
                  <input
                    type="number"
                    className={inputClass + ' text-center'}
                    value={p.qty}
                    onChange={(e) => updateQty(p.id, e.target.value)}
                  />
                </div>
                <button
                  onClick={() => markPurchased(p)}
                  className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-green-600 active:bg-green-700 text-white"
                  title="Отметить купленным"
                >
                  <Check size={18} />
                </button>
                <ConfirmDeleteButton onConfirm={() => remove(p.id)} />
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
