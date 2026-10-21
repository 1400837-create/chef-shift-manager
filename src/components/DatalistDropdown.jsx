import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Pencil } from 'lucide-react'
import { computeDropdownRect } from '../utils/dropdownPosition'

// Turns every `<input list="…">` in the app into a proper drop-down list.
//
// The browser's own <datalist> behaves badly on tablets: its suggestions show
// up in the on-screen keyboard's suggestion strip, not under the field. This
// component takes those inputs over once, for the whole app (so any field
// added later gets it for free): it reads the options from the <datalist>,
// hides the native suggestions, and shows its own list under the field —
// filtered as you type, picked with a tap, arrow keys + Enter on a keyboard.
//
// On a touch screen a SHORT list (meal names, stores…) behaves like a select:
// tapping the field opens the list without raising the keyboard; the first
// row, «Ввести своё», switches the same field to typing. Long lists (the
// product catalogue) keep the keyboard, because there you search by typing.

const SHORT_LIST = 14
const MAX_SHOWN = 80

const isCoarse = () => !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)

function takeOver(root) {
  if (!root || root.nodeType !== 1) return
  const list = root.matches && root.matches('input[list]') ? [root] : []
  root.querySelectorAll('input[list]').forEach((i) => list.push(i))
  list.forEach((i) => {
    i.dataset.combo = i.getAttribute('list')
    i.removeAttribute('list')
    i.setAttribute('autocomplete', 'off')
  })
}

function optionsOf(input) {
  const dl = input.dataset.combo ? document.getElementById(input.dataset.combo) : null
  if (!dl) return []
  const seen = new Set()
  const out = []
  ;[...dl.options].forEach((o) => {
    const v = o.value
    if (v && !seen.has(v)) { seen.add(v); out.push(v) }
  })
  return out
}

function setNativeValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

