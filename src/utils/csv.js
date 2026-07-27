// Semicolon-delimited (not comma) because Excel in ru-RU locale treats
// comma as the decimal separator and mis-splits comma-delimited CSVs.
// The UTF-8 BOM prefix is what makes Excel render Cyrillic correctly
// instead of guessing the wrong codepage.
function escapeCsvField(value) {
  const str = String(value ?? '')
  if (/[",;\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsvField).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
