import { apiFetch } from './api';
import { urlBase64ToUint8Array } from './auth';

// Best-effort push registration. Safe to call repeatedly; subscribes once.
export async function registerPush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const { publicKey } = await apiFetch('/api/push/vapid-key');
    if (!publicKey) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const json = sub.toJSON();
    await apiFetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      }),
    });
  } catch {
    /* push is optional — ignore failures */
  }
}
