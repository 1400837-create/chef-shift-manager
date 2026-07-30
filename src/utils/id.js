// Date.now() + Math.random() collides more than it looks like it should:
// summing a 13-digit millisecond timestamp with a Math.random() fraction
// exceeds a double's ~15-17 significant digits, so most of Math.random()'s
// entropy gets rounded away. Fine for one-off creates (a human can't click
// twice in the same millisecond), but bulk creation (import, batch add) can
// generate hundreds of ids in the same tick, where the collision becomes
// real — confirmed in production as duplicate catalog ids breaking React's
// list rendering. crypto.randomUUID() (all modern browsers) sidesteps the
// whole problem; the fallback avoids float addition entirely.
let counter = 0
export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  counter += 1
  return `${Date.now()}-${counter}-${Math.random().toString(36).slice(2)}`
}
