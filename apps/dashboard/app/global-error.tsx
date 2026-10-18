"use client";

import { useEffect } from "react";

/**
 * Root error boundary — replaces its own <html>, styles inline: the dark paper, its ink, the three's coral. The
 * sign-in pages have no boundary of their own, so theirs land here too; each is told to the server (client-error.ts).
 *
 * The reporter is imported once there is something to report. A boundary is a chunk group of its own that every page
 * loads, and the layouts below it cannot count its modules as loaded: imported here, the reporter and the route table
 * it reads were downloaded twice on every page of the OS, once here and once in the frame (17 Oct 2026).
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    void import("@/client/client-error")
      .then(({ reportClientError }) =>
        reportClientError("root", error, window.location.pathname.replace(/^\//, ""), error.digest ?? null),
      )
      .catch(() => {});
  }, [error]);
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0c0d0f",
          color: "#fbfaf8",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          height: "100vh",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Chanlytics hit an error</div>
          <div style={{ color: "#a09c97", fontSize: 14, marginTop: 8 }}>
            Reloading almost always fixes this. ({error.message.slice(0, 80)})
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 18,
              background: "#fa695c",
              color: "#0c0d0f",
              fontWeight: 600,
              border: "none",
              borderRadius: 8,
              padding: "10px 22px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
