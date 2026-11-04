import { useMemo, useState } from 'react'
import { Languages, Copy, ClipboardPaste } from 'lucide-react'
import { Section, inputClass, BigButton, ConfirmDeleteButton } from '../../components/UI'
import { patchRecord, deleteRecord } from '../../plan/planStore'
import { collectMissing, missingToText, parseGlossaryPaste, normKey } from '../../plan/glossary'
import { DraftInput } from './shared'
import { usePlanCtx } from './usePlanCtx'
import { saveTranslation } from './Tr'

const MISSING_SHOWN = 30

// Справочники → Словарь переводов: everything typed by hand in the plan that
// has no German yet, plus the glossary itself. A batch can be copied out,
// translated elsewhere and pasted back as "русский = Deutsch" lines.
export default function GlossaryEditor() {
  const { ctx, allData } = usePlanCtx()
  const [showAll, setShowAll] = useState(false)
  const [paste, setPaste] = useState('')
  const [msg, setMsg] = useState(null)
  const [query, setQuery] = useState('')

  const missing = useMemo(() => collectMissing(allData, ctx.glossaryMap, ctx.recipeById), [allData, ctx.glossaryMap, ctx.recipeById])
  const entries = useMemo(() => {
    const q = normKey(query)
    return [...(ctx.glossaryItems || [])]
      .filter((e) => e.ru)
      .filter((e) => !q || normKey(e.ru).includes(q) || normKey(e.de).includes(q))
      .sort((a, b) => a.ru.localeCompare(b.ru, 'ru'))
  }, [ctx.glossaryItems, query])

  async function copyMissing() {
    const text = missingToText(missing)
    try {
      await navigator.clipboard.writeText(text)
      setMsg({ ok: true, text: `Скопировано фраз: ${missing.length}. Допишите немецкий после «=» и вставьте ниже.` })
    } catch {
      setPaste(text)
      setMsg({ ok: true, text: 'Не удалось скопировать автоматически — список вставлен в поле ниже, скопируйте его оттуда.' })
    }
  }

  function applyPaste() {
    const { pairs, skipped } = parseGlossaryPaste(paste)
    let written = 0
    pairs.forEach((p) => { if (saveTranslation(ctx, p.ru, p.de)) written += 1 })
    const parts = [`Добавлено или обновлено: ${written}`]
    if (pairs.length - written > 0) parts.push(`без изменений: ${pairs.length - written}`)
    if (skipped.length) parts.push(`пропущено строк без перевода: ${skipped.length}`)
    setMsg({ ok: skipped.length === 0, text: parts.join(' · ') })
    setPaste(skipped.join('\n'))
  }

  const shown = showAll ? missing : missing.slice(0, MISSING_SHOWN)

  return (
    <Section title={`Словарь переводов (${(ctx.glossaryItems || []).length})`} icon={Languages} fold="plan-dir-glossary">
      <p className="text-xs text-slate-500 mb-3">
        Немецкий для всего, что набрано от руки: названия мероприятий, блюда без немецкого названия в рецепте,
        комментарии. Фраза переводится один раз и дальше показывается по-немецки везде — в таблице и при печати.
        Код техкарты (ТК-315 · …) переводить не нужно, он сохраняется. В режиме DE фраза без перевода подчёркнута
        оранжевой волной — нажмите на неё, чтобы добавить перевод сразу из таблицы.
      </p>

      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Без перевода: {missing.length}</p>
      {missing.length === 0 && <p className="text-sm text-slate-400 mb-3">Всё переведено.</p>}
      {shown.map((phrase) => (
        <div key={phrase} className="py-1.5 border-b border-slate-100 dark:border-slate-700">
          <p className="text-sm text-slate-700 dark:text-slate-200 mb-1">{phrase}</p>
          <DraftInput value="" placeholder="по-немецки…" onCommit={(v) => saveTranslation(ctx, phrase, v)} />
        </div>
      ))}
      {missing.length > MISSING_SHOWN && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-1 text-sm font-semibold text-orange-600 underline">
          {showAll ? 'Свернуть' : `Показать все (${missing.length})`}
        </button>
      )}

      {missing.length > 0 && (
        <div className="mt-3">
          <BigButton onClick={copyMissing} icon={Copy} color="outline">Скопировать список без перевода</BigButton>
        </div>
      )}

      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-4 mb-1">Вставить переводы пачкой</p>
      <p className="text-xs text-slate-500 mb-1">По одной строке: <span className="font-mono">русский = Deutsch</span></p>
      <textarea
        className={`${inputClass} min-h-[110px] font-mono text-sm`}
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        placeholder={'Бульон куриный с яйцом = Hühnerbrühe mit Ei\nОрганизационные вопросы = Organisatorisches'}
      />
      <div className="mt-2">
        <BigButton onClick={applyPaste} icon={ClipboardPaste} disabled={!paste.trim()}>Добавить в словарь</BigButton>
      </div>
      {msg && (
        <p className={`mt-2 text-sm font-semibold ${msg.ok ? 'text-green-700 dark:text-green-400' : 'text-orange-600'}`}>{msg.text}</p>
      )}

      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-5 mb-1">Словарь</p>
      {(ctx.glossaryItems || []).length > 0 && (
        <input className={`${inputClass} mb-2`} placeholder="Поиск по словарю" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      {entries.map((e) => (
        <div key={e.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center py-1.5 border-b border-slate-100 dark:border-slate-700">
          <DraftInput value={e.ru} onCommit={(v) => { if (v.trim()) patchRecord('glossary', e.id, { ru: v.trim() }) }} />
          <DraftInput value={e.de} onCommit={(v) => { if (v.trim()) patchRecord('glossary', e.id, { de: v.trim() }) }} />
          <ConfirmDeleteButton onConfirm={() => deleteRecord('glossary', e.id)} size="w-10 h-10" iconSize={18} />
        </div>
      ))}
      {(ctx.glossaryItems || []).length === 0 && <p className="text-sm text-slate-400">Пока пусто.</p>}
    </Section>
  )
}
