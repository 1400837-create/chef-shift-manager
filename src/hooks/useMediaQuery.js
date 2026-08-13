import { useEffect, useState } from 'react'

// Tracks a CSS media query in JS — used where a layout decision (not just
// styling) depends on viewport width, e.g. whether to actually mount two
// panes side by side rather than just visually hiding one with CSS.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
