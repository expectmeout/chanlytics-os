/**
 * Campaigns > Library (the route's `messages`, the path's `templates`): the wording the receptionist and the campaigns send, on each channel, shown as the customer sees it
 * (moved from legacy/pages/messages.jsx, decision 0015). One row per message -- the starter set in the library's order,
 * then what the workspace wrote or synced -- opening, beside the list, on the bubble for the language in view, its
 * languages (approved, in review, or one tap to add), and the verbs an operator has under a menu. Meta's own sample is
 * never shown; a message the workspace hid sits under a fold, still on file. A WhatsApp version is approved by WhatsApp
 * whether it is written here or in WhatsApp Manager, an email or a text is ready when it is saved, and a marketing message
 * can only go to people who said yes to offers. Every verb goes through the templates verbs and the surface is re-fetched,
 * so the cards are the server's.
 *
 * A message is a name with a version on each channel it has (One message, every channel, step 1): its row says which
 * ("WhatsApp · Email · Text") and the pane has a switch for them. The email and text rows come from the settings surface
 * beside the WhatsApp ones (`templateVersions`), which no other page reads; a reach-out's emails are their own list, from
 * its chains, and each is a message with an email version that is written in its pane (step 5).
 *
 * The page lists the workspace's messages (the surface's `messages`), not its WhatsApp rows: a message written for email
 * or text alone is a row, and the starter set is offered with or without a WhatsApp number (its email and text versions
 * are written at once, its WhatsApp versions wait for a number). The number gates only what is WhatsApp's: a WhatsApp
 * version's rename, hide and delete, a WhatsApp language, a template written to a number's account.
 *
 * It is the Inbox's shape (parts/split.tsx): the list in a pane and, while something is open, that thing in a second
 * pane beside it -- a message, a reach-out's email, or the composer writing a new one. On a phone what is open rises over
 * the list in the drawer Campaigns' home opens its own in (home/pane-sheet.tsx; Ruben, 11 Oct 2026: a message took the
 * screen over "like a page"), the list still under it. The route has no address per template, so which is open is the
 * page's own.
 *
 * The page is real on every workspace. A demo session draws the same words as a real one, over what it holds; without a
 * read, the waiting line says which of the two is looking.
 */
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { LIBRARY_WORDS } from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { canDo, demoSession, gateTitle, useLegacyToast } from "../../legacy-verbs";
import { FailedRead } from "../../kit/empty/empty";
import { tabDraft } from "../../kit/record/work";
import { useSurface } from "../../use-surface";
import { CmHead } from "../parts/head";
import { CmSplit, useCmPhone } from "../parts/split";
import { PaneSheet } from "../home/pane-sheet";
import { ReachOutEmailPane } from "../reach-out/email-message";
import { tplEmailOpen, tplEmails, tplEmailsMatching } from "./emails";
import { listingOf } from "./group";
import type { TemplateGroup } from "./group";
import { MessageRow } from "./message-row";
import { pageActs } from "./page-acts";
import {
  composerPane,
  headRight,
  headSub,
  listBar,
  listFoot,
  matchesOf,
  numberNotice,
  startersOffer,
  templateList,
} from "./page-parts";
import { TemplatePane } from "./template-pane";
import { starters as library } from "./verbs";
import { brainOf } from "./words";

/** No email or text rows read: one array for every draw, so nothing that takes it sees it change. */
const NO_VERSIONS: readonly TemplateDto[] = [];

/** The page has read nothing yet, or is a session with no workspace to read. */
function readingNow() {
  return (
    <div className="reports" data-testid="messages-real">
      <div className="cm-standing">{demoSession() ? LIBRARY_WORDS.demo : LIBRARY_WORDS.reading}</div>
    </div>
  );
}

/** The templates could not be read: said, with the way to read them again. */
function couldntLoad() {
  return (
    <div className="reports" data-testid="messages-real">
      <div className="cm-standing">{LIBRARY_WORDS.failed}</div>
      <div className="rp-body">
        <FailedRead
          kind="card"
          what={LIBRARY_WORDS.failedWhat}
          body={LIBRARY_WORDS.failedBody}
          surface="settings"
          testid="messages-failed"
        />
      </div>
    </div>
  );
}

