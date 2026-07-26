import { useMemo, useState } from 'react'
import {
  Plus, Trash2, PackageSearch, ClipboardCheck, Snowflake, Archive, Trash,
  ClipboardList, Upload, X,
} from 'lucide-react'
import { Section, Field, inputClass, Badge, CheckRow, BigButton, PrintButton } from '../components/UI'
import { LEFTOVER_ACTIONS, INVENTORY_AUDIT_ZONES } from '../utils/constants'
import { addDays, daysBetween, formatRu, monthKey, parseLocalDate, startOfDay } from '../utils/dateUtils'
import { parseRecountCatalogImport } from '../utils/importParsers'

function computeExpiry(item) {
  return addDays(parseLocalDate(item.packDate), Number(item.shelfLifeDays || 0))
}

function statusFor(daysLeft) {
  if (daysLeft <= 1) return { tone: 'red', label: daysLeft <= 0 ? 'Истекает сегодня' : 'Истекает завтра' }
  if (daysLeft <= 3) return { tone: 'yellow', label: `Осталось ${daysLeft} дн.` }
  return { tone: 'green', label: `Осталось ${daysLeft} дн.` }
}

const toneClasses = {
  red: 'border-red-300 bg-red-50',
  yellow: 'border-yellow-300 bg-yellow-50',
  green: 'border-slate-200 bg-white',
}

