// Chanlytics OS — the installable shell's service worker.
//
// It caches nothing and answers nothing: the workspace is live data, and a
// stale Inbox would be worse than a slow one. It exists so a phone can add
// the app to its home screen, and it takes over at once so an update never
// waits on a closed tab. Push arrives here when the keys for it exist.
//
// No fetch handler. One that did nothing still sent a returning page's
// requests through this worker in WebKit, Safari's engine (Chrome skips an
// empty one), and Chrome no longer asks for one to install the app (the load
// review of 28 Oct 2026: Chrome's own check found it installable without it).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
