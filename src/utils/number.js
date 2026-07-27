// Quantity/price inputs are type="text" + inputMode="decimal" (not
// type="number") so mobile keyboards keep their mic/voice-input button.
// That means a Russian keyboard's comma decimal key would otherwise produce
// a string Number() can't parse — normalize it to a dot as the user types.
export function sanitizeDecimal(value) {
  return value.replace(/,/g, '.')
}
