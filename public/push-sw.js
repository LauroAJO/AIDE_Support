// Imported into the generated Workbox service worker via workbox.importScripts.
// Handles Web Push display + click-through.

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'Aide', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Aide', {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      data: data.data || { url: '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Fix A2 (Bloco A do redesign de notificações) — antes sempre abria '/'
  // (a home), mesmo quando a notificação tinha um item específico. Prioriza
  // o deep-link explícito (`link`, calculado no backend), depois monta um
  // fallback a partir de taskId/noteId (mesmo padrão do clique no painel),
  // e só cai em '/tasks' (não mais '/') como último recurso.
  const data = event.notification.data || {};
  const url = data.link
    || (data.taskId ? `/tasks?task=${data.taskId}` : null)
    || (data.noteId ? `/notes?note=${data.noteId}` : null)
    || data.url
    || '/tasks';
  event.waitUntil(self.clients.openWindow(url));
});
