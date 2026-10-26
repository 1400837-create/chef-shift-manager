import { useEffect, useState } from 'react'
import App from './App'
import StaffApp from './StaffApp'
import { StaffLogin, DeviceChooser } from './components/StaffGate'
import DatalistDropdown from './components/DatalistDropdown'
import { usePlanDeviceState, isFreshDevice } from './plan/planRoom'

// Decides what this device is running:
//  - staff device, signed in      → the plan-only shell
//  - staff device, signed out     → login (room code remembered)
//  - brand-new device             → "owner device or staff?"
//  - everything else (all existing installs) → the normal app, unchanged
export default function Root() {
  const { config, session, deviceChoice } = usePlanDeviceState()
  // Evaluated once, on first render: by the time anything else has mounted the
  // app has already written its own bookkeeping keys, so asking later would
  // always say "not fresh".
  const [fresh] = useState(() => isFreshDevice())

  // Launch parameters (from an app-icon shortcut) were read while the screens
  // rendered; clear them so a reload or a later visit doesn't repeat them.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      if (p.has('tab') || p.has('sub')) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash)
    } catch { /* ignore */ }
  }, [])

  let screen
  if (config?.role === 'staff') {
    screen = session ? <StaffApp /> : <StaffLogin initialCode={config.code} />
  } else if (fresh && !deviceChoice && !config) {
    screen = <DeviceChooser />
  } else {
    screen = <App />
  }
  // The suggestion lists of every `<input list>` in the app are drawn by this.
  return (
    <>
      {screen}
      <DatalistDropdown />
    </>
  )
}
