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
 * screen over "like a page"), the list still under it. A message open is the address's (`campaigns/messages/<name>`,
 * contracts messageRoute: a message's one home, the Campaigns wiring review's rule A), written as it opens and closes,
 * replaced and never pushed, as the Inbox writes a thread's, so a link opens it, a reload keeps it, and Back leaves the
 * page. A reach-out's email and the composer stay the page's own, the email's words being its step's on its sequence.
 *
 * The page is real on every workspace. A demo session draws the same words as a real one, over what it holds; without a
 * read, the waiting line says which of the two is looking.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BAR_LINE_WORDS,
  LIBRARY_WORDS,
  LIFECYCLE_WORDS,
  MESSAGES_ROUTE,
  messageOfRoute,
  messageRoute,
  sequenceRoute,
} from "@chanlytics/contracts";
import type { ReachOutChainDto } from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { canDo, demoSession, gateTitle, navigate, replaceRoute, useLegacyToast } from "../../legacy-verbs";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { LinkButton } from "../../kit/link-button/link-button";
import { tabDraft } from "../../kit/record/work";
import { usePageSearch } from "../../kit/head/page-search";
import { usePartShown, useSurface } from "../../use-surface";
import { CmHead } from "../parts/head";
import { CmSplit, useCmPhone, type CmView } from "../parts/split";
import { PaneSheet } from "../home/pane-sheet";
import { ReachOutEmailPane } from "../reach-out/email-message";
import { tplEmailOpen, tplEmails, tplEmailsMatching } from "./emails";
import { groupNamed, listingOf, nameOfGroup } from "./group";
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
function readingNow(view: CmView | undefined) {
  return (
    <div className="reports" data-testid="messages-real" ref={view?.ref} data-slide={view?.slide}>
      <div className="cm-standing">{demoSession() ? LIBRARY_WORDS.demo : LIBRARY_WORDS.reading}</div>
    </div>
  );
}

/** The templates could not be read: said, with the way to read them again. */
function couldntLoad(view: CmView | undefined) {
  return (
    <div className="reports" data-testid="messages-real" ref={view?.ref} data-slide={view?.slide}>
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
  // Which reach-out email is open, by its key, in the pane beside the list (a message open is the address's). One thing open
  // at a time: the words of two messages side by side is the wall this page stopped being.
  const [openKey, setOpenKey] = useState<string | null>(null);
  // A message pressed, by its key and the address it was pressed at, shown until its own address lands.
  const [pressed, setPressed] = useState<{ key: string; at: string } | null>(null);
  // What the search box holds: the rows whose words have it stay, the rest stand down.
  const [q, setQ] = useState("");
  // On a desk the box is the bar's line (page-search.ts); a phone keeps its box over the list.
  const inLine = usePageSearch({ label: BAR_LINE_WORDS.messages, value: q, onValue: setQ, testid: "templates-search" });
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
    pressed,
    setPressed,
    q,
    setQ,
    inLine,
    toastNode,
    flash,
  };
}

/** Edit the reach-out, from one of its emails: its sequence's record, where a sequence to leads is written (18 Oct 2026). */
const changeChain = (c: ReachOutChainDto) => navigate(sequenceRoute(c.root_id));

/**
 * The page's own acts stay where they are for every role and say who may (gate); a message's rename, hide and delete stay
 * with those who may, and whoever may not is told so where there is a number to hold messages.
 */
function roleHint(canAct: boolean, hasWhatsApp: boolean): ReactNode {
  if (canAct || !hasWhatsApp) return null;
  return (
    <span className="bc-excl-hint" data-testid="messages-role">
      {gateTitle("approve", "rename, hide or delete a template")}
    </span>
  );
}

/** A message the address names that the workspace no longer holds: said, with the way back to the list. */
function messageGone(onClose: () => void) {
  const W = LIFECYCLE_WORDS.messageGone;
  return (
    <EmptyState
      kind="line"
      title={W.title}
      body={
        <>
          {W.body}{" "}
          <LinkButton onClick={onClose} data-testid="tpl-message-gone-back">
            {LIBRARY_WORDS.title}
          </LinkButton>
        </>
      }
      testid="tpl-message-gone"
    />
  );
}

