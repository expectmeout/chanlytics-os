/**
 * What New conversation opens, held once by the frame (a conversation begins from the Inbox, the design's 4.1 and
 * 4.7): the sheet, loaded on demand, and the Inbox's key for it. Drawn beside the shell (legacy-bridge/LegacyApp.tsx),
 * as the frame's head is, so one sheet answers the Inbox's three tabs and a person's page alike, and nothing of it is
 * in any page's first load: the button a page draws (act.tsx) asks the store, and this answers.
 *
 * It is the frame's, and not each page's, for the bundle's sake as much as the product's. Loaded on demand from the
 * three pages that draw the act, the sheet made the bundler divide a chunk the whole route shares, and People, Sent and
 * Templates each loaded a second copy of it (thirteen to twenty kilobytes gzipped, 7 October 2026).
 */
import { useEffect, useState } from "react";
import { ixKeyLeft } from "../keys";
import { canDo, currentRoute, useToast } from "../shell";
import {
  closeNewConversation,
  newConversationAsked,
  onWarmAsked,
  openNewConversation,
  useNewConversation,
} from "./store";

type SheetModule = typeof import("./sheet");
let sheetModule: SheetModule | null = null;
let sheetLoading: Promise<SheetModule> | null = null;

/** What the act opens, loaded once for the tab. */
function loadNewConversation(): Promise<SheetModule> {
  // What it reads of the module is named, so the dead-exports check (knip) sees the use.
  sheetLoading ??= import("./sheet").then(({ NewConversationSheet }) => (sheetModule = { NewConversationSheet }));
  return sheetLoading;
}

/** The Inbox's three tabs: where N is the page's key for a new conversation. */
const ON_THE_INBOX = /^(inbox|conversations|live)(\/|$)/;

/** N, pressed on one of the Inbox's tabs (keys.ts says which keys a page leaves alone), by a role that may write. */
function onNewKey(e: KeyboardEvent): void {
  if (ixKeyLeft(e) || e.shiftKey || e.repeat || e.key.toLowerCase() !== "n") return;
  if (!ON_THE_INBOX.test(currentRoute()) || !canDo("approve") || newConversationAsked().open) return;
  e.preventDefault();
  openNewConversation();
}

/**
 * Nothing until the sheet is first asked for, then the sheet once it has loaded, kept drawn while it leaves. It warms
 * the sheet as a pointer or focus reaches the act, answers the Inbox's key, and draws the toast that says a message is
 * on its way, which outlives the sheet.
 */
export function NewConversationHost() {
  const ask = useNewConversation();
  const [toast, flash] = useToast();
  const [, landed] = useState(0);
  useEffect(() => {
    window.addEventListener("keydown", onNewKey);
    const forget = onWarmAsked(() => void loadNewConversation());
    return () => {
      window.removeEventListener("keydown", onNewKey);
      forget();
    };
  }, []);
  useEffect(() => {
    if (!ask.open || sheetModule) return;
    void loadNewConversation().then(() => landed((n) => n + 1));
  }, [ask.open]);
  const Opened = sheetModule?.NewConversationSheet;
  return (
    <>
      {Opened && ask.session > 0 ? (
        <Opened
          key={ask.session}
          open={ask.open}
          personId={ask.personId}
          onClose={closeNewConversation}
          flash={flash}
        />
      ) : null}
      {toast}
    </>
  );
}
