import { useEffect, useRef } from 'react'

// Switching tabs (top-level, or a sub-tab like Меню/Рецепты or Склад's
// FIFO/Переучёт/...) is plain React state — it never touches browser
// history, so the OS/system back-swipe has nothing to "pop" and instead
// exits the whole PWA on the very first swipe, even from deep inside a tab.
// This pushes one history entry per tab change and listens for popstate to
// switch back, making the system gesture behave like an in-app back button.
//
// Every history entry's state is a merged snapshot across every active
// scope (e.g. { app: 'menu', menuTab: 'recipes' }), not just this hook's own
// slice — each call site (App's top tab, MenuPlanner's menuTab, Inventory's
// tab, ...) reads/writes only its own key but folds it into whatever the
// other scopes last recorded, so one back-press restores exactly one step
// (e.g. Рецепты → Меню) instead of jumping straight out of the app.
export function useBackableTab(scope, value, setValue) {
  const prevRef = useRef(value)
  const skipNextPush = useRef(false)

  // Make sure the current entry carries this scope's value too, without
  // clobbering whatever other scopes already recorded there.
  useEffect(() => {
    const current = window.history.state || {}
    if (current[scope] !== value) {
      window.history.replaceState({ ...current, [scope]: value }, '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (prevRef.current === value) return
    if (skipNextPush.current) {
      skipNextPush.current = false
      prevRef.current = value
      return
    }
    const current = window.history.state || {}
    window.history.pushState({ ...current, [scope]: value }, '')
    prevRef.current = value
  }, [scope, value])

  useEffect(() => {
    function onPopState(e) {
      const v = e.state?.[scope]
      if (v !== undefined && v !== prevRef.current) {
        skipNextPush.current = true
        prevRef.current = v
        setValue(v)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, setValue])
}
