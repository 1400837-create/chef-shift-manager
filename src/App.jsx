import { useEffect, useMemo, useRef, useState } from 'react'
import { ChefHat, User, Search, Bell, BellOff, Moon, Sun } from 'lucide-react'
import BottomNav from './components/BottomNav'
import GlobalSearch from './components/GlobalSearch'
import Dashboard from './pages/Dashboard'
import MenuPlanner from './pages/MenuPlanner'
import Inventory from './pages/Inventory'
import ShoppingList from './pages/ShoppingList'
import Cleaning from './pages/Cleaning'
import Finances from './pages/Finances'
import { UndoRedoBar } from './components/UI'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useTabHistory } from './hooks/useTabHistory'
import { useBackableTab } from './hooks/useBackableTab'
import { todayKey, addDays, daysBetween, startOfDay, parseLocalDate } from './utils/dateUtils'
import { menuDeadlineInfo } from './utils/deadlines'
import { DAILY_CLEANING_ITEMS } from './utils/constants'
import { computeBalance } from './utils/stockBalance'

export default function App() {
  const [tab, setTab] = useState('dashboard')
  useBackableTab('app', tab, setTab)
  const [searchOpen, setSearchOpen] = useState(false)

  // This is a single-page app — every tab/sub-tab switch goes through
  // useBackableTab's pushState, never a real page navigation — so the
  // browser's own scroll-restoration guess on popstate is working from
  // stale assumptions (e.g. restoring a scroll position that belonged to a
  // completely different, much taller view) and fights with any scroll
  // position pages manage themselves (see MenuPlanner's recipe/day jumps).
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
  }, [])

  // Exposes the sticky header's real rendered height (varies with the
  // safe-area inset on notched phones) as a CSS variable, so page-level sticky
  // bars — e.g. MenuPlanner's Меню/Рецепты toggle — can stick right below it
  // instead of guessing a fixed pixel value or overlapping it.
  const headerRef = useRef(null)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const setVar = () => document.documentElement.style.setProperty('--app-header-h', `${el.offsetHeight}px`)
    setVar()
    const ro = new ResizeObserver(setVar)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // One-shot cross-page navigation request — two callers: MenuPlanner sets
  // this when a recipe ingredient's product doesn't exist yet in the
  // nomenclature and the user confirms adding it, and Глобальный поиск sets
  // it when a product result is tapped. Either way Inventory reads it once
  // on mount (to land on Каталог with that item scrolled into view) and
  // immediately hands back control via onInitialConsumed so a later,
  // unrelated visit to Склад doesn't get stuck reopening on Каталог.
  const [pendingInventoryTab, setPendingInventoryTab] = useState(null)
  const [pendingCatalogHighlight, setPendingCatalogHighlight] = useState(null)

  function goToCatalogProduct(productId) {
    setPendingInventoryTab('catalog')
    setPendingCatalogHighlight(productId)
    setTab('inventory')
  }

  // Same one-shot pattern, for Глобальный поиск's recipe results — jumps to
  // Меню → Рецепты with that recipe opened and scrolled into view instead of
  // just showing it in the search results with nowhere to go.
  const [pendingOpenRecipeId, setPendingOpenRecipeId] = useState(null)

  function goToRecipe(recipeId) {
    setPendingOpenRecipeId(recipeId)
    setTab('menu')
  }

  const [shiftChecklist, setShiftChecklist] = useLocalStorage('shiftChecklist', {})
  const [kuchenhilfeTasks, setKuchenhilfeTasks] = useLocalStorage('kuchenhilfeTasks', {})

  const [menuData, setMenuData] = useLocalStorage('menuData', {})
  const [settings, setSettings] = useLocalStorage('settings', { kuchenleiterinEmail: '' })
  const [dishLibrary, setDishLibrary] = useLocalStorage('dishLibrary', {})

  const [inventoryItems, setInventoryItems] = useLocalStorage('inventoryItems', [])
  const [audits, setAudits] = useLocalStorage('audits', {})

  const [dailyCleaning, setDailyCleaning] = useLocalStorage('dailyCleaning', {})
  const [weeklyCleaning, setWeeklyCleaning] = useLocalStorage('weeklyCleaning', {})

  // Shape is a single ongoing advance { budget, updatedAt }, not a per-period
  // map — "Потрачено"/"Остаток" count every receipt entered since updatedAt,
  // so entering a new advance amount is what starts a fresh count, rather
  // than an automatic calendar-based reporting period (removed per request).
  const [advance, setAdvance] = useLocalStorage('advances', { budget: '', updatedAt: 0 })
  const [receipts, setReceipts] = useLocalStorage('receipts', [])

  const [recountCatalog, setRecountCatalog] = useLocalStorage('recountCatalog', [])
  const [recounts, setRecounts] = useLocalStorage('recounts', {})

  const [recipes, setRecipes] = useLocalStorage('recipes', [])
  const [purchases, setPurchases] = useLocalStorage('purchases', [])
  const [productions, setProductions] = useLocalStorage('productions', [])
  const [catalogWaste, setCatalogWaste] = useLocalStorage('catalogWaste', [])
  const [plannedPurchases, setPlannedPurchases] = useLocalStorage('plannedPurchases', [])
  const [notifiedLog, setNotifiedLog] = useLocalStorage('notifiedLog', {})
  const [darkMode, setDarkMode] = useLocalStorage('darkMode', false)

  // One undo/redo stack per tab, except Склад+Закупка share a single stack —
  // they edit the same underlying catalog/purchase data (catalog auto-create
  // on import, "mark purchased" writing into Приход), so two independent
  // stacks over the same arrays could let an undo on one tab silently skip
  // over a change made from the other.
  const dashboardHistory = useTabHistory({
    shiftChecklist: [shiftChecklist, setShiftChecklist],
    kuchenhilfeTasks: [kuchenhilfeTasks, setKuchenhilfeTasks],
    settings: [settings, setSettings],
  })
  // recipes can carry embedded photo data URLs — a lower cap here than the
  // other groups keeps a long editing session from holding many near-full
  // copies of that array alive in memory at once (see useTabHistory).
  const menuHistory = useTabHistory({
    menuData: [menuData, setMenuData],
    dishLibrary: [dishLibrary, setDishLibrary],
    recipes: [recipes, setRecipes],
  }, 12)
  const inventoryHistory = useTabHistory({
    inventoryItems: [inventoryItems, setInventoryItems],
    audits: [audits, setAudits],
    recountCatalog: [recountCatalog, setRecountCatalog],
    recounts: [recounts, setRecounts],
    purchases: [purchases, setPurchases],
    productions: [productions, setProductions],
    catalogWaste: [catalogWaste, setCatalogWaste],
    plannedPurchases: [plannedPurchases, setPlannedPurchases],
  })
  const cleaningHistory = useTabHistory({
    dailyCleaning: [dailyCleaning, setDailyCleaning],
    weeklyCleaning: [weeklyCleaning, setWeeklyCleaning],
  })
  const financesHistory = useTabHistory({
    advance: [advance, setAdvance],
    receipts: [receipts, setReceipts],
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  // useLocalStorage fires this when a write fails (storage full/unavailable)
  // instead of failing silently — the change is still visible on screen
  // (it's in memory) but won't survive a reload, which is exactly the kind
  // of thing that must not go unnoticed on the app's only persistence layer.
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    function onStorageError() { setStorageError(true) }
    window.addEventListener('kitchenos-storage-error', onStorageError)
    return () => window.removeEventListener('kitchenos-storage-error', onStorageError)
  }, [])

  // One-time default: catalog items without a "мин. остаток" get 1, so the
  // low-stock/shopping-needed features have something to work with out of
  // the box. Only fills in missing values — never touches ones already set —
  // and runs once (tracked via minQtyDefaultsApplied) so it doesn't fight
  // deliberate later edits, including setting one back to blank.
  useEffect(() => {
    if (localStorage.getItem('kitchenOS_minQtyDefaultsApplied')) return
    setRecountCatalog((prev) =>
      prev.map((item) => (item.minQty === undefined || item.minQty === '' ? { ...item, minQty: '1' } : item))
    )
    localStorage.setItem('kitchenOS_minQtyDefaultsApplied', 'true')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One-time: finances used to bucket advances/receipts into automatic
  // 2-week reporting periods (keyed "P<n>"); that concept is gone, replaced
  // by one ongoing advance. Old data was { "P123": { budget }, ... } — pick
  // the most recent period's budget as the starting advance, dated to that
  // period's start so receipts already logged in it still count as spent.
  useEffect(() => {
    if (localStorage.getItem('kitchenOS_advancePeriodsMigrated')) return
    if (advance && typeof advance === 'object' && !Array.isArray(advance) && !('budget' in advance)) {
      const periodKeys = Object.keys(advance).filter((k) => /^P\d+$/.test(k))
      if (periodKeys.length) {
        const latestKey = periodKeys.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).pop()
        const epoch = Date.UTC(2024, 0, 1)
        setAdvance({
          budget: advance[latestKey]?.budget || '',
          updatedAt: epoch + Number(latestKey.slice(1)) * 14 * 86400000,
        })
      } else {
        setAdvance({ budget: '', updatedAt: 0 })
      }
    }
    localStorage.setItem('kitchenOS_advancePeriodsMigrated', 'true')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One-time: receipts didn't previously track enteredAt (they only had the
  // user-editable "date"), which the new ongoing-advance spent/remaining
  // calculation needs to compare against advance.updatedAt — backfill from
  // date so already-logged receipts keep counting correctly.
  useEffect(() => {
    if (localStorage.getItem('kitchenOS_receiptsEnteredAtMigrated')) return
    setReceipts((prev) => prev.map((r) => {
      if (r.enteredAt) return r
      let enteredAt = 0
      try { enteredAt = parseLocalDate(r.date).getTime() } catch { enteredAt = 0 }
      return { ...r, enteredAt }
    }))
    localStorage.setItem('kitchenOS_receiptsEnteredAtMigrated', 'true')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        new Notification('LA CHEF', {
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
    const advanceBudget = Number(advance.budget) || 0
    const advanceSpent = receipts
      .filter((r) => (r.enteredAt || 0) >= (advance.updatedAt || 0))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    const financeOverspent = advanceBudget > 0 && advanceBudget - advanceSpent < 0

    const dailyState = dailyCleaning[today] || {}
    const dailyIncomplete = DAILY_CLEANING_ITEMS.some((_, idx) => !dailyState[idx])

    const openingIncomplete = !shiftChecklist[today]?.kitchenClean || !shiftChecklist[today]?.tasksAssigned

    const shoppingNeeded = recountCatalog.some((product) => {
      if (product.archived) return false
      const min = Number(product.minQty)
      if (!(min > 0)) return false
      const { balance } = computeBalance(product.id, { recounts, purchases, productions, recipes, waste: catalogWaste }, now)
      if (balance === null || balance > min) return false
      return !plannedPurchases.some((p) => String(p.productId) === String(product.id))
    })

    return {
      dashboard: openingIncomplete,
      inventory: expiringSoon,
      menu: menuUrgent,
      cleaning: dailyIncomplete,
      finances: financeOverspent,
      shopping: shoppingNeeded,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryItems, dailyCleaning, shiftChecklist, today, recountCatalog, recounts, purchases, productions, recipes, plannedPurchases, catalogWaste, advance, receipts])

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
        notifyOnce(`menu_${d}`, 'LA CHEF — дедлайн меню', `Меню нужно сдать: ${menuInfo.label}`)
      }
      if (alerts.finances) {
        notifyOnce(`finance_${d}`, 'LA CHEF — аванс', 'Остаток аванса ушёл в минус')
      }
      if (alerts.shopping) {
        notifyOnce(`shopping_${d}`, 'LA CHEF — мало на складе', 'Есть товары с низким остатком, ещё не добавленные в закупку')
      }
    }

    check()
    const id = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationsEnabled, alerts.shopping, alerts.finances])

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <header
        ref={headerRef}
        className="safe-top sticky top-0 z-30 bg-slate-900 text-white px-3 py-3 flex items-center gap-1 shadow-md"
      >
        <ChefHat size={20} className="text-orange-400 shrink-0 mr-1" />
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight truncate text-[15px]">LA CHEF</p>
          <p className="text-[10px] text-slate-400 leading-tight truncate">
            {now.toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' })}
            {' · сборка '}
            {new Date(__BUILD_TIME__).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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

      {storageError && (
        <div className="sticky z-30 bg-red-600 text-white px-3 py-2 flex items-center gap-2 text-sm" style={{ top: 'var(--app-header-h, 64px)' }}>
          <span className="flex-1">
            Не удалось сохранить последнее изменение — на устройстве не хватает места. Освободите память
            (например, удалите крупные фото у старых рецептов) или скачайте резервную копию на Дашборде.
          </span>
          <button onClick={() => setStorageError(false)} className="shrink-0 font-semibold underline">
            Скрыть
          </button>
        </div>
      )}

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        recountCatalog={recountCatalog}
        recipes={recipes}
        recounts={recounts}
        purchases={purchases}
        productions={productions}
        catalogWaste={catalogWaste}
        onSelectProduct={(id) => { goToCatalogProduct(id); setSearchOpen(false) }}
        onSelectRecipe={(id) => { goToRecipe(id); setSearchOpen(false) }}
      />

      <main className="max-w-lg md:max-w-none mx-auto px-3 md:px-6 lg:px-10 pt-3 pb-24">
        {tab === 'dashboard' && (
          <>
            <UndoRedoBar {...dashboardHistory} />
            <Dashboard
              shiftChecklist={shiftChecklist}
              setShiftChecklist={setShiftChecklist}
              kuchenhilfeTasks={kuchenhilfeTasks}
              setKuchenhilfeTasks={setKuchenhilfeTasks}
              recountCatalog={recountCatalog}
              recounts={recounts}
              purchases={purchases}
              productions={productions}
              catalogWaste={catalogWaste}
              recipes={recipes}
              plannedPurchases={plannedPurchases}
              menuData={menuData}
              onNavigate={setTab}
            />
          </>
        )}
        {tab === 'menu' && (
          <>
            <UndoRedoBar {...menuHistory} />
            <MenuPlanner
              menuData={menuData}
              setMenuData={setMenuData}
              settings={settings}
              setSettings={setSettings}
              dishLibrary={dishLibrary}
              setDishLibrary={setDishLibrary}
              recipes={recipes}
              setRecipes={setRecipes}
              recountCatalog={recountCatalog}
              setRecountCatalog={setRecountCatalog}
              onNavigateToCatalog={goToCatalogProduct}
              initialOpenRecipeId={pendingOpenRecipeId}
              onInitialRecipeConsumed={() => setPendingOpenRecipeId(null)}
            />
          </>
        )}
        {tab === 'inventory' && (
          <>
            <UndoRedoBar {...inventoryHistory} />
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
              catalogWaste={catalogWaste}
              setCatalogWaste={setCatalogWaste}
              plannedPurchases={plannedPurchases}
              setPlannedPurchases={setPlannedPurchases}
              menuData={menuData}
              staffName={staffName}
              initialTab={pendingInventoryTab}
              initialHighlightId={pendingCatalogHighlight}
              onInitialConsumed={() => { setPendingInventoryTab(null); setPendingCatalogHighlight(null) }}
            />
          </>
        )}
        {tab === 'shopping' && (
          <>
            <UndoRedoBar {...inventoryHistory} />
            <ShoppingList
              recountCatalog={recountCatalog}
              setRecountCatalog={setRecountCatalog}
              recounts={recounts}
              purchases={purchases}
              productions={productions}
              catalogWaste={catalogWaste}
              recipes={recipes}
              menuData={menuData}
              plannedPurchases={plannedPurchases}
              setPlannedPurchases={setPlannedPurchases}
              setPurchases={setPurchases}
            />
          </>
        )}
        {tab === 'cleaning' && (
          <>
            <UndoRedoBar {...cleaningHistory} />
            <Cleaning
              dailyCleaning={dailyCleaning}
              setDailyCleaning={setDailyCleaning}
              weeklyCleaning={weeklyCleaning}
              setWeeklyCleaning={setWeeklyCleaning}
              staffName={staffName}
            />
          </>
        )}
        {tab === 'finances' && (
          <>
            <UndoRedoBar {...financesHistory} />
            <Finances
              advance={advance}
              setAdvance={setAdvance}
              receipts={receipts}
              setReceipts={setReceipts}
              staffName={staffName}
            />
          </>
        )}
      </main>

      <BottomNav active={tab} onChange={setTab} alerts={alerts} />

      <datalist id="product-nomenclature">
        {recountCatalog.filter((item) => !item.archived).map((item) => (
          <option key={item.id} value={item.name} />
        ))}
      </datalist>
    </div>
  )
}
