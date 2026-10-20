import { useState } from 'react'
import App from './App'
import StaffApp from './StaffApp'
import { StaffLogin, DeviceChooser } from './components/StaffGate'
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

  if (config?.role === 'staff') {
    return session ? <StaffApp /> : <StaffLogin initialCode={config.code} />
  }
  if (fresh && !deviceChoice && !config) return <DeviceChooser />
  return <App />
}
