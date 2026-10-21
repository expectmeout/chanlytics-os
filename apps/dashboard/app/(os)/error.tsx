"use client";

import { useEffect } from "react";
import { MIN_MS, routeOfAddress } from "@chanlytics/contracts";
import { REPORT_WORDS } from "@chanlytics/contracts";
import { REPORT_AFTER_KEY, lastClientError, reportClientError } from "@/client/client-error";

const CHUNK_ERROR = /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i;
/** Two chunk failures closer together than this are a loop, not a new deploy. */
const LOOP_MS = MIN_MS;

/** Pane-level error boundary: stale-deploy chunk failures self-heal with one
 *  reload; everything else gets a branded card instead of Next's white screen.
 *  Either way the error is told to the server (client-error.ts), once.
 *
 *  The reporter is imported with the boundary, so a report never waits on a chunk: after a deploy the old ones are
 *  gone, and a boundary that caught a page's first render may be all of the frame that ran. The boundary is a chunk
 *  group the frame cannot count as loaded, so what it imports is downloaded twice on every page: the reporter holds
 *  its route's path, not the route table, and the route is read from the address through contracts, as
 *  workspace.ts routeOnScreen reads it. */
/** Leave the error this screen showed for Get help, then reload: the frame opens the sheet with it, as a bug. */
function reportAfterReload() {
  try {
    sessionStorage.setItem(REPORT_AFTER_KEY, JSON.stringify(lastClientError() ?? { none: true }));
  } catch {
    /* storage blocked: the sheet opens from Settings › Profile instead */
  }
  window.location.reload();
}

export default function OsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError("os", error, routeOfAddress(window.location), error.digest ?? null);
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
      <p>The rest of Chanlytics is fine. Reloading usually fixes it.</p>
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
      {/* Report this (decisions 0066, 0067): the reload heals the frame, and its sheet opens on "Something isn't
          working" with this error. */}
      <button className="auth-linkbtn" onClick={reportAfterReload} data-testid="os-error-report">
        {REPORT_WORDS.doorShort}
      </button>
    </main>
  );
}
