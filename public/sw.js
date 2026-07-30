const CACHE_NAME = 'kitchen-os-v2'
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
      fetch(request, { cache: 'no-store' }).catch(() => caches.match('/chef-shift-manager/'))
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => cached)
    })
  )
})
