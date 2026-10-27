import { useEffect, useRef, useState } from 'react'
import { ChefHat, LogOut, Moon, Sun, User } from 'lucide-react'
import PlanPage from './pages/PlanPage'
import { usePlanDeviceState } from './plan/planRoom'
import { usePlanMaintenance, validateSession, logoutStaff } from './plan/planAdmin'

// What a signed-in staff member sees: only the plan. This shell deliberately
// does not mount App at all — none of the main app's data, migrations or sync
// subscriptions exist on this device.
export default function StaffApp() {
  const { session } = usePlanDeviceState()
  const [dark, setDark] = useState(() => localStorage.getItem('kitchenPlan_dark') === '1')
  const headerRef = useRef(null)

  usePlanMaintenance()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('kitchenPlan_dark', dark ? '1' : '0')
  }, [dark])

  useEffect(() => {
    const el = headerRef.current
    if (el) document.documentElement.style.setProperty('--app-header-h', `${el.offsetHeight}px`)
  }, [])

  // Disabled / re-passworded by the owner → signed out on the next check.
  useEffect(() => {
    validateSession()
    const id = setInterval(validateSession, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen app-bg" style={{ "--bottom-nav-h": "0px" }}>
      <header
        ref={headerRef}
        className="safe-top sticky top-0 z-30 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 text-white px-3 lg:px-6 py-2.5 flex items-center gap-2 shadow-lg border-b border-white/5"
      >
        <span className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-orange-400 to-orange-600 shadow-glow">
          <ChefHat size={19} className="text-white" />
        </span>
        <p className="font-bold leading-tight truncate text-[15px] flex-1 min-w-0">LA CHEF · План</p>
        <span className="flex items-center gap-1 text-xs text-slate-300 shrink-0">
          <User size={13} /> {session?.name}
        </span>
        <button
          onClick={() => setDark((v) => !v)}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg active:bg-slate-800 text-slate-300"
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          onClick={logoutStaff}
          title="Выйти"
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg active:bg-slate-800 text-slate-300"
        >
          <LogOut size={16} />
        </button>
      </header>
      <main className="max-w-lg md:max-w-none lg:max-w-[1680px] mx-auto px-3 md:px-6 lg:px-8 pt-3 pb-12">
        <PlanPage />
      </main>
    </div>
  )
}
