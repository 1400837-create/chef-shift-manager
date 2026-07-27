const PREFIX = 'kitchenOS_'

export function buildBackup() {
  const data = {}
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (!key || !key.startsWith(PREFIX)) continue
    try {
      data[key.slice(PREFIX.length)] = JSON.parse(window.localStorage.getItem(key))
    } catch {
      // skip unparsable entries
    }
  }
  return { exportedAt: new Date().toISOString(), data }
}

export function downloadBackup() {
  const backup = buildBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kitchen-os-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Parses and validates a backup file's text without writing anything yet.
export function parseBackupFile(text) {
  const parsed = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || typeof parsed.data !== 'object') {
    throw new Error('Некорректный файл резервной копии')
  }
  return parsed
}

export function applyBackup(parsed) {
  const keys = Object.keys(parsed.data)
  keys.forEach((key) => {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(parsed.data[key]))
  })
  return keys.length
}
