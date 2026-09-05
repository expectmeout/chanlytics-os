"use client";

import { useEffect } from "react";

const CHUNK_ERROR = /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i;

/** Pane-level error boundary: stale-deploy chunk failures self-heal with one
 *  reload; everything else gets a branded card instead of Next's white screen. */
export default function OsError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("os_error", error.message);
    if (CHUNK_ERROR.test(error.message)) {
      try {
        if (!sessionStorage.getItem("chunk-reloaded")) {
          sessionStorage.setItem("chunk-reloaded", "1");
          window.location.reload();
          return;
        }
      } catch { /* storage blocked — fall through to the card */ }
    }
    try { sessionStorage.removeItem("chunk-reloaded"); } catch { /* ignore */ }
  }, [error]);

  return (
    <main className="auth-card" style={{ marginTop: "24vh" }}>
      <h1>Something broke on this screen</h1>
      <p>The rest of Chanlytics OS is fine. Reloading usually fixes it.</p>
      <button onClick={() => window.location.reload()}>Reload</button>
      <div className="hint">
        Still stuck? Try again in a minute. <button onClick={reset} style={{ background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0, font: "inherit" }}>Retry without reloading</button>
      </div>
    </main>
  );
}
