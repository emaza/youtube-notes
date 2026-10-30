import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { AppComponent } from './src/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient()
  ]
}).catch(err => console.error(err));

// Registered from code (not an inline <script>) so it works under a strict CSP.
// The server decides whether it is enabled (SERVICE_WORKER env var); when it is
// disabled, any previously installed worker and its caches are removed.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const enabled = await fetch('/api/config')
      .then(res => res.ok ? res.json() : {})
      .then((config: { serviceWorker?: boolean }) => config.serviceWorker !== false)
      .catch(() => true);

    if (enabled) {
      navigator.serviceWorker.register('/service-worker.js')
        .catch(err => console.warn('SW registration failed: ', err));
      return;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(r => r.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.startsWith('yt-notetaker')).map(k => caches.delete(k)));
    }
  });
}
