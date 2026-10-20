import { LayoutDashboard, UtensilsCrossed, BookOpen, Warehouse, Wallet, ShoppingBasket } from 'lucide-react'

const TABS = [
  { key: 'dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { key: 'menu', label: 'Меню', icon: UtensilsCrossed },
  { key: 'recipes', label: 'Рецепты', icon: BookOpen },
  { key: 'inventory', label: 'Склад', icon: Warehouse },
  { key: 'shopping', label: 'Закупка', icon: ShoppingBasket },
  { key: 'finances', label: 'Финансы', icon: Wallet },
]

// A bottom bar on phones and tablets; on a wide (desktop) screen the same
// buttons stand in a column down the left edge, under the header — where a
// mouse can reach them and the page gets the full width.
export const NAV_SIDEBAR_PX = 92

export default function BottomNav({ active, onChange, alerts = {} }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 safe-bottom rounded-t-3xl
        bg-slate-900/90 backdrop-blur-xl border-t border-white/10
        shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.45)]
        lg:top-[var(--app-header-h,56px)] lg:right-auto lg:rounded-none lg:border-t-0 lg:border-r lg:border-white/10
        lg:bg-slate-900 lg:shadow-[8px_0_24px_-12px_rgba(0,0,0,0.5)]"
      style={{ ['--nav-w']: `${NAV_SIDEBAR_PX}px` }}
    >
      <div className="grid grid-cols-6 px-1 pt-1 lg:flex lg:flex-col lg:gap-1.5 lg:p-2.5 lg:pt-4 lg:w-[var(--nav-w)]">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = active === key
          const hasAlert = alerts[key]
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`relative flex flex-col items-center justify-center gap-1 py-2 min-h-[62px] rounded-2xl transition-all duration-200
                lg:min-h-[74px] lg:py-3 lg:w-full ${
                isActive
                  ? 'text-orange-400 bg-orange-500/15 lg:bg-orange-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 active:bg-white/10'
              }`}
            >
              <span
                className={`absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full bg-orange-400 transition-all duration-300 lg:top-1/2 lg:left-0 lg:-translate-y-1/2 lg:translate-x-0 lg:w-[3px] lg:h-8 ${
                  isActive ? 'w-8 opacity-100' : 'w-0 opacity-0'
                }`}
              />
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
              <span className="text-[10px] font-semibold leading-none tracking-wide">{label}</span>
              {hasAlert && (
                <span className="absolute top-1.5 right-[22%] w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-slate-900 shadow" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
