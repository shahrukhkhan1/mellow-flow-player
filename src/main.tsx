import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Check for force reload URL parameter
const urlParams = new URLSearchParams(window.location.search);
const forceReload = urlParams.get('forcereload') === '1';

// Check if dev mode is enabled
const devMode = localStorage.getItem('dev-mode') === 'true';

// Perform cache clear if force reload or dev mode is enabled
const performStartupCacheClear = async () => {
  if (!forceReload && !devMode) return;

  console.log('[Startup] Cache clear triggered:', { forceReload, devMode });

  try {
    // Clear all caches
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map(name => caches.delete(name)));
      console.log('[Startup] Cleared caches:', names);
    }

    // Unregister service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister()));
      console.log('[Startup] Unregistered service workers:', registrations.length);
    }

    // If triggered by URL param, remove it and reload
    if (forceReload) {
      urlParams.delete('forcereload');
      const newUrl = urlParams.toString() 
        ? `${window.location.pathname}?${urlParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      window.location.reload();
      return; // Stop execution, page will reload
    }
  } catch (error) {
    console.error('[Startup] Failed to clear caches:', error);
  }
};

// Run cache clear before rendering (async IIFE)
(async () => {
  await performStartupCacheClear();
  createRoot(document.getElementById("root")!).render(<App />);
})();
