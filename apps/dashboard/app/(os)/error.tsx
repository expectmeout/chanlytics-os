"use client";

import { useEffect } from "react";
import { MIN_MS } from "@chanlytics/contracts";
import { reportClientError } from "@/client/client-error";
import { routeOnScreen } from "@/legacy-bridge/workspace";

const CHUNK_ERROR = /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i;
/** Two chunk failures closer together than this are a loop, not a new deploy. */
const LOOP_MS = MIN_MS;

/** Pane-level error boundary: stale-deploy chunk failures self-heal with one
 *  reload; everything else gets a branded card instead of Next's white screen.
 *  Either way the error is told to the server (client-error.ts), once. */
export default function OsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError("os", error, routeOnScreen(), error.digest ?? null);
    if (CHUNK_ERROR.test(error.message)) {
      try {
        // A TIMESTAMP, not a flag. The flag was only ever cleared on this line
        // below — which a successful self-heal never reaches, because the
        // reloaded page renders fine and this boundary never mounts. So the
        // first stale-deploy reload in a tab worked and every later one showed
        // the card instead: a tab open across two deploys stopped healing. What
        // must be stopped is a reload LOOP, which is two failures moments
        // apart, not two hours apart.
        const last = Number(sessionStorage.getItem("chunk-reloaded") ?? 0);
        if (!(Date.now() - last < LOOP_MS)) {
          sessionStorage.setItem("chunk-reloaded", String(Date.now()));
          window.location.reload();
          return;
        }
      } catch {
        /* storage blocked — fall through to the card */
      }
    }
    try {
      sessionStorage.removeItem("chunk-reloaded");
    } catch {
      /* ignore */
    }
  }, [error]);

  return (
    <main className="auth-card" style={{ marginTop: "24vh" }}>
      <h1>Something broke on this screen</h1>
      <p>The rest of Chanlytics OS is fine. Reloading usually fixes it.</p>
      <button onClick={() => window.location.reload()}>Reload</button>
      <div className="hint">
        Still stuck? Try again in a minute.{" "}
        <button
          onClick={reset}
          style={{
            background: "none",
            border: "none",
            color: "inherit",
            textDecoration: "underline",
            cursor: "pointer",
            padding: 0,
            font: "inherit",
          }}
        >
          Retry without reloading
        </button>
      </div>
    </main>
  );
}