/** What the page holds as it is used: the act under way, what is open, what the search holds, and the toast. */
function usePageState() {
  // Which act is under way, if any: every control waits for it, and only the one pressed says it is working. The ref
  // holds the guard before the page has drawn the state.
  const [doing, setDoing] = useState<string | null>(null);
  const doingRef = useRef<string | null>(null);
  // A message half-written when the page was left opens again as the page does: the tab kept its words (the
  // composer's own useUnsavedWork, under "new").
  const [composing, setComposing] = useState(() => !!tabDraft("template", "new"));
  const [showHidden, setShowHidden] = useState(false);
  // Which message is open, by its key: in the pane beside the list. One at a time: the words of two messages side by
  // side is the wall this page stopped being.
  const [openKey, setOpenKey] = useState<string | null>(null);
  // What the search box holds: the rows whose words have it stay, the rest stand down.
  const [q, setQ] = useState("");
  const [toastNode, flash] = useLegacyToast();
  return {
    doing,
    setDoing,
    doingRef,
    composing,
    setComposing,
    showHidden,
    setShowHidden,
    openKey,
    setOpenKey,
    q,
    setQ,
    toastNode,
    flash,
  };
}

function MessagesReal() {
  // The settings surface holds the templates, the numbers and what sends and went out; a reach-out's emails are their
  // own surface (Part 4 PR 8): their rows draw when they land.
  const settings = useSurface("settings");
  const chains = useSurface("reach_outs");
  const templates = settings ? settings.templatesAll : undefined;
  const messages = settings?.messages;
  // The workspace's email and text rows (not a reach-out's): each message finds its own among them. Unread is none.
  const versions = settings?.templateVersions ?? NO_VERSIONS;
  const S = library;
  const state = usePageState();
  const phone = useCmPhone();
  const { doing, setDoing, doingRef, composing, setComposing, showHidden, setShowHidden } = state;
  const { openKey, setOpenKey, q, setQ, toastNode, flash } = state;
  const busy = doing !== null;
  // Who may add, change or remove a message: the role store's answer, View-as included.
  const canAct = canDo("approve");
  // The numbers, from the channels read (surfaces/channels/surface.ts): undefined while it is read, null where it failed.
  const channels = useSurface("channels")?.rows;
  const hasWhatsApp = (channels || []).some((c) => c.kind === "whatsapp");
  const bizName = brainOf(settings ? settings.settings : undefined).business_name || null;

  if (templates === undefined || messages === undefined) return readingNow();
  if (templates === null || messages === null) return couldntLoad();

  const listing = listingOf(templates, messages, S);
  const { langs, starters, customGroups, hiddenGroups, missingTotal, allMissing } = listing;
  const partialSet = missingTotal > 0 && !allMissing;
  const addingAll = doing === `add:all:${langs.map((l) => l.id).join(",")}`;
  const acts = pageActs({ doingRef, setDoing, flash });
  const { rename, toggleHidden, remove, addStarters, sync, written } = acts;
  // A new language is written and sent from the pane that opened it, by whoever may
  // add a template and only with a number to add it to; anyone else is told why in
  // the picker, where the languages it cannot add would have been. (An email's or a text's
  // version of a message needs no number: only a WhatsApp version does.)
  const addWhy = !hasWhatsApp ? LIBRARY_WORDS.addNeedsNumber : !canAct ? gateTitle("approve", "add a language") : null;
  // A row opens its message beside the list, or closes it again; the composer gives way to it (its words are kept in
  // the tab, and come back with New), as New gives way to the message.
  const openOne = (key: string) => {
    setComposing(false);
    setOpenKey((k) => (k === key ? null : key));
  };
  const startNew = () => {
    setOpenKey(null);
    setComposing(true);
  };
  const read = { langs, S, versions };
  const held = { templates, messages };
  const card = (g: TemplateGroup) => (
    <MessageRow key={g.key} g={g} {...read} open={openKey === g.key} onOpen={() => openOne(g.key)} />
  );

  const needle = q.trim().toLowerCase();
  const matches = matchesOf(needle, langs, S, versions);
  const listStarters = starters.filter(matches);
  const listCustom = customGroups.filter(matches);
  // A reach-out's emails (Reach out Part 4 PR 8, R19): contracts' rows over the chains, found by their words too.
  const emails = tplEmails(chains);
  const listEmails = tplEmailsMatching(emails, needle);
  const listed = listStarters.length + listCustom.length + listEmails.length;

  // What is open beside the list: the composer, a message or a reach-out's email. A message the list no longer has
  // (deleted, or a number that went) is nothing open.
  const openGroup = openKey
    ? [...starters, ...customGroups, ...hiddenGroups].find((g) => g.key === openKey)
    : undefined;
  const openEmail = tplEmailOpen(emails, openKey);
  const closeOpen = () => setOpenKey(null);
  const pane = composing ? (
    composerPane({ bizName, setComposing, setOpenKey, flash, hasWhatsApp, beginMessage: acts.beginMessage, held })
  ) : openGroup ? (
    <TemplatePane
      key={openGroup.key}
      g={openGroup}
      langs={langs}
      bizName={bizName}
      canAct={canAct && hasWhatsApp}
      canAdd={canAct && hasWhatsApp}
      addWhy={addWhy}
      busy={busy}
      doing={doing}
      S={S}
      onClose={closeOpen}
      onAdd={(gg, lang) => addStarters([gg.starter.key], [lang.id])}
      onRename={rename}
      onHide={toggleHidden}
      onDelete={remove}
      onWritten={written}
      versions={versions}
      canWrite={canAct}
      onSaveVersion={acts.saveVersion}
      onRemoveVersion={acts.removeVersion}
    />
  ) : openEmail ? (
    <ReachOutEmailPane
      key={`e:${openEmail.template_id}`}
      t={openEmail}
      busy={busy}
      onSave={acts.saveEmail}
      onClose={closeOpen}
    />
  ) : null;

  const list = (
    <div className="cm-page tpl-wrap">
      {/* The Library is a room of Campaigns' home (no strip of tabs any more): its crumbs say Campaigns › Library, and the
          head names it and says its line. */}
      <CmHead
        title={LIBRARY_WORDS.title}
        testid="messages-standing"
        sub={headSub({ listing, messages, emails })}
        right={headRight({ onNew: startNew })}
      />
      {/* The top of the list, as the Inbox's opens: the search, and beside it when WhatsApp was last asked. */}
      {listBar({ q, setQ, hasWhatsApp, lastSync: listing.lastSync, doing, busy, sync })}
      {/* The page's own acts stay where they are for every role and say who may
          (gate); a message's rename, hide and delete stay with those who may. */}
      {!canAct && hasWhatsApp && (
        <span className="bc-excl-hint" data-testid="messages-role">
          {gateTitle("approve", "rename, hide or delete a template")}
        </span>
      )}
      {numberNotice({ channels, hasWhatsApp })}
      {allMissing && startersOffer({ S, langs, busy, addingAll, addStarters, hasNumber: hasWhatsApp })}
      {templateList({
        listed,
        listStarters,
        listCustom,
        listEmails,
        openKey,
        onOpenKey: openOne,
        card,
        needle,
        q,
      })}
      {listFoot({ listing, partialSet, busy, addingAll, addStarters, showHidden, setShowHidden, card })}
    </div>
  );

  // The list in its pane, and what is open beside it -- a message, an email or the composer (parts/split.tsx); on a
  // phone, over it in the drawer.
  return (
    <>
      <CmSplit className="tpl-page" testid="messages-real" list={list} open={phone ? null : pane} />
      {phone ? phoneDrawer({ pane, composing, onClose: composing ? () => setComposing(false) : closeOpen }) : null}
      {toastNode}
    </>
  );
}

/**
 * What is open, on a phone: over the list in the drawer Campaigns' home opens its own in, whose Close asks the composer
 * first about what was written (its foot has no Cancel), and which a message alone fits.
 */
function phoneDrawer({ pane, composing, onClose }: { pane: ReactNode; composing: boolean; onClose: () => void }) {
  return (
    <PaneSheet
      open={pane !== null}
      title={LIBRARY_WORDS.title}
      onClose={onClose}
      askFirst={composing}
      fit={!composing}
      testid="tpl-drawer"
    >
      {pane}
    </PaneSheet>
  );
}

/** The page, over what the settings and reach-out surfaces hold: no props, the address is its route's. */
export function TemplatesPage() {
  return <MessagesReal />;
}
