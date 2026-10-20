const SUBJECT = {
  staff: 'сотрудника',
  shiftTemplates: 'типовую смену',
  users: 'пользователя',
}

const FIELD = {
  name: 'имя',
  nameDe: 'имя (DE)',
  norm: 'норма часов',
  label: 'название',
  start: 'начало',
  end: 'конец',
}

function fmt(v) {
  return v === null || v === undefined || v === '' ? '—' : String(v)
}

// One human-readable line per journal entry. Genderless verb forms ("изменил(а)")
// because both people using the plan read these.
export function describeEntry(e) {
  const subject = SUBJECT[e.coll] || 'запись'
  const name = e.label ? `«${e.label}»` : ''
  switch (e.action) {
    case 'create':
      return `добавил(а) ${subject} ${name}`.trim()
    case 'delete':
      return `удалил(а) ${subject} ${name}`.trim()
    case 'update': {
      const changes = Array.isArray(e.changes) ? e.changes : Object.values(e.changes || {})
      const parts = changes.map((c) => `${FIELD[c.f] || c.f}: ${fmt(c.from)} → ${fmt(c.to)}`)
      return `изменил(а) ${subject} ${name}${parts.length ? ': ' + parts.join('; ') : ''}`.trim()
    }
    case 'password':
      return `сменил(а) пароль пользователя ${name}`.trim()
    case 'disable':
      return `отключил(а) доступ пользователя ${name}`.trim()
    case 'enable':
      return `включил(а) доступ пользователя ${name}`.trim()
    case 'restore':
      return `восстановил(а) план из копии ${e.label || ''}`.trim()
    case 'import':
      return 'загрузил(а) план из файла'
    default:
      return `${e.action || 'изменение'} ${subject} ${name}`.trim()
  }
}
