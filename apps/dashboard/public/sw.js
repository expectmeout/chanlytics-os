// Chanlytics OS — the installable shell's service worker.
//
// It caches nothing and answers nothing: the workspace is live data, and a
// stale Inbox would be worse than a slow one. It exists so a phone can add
// the app to its home screen, and it takes over at once so an update never
// waits on a closed tab.
//
// No fetch handler. One that did nothing still sent a returning page's
// requests through this worker in WebKit, Safari's engine (Chrome skips an
// empty one), and Chrome no longer asks for one to install the app (the load
// review of 28 Oct 2026: Chrome's own check found it installable without it).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// A browser told (D12 of the answers canvas): the bell's own line, and a press opens where the bell opens.
self.addEventListener("push", (event) => {
  let note = {};
  try {
    note = event.data ? event.data.json() : {};
  } catch {
    note = {};
  }
  event.waitUntil(
    self.registration.showNotification(note.title || "Chanlytics", {
      body: note.body || "",
      icon: "/icons/icon-192.png",
      tag: note.notification_id || undefined,
      data: { route: note.route || "" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route = (event.notification.data && event.notification.data.route) || "";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => {
      const tab = open.find((c) => "focus" in c);
      if (tab) {
        tab.postMessage({ type: "open-route", route });
        return tab.focus();
      }
      return self.clients.openWindow(`/?to=${encodeURIComponent(route)}`);
    }),
  );
});
