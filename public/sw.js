self.addEventListener('install', (event) => {
  console.log('[SW] Installing...')
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  console.log('[SW] Activated')
  self.clients.claim()
})
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('/api/')) return
  if (event.request.url.includes('supabase.co')) return
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then(cached =>
        cached || new Response('Offline', { status: 503 })
      )
    )
  )
})