/** The message the address opens, by its name (contracts messageOfRoute): a door to one reached while the composer was open
 * opens it, the composer's words kept in the tab. */
function useNamedMessage(route: string, setComposing: (on: boolean) => void): string | null {
  const named = messageOfRoute(route);
  useEffect(() => {
    if (named) setComposing(false);
  }, [named, setComposing]);
  return named;
}

/**
 * What is open, and the presses that open and close it: a message by its address (replaced, so Back leaves the page), a
 * reach-out's email and the composer by the page's own state, one at a time. The composer gives way to a message (its
 * words are kept in the tab, and come back with New), as New gives way to the message.
 */
function messageOpener(
  at: { route: string; named: string | null },
  groups: readonly TemplateGroup[],
  st: Pick<ReturnType<typeof usePageState>, "openKey" | "setOpenKey" | "setComposing" | "pressed" | "setPressed">,
) {
  const { route, named } = at;
  // The message open: the address's, else one pressed at this address whose own has not landed yet (shown at once, and
  // let go as the address moves, which is the truth again).
  const pressed = st.pressed && st.pressed.at === route ? groups.find((g) => g.key === st.pressed?.key) : undefined;
  const routed = named ? groupNamed(groups, named) : (pressed ?? null);
  const shownKey = routed ? routed.key : named ? null : st.openKey;
  const leaveMessage = () => {
    st.setPressed(null);
    if (named) replaceRoute(MESSAGES_ROUTE);
  };
  const openOne = (key: string) => {
    st.setComposing(false);
    const g = groups.find((x) => x.key === key);
    const closing = shownKey === key;
    if (g) {
      st.setOpenKey(null);
      st.setPressed(closing ? null : { key, at: route });
      replaceRoute(closing ? MESSAGES_ROUTE : messageRoute(nameOfGroup(g)));
      return;
    }
    leaveMessage();
    st.setOpenKey(closing ? null : key);
  };
  const startNew = () => {
    st.setOpenKey(null);
    leaveMessage();
    st.setComposing(true);
  };
  const closeOpen = () => {
    st.setOpenKey(null);
    leaveMessage();
  };
  // A message the composer just made, opened as a press opens one: its address, and the message shown until it lands.
  const openMade = (key: string, name: string) => {
    st.setComposing(false);
    st.setOpenKey(null);
    st.setPressed({ key, at: route });
    replaceRoute(messageRoute(name));
  };
  // What the list lights as open: the message, else the email open here.
  return { routed, shownKey, openOne, startNew, closeOpen, openMade };
}

