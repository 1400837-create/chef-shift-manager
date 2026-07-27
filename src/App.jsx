import { useMemo, useState } from 'react'
import { ChefHat } from 'lucide-react'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import MenuPlanner from './pages/MenuPlanner'
import Inventory from './pages/Inventory'
import Cleaning from './pages/Cleaning'
import Finances from './pages/Finances'
import { useLocalStorage } from './hooks/useLocalStorage'
import { todayKey, addDays, daysBetween, startOfDay, parseLocalDate } from './utils/dateUtils'
import { menuDeadlineInfo, financeDeadlineInfo } from './utils/deadlines'
import { DAILY_CLEANING_ITEMS } from './utils/constants'

export default function App() {
  const [tab, setTab] = useState('dashboard')

  const [shiftChecklist, setShiftChecklist] = useLocalStorage('shiftChecklist', {})
  const [kuchenhilfeTasks, setKuchenhilfeTasks] = useLocalStorage('kuchenhilfeTasks', {})
  const [stockTracker, setStockTracker] = useLocalStorage('stockTracker', { checks: {}, produce: [] })

  const [menuData, setMenuData] = useLocalStorage('menuData', {})
  const [settings, setSettings] = useLocalStorage('settings', { kuchenleiterinEmail: '' })
  const [dishLibrary, setDishLibrary] = useLocalStorage('dishLibrary', {})

  const [inventoryItems, setInventoryItems] = useLocalStorage('inventoryItems', [])
  const [audits, setAudits] = useLocalStorage('audits', {})

  const [dailyCleaning, setDailyCleaning] = useLocalStorage('dailyCleaning', {})
  const [weeklyCleaning, setWeeklyCleaning] = useLocalStorage('weeklyCleaning', {})

  const [advances, setAdvances] = useLocalStorage('advances', {})
  const [receipts, setReceipts] = useLocalStorage('receipts', [])

  const [recountCatalog, setRecountCatalog] = useLocalStorage('recountCatalog', [])
  const [recounts, setRecounts] = useLocalStorage('recounts', {})

  const [recipes, setRecipes] = useLocalStorage('recipes', [])
  const [purchases, setPurchases] = useLocalStorage('purchases', [])
  const [productions, setProductions] = useLocalStorage('productions', [])

  const now = new Date()
  const today = todayKey()

  const alerts = useMemo(() => {
    const expiringSoon = inventoryItems
      .filter((i) => i.status === 'active' || !i.status)
      .some((i) => {
        const expiry = addDays(parseLocalDate(i.packDate), Number(i.shelfLifeDays || 0))
        return daysBetween(startOfDay(now), expiry) <= 1
      })

    const menuUrgent = menuDeadlineInfo(now).daysLeft <= 3
    const financeUrgent = financeDeadlineInfo(now).daysLeft <= 3

    const dailyState = dailyCleaning[today] || {}
    const dailyIncomplete = DAILY_CLEANING_ITEMS.some((_, idx) => !dailyState[idx])

    const openingIncomplete = !shiftChecklist[today]?.kitchenClean || !shiftChecklist[today]?.tasksAssigned

    return {
      dashboard: openingIncomplete,
      inventory: expiringSoon,
      menu: menuUrgent,
      cleaning: dailyIncomplete,
      finances: financeUrgent,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryItems, dailyCleaning, shiftChecklist, today])

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="safe-top sticky top-0 z-30 bg-slate-900 text-white px-4 py-3 flex items-center gap-2 shadow-md">
        <ChefHat size={22} className="text-orange-400" />
        <div>
          <p className="font-bold leading-tight">Kitchen OS</p>
          <p className="text-[11px] text-slate-400 leading-tight">
            {now.toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 pt-3 pb-24">
        {tab === 'dashboard' && (
          <Dashboard
            shiftChecklist={shiftChecklist}
            setShiftChecklist={setShiftChecklist}
            kuchenhilfeTasks={kuchenhilfeTasks}
            setKuchenhilfeTasks={setKuchenhilfeTasks}
            stockTracker={stockTracker}
            setStockTracker={setStockTracker}
          />
        )}
        {tab === 'menu' && (
          <MenuPlanner
            menuData={menuData}
            setMenuData={setMenuData}
            settings={settings}
            setSettings={setSettings}
            dishLibrary={dishLibrary}
            setDishLibrary={setDishLibrary}
            recipes={recipes}
          />
        )}
        {tab === 'inventory' && (
          <Inventory
            items={inventoryItems}
            setItems={setInventoryItems}
            audits={audits}
            setAudits={setAudits}
            recountCatalog={recountCatalog}
            setRecountCatalog={setRecountCatalog}
            recounts={recounts}
            setRecounts={setRecounts}
            recipes={recipes}
            setRecipes={setRecipes}
            purchases={purchases}
            setPurchases={setPurchases}
            productions={productions}
            setProductions={setProductions}
          />
        )}
        {tab === 'cleaning' && (
          <Cleaning
            dailyCleaning={dailyCleaning}
            setDailyCleaning={setDailyCleaning}
            weeklyCleaning={weeklyCleaning}
            setWeeklyCleaning={setWeeklyCleaning}
          />
        )}
        {tab === 'finances' && (
          <Finances
            advances={advances}
            setAdvances={setAdvances}
            receipts={receipts}
            setReceipts={setReceipts}
          />
        )}
      </main>

      <BottomNav active={tab} onChange={setTab} alerts={alerts} />

      <datalist id="product-nomenclature">
        {recountCatalog.map((item) => (
          <option key={item.id} value={item.name} />
        ))}
      </datalist>
    </div>
  )
}