function previousMonthKey(currentMonth) {
  const [y, m] = currentMonth.split('-').map(Number)
  const prev = new Date(y, m - 2, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

export default function Inventory({
  items, setItems, audits, setAudits,
  recountCatalog, setRecountCatalog, recounts, setRecounts,
  requestPrint,
}) {
  const [form, setForm] = useState({ name: '', packDate: new Date().toISOString().slice(0, 10), shelfLifeDays: '' })
  const [tab, setTab] = useState('fifo')
  const now = new Date()
  const currentMonth = monthKey(now)
  const prevMonth = previousMonthKey(currentMonth)
  const audit = audits[currentMonth] || { fridges: {}, freezers: {}, dry: {}, verifiedWithLead: false }

  const [showCatalogImport, setShowCatalogImport] = useState(false)
  const [catalogImportText, setCatalogImportText] = useState('')
  const [catalogImportResult, setCatalogImportResult] = useState(null)
  const [newCatalogItem, setNewCatalogItem] = useState({ name: '', unit: 'шт', zone: 'fridges' })

  const recount = recounts[currentMonth] || { qty: {}, verifiedWithLead: false }
  const prevRecount = recounts[prevMonth]

  const sorted = useMemo(() => {
    return [...items]
      .filter((i) => i.status !== 'disposal')
      .map((i) => ({ ...i, expiry: computeExpiry(i) }))
      .sort((a, b) => a.expiry - b.expiry)
  }, [items])

  function addItem() {
    if (!form.name.trim() || !form.shelfLifeDays) return
    const item = {
      id: Date.now(),
      name: form.name.trim(),
      packDate: form.packDate,
      shelfLifeDays: form.shelfLifeDays,
      status: 'active',
    }
    setItems((prev) => [item, ...prev])
    setForm({ name: '', packDate: new Date().toISOString().slice(0, 10), shelfLifeDays: '' })
  }

  function setItemStatus(id, status) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)))
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function toggleAuditItem(zoneKey, idx) {
    setAudits((prev) => {
      const cur = prev[currentMonth] || { fridges: {}, freezers: {}, dry: {}, verifiedWithLead: false }
      const zone = { ...(cur[zoneKey] || {}) }
      zone[idx] = !zone[idx]
      return { ...prev, [currentMonth]: { ...cur, [zoneKey]: zone } }
    })
  }

  function setVerified(v) {
    setAudits((prev) => {
      const cur = prev[currentMonth] || { fridges: {}, freezers: {}, dry: {}, verifiedWithLead: false }
      return { ...prev, [currentMonth]: { ...cur, verifiedWithLead: v } }
    })
  }

  const auditTotal = INVENTORY_AUDIT_ZONES.reduce((sum, z) => sum + z.items.length, 0)
  const auditDone = INVENTORY_AUDIT_ZONES.reduce(
    (sum, z) => sum + z.items.filter((_, idx) => audit[z.key]?.[idx]).length,
    0
  )

  function addCatalogItem() {
    if (!newCatalogItem.name.trim()) return
    setRecountCatalog((prev) => [
      ...prev,
      { id: Date.now(), name: newCatalogItem.name.trim(), unit: newCatalogItem.unit.trim() || 'шт', zone: newCatalogItem.zone },
    ])
    setNewCatalogItem({ name: '', unit: 'шт', zone: 'fridges' })
  }

  function removeCatalogItem(id) {
    setRecountCatalog((prev) => prev.filter((i) => i.id !== id))
  }

  function importCatalog() {
    const { items: parsed, skipped } = parseRecountCatalogImport(catalogImportText)
    const existingNames = new Set(recountCatalog.map((i) => i.name.trim().toLowerCase()))
    const toAdd = []
    parsed.forEach((p) => {
      const key = p.name.toLowerCase()
      if (existingNames.has(key)) return
      existingNames.add(key)
      toAdd.push({ id: Date.now() + Math.random(), ...p })
    })
    setRecountCatalog((prev) => [...prev, ...toAdd])
    const parts = [`Добавлено товаров: ${toAdd.length}`]
    const dupes = parsed.length - toAdd.length
    if (dupes) parts.push(`пропущено дублей: ${dupes}`)
    if (skipped.length) parts.push(`не распознано строк: ${skipped.length}`)
    setCatalogImportResult(parts.join(', '))
    setCatalogImportText('')
  }

  function setQty(itemId, value) {
    setRecounts((prev) => ({
      ...prev,
      [currentMonth]: { ...(prev[currentMonth] || { qty: {}, verifiedWithLead: false }), qty: { ...(prev[currentMonth]?.qty || {}), [itemId]: value } },
    }))
  }

  function setRecountVerified(v) {
    setRecounts((prev) => ({
      ...prev,
      [currentMonth]: { ...(prev[currentMonth] || { qty: {}, verifiedWithLead: false }), verifiedWithLead: v },
    }))
  }

  function zonesForPrint() {
    return INVENTORY_AUDIT_ZONES.map((z) => ({
      label: z.label,
      items: recountCatalog
        .filter((i) => i.zone === z.key)
        .map((i) => ({ name: i.name, unit: i.unit, qty: recount.qty[i.id] ?? '' })),
    }))
  }

  function printRecount(blank) {
    requestPrint({
      type: 'recount',
      title: `Полный переучёт — ${formatRu(now)}${blank ? ' (бланк для подсчёта)' : ''}`,
      blank,
      zones: zonesForPrint(),
    })
  }

  const catalogTotal = recountCatalog.length
  const catalogFilled = recountCatalog.filter((i) => recount.qty[i.id] !== undefined && recount.qty[i.id] !== '').length

  return (
    <div className="pb-4">
      <div className="flex gap-1.5 mb-4">
        <button
          onClick={() => setTab('fifo')}
          className={`flex-1 min-h-[48px] rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm ${
            tab === 'fifo' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          <PackageSearch size={16} /> FIFO
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`flex-1 min-h-[48px] rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm ${
            tab === 'audit' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          <ClipboardCheck size={16} /> Проверка
        </button>
        <button
          onClick={() => setTab('recount')}
          className={`flex-1 min-h-[48px] rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm ${
            tab === 'recount' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          <ClipboardList size={16} /> Переучёт
        </button>
      </div>

      {tab === 'fifo' && (
        <>
          <Section title="Добавить продукт" icon={Plus}>
            <Field label="Название">
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Например: Куриное филе"
              />
            </Field>
            <div className="flex gap-2">
              <Field label="Дата приготовления/упаковки">
                <input
                  type="date"
                  className={inputClass}
                  value={form.packDate}
                  onChange={(e) => setForm((f) => ({ ...f, packDate: e.target.value }))}
                />
              </Field>
              <Field label="Срок годности, дней">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={form.shelfLifeDays}
                  onChange={(e) => setForm((f) => ({ ...f, shelfLifeDays: e.target.value }))}
                  placeholder="3"
                />
              </Field>
            </div>
            <BigButton onClick={addItem} icon={Plus}>Добавить в список</BigButton>
          </Section>

          <Section title="Список FIFO (по сроку годности)" icon={PackageSearch}>
            {sorted.length === 0 && <p className="text-sm text-slate-400 text-center py-3">Список пуст</p>}
            <div className="flex flex-col gap-2">
              {sorted.map((item) => {
                const daysLeft = daysBetween(startOfDay(now), item.expiry)
                const status = statusFor(daysLeft)
                return (
                  <div key={item.id} className={`rounded-xl border-2 p-3 ${toneClasses[status.tone]}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          Упаковано {formatRu(parseLocalDate(item.packDate))} · годен {item.shelfLifeDays} дн.
                        </p>
                        <p className="text-xs text-slate-500">Истекает {formatRu(item.expiry)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge color={status.tone}>{status.label}</Badge>
                        <button onClick={() => removeItem(item.id)} className="w-9 h-9 flex items-center justify-center text-slate-400">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      {LEFTOVER_ACTIONS.map((a) => (
                        <button
                          key={a.key}
                          onClick={() => setItemStatus(item.id, a.key)}
                          className={`flex-1 min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1 border ${
                            item.status === a.key
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-slate-600 border-slate-200'
                          }`}
                        >
                          {a.key === 'freezing' && <Snowflake size={14} />}
                          {a.key === 'storage' && <Archive size={14} />}
                          {a.key === 'disposal' && <Trash size={14} />}
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        </>
      )}

      {tab === 'audit' && (
        <>
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-4 py-3 mb-4 shadow-sm">
            <p className="text-sm font-medium text-slate-600">Проверка зон за месяц</p>
            <Badge color={auditDone === auditTotal ? 'green' : 'slate'}>{auditDone}/{auditTotal}</Badge>
          </div>

          {INVENTORY_AUDIT_ZONES.map((zone) => (
            <Section key={zone.key} title={zone.label}>
              {zone.items.map((item, idx) => (
                <CheckRow
                  key={idx}
                  label={item}
                  checked={!!audit[zone.key]?.[idx]}
                  onChange={() => toggleAuditItem(zone.key, idx)}
                />
              ))}
            </Section>
          ))}

          <Section title="Подтверждение">
            <CheckRow
              label="Проверка сверена с Küchenleiterin"
              checked={!!audit.verifiedWithLead}
              onChange={setVerified}
            />
          </Section>
        </>
      )}

      {tab === 'recount' && (
        <>
          <Section
            title="Импорт каталога из Google Таблиц"
            icon={Upload}
            right={
              <button onClick={() => setShowCatalogImport((v) => !v)} className="text-xs font-semibold text-orange-600">
                {showCatalogImport ? 'Скрыть' : 'Показать'}
              </button>
            }
          >
            {showCatalogImport && (
              <>
                <p className="text-xs text-slate-500 mb-2">
                  Столбцы: <b>Название, Ед. изм., Зона</b> (холодильник / морозильник / сухой склад).
                  Выделите в Google Таблице → Ctrl+C → вставьте сюда.
                </p>
                <textarea
                  className={inputClass + ' h-28 py-2'}
                  placeholder={'Куриное филе\tкг\tхолодильник\nМука\tкг\tсухой склад'}
                  value={catalogImportText}
                  onChange={(e) => setCatalogImportText(e.target.value)}
                />
                <div className="flex gap-2 mt-2">
                  <BigButton onClick={importCatalog} icon={Upload} disabled={!catalogImportText.trim()}>
                    Импортировать в каталог
                  </BigButton>
                  <button
                    onClick={() => { setShowCatalogImport(false); setCatalogImportText(''); setCatalogImportResult(null) }}
                    className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500"
                  >
                    <X size={18} />
                  </button>
                </div>
                {catalogImportResult && (
                  <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-2">
                    {catalogImportResult}
                  </p>
                )}
              </>
            )}
          </Section>

          <Section title="Добавить товар вручную" icon={Plus}>
            <div className="flex gap-2">
              <input
                className={inputClass + ' flex-1'}
                placeholder="Название"
                value={newCatalogItem.name}
                onChange={(e) => setNewCatalogItem((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                className={inputClass + ' w-20'}
                placeholder="Ед."
                value={newCatalogItem.unit}
                onChange={(e) => setNewCatalogItem((f) => ({ ...f, unit: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 mt-2">
              <select
                className={inputClass + ' flex-1'}
                value={newCatalogItem.zone}
                onChange={(e) => setNewCatalogItem((f) => ({ ...f, zone: e.target.value }))}
              >
                {INVENTORY_AUDIT_ZONES.map((z) => (
                  <option key={z.key} value={z.key}>{z.label}</option>
                ))}
              </select>
              <button
                onClick={addCatalogItem}
                className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-orange-500 active:bg-orange-600 text-white"
              >
                <Plus size={20} />
              </button>
            </div>
          </Section>

          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-4 py-3 mb-2 shadow-sm">
            <p className="text-sm font-medium text-slate-600">Переучёт за {formatRu(now)}</p>
            <Badge color={catalogFilled === catalogTotal && catalogTotal > 0 ? 'green' : 'slate'}>
              {catalogFilled}/{catalogTotal}
            </Badge>
          </div>

          <div className="flex gap-2 mb-4">
            <PrintButton onClick={() => printRecount(true)} label="Пустой бланк" />
            <PrintButton onClick={() => printRecount(false)} label="С текущими данными" />
          </div>

          {INVENTORY_AUDIT_ZONES.map((zone) => {
            const zoneItems = recountCatalog.filter((i) => i.zone === zone.key)
            if (zoneItems.length === 0) return null
            return (
              <Section key={zone.key} title={zone.label}>
                <div className="flex flex-col gap-2">
                  {zoneItems.map((item) => {
                    const prevQty = prevRecount?.qty?.[item.id]
                    const curQty = recount.qty[item.id]
                    const delta = prevQty !== undefined && curQty !== undefined && curQty !== ''
                      ? Number(curQty) - Number(prevQty)
                      : null
                    return (
                      <div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{item.name}</p>
                          <p className="text-xs text-slate-400">
                            {item.unit}
                            {prevQty !== undefined && prevQty !== '' && ` · было ${prevQty}`}
                            {delta !== null && delta !== 0 && (
                              <span className={delta > 0 ? 'text-green-600' : 'text-red-600'}> ({delta > 0 ? '+' : ''}{delta})</span>
                            )}
                          </p>
                        </div>
                        <input
                          type="number"
                          className={inputClass + ' w-20 text-center'}
                          value={curQty ?? ''}
                          onChange={(e) => setQty(item.id, e.target.value)}
                          placeholder="0"
                        />
                        <button onClick={() => removeCatalogItem(item.id)} className="w-9 h-9 shrink-0 flex items-center justify-center text-slate-400">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </Section>
            )
          })}

          {recountCatalog.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-3">
              Каталог пуст — импортируйте из Google Таблиц или добавьте товары вручную
            </p>
          )}

          <Section title="Подтверждение">
            <CheckRow
              label="Переучёт сверен с Küchenleiterin"
              checked={!!recount.verifiedWithLead}
              onChange={setRecountVerified}
            />
          </Section>
        </>
      )}
    </div>
  )
}
