const CACHE_NAME = 'kitchen-os-v5'
const APP_SHELL = ['/chef-shift-manager/', '/chef-shift-manager/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Mobile networks are frequently not "warm" yet the instant a PWA cold-starts
// from its home-screen icon — a fetch issued in that first moment can fail
// even though the network is fine a few hundred ms later. One retry with a
// short delay absorbs that instead of failing the request outright.
async function fetchWithRetry(request, retries = 2, delayMs = 300) {
  try {
    return await fetch(request)
  } catch (err) {
    if (retries <= 0) throw err
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return fetchWithRetry(request, retries - 1, delayMs)
  }
}

// Network-first for navigation/HTML, cache-first for everything else.
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    // GitHub Pages sends the HTML with Cache-Control: max-age=600, so a plain
    // fetch() here can be satisfied entirely from the browser's own HTTP
    // cache for up to 10 minutes after a deploy — "network-first" in name
    // only, never actually reaching the network. Force revalidation so a
    // fresh deploy is picked up on the very next load, not up to 10 min later.
    event.respondWith(
      fetchWithRetry(new Request(request.url, { cache: 'no-store' }))
        .catch(() => caches.match('/chef-shift-manager/'))
    )
    return
  }

  // Bug fixed here: the old code fell back to `cached` in the .catch even on
  // a cold cache (nothing fetched yet), silently resolving to `undefined` —
  // respondWith(undefined) fails the resource load with no retry and no
  // visible error, which is exactly what produces an intermittent blank
  // white screen: the very first launch after install has an empty cache,
  // so any transient network hiccup on a critical JS chunk killed the whole
  // page load, while the next launch (already cached, or network happened
  // to succeed) rendered fine.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetchWithRetry(request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => cached)
    })
  )
})
