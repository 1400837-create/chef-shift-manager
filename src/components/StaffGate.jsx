import { useRef, useState } from 'react'
import { ChefHat, Lock, User } from 'lucide-react'
import { inputClass, BigButton } from './UI'
import { loginStaff } from '../plan/planAdmin'
import { setDeviceChoice } from '../plan/planRoom'

function Shell({ children }) {
  return (
    <div className="min-h-screen app-bg flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-5">
          <ChefHat size={28} className="text-orange-500" />
          <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">LA CHEF</span>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 animate-pop-in">
          {children}
        </div>
      </div>
    </div>
  )
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function StaffLogin({ initialCode = '', onBack }) {
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const fails = useRef(0)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // Cosmetic brake on repeated wrong guesses — real protection is the
    // unguessable room code plus the password hash, not this delay.
    if (fails.current > 0) await sleep(Math.min(fails.current * 1000, 5000))
    try {
      await loginStaff({ code, name, password })
      // success: the root re-renders into the staff shell, nothing more to do here
    } catch (err) {
      fails.current += 1
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Shell>
      <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">Вход для сотрудников</h1>
      <p className="text-xs text-slate-500 mb-4">Код плана вам выдаёт владелец вместе с именем и паролем.</p>
      <form onSubmit={submit}>
        <div className="mb-3">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Код плана</label>
          <input
            className={inputClass + ' font-mono'}
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1"><User size={14} /> Имя</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1"><Lock size={14} /> Пароль</label>
          <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        {error && (
          <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 mb-3">
            {error}
          </p>
        )}
        <BigButton type="submit" disabled={busy}>{busy ? 'Проверяем…' : 'Войти'}</BigButton>
        {onBack && (
          <button type="button" onClick={onBack} className="w-full mt-3 text-sm font-semibold text-slate-500">
            Назад
          </button>
        )}
      </form>
    </Shell>
  )
}

// First launch on a device that has never held any data: is this the owner's
// own device, or a staff member signing in?
export function DeviceChooser() {
  const [staff, setStaff] = useState(false)
  if (staff) return <StaffLogin onBack={() => setStaff(false)} />
  return (
    <Shell>
      <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">Добро пожаловать</h1>
      <p className="text-xs text-slate-500 mb-4">Это новое устройство. Как вы будете им пользоваться?</p>
      <div className="flex flex-col gap-3">
        <BigButton onClick={() => setDeviceChoice('owner')}>Это моё основное устройство</BigButton>
        <BigButton onClick={() => setStaff(true)} color="outline">Войти как сотрудник</BigButton>
      </div>
    </Shell>
  )
}
