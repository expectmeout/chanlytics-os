/**
 * A page's layout: its own stylesheets around whatever the page draws (sheet-links.tsx PageSheets). Each page under
 * app/(os) has one of these beside it, named by the page's key, the build's name for it (src/styles/page-sheets.ts
 * pageKeyOf): `export default sheetsLayout("people")`. tests/styles/sheets/page-layouts.test.mjs holds each page to its key.
 */
import type { ReactNode } from "react";
import { PageSheets } from "./sheet-links";

export function sheetsLayout(page: string) {
  return function PageLayout({ children }: { children: ReactNode }) {
    return <PageSheets page={page}>{children}</PageSheets>;
  };
}
