// Shared by every portalled suggestion dropdown (Закупка's product field,
// Меню's dish field, …) — they all sit inside a card that clips overflow
// for its rounded corners, so the dropdown is portalled to document.body
// and positioned from the trigger element's own screen rect.
//
// A rect computed once at open time goes stale the moment the page scrolls
// or the on-screen keyboard opens/closes (mobile browsers resize the visual
// viewport, which a plain `window.innerHeight` check doesn't see) — callers
// must recompute this on scroll/resize while the dropdown is open, not just
// once on click. This also flips the dropdown above the trigger and caps
// its height when there isn't enough room below (e.g. keyboard covering the
// bottom half of the screen), instead of letting it run under the keyboard.
export function computeDropdownRect(triggerEl, maxListHeight = 224) {
  const r = triggerEl.getBoundingClientRect()
  const vv = window.visualViewport
  const viewportHeight = vv ? vv.height : window.innerHeight
  const viewportTop = vv ? vv.offsetTop : 0
  const viewportBottom = viewportTop + viewportHeight
  const margin = 8

  const spaceBelow = viewportBottom - r.bottom - margin
  const spaceAbove = r.top - viewportTop - margin

  if (spaceBelow >= 80 || spaceBelow >= spaceAbove) {
    return {
      left: r.left,
      width: r.width,
      top: r.bottom + 4,
      maxHeight: Math.max(80, Math.min(maxListHeight, spaceBelow)),
      direction: 'down',
    }
  }
  const height = Math.max(80, Math.min(maxListHeight, spaceAbove))
  return {
    left: r.left,
    width: r.width,
    top: r.top - height - 4,
    maxHeight: height,
    direction: 'up',
  }
}
