/**
 * The kit's components that behave (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, step 2.5), run in a
 * browser: the entries of kit-behaves-entries.tsx, each drawn by the kit's own component on the dashboard's React 19
 * and the pinned Base UI, in the app's own stylesheets. The harness bundles this with esbuild (kit-behaves.mjs) and
 * serves it for the `kit` record at /behaves (server.mjs); production never does (decision 7).
 *
 *   node tooling/scripts/e2e-harness/server.mjs 3210 kit     # http://localhost:3210/behaves ; t turns the theme, l the look
 *   corepack pnpm e2e:local -- e2e/kit/kit-behaves.spec.ts --scenario=kit
 *
 * The spec (e2e/kit/kit-behaves.spec.ts) drives each entry with a keyboard and a pointer, and holds each state it
 * reaches to the static gallery's entry of the same id (kit-gallery.mjs), element for element. A popup is drawn in a
 * portal on the document's body, as it is on a page. Under the entries, room to scroll, so the page behind a modal can
 * be seen to hold still.
 *
 * The dashboard's `tsc --noEmit` compiles this file and the entries it imports (apps/dashboard/tsconfig.json), so a
 * props change to a component that an entry no longer meets fails `corepack pnpm -r typecheck`, where no CI job runs
 * the browser spec. Nothing lints it. The spec runs it.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ENTRIES } from "./kit-behaves-entries.tsx";

/** The page: its heading, the entries in the gallery's layout, and room under them. */
function Page() {
  return (
    <main className="gx">
      <header className="gx-head">
        <h1 className="gx-title">The kit, behaving</h1>
        <p className="gx-lede">
          The kit's components with behaviour of their own, each drawn by its component on Base UI. Press t for the
          other theme and l for the other look.
        </p>
      </header>
      <section className="gx-family" data-family="behaves">
        <div className="gx-entries">
          {ENTRIES.map(({ id, Draw }) => (
            <Draw key={id} />
          ))}
        </div>
      </section>
      <div className="gx-room" aria-hidden="true" />
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
