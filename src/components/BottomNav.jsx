import { LayoutDashboard, UtensilsCrossed, Warehouse, SprayCan, Wallet, ShoppingBasket } from 'lucide-react'

const TABS = [
  { key: 'dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { key: 'menu', label: 'Меню', icon: UtensilsCrossed },
  { key: 'inventory', label: 'Склад', icon: Warehouse },
  { key: 'shopping', label: 'Закупка', icon: ShoppingBasket },
  { key: 'cleaning', label: 'Уборка', icon: SprayCan },
  { key: 'finances', label: 'Финансы', icon: Wallet },
]

export default function BottomNav({ active, onChange, alerts = {} }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-slate-700 safe-bottom">
      <div className="grid grid-cols-6">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = active === key
          const hasAlert = alerts[key]
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`relative flex flex-col items-center justify-center gap-1 py-2.5 min-h-[64px] active:bg-slate-800 transition-colors ${
                isActive ? 'text-orange-400' : 'text-slate-400'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
              {hasAlert && (
                <span className="absolute top-1.5 right-[18%] w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-slate-900" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
