import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Production updates wait until the user accepts. An open form must never
// disappear because another version was deployed.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let acceptedUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (acceptedUpdate) window.location.reload();
    });
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'DAILYPEP_OPEN' && event.data.page === 'today') window.location.hash = '#today';
    });
    const baseURL = new URL(import.meta.env.BASE_URL, document.baseURI);
    void navigator.serviceWorker.register(new URL('sw.js', baseURL), { scope: baseURL.pathname })
      .then((registration) => {
        const offerUpdate = () => {
          if (!registration.waiting || !navigator.serviceWorker.controller) return;
          window.dispatchEvent(new CustomEvent('dailypep:update-ready', {
            detail: { update: async () => {
              if (!registration.waiting) return;
              acceptedUpdate = true;
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            } },
          }));
        };
        offerUpdate();
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state !== 'installed') return;
            if (navigator.serviceWorker.controller) offerUpdate();
            else window.dispatchEvent(new CustomEvent('dailypep:offline-ready'));
          });
        });
        window.addEventListener('online', () => { void registration.update().catch(() => undefined); });
      }).catch((error: unknown) => console.warn('DailyPep offline installation failed:', error));
  }, { once: true });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
