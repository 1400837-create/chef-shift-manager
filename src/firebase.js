import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

// From Firebase console → Project settings → General → "Your apps" → SDK
// setup and configuration. databaseURL is NOT part of that generic snippet —
// it only appears once Realtime Database is created (Build → Realtime
// Database → shown at the top of that page, looks like
// "https://<project>-default-rtdb.<region>.firebasedatabase.app").
const firebaseConfig = {
  apiKey: 'AIzaSyDVgHC3auFYtkRDLsb84gpvzzkgDs30CJ4',
  authDomain: 'la-chef-bbb7e.firebaseapp.com',
  databaseURL: 'https://la-chef-bbb7e-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'la-chef-bbb7e',
  storageBucket: 'la-chef-bbb7e.firebasestorage.app',
  messagingSenderId: '451942712255',
  appId: '1:451942712255:web:113c03cee6b9e1309cd70a',
}

// getDatabase() throws immediately if databaseURL isn't a real, valid
// Realtime Database URL — and this module loads on every single page
// (useLocalStorage → utils/sync → here), so a bad config must not crash
// the whole app. Sync-related calls all check `db` and no-op if it's null;
// everything else (which is everything that isn't sync) keeps working
// exactly as before regardless of whether Firebase is configured yet.
let firebaseApp = null
let db = null
try {
  firebaseApp = initializeApp(firebaseConfig)
  db = getDatabase(firebaseApp)
} catch (err) {
  console.error('Firebase init failed — sync will stay disabled until this is fixed:', err)
}

export { firebaseApp, db }
