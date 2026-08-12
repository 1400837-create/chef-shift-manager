import { useEffect, useRef } from 'react'

// Switching tabs (top-level, or a sub-tab like Меню/Рецепты or Склад's
// FIFO/Переучёт/...) is plain React state — it never touches browser
// history, so the OS/system back-swipe has nothing to "pop" and instead
// exits the whole PWA on the very first swipe, even from deep inside a tab.
// This pushes one history entry per tab change (skipping the very first
// render) and listens for popstate to switch back, making the system
// gesture behave like an in-app back button instead of a close button.
//
// Multiple independent call sites (App's top tab, MenuPlanner's menuTab,
// Inventory's tab, ...) all share the single browser history stack, so a
// single back-press correctly undoes whichever was the most recent change —
// each call site is tagged with its own `scope` and only reacts to popstate
// entries carrying that scope, ignoring ones pushed by other call sites.
export function useBackableTab(scope, value, setValue) {
  const prevRef = useRef(value)
  const skipNextPush = useRef(false)

  useEffect(() => {
    if (prevRef.current === value) return
    if (skipNextPush.current) {
      skipNextPush.current = false
      prevRef.current = value
      return
    }
    window.history.pushState({ scope, value: prevRef.current }, '')
    prevRef.current = value
  }, [scope, value])

  useEffect(() => {
    function onPopState(e) {
      if (e.state?.scope === scope) {
        skipNextPush.current = true
        setValue(e.state.value)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [scope, setValue])
}
