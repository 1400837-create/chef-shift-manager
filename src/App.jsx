import { useEffect, useMemo, useState } from 'react'
import { ChefHat, User, Search, Bell, BellOff, Moon, Sun } from 'lucide-react'
import BottomNav from './components/BottomNav'
import GlobalSearch from './components/GlobalSearch'
import Dashboard from './pages/Dashboard'
import MenuPlanner from './pages/MenuPlanner'
import Inventory from './pages/Inventory'
import ShoppingList from './pages/ShoppingList'
import Cleaning from './pages/Cleaning'
import Finances from './pages/Finances'
import { useLocalStorage } from './hooks/useLocalStorage'
import { todayKey, addDays, daysBetween, startOfDay, parseLocalDate } from './utils/dateUtils'
import { menuDeadlineInfo, financeDeadlineInfo } from './utils/deadlines'
import { DAILY_CLEANING_ITEMS } from './utils/constants'
import { computeBalance } from './utils/stockBalance'

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [searchOpen, setSearchOpen] = useState(false)

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
  const [plannedPurchases, setPlannedPurchases] = useLocalStorage('plannedPurchases', [])
  const [notifiedLog, setNotifiedLog] = useLocalStorage('notifiedLog', {})
  const [darkMode, setDarkMode] = useLocalStorage('darkMode', false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const now = new Date()
  const today = todayKey()
  const staffName = settings.currentStaffName || ''
  function setStaffName(name) {
    setSettings((s) => ({ ...s, currentStaffName: name }))
  }

  const notificationsEnabled = !!settings.notificationsEnabled

  function toggleNotifications() {
    if (typeof Notification === 'undefined') {
      alert('Этот браузер не поддерживает уведомления.')
      return
    }
    if (notificationsEnabled) {
      setSettings((s) => ({ ...s, notificationsEnabled: false }))
      return
    }
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        setSettings((s) => ({ ...s, notificationsEnabled: true }))
        new Notification('Kitchen OS', {
          body: 'Уведомления включены — напомним о дедлайнах меню/финансов и о низком остатке на складе, пока приложение открыто.',
        })
      }
    })
  }

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

    const shoppingNeeded = recountCatalog.some((product) => {
      const min = Number(product.minQty)
      if (!(min > 0)) return false
      const { balance } = computeBalance(product.id, { recounts, purchases, productions, recipes }, now)
      if (balance === null || balance > min) return false
      return !plannedPurchases.some((p) => String(p.productId) === String(product.id))
    })

    return {
      dashboard: openingIncomplete,
      inventory: expiringSoon,
      menu: menuUrgent,
      cleaning: dailyIncomplete,
      finances: financeUrgent,
      shopping: shoppingNeeded,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryItems, dailyCleaning, shiftChecklist, today, recountCatalog, recounts, purchases, productions, recipes, plannedPurchases])

  // Best-effort reminders: GitHub Pages is static (no server), so there is no
  // real background push — this only fires while the app/tab is open.
  useEffect(() => {
    if (!notificationsEnabled) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    function notifyOnce(key, title, body) {
      setNotifiedLog((prev) => {
        if (prev[key]) return prev
        try {
          new Notification(title, { body })
        } catch {
          // ignore — best-effort only
        }
        return { ...prev, [key]: true }
      })
    }

    function check() {
      const d = todayKey()
      const menuInfo = menuDeadlineInfo(new Date())
      if (menuInfo.daysLeft <= 1) {
        notifyOnce(`menu_${d}`, 'Kitchen OS — дедлайн меню', `Меню нужно сдать: ${menuInfo.label}`)
      }
      const finInfo = financeDeadlineInfo(new Date())
      if (finInfo.daysLeft <= 1) {
        notifyOnce(`finance_${d}`, 'Kitchen OS — финансовый отчёт', `Отчёт нужно сдать: ${finInfo.label}`)
      }
      if (alerts.shopping) {
        notifyOnce(`shopping_${d}`, 'Kitchen OS — мало на складе', 'Есть товары с низким остатком, ещё не добавленные в закупку')
      }
    }

    check()
    const id = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationsEnabled, alerts.shopping])

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <header className="safe-top sticky top-0 z-30 bg-slate-900 text-white px-3 py-3 flex items-center gap-1 shadow-md">
        <ChefHat size={20} className="text-orange-400 shrink-0 mr-1" />
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight truncate text-[15px]">Kitchen OS</p>
          <p className="text-[10px] text-slate-400 leading-tight truncate">
            {now.toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
        <button
          onClick={() => setDarkMode((v) => !v)}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg active:bg-slate-800 text-slate-300"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          onClick={toggleNotifications}
          className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg active:bg-slate-800 ${notificationsEnabled ? 'text-orange-400' : 'text-slate-500'}`}
          title={notificationsEnabled ? 'Напоминания включены' : 'Включить напоминания'}
        >
          {notificationsEnabled ? <Bell size={16} /> : <BellOff size={16} />}
        </button>
        <button
          onClick={() => setSearchOpen(true)}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg active:bg-slate-800 text-slate-300"
        >
          <Search size={17} />
        </button>
        <div className="flex items-center gap-1 shrink-0 bg-slate-800 rounded-lg px-1.5 py-1 ml-0.5">
          <User size={12} className="text-slate-400 shrink-0" />
          <input
            className="bg-transparent text-[12px] text-white placeholder-slate-500 focus:outline-none w-12"
            placeholder="Имя"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
          />
        </div>
      </header>

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        recountCatalog={recountCatalog}
        recipes={recipes}
        recounts={recounts}
        purchases={purchases}
        productions={productions}
      />

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
            plannedPurchases={plannedPurchases}
            setPlannedPurchases={setPlannedPurchases}
            staffName={staffName}
          />
        )}
        {tab === 'shopping' && (
          <ShoppingList
            recountCatalog={recountCatalog}
            recounts={recounts}
            purchases={purchases}
            productions={productions}
            recipes={recipes}
            plannedPurchases={plannedPurchases}
            setPlannedPurchases={setPlannedPurchases}
            setPurchases={setPurchases}
          />
        )}
        {tab === 'cleaning' && (
          <Cleaning
            dailyCleaning={dailyCleaning}
            setDailyCleaning={setDailyCleaning}
            weeklyCleaning={weeklyCleaning}
            setWeeklyCleaning={setWeeklyCleaning}
            staffName={staffName}
          />
        )}
        {tab === 'finances' && (
          <Finances
            advances={advances}
            setAdvances={setAdvances}
            receipts={receipts}
            setReceipts={setReceipts}
            staffName={staffName}
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
