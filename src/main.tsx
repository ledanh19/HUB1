import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "@/pwa/registerSW";
// SESSION_RECOVERY_V1: Initialize session manager early (before React renders)
import { sessionManager } from "@/auth/sessionManager";
sessionManager.initialize();

// Auto-reload on stale chunk errors (after a new deploy)
window.addEventListener('error', (event) => {
  if (
    event.message?.includes('Failed to fetch dynamically imported module') ||
    event.message?.includes('Importing a module script failed')
  ) {
    console.warn('[App] Stale chunk detected, reloading...');
    window.location.reload();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || String(event.reason);
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed')
  ) {
    console.warn('[App] Stale chunk detected (promise), reloading...');
    window.location.reload();
  }
});

// Register Service Worker for PWA + Push Notifications
registerServiceWorker().then((registration) => {
  if (registration) {
    console.log('[App] Service Worker registered successfully');
  }
}).catch((error) => {
  console.warn('[App] Service Worker registration failed:', error);
});

createRoot(document.getElementById("root")!).render(<App />);
