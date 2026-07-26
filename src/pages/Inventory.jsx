import { useMemo, useState } from 'react'
import { Plus, Trash2, PackageSearch, ClipboardCheck, Snowflake, Archive, Trash } from 'lucide-react'
import { Section, Field, inputClass, Badge, CheckRow, BigButton } from '../components/UI'
import { LEFTOVER_ACTIONS, INVENTORY_AUDIT_ZONES } from '../utils/constants'
import { addDays, daysBetween, formatRu, monthKey, parseLocalDate, startOfDay } from '../utils/dateUtils'

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

export default function Inventory({ items, setItems, audits, setAudits }) {
  const [form, setForm] = useState({ name: '', packDate: new Date().toISOString().slice(0, 10), shelfLifeDays: '' })
  const [tab, setTab] = useState('fifo')
  const now = new Date()
  const currentMonth = monthKey(now)
  const audit = audits[currentMonth] || { fridges: {}, freezers: {}, dry: {}, verifiedWithLead: false }

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

  return (
    <div className="pb-4">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('fifo')}
          className={`flex-1 min-h-[48px] rounded-xl font-semibold flex items-center justify-center gap-2 ${
            tab === 'fifo' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          <PackageSearch size={18} /> FIFO
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`flex-1 min-h-[48px] rounded-xl font-semibold flex items-center justify-center gap-2 ${
            tab === 'audit' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          <ClipboardCheck size={18} /> Инвентаризация
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
            <p className="text-sm font-medium text-slate-600">Инвентаризация за месяц</p>
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
              label="Инвентаризация сверена с Küchenleiterin"
              checked={!!audit.verifiedWithLead}
              onChange={setVerified}
            />
          </Section>
        </>
      )}
    </div>
  )
}
