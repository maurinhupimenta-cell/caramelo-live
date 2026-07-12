// AMD Live — service worker: recebe o push da ZONA DE OPERACAO mesmo com o site fechado
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.t || 'AMD Live', {
    body: d.b || '', tag: d.tag || 'amd', renotify: true,
    vibrate: [200, 100, 200, 100, 400]
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if ('focus' in w) return w.focus(); }
    return clients.openWindow('/');
  }));
});