function MessagesReal({ view, route }: { view?: CmView; route: string }) {
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
  const { openKey, q, setQ, inLine, toastNode, flash } = state;
  const named = useNamedMessage(route, setComposing);
  const busy = doing !== null;
  // Who may add, change or remove a message: the role store's answer, View-as included.
  const canAct = canDo("approve");
  // The numbers, from the channels read (surfaces/channels/surface.ts): undefined while it is read, null where it failed.
  const channels = useSurface("channels")?.rows;
  const hasWhatsApp = (channels || []).some((c) => c.kind === "whatsapp");
  const bizName = brainOf(settings ? settings.settings : undefined).business_name || null;
  // Messages' first part (client/page-speed.ts, contracts PRIMARY_PART): its list, drawn once the settings read is in, or
  // what could not be read. Shown beside Sequences under Campaigns' one mount, it is timed from the press that showed it.
  usePartShown("templates", "list", templates !== undefined && messages !== undefined);

  if (templates === undefined || messages === undefined) return readingNow(view);
  if (templates === null || messages === null) return couldntLoad(view);

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
  const { routed, shownKey, openOne, startNew, closeOpen, openMade } = messageOpener(
    { route, named },
    [...starters, ...customGroups, ...hiddenGroups],
    state,
  );
  const read = { langs, S, versions };
  const held = { templates, messages };
  const card = (g: TemplateGroup) => (
    <MessageRow key={g.key} g={g} {...read} open={shownKey === g.key} onOpen={() => openOne(g.key)} />
  );

  const needle = q.trim().toLowerCase();
  const matches = matchesOf(needle, langs, S, versions);
  const listStarters = starters.filter(matches);
  const listCustom = customGroups.filter(matches);
  // A reach-out's emails (Reach out Part 4 PR 8, R19): contracts' rows over the chains, found by their words too.
  const emails = tplEmails(chains);
  const listEmails = tplEmailsMatching(emails, needle);
  const listed = listStarters.length + listCustom.length + listEmails.length;

  // What is open beside the list: the composer, a message or a reach-out's email. A message the address names that the
  // list no longer has (deleted, or a number that went) says so.
  const openGroup = routed;
  const openEmail = named || openGroup ? null : tplEmailOpen(emails, openKey);
  const pane = composing ? (
    composerPane({ bizName, setComposing, openMade, flash, hasWhatsApp, beginMessage: acts.beginMessage, held })
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
  ) : named ? (
    messageGone(closeOpen)
  ) : openEmail ? (
    <ReachOutEmailPane
      key={`e:${openEmail.step_id}`}
      t={openEmail}
      busy={busy}
      onSave={acts.saveEmail}
      onClose={closeOpen}
      onEdit={changeChain}
    />
  ) : null;

  const list = (
    <div className="cm-page tpl-wrap">
      {/* Messages is a view of Campaigns beside Sequences (decision 0060, D4): its head is Campaigns', the strip under it
          saying the view, with its line beside the name and New by the strip, as Sequences' head is. */}
      <CmHead
        quiet
        title={LIBRARY_WORDS.title}
        testid="messages-standing"
        sub={headSub({ listing, messages, emails })}
        right={headRight({ onNew: startNew })}
      />
      {/* The top of the list, as the Inbox's opens: the search, and beside it when WhatsApp was last asked. */}
      {listBar({ q, setQ, inLine, hasWhatsApp, lastSync: listing.lastSync, doing, busy, sync })}
      {roleHint(canAct, hasWhatsApp)}
      {numberNotice({ channels, hasWhatsApp })}
      {allMissing && startersOffer({ S, langs, busy, addingAll, addStarters, hasNumber: hasWhatsApp })}
      {templateList({
        listed,
        listStarters,
        listCustom,
        listEmails,
        openKey: shownKey,
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
      <CmSplit className="tpl-page" testid="messages-real" list={list} open={phone ? null : pane} view={view} />
      {phone ? phoneDrawer({ pane, composing, onClose: composing ? () => setComposing(false) : closeOpen }) : null}
      {toastNode}
    </>
  );
}

/**
 * What is open, on a phone: over the list in the drawer Campaigns' home opens its own in, whose Close asks the composer
 * first about what was written (its foot has no Cancel).
 */
function phoneDrawer({ pane, composing, onClose }: { pane: ReactNode; composing: boolean; onClose: () => void }) {
  return (
    <PaneSheet
      open={pane !== null}
      title={LIBRARY_WORDS.title}
      onClose={onClose}
      askFirst={composing}
      testid="tpl-drawer"
    >
      {pane}
    </PaneSheet>
  );
}

/**
 * Messages, over what the settings and reach-out surfaces hold, as Campaigns draws it (home/route.tsx): a view kept beside
 * Sequences under Campaigns' one mount, `view` the deck's seat, its side and whether it is shown (parts/split.tsx
 * CmView), at `route`, the address it was last at (`campaigns/messages`, or a message open in it). Its code is a chunk of
 * Campaigns' own (home/campaigns-code.tsx), so no page's first load carries it.
 */
export function TemplatesPage({ view, route = MESSAGES_ROUTE }: { view?: CmView; route?: string } = {}) {
  return <MessagesReal view={view} route={route} />;
}
