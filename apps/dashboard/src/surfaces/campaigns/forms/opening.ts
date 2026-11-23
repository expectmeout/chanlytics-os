/**
 * What Campaigns › Forms opens on, read as a load there begins (home/opening.ts): its list (`GET forms`), which the document's
 * head starts with the settings read (contracts PREFETCH_READS) and this takes, so the view's first draw is the list. Asked
 * only once the view's code was in, the list said "Reading…" under the head for 0.5 s after the page, 2.2 s on a slow phone
 * (the phone sweep of 22 Nov 2026). The list's hook starts from this answer (use-forms.ts), and reads again itself on a
 * press and on a return to the tab. Nothing of the view is in it, so the view stays the chunk it is.
 */
import { SECOND_MS, type FormsDto } from "@chanlytics/contracts";
import { readForms } from "@/bridge/verbs/forms";
import { getActiveWorkspace } from "@/bridge/workspace";

/** How long the opening answer stands for the list's first draw: one read this recently is the list's first answer. */
const OPENING_STANDS_MS = 30 * SECOND_MS;

/** The answer, when it was read, and the workspace it is of: it is that workspace's list, and no other's. */
let opened: { dto: FormsDto; at: number; workspace: string | null } | null = null;

/** The list, read for a load that opens on Forms. A read that fails keeps nothing: the list then asks for itself, and says so. */
export async function readFormsOpening(): Promise<void> {
  const workspace = getActiveWorkspace();
  try {
    opened = { dto: await readForms(), at: Date.now(), workspace };
  } catch {
    opened = null;
  }
}

/** The opening answer, where it is this workspace's and recent: what the list is first drawn from; else null. */
export function formsOpenedOn(nowMs: number, workspace: string | null): FormsDto | null {
  if (!opened || opened.workspace !== workspace || nowMs - opened.at >= OPENING_STANDS_MS) return null;
  return opened.dto;
}
