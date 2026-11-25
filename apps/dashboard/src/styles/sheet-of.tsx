/**
 * A stylesheet a part of a page links for itself, where that part is drawn: its draw waits for it (the lead map's
 * `maplibre` stylesheet, linked where the streets are drawn and nowhere else).
 *
 * Apart from sheet-links.tsx, which holds the pages' links and the context they are drawn under: a part that links one
 * stylesheet brings neither with it (sheet-list.ts says why that matters to a test).
 */
import { sheetApart } from "./sheet-list";

export function SheetOf({ name }: { name: string }) {
  const file = sheetApart(name);
  return file ? <link rel="stylesheet" href={file.href} precedence={file.slot} /> : null;
}