export default function DatalistDropdown() {
  const [state, setState] = useState(null) // { el, rect, options, selectLike }
  const [tick, setTick] = useState(0)
  const [active, setActive] = useState(-1)
  const stateRef = useRef(null)
  stateRef.current = state
  const closeTimer = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    takeOver(document.body)
    const mo = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'attributes') takeOver(m.target)
        else m.addedNodes.forEach((n) => takeOver(n))
      })
    })
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['list'] })

    const comboOf = (t) => (t && t.tagName === 'INPUT' && t.dataset && t.dataset.combo ? t : null)

    function open(el) {
      clearTimeout(closeTimer.current)
      const options = optionsOf(el)
      const selectLike = isCoarse() && options.length <= SHORT_LIST && !el.dataset.typing
      if (selectLike) el.setAttribute('inputmode', 'none')
      setActive(-1)
      setState({ el, rect: computeDropdownRect(el, 300), options, selectLike })
    }

    function close() {
      const s = stateRef.current
      if (s) {
        delete s.el.dataset.typing
        if (s.selectLike || s.el.getAttribute('inputmode') === 'none') s.el.removeAttribute('inputmode')
      }
      setState(null)
    }

    const onFocusIn = (e) => { const el = comboOf(e.target); if (el) open(el) }
    const onPointerDown = (e) => {
      const el = comboOf(e.target)
      if (el && document.activeElement === el && !stateRef.current) open(el)
    }
    const onFocusOut = (e) => {
      if (!comboOf(e.target)) return
      clearTimeout(closeTimer.current)
      closeTimer.current = setTimeout(close, 180)
    }
    const onInput = (e) => {
      const el = comboOf(e.target)
      if (el && stateRef.current && stateRef.current.el === el) {
        setActive(-1)
        setTick((n) => n + 1)
      }
    }
    const reposition = (e) => {
      const s = stateRef.current
      if (!s) return
      if (e && e.target && e.target.closest && e.target.closest('[data-combo-list]')) return
      setState({ ...s, rect: computeDropdownRect(s.el, 300) })
    }
    const onKeyDown = (e) => {
      const s = stateRef.current
      if (!s || e.target !== s.el) return
      const shown = visible(s)
      if (e.key === 'Escape') { close(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!shown.length) return
        e.preventDefault()
        setActive((a) => {
          const n = shown.length
          if (e.key === 'ArrowDown') return a + 1 >= n ? 0 : a + 1
          return a <= 0 ? n - 1 : a - 1
        })
      }
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('input', onInput, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    window.visualViewport?.addEventListener('resize', reposition)
    window.visualViewport?.addEventListener('scroll', reposition)
    return () => {
      mo.disconnect()
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      window.visualViewport?.removeEventListener('resize', reposition)
      window.visualViewport?.removeEventListener('scroll', reposition)
      clearTimeout(closeTimer.current)
    }
  }, [])

  // The options that match what is typed (everything, when the field is empty
  // or already holds one of the options — so the list is never "stuck" on
  // the current value).
  function visible(s) {
    const q = (s.el.value || '').trim().toLowerCase()
    const exact = s.options.some((o) => o.toLowerCase() === q)
    const list = !q || exact ? s.options : s.options.filter((o) => o.toLowerCase().includes(q))
    return list.slice(0, MAX_SHOWN)
  }

  function pick(value) {
    const s = stateRef.current
    if (!s) return
    const el = s.el
    setNativeValue(el, value)
    setState(null)
    delete el.dataset.typing
    el.removeAttribute('inputmode')
    // blur → fields that save on blur (plan cells) save the picked value.
    el.blur()
  }

  function startTyping() {
    const s = stateRef.current
    if (!s) return
    const el = s.el
    el.dataset.typing = '1'
    el.removeAttribute('inputmode')
    setState(null)
    el.blur()
    requestAnimationFrame(() => el.focus())
  }

  // Enter picks the highlighted row.
  useEffect(() => {
    if (!state) return undefined
    const el = state.el
    const onKey = (e) => {
      if (e.key !== 'Enter') return
      const shown = visible(stateRef.current)
      if (active >= 0 && shown[active] !== undefined) {
        e.preventDefault()
        e.stopPropagation()
        pick(shown[active])
      }
    }
    el.addEventListener('keydown', onKey, true)
    return () => el.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, active])

  // keep the highlighted row in view
  useEffect(() => {
    if (active < 0 || !listRef.current) return
    const node = listRef.current.querySelector(`[data-i="${active}"]`)
    if (node) node.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!state) return null
  void tick
  const shown = visible(state)
  const showTypingRow = state.selectLike
  if (!shown.length && !showTypingRow) return null

  const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth
  const width = Math.min(Math.max(state.rect.width, 230), vw - 16)
  const left = Math.max(8, Math.min(state.rect.left, vw - width - 8))
  const current = (state.el.value || '').trim().toLowerCase()

  return createPortal(
    <div
      ref={listRef}
      data-combo-list
      style={{ position: 'fixed', top: state.rect.top, left, width, maxHeight: state.rect.maxHeight }}
      className="z-[90] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl animate-pop-in py-1"
      onMouseDown={(e) => e.preventDefault()}
    >
      {showTypingRow && (
        <button
          type="button"
          onClick={startTyping}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-orange-600 dark:text-orange-300 border-b border-slate-100 dark:border-slate-700 active:bg-orange-50 dark:active:bg-slate-700"
        >
          <Pencil size={14} /> Ввести своё…
        </button>
      )}
      {shown.map((o, i) => (
        <button
          key={o}
          type="button"
          data-i={i}
          onClick={() => pick(o)}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-[15px] text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700 last:border-0 active:bg-orange-50 dark:active:bg-slate-700 ${
            i === active ? 'bg-orange-50 dark:bg-slate-700' : ''
          }`}
        >
          <span className="min-w-0 break-words">{o}</span>
          {o.toLowerCase() === current && <Check size={15} className="shrink-0 text-orange-500" />}
        </button>
      ))}
    </div>,
    document.body
  )
}
